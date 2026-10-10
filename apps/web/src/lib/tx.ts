import { swapAdapterAbi, trustPoolAbi } from '@trustpool/core'
import { useCallback, useState } from 'react'
import {
  BaseError,
  ContractFunctionRevertedError,
  decodeEventLog,
  parseEther,
  UserRejectedRequestError,
  type Hash,
  type TransactionReceipt,
  type WalletClient,
} from 'viem'
import { useSession } from '@/auth/session'
import { deployment, publicClient } from './chain'

/** Default slippage for a swap, in basis points. Never send minOut = 0 on a real DEX. */
export const DEFAULT_SLIPPAGE_BPS = 100

/** What a contract revert means for the person who caused it. */
const REVERTS: Record<string, string> = {
  BondTooSmall: 'Your bond is below the minimum. Add to it first.',
  TokenNotAllowed: 'This token is not on the allow list.',
  LockOutOfRange: 'The lock is outside the allowed range.',
  NoticeTooShort: 'The notice is shorter than the minimum.',
  ThesisTooLong: 'The thesis is longer than 280 bytes.',
  ZeroValue: 'The amount must be more than zero.',
  NothingBought: 'The swap returned no tokens.',
  Slippage: 'The price moved more than your slippage allows. Try again.',
  NotCaller: 'Only the caller of this call can do that.',
  WrongState: 'This call is not in a state that allows that.',
  TooEarly: 'Too early: the lock, notice or grace period has not ended yet.',
  OpenCalls: 'Close your open calls before withdrawing the bond.',
  NoWithdrawal: 'Request a withdrawal first.',
  NoBond: 'You have no bond to withdraw.',
  OpenPaused: 'New calls are paused right now. Open calls can still exit.',
  TransferFailed: 'A transfer failed.',
  InsufficientOutput: 'The price moved more than your slippage allows. Try again.',
}

export class TxError extends Error {}

export function explain(err: unknown): string {
  if (err instanceof TxError) return err.message
  if (err instanceof BaseError) {
    if (err.walk((e) => e instanceof UserRejectedRequestError)) return 'You rejected the request in your wallet.'
    const revert = err.walk((e) => e instanceof ContractFunctionRevertedError)
    if (revert instanceof ContractFunctionRevertedError) {
      const name = revert.data?.errorName
      return (name && REVERTS[name]) ?? revert.reason ?? 'The contract rejected this transaction.'
    }
    return err.shortMessage
  }
  return err instanceof Error ? err.message : 'Something went wrong.'
}

const withSlippage = (amount: bigint, bps: number) => (amount * BigInt(10_000 - bps)) / 10_000n

type PoolWrite = 'postBond' | 'openCall' | 'announceExit' | 'executeExit' | 'releaseTokens' | 'requestBondWithdraw' | 'withdrawBond'

/**
 * Every TrustPool write the web app makes. Each one simulates first (so a revert shows its
 * reason before the wallet opens), sends, and waits for the receipt.
 */
export function trustPool(wallet: WalletClient) {
  if (!deployment) throw new TxError('No TrustPool deployment for this chain.')
  const pool = deployment.trustPool

  async function send(functionName: PoolWrite, args: readonly unknown[], value?: bigint): Promise<TransactionReceipt> {
    const account = wallet.account
    if (!account) throw new TxError('No wallet connected.')
    const { request } = await publicClient.simulateContract({
      address: pool,
      abi: trustPoolAbi,
      functionName,
      args,
      value,
      account,
    } as Parameters<typeof publicClient.simulateContract>[0])
    const hash: Hash = await wallet.writeContract(request as Parameters<WalletClient['writeContract']>[0])
    const receipt = await publicClient.waitForTransactionReceipt({ hash })
    if (receipt.status !== 'success') throw new TxError('The transaction reverted on chain.')
    return receipt
  }

  const currentAdapter = () => publicClient.readContract({ address: pool, abi: trustPoolAbi, functionName: 'adapter' })

  return {
    postBond: (mon: number) => send('postBond', [], parseEther(String(mon))),
    requestBondWithdraw: () => send('requestBondWithdraw', []),
    withdrawBond: () => send('withdrawBond', []),

    /** Quotes the buy, applies slippage, opens the call, and returns its id. */
    async openCall(p: { token: `0x${string}`; mon: number; lockSeconds: number; noticeSeconds: number; thesis: string; slippageBps?: number }) {
      const value = parseEther(String(p.mon))
      const quoted = await publicClient.readContract({ address: await currentAdapter(), abi: swapAdapterAbi, functionName: 'quoteBuy', args: [p.token, value] })
      const minOut = withSlippage(quoted, p.slippageBps ?? DEFAULT_SLIPPAGE_BPS)
      const receipt = await send('openCall', [p.token, BigInt(p.lockSeconds), p.noticeSeconds, minOut, p.thesis], value)
      for (const log of receipt.logs) {
        try {
          const e = decodeEventLog({ abi: trustPoolAbi, ...log })
          if (e.eventName === 'CallOpened') return { id: Number(e.args.id), receipt }
        } catch {
          // a token Transfer or another contract's log
        }
      }
      return { id: undefined, receipt }
    },

    announceExit: (id: number) => send('announceExit', [BigInt(id)]),

    /** Quotes the sale through the call's own adapter, applies slippage, and settles. */
    async executeExit(id: number, slippageBps = DEFAULT_SLIPPAGE_BPS) {
      const c = await publicClient.readContract({ address: pool, abi: trustPoolAbi, functionName: 'getCall', args: [BigInt(id)] })
      const quoted = await publicClient.readContract({ address: c.adapter, abi: swapAdapterAbi, functionName: 'quoteSell', args: [c.token, c.tokens] })
      return send('executeExit', [BigInt(id), withSlippage(quoted, slippageBps)])
    },

    releaseTokens: (id: number) => send('releaseTokens', [BigInt(id)]),
  }
}

export type TrustPoolTx = ReturnType<typeof trustPool>

/**
 * Runs one TrustPool action from a component, with pending state and a readable error.
 * `enabled` is false in the demo (no Privy or no deployment): pages fall back to demo actions.
 */
export function useTrustPool() {
  const session = useSession()
  const [pending, setPending] = useState<string | null>(null)
  const enabled = session.mode === 'privy' && !!deployment && !!session.walletClient

  const run = useCallback(
    async <T,>(label: string, fn: (tx: TrustPoolTx) => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: string }> => {
      if (!enabled) return { ok: false, error: 'Transactions need a Privy wallet and a deployment on this chain.' }
      setPending(label)
      try {
        const wallet = await session.walletClient!()
        return { ok: true, value: await fn(trustPool(wallet)) }
      } catch (err) {
        return { ok: false, error: explain(err) }
      } finally {
        setPending(null)
      }
    },
    [enabled, session],
  )

  return { enabled, pending, run }
}

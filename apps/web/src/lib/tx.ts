import { swapAdapterAbi, trustPoolAbi } from '@trustpool/core'
import { useCallback, useRef, useState } from 'react'
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
  BadRules: 'A rule is outside the allowed range.',
  ShareAboveTier: 'That profit share is above what your tier allows.',
  ThesisTooLong: 'The thesis is longer than 280 bytes.',
  ZeroValue: 'The amount must be more than zero.',
  BadAmount: 'You cannot take out more than you put in.',
  OverCap: 'That would take the pool over its cap.',
  ImpactTooHigh: 'That would take the pool past what one buy can take without moving the price more than the limit.',
  NoLiquidity: 'This token has no liquidity to quote.',
  CallerStakeTooSmall: "That would put the caller's share under the minimum.",
  CallerCannotWithdraw: 'The caller cannot take money out of their own pool.',
  PoolTooSmall: 'The pool is below its minimum. Anyone can refund it now.',
  NothingBought: 'The swap returned no tokens.',
  Slippage: 'The price moved more than the slippage allows. Try again.',
  NotCaller: 'Only the caller of this call can do that.',
  WrongState: 'This call is not in a state that allows that.',
  TooEarly: 'Too early for that.',
  TooLate: 'Too late: the deadline has passed.',
  CheckpointTooSoon: 'The last price was recorded less than one gap ago.',
  CheckpointStale: 'Record the price first: the last record is too old.',
  ConditionNotMet: 'No sale rule is met by the last two price records.',
  CheckpointsDisagree: 'The last two price records disagree by more than the tolerance. Record again after one gap.',
  NotParticipant: 'You have nothing in this pool.',
  AlreadyClaimed: 'You already claimed.',
  ActiveCalls: 'Your bond stays locked while you have an open or holding call.',
  NoWithdrawal: 'Request a withdrawal first.',
  NoBond: 'You have no bond to withdraw.',
  OpenPaused: 'New calls are paused right now. Every call already open runs to its end.',
  TransferFailed: 'A transfer failed.',
  InsufficientOutput: 'The price moved more than the slippage allows. Try again.',
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

type PoolWrite =
  | 'postBond'
  | 'requestBondWithdraw'
  | 'withdrawBond'
  | 'openCall'
  | 'deposit'
  | 'withdraw'
  | 'buy'
  | 'checkpoint'
  | 'sell'
  | 'refund'
  | 'split'
  | 'claim'

/** The rules a caller picks at open. Times in seconds, shares in basis points. */
export interface OpenCallParams {
  token: `0x${string}`
  /** The caller's own first deposit, in MON. */
  stake: number
  windowSeconds: number
  takeProfitBps: number
  stopLossBps: number
  maxHoldSeconds: number
  shareBps: number
  thesis: string
}

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

  const id = (n: number) => BigInt(n)

  return {
    postBond: (mon: number) => send('postBond', [], parseEther(String(mon))),
    requestBondWithdraw: () => send('requestBondWithdraw', []),
    withdrawBond: () => send('withdrawBond', []),

    /** Opens a call with the caller's own stake, and returns its id. */
    async openCall(p: OpenCallParams) {
      const receipt = await send(
        'openCall',
        [p.token, p.windowSeconds, p.takeProfitBps, p.stopLossBps, p.maxHoldSeconds, p.shareBps, p.thesis],
        parseEther(String(p.stake)),
      )
      for (const log of receipt.logs) {
        try {
          const e = decodeEventLog({ abi: trustPoolAbi, ...log })
          if (e.eventName === 'CallOpened') return { id: Number(e.args.id), receipt }
        } catch {
          // another contract's log
        }
      }
      return { id: undefined, receipt }
    },

    deposit: (call: number, mon: number) => send('deposit', [id(call)], parseEther(String(mon))),
    withdraw: (call: number, mon: number) => send('withdraw', [id(call), parseEther(String(mon))]),

    /** The caller's buy for the whole pool, with a least-tokens guard from a fresh quote. */
    async buy(call: number, slippageBps = DEFAULT_SLIPPAGE_BPS) {
      const c = await publicClient.readContract({ address: pool, abi: trustPoolAbi, functionName: 'getCall', args: [id(call)] })
      const quoted = await publicClient.readContract({ address: c.rules.adapter, abi: swapAdapterAbi, functionName: 'quoteBuy', args: [c.token, c.totalIn] })
      return send('buy', [id(call), withSlippage(quoted, slippageBps)])
    },

    // Anyone may send these; the contract decides whether they are allowed.
    checkpoint: (call: number) => send('checkpoint', [id(call)]),
    sell: (call: number) => send('sell', [id(call)]),
    refund: (call: number) => send('refund', [id(call)]),
    split: (call: number) => send('split', [id(call)]),
    claim: (call: number) => send('claim', [id(call)]),
  }
}

/** Reads the impact a pool of `mon` would have, with the contract's own measure. */
export async function impactBps(adapter: `0x${string}`, token: `0x${string}`, mon: number): Promise<number | undefined> {
  if (!deployment || mon <= 0) return undefined
  try {
    return Number(await publicClient.readContract({ address: deployment.trustPool, abi: trustPoolAbi, functionName: 'impactBps', args: [adapter, token, parseEther(String(mon))] }))
  } catch {
    return undefined
  }
}

/** Whether `fn` on call `id` would go through right now, by simulation. For the keeper buttons. */
export async function wouldPass(fn: 'checkpoint' | 'sell' | 'refund' | 'split', callId: number, account?: `0x${string}`): Promise<boolean> {
  if (!deployment) return false
  try {
    await publicClient.simulateContract({ address: deployment.trustPool, abi: trustPoolAbi, functionName: fn, args: [BigInt(callId)], account })
    return true
  } catch {
    return false
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
  // State lags a render behind, so a fast second click would slip past `pending`; this does not.
  const inFlight = useRef(false)
  const enabled = session.mode !== 'demo' && !!deployment && !!session.walletClient

  const run = useCallback(
    async <T,>(label: string, fn: (tx: TrustPoolTx) => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: string }> => {
      if (!enabled) return { ok: false, error: 'Transactions need a wallet and a deployment on this chain.' }
      if (inFlight.current) return { ok: false, error: 'Another transaction is still waiting for your wallet.' }
      inFlight.current = true
      setPending(label)
      try {
        const wallet = await session.walletClient!()
        return { ok: true, value: await fn(trustPool(wallet)) }
      } catch (err) {
        return { ok: false, error: explain(err) }
      } finally {
        inFlight.current = false
        setPending(null)
      }
    },
    [enabled, session],
  )

  return { enabled, pending, run }
}

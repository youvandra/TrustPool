import { BellRing, Lock, Plus, Shield, Unlock, Wallet } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { averageBps, returnBps, type Call } from '@trustpool/core'
import { useSession } from '@/auth/session'
import { Button, ButtonLink, Card, Empty, Modal, Row, SectionHead, Signed, Skeleton, Stat, StateTag, TokenIcon, toast } from '@/components/ui'
import { date, duration, mon } from '@/lib/format'
import { source } from '@/lib/data'
import { useLoad, useTitle } from '@/lib/hooks'
import { actions } from '@/lib/store'
import { useTrustPool, type TrustPoolTx } from '@/lib/tx'
import { useLocalCalls } from '@/lib/view'
import Countdown from '../components/Countdown'
import RequireAuth from '../shell/RequireAuth'

async function load(address: string) {
  const [caller, calls] = await Promise.all([source.getCaller(address), source.listCalls({ caller: address })])
  return { caller, calls }
}

/** Default release grace from the contract; the contract checks the call's own value. */
const RELEASE_GRACE = 6 * 3_600_000

type Act = (label: string, fn: (t: TrustPoolTx) => Promise<unknown>, done: string) => Promise<boolean>

/** One open position with the only actions a caller has: announce, execute, or release. */
function OpenPosition({ call, onAnnounce, act, busy }: { call: Call; onAnnounce: (c: Call) => void; act: Act; busy: boolean }) {
  const now = Date.now()
  const unlocked = now >= call.unlockAt
  const canRelease = call.state === 'Exiting' && now >= call.exitAt! + RELEASE_GRACE
  return (
    <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
      <Link to={`/app/calls/${call.id}`} className="flex items-center gap-3">
        <TokenIcon token={call.token} size={40} />
        <div>
          <p className="flex items-center gap-2 text-[15px] font-semibold">
            {call.token.symbol} <span className="num text-[12px] font-normal text-ink-3">#{call.id}</span>
            <StateTag state={call.state} size="sm" />
          </p>
          <p className="mt-0.5 text-[12.5px] text-ink-3">
            {mon(call.monIn, 0)} locked ·{' '}
            {call.state === 'Exiting' ? (
              <>
                executable in <Countdown at={call.exitAt!} done="now" className="text-accent-deep" />
              </>
            ) : unlocked ? (
              'lock ended'
            ) : (
              <>
                lock ends in <Countdown at={call.unlockAt} />
              </>
            )}
          </p>
        </div>
      </Link>
      {call.state === 'Locked' ? (
        <Button variant="accent" icon={BellRing} onClick={() => onAnnounce(call)}>
          Announce exit
        </Button>
      ) : (
        <div className="flex gap-2">
          {canRelease && (
            <Button
              variant="secondary"
              icon={Unlock}
              disabled={busy}
              title="Take the tokens unsold. Your record counts this call as -100%."
              onClick={() => void act('Releasing', (t) => t.releaseTokens(call.id), 'Tokens released to you. The record counts this call as -100%.')}
            >
              Release unsold
            </Button>
          )}
          <Button
            disabled={busy || now < call.exitAt!}
            title="Available once the notice period ends"
            onClick={() => void act('Selling', (t) => t.executeExit(call.id), 'Sold and settled. The result is on your record.')}
          >
            Sell and settle
          </Button>
        </div>
      )}
    </div>
  )
}

/** Add to the bond, or start and finish a withdrawal. The contract enforces every rule. */
function BondModal({ open, onClose, act, busy, hasOpen }: { open: boolean; onClose: () => void; act: Act; busy: boolean; hasOpen: boolean }) {
  const [amount, setAmount] = useState('10')
  const value = Number(amount)
  return (
    <Modal open={open} onClose={onClose} title="Your bond">
      <label className="block">
        <span className="text-[13px] text-ink-3">Add MON</span>
        <input
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="num mt-1.5 h-11 w-full rounded-xl border border-line bg-surface px-4 text-ink outline-none focus:border-accent/50 focus:shadow-ring"
        />
      </label>
      <Button className="mt-3" block disabled={busy || !(value > 0)} onClick={() => void act('Posting bond', (t) => t.postBond(value), `Added ${value} MON to your bond.`).then((ok) => ok && onClose())}>
        Add to bond
      </Button>
      <div className="mt-6 border-t border-line pt-5">
        <p className="text-[13.5px] leading-[1.55] text-ink-2">
          Withdrawing takes two steps: request it, then withdraw after 7 days. It needs no open calls, and opening a call or adding to the bond cancels a pending request.
        </p>
        <div className="mt-4 flex gap-2">
          <Button variant="secondary" block disabled={busy || hasOpen} onClick={() => void act('Requesting withdrawal', (t) => t.requestBondWithdraw(), 'Withdrawal requested. You can withdraw in 7 days.')}>
            Request withdrawal
          </Button>
          <Button variant="secondary" block disabled={busy || hasOpen} onClick={() => void act('Withdrawing', (t) => t.withdrawBond(), 'Bond withdrawn to your wallet.').then((ok) => ok && onClose())}>
            Withdraw now
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function Inner({ address }: { address: string }) {
  const [version, setVersion] = useState(0)
  const data = useLoad(() => load(address), [address, version])
  const calls = useLocalCalls(data?.calls)
  const [confirm, setConfirm] = useState<Call | null>(null)
  const [bondOpen, setBondOpen] = useState(false)
  const tx = useTrustPool()

  /** Sends one transaction, reports the outcome, and reloads once the indexer has seen it. */
  const act: Act = async (label, fn, done) => {
    if (!tx.enabled) {
      toast('Demo: transactions need a Privy wallet and a deployment')
      return false
    }
    toast(`${label}… confirm in your wallet`)
    const r = await tx.run(label, fn)
    toast(r.ok ? done : r.error)
    if (r.ok) setTimeout(() => setVersion((v) => v + 1), 2_500)
    return r.ok
  }

  if (!data || !calls) return <Skeleton className="h-[480px] rounded-2xl" />
  const { caller } = data
  const open = calls.filter((c) => c.state === 'Locked' || c.state === 'Exiting')
  const done = calls.filter((c) => !open.includes(c))

  if (!caller)
    return (
      <Card>
        <Empty
          icon={<Wallet size={18} />}
          title="You have not opened a call yet"
          body="Post a bond, buy with your own MON, and the call goes public with your entry already on the record."
          action={
            <ButtonLink to="/app/new" icon={Plus}>
              Open your first call
            </ButtonLink>
          }
        />
      </Card>
    )

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr_1.2fr]">
        <Card tone="accent" className="p-5">
          <div className="flex items-center justify-between">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/15 text-white">
              <Shield size={16} />
            </span>
            <span className="rounded-full bg-white/15 px-2.5 py-1 text-[11.5px] font-medium text-white">{open.length ? 'Locked by open calls' : 'Withdrawable after 7 days'}</span>
          </div>
          <p className="mt-4 text-[13px] text-white/80">Bond</p>
          <p className="num mt-1.5 text-[28px] font-medium tracking-[-0.03em]">{mon(caller.bond)}</p>
          <p className="mt-1 text-[12.5px] text-white/75">Slashed {caller.record.slashes} times</p>
          <div className="mt-4 flex gap-2">
            <button type="button" onClick={() => setBondOpen(true)} className="h-8 rounded-lg bg-white px-3 text-[13px] font-medium text-accent-deep hover:bg-white/90">
              Add
            </button>
            <button type="button" disabled={open.length > 0} onClick={() => setBondOpen(true)} className="h-8 rounded-lg px-3 text-[13px] font-medium text-white/90 ring-1 ring-inset ring-white/30 disabled:opacity-40">
              Withdraw
            </button>
          </div>
        </Card>
        <Card className="p-5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-ink text-white">
            <Lock size={16} />
          </span>
          <Stat className="mt-4" label="Locked in open calls" value={mon(open.reduce((s, c) => s + c.monIn, 0))} foot={`${open.length} open`} />
        </Card>
        <Card className="p-5">
          <p className="text-[13px] text-ink-3">Your public record</p>
          <div className="mt-3 grid grid-cols-3 gap-3">
            <Stat label="Settled" value={caller.record.settled + caller.record.released} />
            <Stat label="At a loss" value={caller.record.losses} />
            <Stat label="Average" value={<Signed bps={averageBps(caller.record)} />} />
          </div>
          <Link to={`/app/callers/${caller.address}`} className="mt-3 inline-block text-[13px] font-medium text-ink-3 hover:text-ink">
            See it as followers do →
          </Link>
        </Card>
      </div>

      <Card>
        <SectionHead
          className="px-5 pt-5"
          title="Open calls"
          sub="Announcing starts the public notice clock. It cannot be taken back."
          action={
            <ButtonLink to="/app/new" size="sm" icon={Plus}>
              New call
            </ButtonLink>
          }
        />
        {open.length === 0 ? (
          <Empty title="No open calls" body="Your next call will show here with its lock and exit controls." />
        ) : (
          <div className="mt-2 divide-y divide-line">
            {open.map((c) => (
              <OpenPosition key={c.id} call={c} onAnnounce={setConfirm} act={act} busy={!!tx.pending} />
            ))}
          </div>
        )}
      </Card>

      <Card>
        <SectionHead className="px-5 pt-5" title="History" sub="Everything here is public and permanent." />
        <ul className="mt-2 divide-y divide-line">
          {done.map((c) => (
            <li key={c.id}>
              <Link to={`/app/calls/${c.id}`} className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-subtle">
                <span className="flex items-center gap-3">
                  <TokenIcon token={c.token} size={32} />
                  <span>
                    <span className="block text-[14px] font-semibold">{c.token.symbol}</span>
                    <span className="num block text-[12px] text-ink-3">{date(c.openedAt)}</span>
                  </span>
                </span>
                <Signed bps={returnBps(c)!} pill />
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      <BondModal open={bondOpen} onClose={() => setBondOpen(false)} act={act} busy={!!tx.pending} hasOpen={open.length > 0} />

      <Modal open={!!confirm} onClose={() => setConfirm(null)} title="Announce your exit?">
        {confirm && (
          <>
            <p className="text-[14px] leading-[1.55] text-ink-2">
              Everyone watching {confirm.token.symbol} #{confirm.id} is alerted now. You can sell after the notice period, and not before.
            </p>
            <div className="mt-5 rounded-xl bg-subtle p-4">
              <Row label="Notice">
                <span className="num">{duration(confirm.notice)}</span>
              </Row>
              <Row label="Earliest sale">
                <span className="num">{date(Math.max(confirm.unlockAt, Date.now() + confirm.notice))}</span>
              </Row>
            </div>
            <div className="mt-6 flex gap-2">
              <Button variant="secondary" block onClick={() => setConfirm(null)}>
                Keep holding
              </Button>
              <Button
                block
                variant="accent"
                disabled={!!tx.pending}
                onClick={() => {
                  const c = confirm
                  setConfirm(null)
                  if (!tx.enabled) {
                    actions.announce(c.id) // demo: shown locally only
                    return toast(`Exit announced. ${c.watchers} watchers alerted.`)
                  }
                  void act('Announcing', (t) => t.announceExit(c.id), `Exit announced on chain. ${c.watchers} watchers alerted.`)
                }}
              >
                Announce
              </Button>
            </div>
          </>
        )}
      </Modal>
    </div>
  )
}

export default function PortfolioPage() {
  useTitle('Portfolio · trustpool')
  const s = useSession()
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[26px] font-semibold tracking-[-0.03em] sm:text-[30px]">Portfolio</h1>
        <p className="mt-1 text-[14px] text-ink-3">Your bond, your open calls and the record they leave.</p>
      </div>
      <RequireAuth title="Sign in to see your calls" body="Your bond, open positions and the controls to announce an exit live here.">
        {s.address ? <Inner address={s.address} /> : <Skeleton className="h-[320px] rounded-2xl" />}
      </RequireAuth>
    </div>
  )
}

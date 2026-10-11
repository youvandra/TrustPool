import { Coins, Lock, Plus, Shield, ShoppingCart, Wallet } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { averageBps, type Call, type Position } from '@trustpool/core'
import { useSession } from '@/auth/session'
import { Button, ButtonLink, Card, Empty, Modal, SectionHead, Signed, Skeleton, SkeletonRows, Stat, StateTag, TokenIcon } from '@/components/ui'
import { date, mon, signedPct, tokens } from '@/lib/format'
import { source } from '@/lib/data'
import { useLoad, useNow, useTitle } from '@/lib/hooks'
import { actions, useStore } from '@/lib/store'
import { applyLocal, applyLocalParticipants } from '@/lib/view'
import { useAct } from '../components/act'
import { ClockCell } from '../components/CallCard'
import RequireAuth from '../shell/RequireAuth'

type Act = ReturnType<typeof useAct>

async function load(address: string) {
  const [caller, mine, positions, all] = await Promise.all([source.getCaller(address), source.listCalls({ caller: address }), source.positions(address), source.listCalls()])
  return { caller, mine, positions, calls: new Map(all.map((c) => [c.id, c])) }
}

const ended = (c: Call) => c.state === 'Settled' || c.state === 'Refunded' || c.state === 'Split'
const owed = (c: Call, p: Position) => (c.state === 'Split' ? `${tokens(p.claimTokens ?? 0)} ${c.token.symbol}` : mon(p.claimMon ?? 0))

/** One position: what is in, where the call stands, and the one thing to do, if any. */
function PositionRow({ call, p, a }: { call: Call; p: Position; a: Act }) {
  const claimable = ended(call) && !p.claimed
  return (
    <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
      <Link to={`/app/calls/${call.id}`} className="flex min-w-0 items-center gap-3">
        <TokenIcon token={call.token} size={40} />
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-[15px] font-semibold">
            {call.token.symbol} <span className="num text-[12px] font-normal text-ink-3">#{call.id}</span>
            <StateTag state={call.state} size="sm" />
            {p.isCaller && <span className="rounded-full bg-ink px-2 py-0.5 text-[11px] font-medium text-white">your call</span>}
          </p>
          <p className="mt-0.5 text-[12.5px] text-ink-3">
            <span className="num">{mon(p.deposit)}</span> in · {ended(call) ? (p.claimed ? `claimed ${owed(call, p)}` : `${owed(call, p)} to claim`) : `pool ${mon(call.totalIn)}`}
          </p>
        </div>
      </Link>
      <div className="flex items-center gap-4 sm:text-right">
        <div className="min-w-[96px]">
          <ClockCell call={call} />
        </div>
        {claimable && (
          <Button
            variant="secondary"
            size="sm"
            disabled={!!a.pending}
            onClick={() => void a.act('Claiming', (t) => t.claim(call.id), `Claimed ${owed(call, p)}.`, () => actions.claim(call.id))}
          >
            {a.pending === 'Claiming' ? 'Claiming…' : 'Claim'}
          </Button>
        )}
      </div>
    </div>
  )
}

/** A pool the caller opened whose window has closed: the buy is theirs to do, before the deadline. */
function BuyDue({ call, a }: { call: Call; a: Act }) {
  return (
    <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
      <Link to={`/app/calls/${call.id}`} className="flex items-center gap-3">
        <TokenIcon token={call.token} size={40} />
        <div>
          <p className="text-[15px] font-semibold">
            {call.token.symbol} <span className="num text-[12px] font-normal text-ink-3">#{call.id}</span>
          </p>
          <p className="mt-0.5 text-[12.5px] text-ink-3">
            Window closed with <span className="num">{mon(call.totalIn)}</span>. Buy before <span className="num">{date(call.rules.buyDeadline)}</span>.
          </p>
        </div>
      </Link>
      <Button variant="accent" icon={ShoppingCart} disabled={!!a.pending} onClick={() => void a.act('Buying', (t) => t.buy(call.id), 'Bought for the whole pool, one price for everyone.')}>
        {a.pending === 'Buying' ? 'Buying…' : 'Buy for the pool'}
      </Button>
    </div>
  )
}

/** Add to the bond, or start and finish a withdrawal. The contract enforces every rule. */
function BondModal({ open, onClose, act, pending, hasOpen }: { open: boolean; onClose: () => void; act: Act['act']; pending: string | null; hasOpen: boolean }) {
  const busy = !!pending
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
        {pending === 'Posting bond' ? 'Posting bond…' : 'Add to bond'}
      </Button>
      <div className="mt-6 border-t border-line pt-5">
        <p className="text-[13.5px] leading-[1.55] text-ink-2">
          Withdrawing takes two steps: request it, then withdraw after the cooldown. It needs no open or holding calls, and opening a call or adding to the bond cancels a pending request.
        </p>
        <div className="mt-4 flex gap-2">
          <Button variant="secondary" block disabled={busy || hasOpen} onClick={() => void act('Requesting withdrawal', (t) => t.requestBondWithdraw(), 'Withdrawal requested. You can withdraw after the cooldown.')}>
            {pending === 'Requesting withdrawal' ? 'Requesting…' : 'Request withdrawal'}
          </Button>
          <Button variant="secondary" block disabled={busy || hasOpen} onClick={() => void act('Withdrawing', (t) => t.withdrawBond(), 'Bond withdrawn to your wallet.').then((ok) => ok && onClose())}>
            {pending === 'Withdrawing' ? 'Withdrawing…' : 'Withdraw now'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function Inner({ address }: { address: string }) {
  const a = useAct()
  const data = useLoad(() => load(address), [address, a.version])
  const joined = useStore((s) => s.joined)
  const claimed = useStore((s) => s.claimed)
  const [bondOpen, setBondOpen] = useState(false)
  const now = useNow(10_000)

  if (!data)
    return (
      <div className="space-y-6">
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr_1.2fr]">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[190px] rounded-2xl" />
          ))}
        </div>
        <SkeletonRows rows={3} />
      </div>
    )

  const { caller } = data
  // Demo-only deposits and claims, laid over the fixed set; with the API they are already on chain.
  // A demo join on a call the demo set has no position for yet.
  const fresh: Position[] = Object.entries(joined)
    .filter(([id, v]) => v > 0 && !data.positions.some((p) => p.callId === Number(id)))
    .map(([id]) => ({ callId: Number(id), address, deposit: 0, isCaller: false, claimed: false }))
  const rows = [...fresh, ...data.positions]
    .map((p) => {
      const c = data.calls.get(p.callId)
      if (!c) return undefined
      const call = applyLocal(c, joined)
      const [mine] = applyLocalParticipants(call, [p], joined, claimed, address)
      return mine ? { call, p: { ...p, ...mine } } : undefined
    })
    .filter((x): x is { call: Call; p: Position } => !!x)
  const active = rows.filter((r) => !ended(r.call))
  const toClaim = rows.filter((r) => ended(r.call) && !r.p.claimed)
  const history = rows.filter((r) => ended(r.call) && r.p.claimed)
  const buyDue = data.mine.filter((c) => c.state === 'Open' && now >= c.rules.windowEnd && now < c.rules.buyDeadline && c.totalIn >= c.rules.minPool)
  const callerActive = data.mine.some((c) => c.state === 'Open' || c.state === 'Holding')
  const pendingMon = toClaim.filter((r) => r.call.state !== 'Split').reduce((s, r) => s + (r.p.claimMon ?? 0), 0)

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr_1.2fr]">
        <Card className="p-5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-ink text-white">
            <Lock size={16} />
          </span>
          <Stat className="mt-4" label="In pools now" value={mon(active.reduce((s, r) => s + r.p.deposit, 0))} foot={`${active.length} ${active.length === 1 ? 'position' : 'positions'}`} />
        </Card>
        <Card className="p-5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent-fill text-accent-strong">
            <Coins size={16} />
          </span>
          <Stat className="mt-4" label="Waiting to be claimed" value={mon(pendingMon)} foot={`${toClaim.length} ${toClaim.length === 1 ? 'claim' : 'claims'}`} />
        </Card>
        <Card tone="accent" className="p-5">
          <div className="flex items-center justify-between">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/15 text-white">
              <Shield size={16} />
            </span>
            <span className="rounded-full bg-white/15 px-2.5 py-1 text-[11.5px] font-medium text-white">{callerActive ? 'Locked by your calls' : 'Withdrawable after cooldown'}</span>
          </div>
          <p className="mt-4 text-[13px] text-white/80">Bond {caller ? `· tier ${caller.tier}` : ''}</p>
          <p className="num mt-1.5 text-[28px] font-medium tracking-[-0.03em]">{mon(caller?.bond ?? 0)}</p>
          <p className="mt-1 text-[12.5px] text-white/75">
            {caller ? (
              <>
                {caller.record.settled} settled · {caller.record.losses} at a loss
                {caller.record.settled > 0 && (
                  <>
                    {' '}
                    · avg <span className="num">{signedPct(averageBps(caller.record))}</span>
                  </>
                )}
              </>
            ) : (
              'Needed only to open calls'
            )}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setBondOpen(true)} className="h-8 rounded-lg bg-white px-3 text-[13px] font-medium text-accent-deep hover:bg-white/90">
              {caller ? 'Add or withdraw' : 'Post a bond'}
            </button>
            {caller && (
              <Link to={`/app/callers/${caller.address}`} className="px-2 text-[13px] font-medium text-white/90 hover:text-white">
                Your profile →
              </Link>
            )}
          </div>
        </Card>
      </div>

      {buyDue.length > 0 && (
        <Card className="ring-4 ring-accent/[0.08]">
          <SectionHead className="px-5 pt-5" title="Your buy is due" sub="If you do not buy before the deadline, anyone can refund the pool, and your record counts it as negligent." />
          <div className="mt-2 divide-y divide-line">
            {buyDue.map((c) => (
              <BuyDue key={c.id} call={c} a={a} />
            ))}
          </div>
        </Card>
      )}

      {toClaim.length > 0 && (
        <Card>
          <SectionHead className="px-5 pt-5" title="To claim" />
          <div className="mt-2 divide-y divide-line">
            {toClaim.map((r) => (
              <PositionRow key={r.call.id} call={r.call} p={r.p} a={a} />
            ))}
          </div>
        </Card>
      )}

      <Card>
        <SectionHead
          className="px-5 pt-5"
          title="Open positions"
          action={
            <ButtonLink to="/app/new" size="sm" variant="secondary" icon={Plus}>
              New call
            </ButtonLink>
          }
        />
        {active.length === 0 ? (
          <Empty
            icon={<Wallet size={18} />}
            title="Nothing in a pool right now"
            action={
              <ButtonLink to="/app/calls?tab=open" variant="secondary">
                See open windows
              </ButtonLink>
            }
          />
        ) : (
          <div className="mt-2 divide-y divide-line">
            {active.map((r) => (
              <PositionRow key={r.call.id} call={r.call} p={r.p} a={a} />
            ))}
          </div>
        )}
      </Card>

      {history.length > 0 && (
        <Card>
          <SectionHead className="px-5 pt-5" title="History" />
          <ul className="mt-2 divide-y divide-line">
            {history.map(({ call, p }) => (
              <li key={call.id}>
                <Link to={`/app/calls/${call.id}`} className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-subtle">
                  <span className="flex items-center gap-3">
                    <TokenIcon token={call.token} size={32} />
                    <span>
                      <span className="block text-[14px] font-semibold">{call.token.symbol}</span>
                      <span className="num block text-[12px] text-ink-3">
                        {mon(p.deposit)} in · {owed(call, p)} out
                      </span>
                    </span>
                  </span>
                  {call.state === 'Settled' ? <Signed bps={call.netReturnBps!} pill /> : <StateTag state={call.state} size="sm" />}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <BondModal open={bondOpen} onClose={() => setBondOpen(false)} act={a.act} pending={a.pending} hasOpen={callerActive} />
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
      </div>
      <RequireAuth title="Sign in to see your positions" body="Your deposits, claims and bond live here.">
        {s.address ? <Inner address={s.address} /> : <Skeleton className="h-[320px] rounded-2xl" />}
      </RequireAuth>
    </div>
  )
}

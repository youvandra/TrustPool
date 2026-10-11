import { ArrowLeft, ExternalLink, Eye, Lock } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { formatEther } from 'viem'
import { averageBps, trustPoolAbi, callerShareBps, entryPrice, markedBps, returnBps, TIERS, type Call, type Caller, type Participant } from '@trustpool/core'
import { useSession } from '@/auth/session'
import { Button, ButtonLink, Card, CallerAvatar, Empty, Fill, Row, Signed, Skeleton, Sparkline, StateTag, TokenIcon } from '@/components/ui'
import { date, duration, mon, pct, price, shortAddress, tokens } from '@/lib/format'
import { deployment, dexIsMarket, dexUrl, publicClient } from '@/lib/chain'
import { source } from '@/lib/data'
import { useLoad, useNow, useTitle } from '@/lib/hooks'
import { actions, useStore } from '@/lib/store'
import { impactBps, wouldPass } from '@/lib/tx'
import { applyLocal, applyLocalParticipants } from '@/lib/view'
import { useAct } from '../components/act'
import { capOf } from '../components/CallCard'
import Countdown from '../components/Countdown'
import { FollowButton, ShareButton, WatchButton } from '../components/Social'
import Timeline from '../components/Timeline'

async function load(id: number) {
  const call = await source.getCall(id)
  if (!call) return undefined
  const [caller, participants] = await Promise.all([source.getCaller(call.caller), source.participants(id)])
  return { call, caller, participants }
}

const same = (a?: string, b?: string) => !!a && !!b && a.toLowerCase() === b.toLowerCase()
const big = 'mt-1 block text-[40px] font-medium leading-none tracking-[-0.03em] sm:text-[48px]'
const REASON = { take_profit: 'take-profit', stop_loss: 'stop-loss', max_hold: 'max hold' } as const

/** The big status block: what a participant needs to know first, in one glance. */
function Status({ call, now }: { call: Call; now: number }) {
  const r = call.rules
  if (call.state === 'Open' && now < r.windowEnd)
    return (
      <div className="rounded-2xl bg-accent p-5 text-white sm:p-6">
        <p className="flex items-center gap-2 text-[13px] text-white/75">
          <span className="h-2 w-2 animate-pulse2 rounded-full bg-white" /> Window open since {date(call.openedAt)}
        </p>
        <p className="mt-3 text-[13px] text-white/75">Closes in</p>
        <Countdown at={r.windowEnd} done="closing" className={big} />
        <p className="mt-3 text-[13px] text-white/75">
          <span className="num">{mon(call.totalIn)}</span> in from <span className="num">{call.depositors}</span>. Until then anyone can join, or take their MON back 1:1.
        </p>
      </div>
    )
  if (call.state === 'Open')
    return (
      <div className="rounded-2xl bg-ink p-5 text-white sm:p-6">
        <p className="text-[13px] text-white/60">Window closed {date(r.windowEnd)}</p>
        <p className="mt-3 text-[13px] text-white/60">{call.totalIn < r.minPool ? 'Below the minimum: anyone can refund it' : 'The caller must buy within'}</p>
        {call.totalIn < r.minPool ? (
          <span className={`num ${big}`}>{mon(call.totalIn)}</span>
        ) : (
          <Countdown at={r.buyDeadline} done="deadline passed" className={big} />
        )}
        <p className="mt-3 text-[13px] text-white/60">
          {call.totalIn < r.minPool
            ? `The pool needed ${mon(r.minPool)}. Every deposit goes back 1:1, with no mark on the caller.`
            : 'One buy for the whole pool, one price for everyone. If the caller does not buy in time, anyone can refund every deposit and the record says so.'}
        </p>
      </div>
    )
  if (call.state === 'Holding')
    return (
      <div className="rounded-2xl bg-ink p-5 text-white sm:p-6">
        <p className="flex items-center gap-2 text-[13px] text-white/60">
          <Lock size={13} /> Bought together {date(call.boughtAt!)} at <span className="num">{price(entryPrice(call)!)}</span>
        </p>
        <p className="mt-3 text-[13px] text-white/60">Anyone may sell at max hold, in</p>
        <Countdown at={call.holdUntil!} done="any moment now" className={big} />
        <p className="mt-3 text-[13px] text-white/60">
          Or sooner, once two price records a gap apart both meet {r.takeProfitBps ? 'take-profit or ' : ''}stop-loss. Nobody can sell alone, the caller included.
        </p>
      </div>
    )
  if (call.state === 'Refunded')
    return (
      <div className="rounded-2xl bg-subtle p-5 ring-1 ring-inset ring-line sm:p-6">
        <p className="text-[13px] text-ink-2">Refunded {call.closedAt ? date(call.closedAt) : ''}</p>
        <span className={`num ${big}`}>{mon(call.totalIn)}</span>
        <p className="mt-3 text-[13px] text-ink-2">
          {call.negligent
            ? 'The caller did not buy before the deadline. Every deposit goes back 1:1, and the record counts it as negligent.'
            : 'The pool did not go ahead. Every deposit goes back 1:1, with no mark on the caller.'}
        </p>
      </div>
    )
  if (call.state === 'Split')
    return (
      <div className="rounded-2xl bg-loss-fill p-5 sm:p-6">
        <p className="text-[13px] text-ink-2">Could not be sold {call.closedAt ? date(call.closedAt) : ''}</p>
        <span className={`num ${big}`}>{tokens(call.tokens!)}</span>
        <p className="mt-3 text-[13px] text-ink-2">{call.token.symbol} split among participants by deposit. No fee. Recorded as a split, not as a result.</p>
      </div>
    )
  const ret = returnBps(call)!
  return (
    <div className={`rounded-2xl p-5 sm:p-6 ${ret < 0 ? 'bg-loss-fill' : ret > 0 ? 'bg-gain-fill' : 'bg-subtle'}`}>
      <p className="text-[13px] text-ink-2">
        Sold together on {REASON[call.saleReason ?? 'max_hold']} {call.closedAt ? date(call.closedAt) : ''}
      </p>
      <Signed bps={ret} className={big} />
      <p className="mt-3 text-[13px] text-ink-2">
        For every participant, caller included: <span className="num">{mon(call.totalIn)}</span> in, <span className="num">{mon(call.payout!)}</span> out, after the keeper&apos;s{' '}
        <span className="num">{mon(call.keeperReward!)}</span> and the caller&apos;s <span className="num">{mon(call.fee!)}</span> share of profit.
      </p>
    </div>
  )
}

/** Live room in an open pool, from the contract's own capOf, and the impact of an amount. */
function useLiveRoom(call: Call, amount: number) {
  const [cap, setCap] = useState<number | undefined>()
  const [impact, setImpact] = useState<number | undefined>()
  useEffect(() => {
    if (!deployment || source.kind !== 'api' || call.state !== 'Open') return
    publicClient
      .readContract({ address: deployment.trustPool, abi: trustPoolAbi, functionName: 'capOf', args: [BigInt(call.id)] })
      .then((v) => setCap(Number(formatEther(v))))
      .catch(() => {})
  }, [call.id, call.state, call.totalIn])
  useEffect(() => {
    if (!deployment || source.kind !== 'api' || call.state !== 'Open') return
    let live = true
    const t = setTimeout(async () => {
      const c = await publicClient.readContract({ address: deployment!.trustPool, abi: trustPoolAbi, functionName: 'getCall', args: [BigInt(call.id)] }).catch(() => undefined)
      if (!c || !live) return
      const v = await impactBps(c.rules.adapter, c.token, call.totalIn + Math.max(0, amount))
      if (live) setImpact(v)
    }, 300)
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [call.id, call.state, call.totalIn, amount])
  return { cap: cap ?? capOf(call), impact }
}

const input = 'num h-11 w-full rounded-xl border border-line bg-surface px-4 text-ink outline-none focus:border-accent/50 focus:shadow-ring'

/** Everything anyone can do on this call right now, and nothing else. */
function Actions({ call, me, mine, reload }: { call: Call; me?: string; mine?: Participant; reload: () => void }) {
  const { authenticated, login } = useSession()
  const { act, pending, enabled } = useAct()
  const now = useNow(5_000)
  const [amount, setAmount] = useState('0.05')
  const value = Number(amount) || 0
  const { cap, impact } = useLiveRoom(call, value)
  const busy = !!pending
  const r = call.rules
  const isCaller = same(me, call.caller)
  const windowOpen = call.state === 'Open' && now < r.windowEnd
  const room = Math.max(0, cap - call.totalIn)
  // the caller's least stake also caps what joiners can add
  const stakeRoom = Math.max(0, (call.callerStake * 10_000) / r.minCallerBps - call.totalIn)
  const most = isCaller ? room : Math.min(room, stakeRoom)
  const done = (fn: Promise<boolean>) => void fn.then((ok) => ok && reload())

  // Keeper buttons: shown to anyone, enabled when the contract would accept them right now.
  const [allowed, setAllowed] = useState<Record<string, boolean>>({})
  useEffect(() => {
    if (!enabled) return
    let live = true
    const fns = call.state === 'Open' ? (['refund'] as const) : call.state === 'Holding' ? (['checkpoint', 'sell', 'split'] as const) : []
    Promise.all(fns.map(async (f) => [f, await wouldPass(f, call.id, me as `0x${string}` | undefined)] as const)).then((xs) => live && setAllowed(Object.fromEntries(xs)))
    return () => {
      live = false
    }
  }, [enabled, call.id, call.state, call.checkpoints.length, me, now])

  const keeper = (fn: 'checkpoint' | 'sell' | 'refund' | 'split', label: string, doing: string, ok: string) => (
    <Button
      key={fn}
      variant="secondary"
      block
      disabled={busy || !enabled || !allowed[fn]}
      title={enabled ? (allowed[fn] ? undefined : 'Not allowed by the rules right now') : 'Needs a wallet and a deployment'}
      onClick={() => done(act(doing, (t) => t[fn](call.id), ok))}
    >
      {pending === doing ? `${doing}…` : label}
    </Button>
  )

  const claimable = mine && !mine.claimed && (call.state === 'Settled' || call.state === 'Refunded' || call.state === 'Split')

  return (
    <Card className="space-y-3 p-5">
      {windowOpen && (
        <>
          <p className="text-[15px] font-semibold">{isCaller ? 'Add to your stake' : 'Join this pool'}</p>
          <label className="block">
            <span className="flex items-baseline justify-between text-[13px] text-ink-3">
              Amount, MON <span className="num">up to {mon(most)}</span>
            </span>
            <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${input} mt-1.5`} aria-label="Amount in MON" />
          </label>
          <div className="space-y-1 text-[12.5px] text-ink-3">
            <p className="flex justify-between">
              Room under the cap <span className="num text-ink-2">{mon(room)}</span>
            </p>
            {impact !== undefined && (
              <p className="flex justify-between">
                Price impact of the pool&apos;s buy <span className={`num ${impact > r.maxImpactBps ? 'text-loss' : 'text-ink-2'}`}>{pct(impact)} of {pct(r.maxImpactBps)} allowed</span>
              </p>
            )}
            {!isCaller && stakeRoom < room && (
              <p className="flex justify-between">
                Limit from the caller&apos;s {pct(r.minCallerBps)} stake <span className="num text-ink-2">{mon(stakeRoom)}</span>
              </p>
            )}
            {value > most && <p className="text-loss">That is more than the pool can take right now.</p>}
          </div>
          <Button
            variant="accent"
            block
            disabled={busy || !(value > 0) || value > most}
            onClick={() => {
              if (!authenticated) return login()
              done(act('Depositing', (t) => t.deposit(call.id, value), `Joined with ${value} MON. You can take it back until the window closes.`, () => actions.join(call.id, value)))
            }}
          >
            {pending === 'Depositing' ? 'Depositing…' : isCaller ? 'Add to stake' : 'Join'}
          </Button>
          {mine && !isCaller && (
            <Button
              variant="secondary"
              block
              disabled={busy}
              onClick={() => done(act('Withdrawing', (t) => t.withdraw(call.id, mine.deposit), `Took back ${mon(mine.deposit)}.`, () => actions.join(call.id, -mine.deposit)))}
            >
              {pending === 'Withdrawing' ? 'Withdrawing…' : `Take back my ${mon(mine.deposit)}`}
            </Button>
          )}
          <p className="text-[12px] leading-[1.5] text-ink-3">
            Everyone, the caller included, gets the same entry and the same exit. The cap keeps the buy&apos;s impact under {pct(r.maxImpactBps)}.
          </p>
        </>
      )}

      {call.state === 'Open' && !windowOpen && isCaller && call.totalIn >= r.minPool && now < r.buyDeadline && (
        <>
          <p className="text-[15px] font-semibold">Buy for the pool</p>
          <Button variant="accent" block disabled={busy} onClick={() => done(act('Buying', (t) => t.buy(call.id), 'Bought for the whole pool, one price for everyone.'))}>
            {pending === 'Buying' ? 'Buying…' : `Buy ${call.token.symbol} with ${mon(call.totalIn)}`}
          </Button>
          <p className="text-[12px] leading-[1.5] text-ink-3">The contract checks the cap, your stake and the price impact again. If one fails nothing moves, and you can retry until the deadline.</p>
        </>
      )}

      {call.state === 'Open' && !windowOpen && keeper('refund', 'Refund every deposit', 'Refunding', 'Refunded. Everyone can claim their deposit back.')}

      {call.state === 'Holding' && (
        <>
          <p className="text-[15px] font-semibold">Keep this call moving</p>
          <p className="text-[12.5px] leading-[1.5] text-ink-3">
            Anyone may record the price, and sell once the rules allow. The keeper earns {pct(r.keeperBps)} of the sale. The contract sets the least the sale must return.
          </p>
          {keeper('checkpoint', 'Record price', 'Recording', 'Price recorded.')}
          {keeper('sell', 'Sell now', 'Selling', 'Sold together. Everyone can claim.')}
          {allowed.split && keeper('split', 'Split the tokens', 'Splitting', 'Split. Everyone can claim their tokens.')}
        </>
      )}

      {claimable && (
        <Button
          variant="accent"
          block
          disabled={busy}
          onClick={() =>
            done(
              act(
                'Claiming',
                (t) => t.claim(call.id),
                call.state === 'Split' ? 'Claimed your tokens.' : 'Claimed. The MON is in your wallet.',
                () => actions.claim(call.id),
              ),
            )
          }
        >
          {pending === 'Claiming' ? 'Claiming…' : call.state === 'Split' ? `Claim ${tokens(mine.claimTokens ?? 0)} ${call.token.symbol}` : `Claim ${mon(mine.claimMon ?? 0)}`}
        </Button>
      )}
      {mine?.claimed && <p className="text-[13px] text-ink-2">You have claimed your part of this call.</p>}

      <WatchButton id={call.id} block variant={windowOpen || claimable ? 'secondary' : 'primary'} />
      {call.state === 'Holding' && dexUrl(call.token.address) && (
        <ButtonLink href={dexUrl(call.token.address)} target="_blank" rel="noopener noreferrer" variant="ghost" block iconRight={ExternalLink}>
          {dexIsMarket ? `${call.token.symbol} on the market` : `${call.token.symbol} on the explorer`}
        </ButtonLink>
      )}
    </Card>
  )
}

/** Everyone in the pool, what they put in, and what their claim pays. */
function Participants({ call, list, me }: { call: Call; list: Participant[]; me?: string }) {
  const ended = call.state === 'Settled' || call.state === 'Refunded' || call.state === 'Split'
  return (
    <Card className="p-5 sm:p-6">
      <div className="flex items-baseline justify-between">
        <p className="text-[15px] font-semibold">Participants</p>
        <p className="num text-[12.5px] text-ink-3">{list.length}</p>
      </div>
      <div className="mt-4">
        {list.length === 0 && <p className="text-[13.5px] text-ink-3">Nobody yet.</p>}
        {list.map((p) => (
          <Row
            key={p.address}
            label={
              <span className="flex items-center gap-2">
                <CallerAvatar address={p.address} size={20} />
                <span className="num">{shortAddress(p.address)}</span>
                {p.isCaller && <span className="rounded-full bg-ink px-2 py-0.5 text-[11px] font-medium text-white">caller</span>}
                {same(p.address, me) && <span className="rounded-full bg-accent-fill px-2 py-0.5 text-[11px] font-medium text-accent-deep">you</span>}
              </span>
            }
            hint={<span className="num">{pct(Math.round((p.deposit * 10_000) / (call.totalIn || 1)))} of the pool</span>}
          >
            <span className="num">{mon(p.deposit)}</span>
            {ended && (
              <span className="num block text-[12px] text-ink-3">
                {call.state === 'Split' ? `${tokens(p.claimTokens ?? 0)} ${call.token.symbol}` : mon(p.claimMon ?? 0)}
                {p.claimed ? ' · claimed' : ''}
              </span>
            )}
          </Row>
        ))}
      </div>
      {call.state === 'Settled' && (
        <p className="mt-4 text-[12.5px] text-ink-3">
          Every participant: <Signed bps={call.netReturnBps!} />. The caller&apos;s line adds the <span className="num">{pct(call.rules.shareBps)}</span> share of profit, if any.
        </p>
      )}
    </Card>
  )
}

function Rules({ call }: { call: Call }) {
  const r = call.rules
  return (
    <Card className="p-5 sm:p-6">
      <div className="flex items-center justify-between">
        <p className="text-[15px] font-semibold">Rules</p>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-ink px-2.5 py-1 text-[11.5px] font-medium text-white">
          <Lock size={11} /> Fixed at open
        </span>
      </div>
      <div className="mt-5 grid gap-x-10 sm:grid-cols-2 [&>*:nth-child(2)]:sm:border-t-0 [&>*:nth-child(2)]:sm:pt-0">
        <Row label="Take-profit" hint="Above entry, on two price records">
          <span className="num">{r.takeProfitBps ? `+${pct(r.takeProfitBps)}` : 'None'}</span>
        </Row>
        <Row label="Stop-loss" hint="Below entry, on two price records">
          <span className="num">−{pct(r.stopLossBps)}</span>
        </Row>
        <Row label="Max hold" hint="Then anyone may sell">
          <span className="num">{duration(r.maxHold)}</span>
        </Row>
        <Row label="Caller's share" hint="Of profit only; nothing on a loss">
          <span className="num">{pct(r.shareBps)}</span>
        </Row>
        <Row label="Window">
          <span className="num">{duration(r.windowEnd - call.openedAt)}</span>
        </Row>
        <Row label="Cap" hint={`${TIERS[call.tier]?.multiple ?? 2}x the caller's bond, at open`}>
          <span className="num">{mon(r.cap, 0)}</span>
        </Row>
        <Row label="Caller's least stake">
          <span className="num">{pct(r.minCallerBps)}</span>
        </Row>
        <Row label="Keeper reward" hint="Of the sale, to whoever sells">
          <span className="num">{pct(r.keeperBps)}</span>
        </Row>
        <Row label="Can the caller change these?">No, nor can the admin</Row>
      </div>
    </Card>
  )
}

function Price({ call }: { call: Call }) {
  if (call.series.length < 2 || entryPrice(call) === undefined) return null
  const last = call.series[call.series.length - 1]!
  const move = Math.round(((last - call.series[0]!) / call.series[0]!) * 10_000)
  const marked = markedBps(call)
  return (
    <Card className="p-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[13px] text-ink-3">Price since the pool&apos;s entry</p>
          <p className="mt-1 flex items-baseline gap-3">
            <span className="num text-[28px] font-medium tracking-[-0.02em]">{price(last)}</span>
            <span className="text-[13px] text-ink-3">MON</span>
            <Signed bps={move} pill />
          </p>
        </div>
        <p className="flex items-center gap-2 text-[12px] text-ink-3">
          <span className="inline-block h-0 w-5 border-t border-dashed border-ink-3" /> Entry {price(entryPrice(call)!)}
        </p>
      </div>
      <div className="mt-6">
        <Sparkline data={call.series} width={720} height={200} strokeWidth={2} className="h-[150px] sm:h-[200px]" />
      </div>
      {call.state === 'Holding' && call.markedValue !== undefined && marked !== undefined && (
        <p className="mt-4 flex flex-wrap items-baseline gap-2 text-[13.5px] text-ink-2">
          Marked to market: <span className="num font-medium text-ink">{mon(call.markedValue)}</span> for the whole pool
          <Signed bps={marked} pill />
          <span className="text-[12px] text-ink-3">unrealised, quoted {date(call.markedAt!)}</span>
        </p>
      )}
      {call.checkpoints.length > 0 && (
        <div className="mt-4 border-t border-line pt-4 text-[13px]">
          <p className="text-ink-3">Last price records</p>
          {call.checkpoints.map((c) => (
            <p key={c.at} className="mt-1 flex justify-between">
              <span className="num text-ink-3">{date(c.at)}</span>
              <span className="num">
                {mon(c.value)} <Signed bps={Math.trunc(((c.value - call.totalIn) * 10_000) / call.totalIn)} className="ml-2" />
              </span>
            </p>
          ))}
        </div>
      )}
      <p className="mt-3 text-[12px] text-ink-3">{source.kind === 'api' ? 'Sell quotes for the whole position, sampled every few minutes.' : 'Illustrative demo series.'}</p>
    </Card>
  )
}

/** Review input for slashing, never proof. Only the API source has the chain to scan. */
function EarlyBuyers({ call }: { call: Call }) {
  const report = useLoad(() => (call.boughtAt ? source.earlyBuyers(call.id) : Promise.resolve(undefined)), [call.id, call.boughtAt])
  if (source.kind !== 'api' || !call.boughtAt || report === null) return null
  return (
    <Card className="p-5 sm:p-6">
      <p className="text-[15px] font-semibold">Bought just before the pool</p>
      <p className="mt-1 text-[12.5px] leading-[1.5] text-ink-3">{report?.note ?? 'Scanning the blocks before the buy…'}</p>
      {report && (
        <div className="mt-4">
          {report.buyers.length === 0 ? (
            <p className="text-[13.5px] text-ink-2">
              No wallet received {call.token.symbol} in blocks {report.fromBlock} to {report.toBlock}.
            </p>
          ) : (
            // Wallets the caller paid come first, so the cut at eight never hides one.
            [...report.buyers]
              .sort((x, y) => Number(y.fundedByCaller) - Number(x.fundedByCaller))
              .slice(0, 8)
              .map((b) => (
                <Row
                  key={b.wallet}
                  label={
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="num">
                        {shortAddress(b.wallet)}
                        {b.isCaller ? ' (caller)' : ''}
                      </span>
                      {b.fundedByCaller && <span className="rounded-full bg-ink/[0.07] px-2 py-0.5 text-[11.5px] font-medium text-ink">funded by the caller</span>}
                    </span>
                  }
                  hint={`block ${b.firstBlock}`}
                >
                  <span className="num">{tokens(b.amount)}</span>
                </Row>
              ))
          )}
        </div>
      )}
    </Card>
  )
}

function CallerCard({ caller }: { caller: Caller }) {
  return (
    <Card className="p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <Link to={`/app/callers/${caller.address}`} className="flex min-w-0 items-center gap-3">
          <CallerAvatar address={caller.address} size={42} />
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold hover:underline">{caller.handle}</p>
            <p className="num text-[12px] text-ink-3">{shortAddress(caller.address)}</p>
          </div>
        </Link>
        <FollowButton address={caller.address} handle={caller.handle} variant="secondary" />
      </div>
      <div className="mt-5">
        <Row label="Record">
          {caller.record.settled} settled, {caller.record.losses} at a loss
        </Row>
        <Row label="Average net result">{caller.record.settled ? <Signed bps={averageBps(caller.record)} /> : '—'}</Row>
        <Row label="Never bought">
          <span className={`num ${caller.record.negligent ? 'text-loss' : ''}`}>{caller.record.negligent}</span>
        </Row>
        <Row label="Tier">
          <span className="num">{caller.tier}</span>
        </Row>
        <Row label="Bond at stake">
          <span className="num">{mon(caller.bond)}</span>
        </Row>
        <Row label="Bond slashed">
          <span className={`num ${caller.record.slashes ? 'text-loss' : ''}`}>{caller.record.slashes === 1 ? '1 time' : `${caller.record.slashes} times`}</span>
        </Row>
      </div>
    </Card>
  )
}

export default function CallPage() {
  const id = Number(useParams().id)
  const [version, setVersion] = useState(0)
  const data = useLoad(() => load(id), [id, version])
  const joined = useStore((s) => s.joined)
  const claimed = useStore((s) => s.claimed)
  const { address: me } = useSession()
  const now = useNow(5_000)
  useTitle(data?.call ? `${data.call.token.symbol} #${id} · trustpool` : 'Call · trustpool')

  if (data === undefined)
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-80" />
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <Skeleton className="h-[420px] rounded-2xl" />
          <Skeleton className="h-[420px] rounded-2xl" />
        </div>
      </div>
    )
  if (data === null)
    return (
      <Card>
        <Empty title={`There is no call #${id}`} action={<ButtonLink to="/app/calls">All calls</ButtonLink>} />
      </Card>
    )

  const call = applyLocal(data.call, joined)
  const participants = applyLocalParticipants(call, data.participants, joined, claimed, me)
  const mine = participants.find((p) => same(p.address, me))
  const { caller } = data

  return (
    <div className="space-y-6">
      <Link to="/app/calls" className="inline-flex items-center gap-1.5 text-[13px] text-ink-3 hover:text-ink">
        <ArrowLeft size={14} /> Calls
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <TokenIcon token={call.token} size={52} />
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-[26px] font-semibold tracking-[-0.03em] sm:text-[30px]">{call.token.symbol}</h1>
              <span className="num text-[14px] text-ink-3">#{call.id}</span>
              <StateTag state={call.state} />
            </div>
            <p className="mt-0.5 text-[13.5px] text-ink-3">
              {call.token.name} · <span className="num">{shortAddress(call.token.address)}</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 text-[13px] text-ink-3">
            <Eye size={14} /> <span className="num">{call.watchers}</span> watching
          </span>
          <ShareButton path={`/calls/${call.id}`} size="sm" />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          {/* On phones the status and the actions lead: they are what a participant must see first. */}
          <div className="space-y-6 lg:hidden">
            <Status call={call} now={now} />
            <Actions call={call} me={me} mine={mine} reload={() => setVersion((v) => v + 1)} />
          </div>

          {call.state === 'Open' && (
            <Card className="p-5 sm:p-6">
              <div className="flex items-baseline justify-between">
                <p className="text-[15px] font-semibold">The pool</p>
                <p className="num text-[13px] text-ink-3">
                  <span className="font-medium text-ink">{mon(call.totalIn)}</span> of {mon(capOf(call), 0)}
                </p>
              </div>
              <Fill value={call.totalIn} max={capOf(call)} className="mt-3" />
              <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
                {[
                  ['Participants', String(call.depositors)],
                  ["Caller's stake", mon(call.callerStake)],
                  ["Caller's share", pct(callerShareBps(call))],
                  ['Minimum to go ahead', mon(call.rules.minPool)],
                ].map(([l, v]) => (
                  <div key={l}>
                    <p className="text-[12px] text-ink-3">{l}</p>
                    <p className="num mt-1 text-[15px] font-medium">{v}</p>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-[12px] leading-[1.5] text-ink-3">
                The cap is the lower of the caller&apos;s bond times their tier and what one buy can take while keeping its price impact under {pct(call.rules.maxImpactBps)}.
              </p>
            </Card>
          )}

          <Price call={call} />

          <Participants call={call} list={participants} me={me} />
          <Rules call={call} />

          {call.thesis && (
            <Card className="p-5 sm:p-6">
              <p className="text-[15px] font-semibold">Thesis</p>
              <blockquote className="mt-3 border-l-[3px] border-accent pl-4 text-[17px] leading-[1.6] text-ink">{call.thesis}</blockquote>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <div className="hidden space-y-6 lg:block">
            <Status call={call} now={now} />
            <Actions call={call} me={me} mine={mine} reload={() => setVersion((v) => v + 1)} />
          </div>

          <EarlyBuyers call={call} />

          <Card className="p-5 sm:p-6">
            <p className="text-[15px] font-semibold">Timeline</p>
            <div className="mt-5">
              <Timeline call={call} now={now} />
            </div>
          </Card>

          {caller && <CallerCard caller={caller} />}
        </div>
      </div>
    </div>
  )
}


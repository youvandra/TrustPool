import { ArrowLeft, ExternalLink, Eye, Lock } from 'lucide-react'
import { Link, useParams } from 'react-router'
import { averageBps, entryPrice, returnBps, type Call } from '@trustpool/core'
import { ButtonLink, Card, CallerAvatar, Empty, Row, Signed, Skeleton, Sparkline, StateTag, TokenIcon } from '@/components/ui'
import { date, duration, mon, price, shortAddress, signedPct, tokens } from '@/lib/format'
import { source } from '@/lib/data'
import { useLoad, useNow, useTitle } from '@/lib/hooks'
import { useLocalCalls } from '@/lib/view'
import Countdown from '../components/Countdown'
import { FollowButton, WatchButton } from '../components/Social'
import Timeline from '../components/Timeline'

async function load(id: number) {
  const call = await source.getCall(id)
  if (!call) return undefined
  return { call, caller: await source.getCaller(call.caller) }
}

/** The big status block: what a follower needs to know first, in one glance. */
function Status({ call }: { call: Call }) {
  if (call.state === 'Exiting')
    return (
      <div className="rounded-2xl bg-accent p-5 text-white sm:p-6">
        <p className="flex items-center gap-2 text-[13px] text-white/75">
          <span className="h-2 w-2 animate-pulse2 rounded-full bg-white" /> Exit announced {call.announcedAt ? `on ${date(call.announcedAt)}` : ''}
        </p>
        <p className="mt-3 text-[13px] text-white/75">The caller can sell in</p>
        <Countdown at={call.exitAt!} done="any moment now" className="mt-1 block text-[40px] font-medium leading-none tracking-[-0.03em] sm:text-[48px]" />
        <p className="mt-3 text-[13px] text-white/75">at {date(call.exitAt!)}. Until then the position cannot move.</p>
      </div>
    )
  if (call.state === 'Locked')
    return (
      <div className="rounded-2xl bg-ink p-5 text-white sm:p-6">
        <p className="flex items-center gap-2 text-[13px] text-white/60">
          <Lock size={13} /> Locked since {date(call.openedAt)}
        </p>
        <p className="mt-3 text-[13px] text-white/60">Lock ends in</p>
        <Countdown at={call.unlockAt} done="lock ended" className="mt-1 block text-[40px] font-medium leading-none tracking-[-0.03em] sm:text-[48px]" />
        <p className="mt-3 text-[13px] text-white/60">Even then, the caller has to announce an exit and wait {duration(call.notice)} before selling. Nothing announced yet.</p>
      </div>
    )
  const r = returnBps(call)!
  return (
    <div className={`rounded-2xl p-5 sm:p-6 ${r < 0 ? 'bg-loss-fill' : r > 0 ? 'bg-gain-fill' : 'bg-subtle'}`}>
      <p className="text-[13px] text-ink-2">{call.state === 'Released' ? 'Released unsold. Recorded as a total loss.' : `Settled ${call.exitAt ? `on ${date(call.exitAt)}` : ''}`}</p>
      <Signed bps={r} className="mt-3 block text-[40px] font-medium leading-none tracking-[-0.03em] sm:text-[48px]" />
      <p className="mt-3 text-[13px] text-ink-2">From the caller&apos;s own fill: {mon(call.monIn)} in, {mon(call.monOut ?? 0)} out.</p>
    </div>
  )
}

export default function CallPage() {
  const id = Number(useParams().id)
  const data = useLoad(() => load(id), [id])
  const [call] = useLocalCalls(data ? [data.call] : undefined) ?? []
  const now = useNow(30_000)
  useTitle(call ? `${call.token.symbol} #${id} · trustpool` : 'Call · trustpool')

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
  if (data === null || !call)
    return (
      <Card>
        <Empty title={`There is no call #${id}`} action={<ButtonLink to="/app/calls">All calls</ButtonLink>} />
      </Card>
    )

  const { caller } = data
  const last = call.series[call.series.length - 1]!
  const move = Math.round(((last - call.series[0]!) / call.series[0]!) * 10_000)
  const open = call.state === 'Locked' || call.state === 'Exiting'

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
        <span className="flex items-center gap-1.5 text-[13px] text-ink-3">
          <Eye size={14} /> <span className="num">{call.watchers}</span> watching for the exit
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          {/* On phones the status leads: it is the one thing a follower must see first. */}
          <div className="lg:hidden">
            <Status call={call} />
          </div>
          <Card className="p-5 sm:p-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-[13px] text-ink-3">Price since the caller&apos;s entry</p>
                <p className="mt-1 flex items-baseline gap-3">
                  <span className="num text-[28px] font-medium tracking-[-0.02em]">{price(last)}</span>
                  <span className="text-[13px] text-ink-3">MON</span>
                  <Signed bps={move} pill />
                </p>
              </div>
              <p className="flex items-center gap-2 text-[12px] text-ink-3">
                <span className="inline-block h-0 w-5 border-t border-dashed border-ink-3" /> Entry {price(entryPrice(call))}
              </p>
            </div>
            <div className="mt-6">
              <Sparkline data={call.series} width={720} height={200} strokeWidth={2} />
            </div>
            <p className="mt-3 text-[12px] text-ink-3">Illustrative series until the price indexer lands. {open ? 'An open call has no result yet: this move is unrealised.' : ''}</p>
          </Card>

          <div className="grid gap-6 md:grid-cols-2">
            <Card className="p-5 sm:p-6">
              <div className="flex items-center justify-between">
                <p className="text-[15px] font-semibold">Rules</p>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-subtle px-2.5 py-1 text-[11.5px] font-medium text-ink-2 ring-1 ring-inset ring-line">
                  <Lock size={11} /> Fixed at open
                </span>
              </div>
              <div className="mt-5">
                <Row label="Lock">
                  <span className="num">{duration(call.unlockAt - call.openedAt)}</span>
                </Row>
                <Row label="Lock ends">
                  <span className="num">{date(call.unlockAt)}</span>
                </Row>
                <Row label="Exit notice" hint="Between announcing and selling">
                  <span className="num">{duration(call.notice)}</span>
                </Row>
                <Row label="Can the caller change these?">No, nor can the admin</Row>
              </div>
            </Card>

            <Card className="p-5 sm:p-6">
              <p className="text-[15px] font-semibold">Position</p>
              <div className="mt-5">
                <Row label="Caller put in">
                  <span className="num">{mon(call.monIn)}</span>
                </Row>
                <Row label="Tokens received">
                  <span className="num">{tokens(call.tokens)}</span>
                </Row>
                <Row label="Entry price">
                  <span className="num">{price(entryPrice(call))}</span>
                </Row>
                {call.monOut !== undefined ? (
                  <Row label="Caller took out">
                    <span className="num">{mon(call.monOut)}</span>
                  </Row>
                ) : (
                  <Row label="Result">Recorded at exit</Row>
                )}
              </div>
            </Card>
          </div>

          <Card className="p-5 sm:p-6">
            <p className="text-[15px] font-semibold">Thesis</p>
            <blockquote className="mt-3 border-l-2 border-accent pl-4 text-[16px] leading-[1.6] text-ink-2">{call.thesis}</blockquote>
            <p className="mt-3 text-[12px] text-ink-3">Written by the caller at open and fixed since. A record, never a recommendation.</p>
          </Card>
        </div>

        <div className="space-y-6">
          <div className="hidden lg:block">
            <Status call={call} />
          </div>

          {open && (
            <Card className="space-y-3 p-5">
              <WatchButton id={call.id} block />
              <ButtonLink href="#" variant="secondary" block iconRight={ExternalLink} onClick={(e) => e.preventDefault()} aria-disabled>
                Buy {call.token.symbol} on your own
              </ButtonLink>
              <p className="text-[12px] leading-[1.5] text-ink-3">
                You buy at today&apos;s market price, after the caller. Their entry was {price(entryPrice(call))}; the gap is {signedPct(move)}.
              </p>
            </Card>
          )}

          <Card className="p-5 sm:p-6">
            <p className="text-[15px] font-semibold">Timeline</p>
            <div className="mt-5">
              <Timeline call={call} now={now} />
            </div>
          </Card>

          {caller && (
            <Card className="p-5 sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <Link to={`/app/callers/${caller.address}`} className="flex min-w-0 items-center gap-3">
                  <CallerAvatar address={caller.address} size={42} />
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-semibold hover:underline">{caller.handle}</p>
                    <p className="num text-[12px] text-ink-3">{shortAddress(caller.address)}</p>
                  </div>
                </Link>
                <FollowButton address={caller.address} handle={caller.handle} />
              </div>
              <div className="mt-5">
                <Row label="Record">
                  {caller.record.settled + caller.record.released} settled, {caller.record.losses} at a loss
                </Row>
                <Row label="Average result">
                  <Signed bps={averageBps(caller.record)} />
                </Row>
                <Row label="Bond at stake">
                  <span className="num">{mon(caller.bond)}</span>
                </Row>
                <Row label="Bond slashed">
                  <span className={`num ${caller.record.slashes ? 'text-loss' : ''}`}>{caller.record.slashes} times</span>
                </Row>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

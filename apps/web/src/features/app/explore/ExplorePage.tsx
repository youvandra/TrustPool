import { ArrowRight, ArrowUpRight, Eye, Search, Triangle, Users } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { averageBps, type Call, type Caller } from '@trustpool/core'
import { Button, CallerAvatar, Card, Empty, Fill, Signed, SkeletonRows, StateTag, Tabs, TokenIcon } from '@/components/ui'
import { ago, date, duration, mon, pct, price, shortAddress, signedPct, toneOf } from '@/lib/format'
import { source } from '@/lib/data'
import { useLoad, useTitle } from '@/lib/hooks'
import { useStore } from '@/lib/store'
import { useLocalCalls } from '@/lib/view'
import { useSession } from '@/auth/session'
import { FollowButton } from '../components/Social'
import { capOf } from '../components/CallCard'
import Countdown from '../components/Countdown'

type Kind = 'opened' | 'bought' | 'ended'
interface Post {
  key: string
  kind: Kind
  at: number
  call: Call
}

async function load() {
  const [calls, callers] = await Promise.all([source.listCalls(), source.listCallers()])
  return { calls, callers }
}

/** Every call is up to three posts: it opened, it bought, it ended. Newest first, losses included. */
function postsOf(calls: Call[]): Post[] {
  const out: Post[] = []
  for (const c of calls) {
    out.push({ key: `${c.id}:opened`, kind: 'opened', at: c.openedAt, call: c })
    if (c.boughtAt) out.push({ key: `${c.id}:bought`, kind: 'bought', at: c.boughtAt, call: c })
    if (c.closedAt && c.state !== 'Open' && c.state !== 'Holding') out.push({ key: `${c.id}:ended`, kind: 'ended', at: c.closedAt, call: c })
  }
  return out.sort((a, b) => b.at - a.at)
}

const nameOf = (address: string, caller?: Caller) => caller?.handle || shortAddress(address)
const people = (n: number) => `${n} ${n === 1 ? 'participant' : 'participants'}`
const REASON = { take_profit: 'take-profit', stop_loss: 'stop-loss', max_hold: 'max hold' } as const

/** One line on what happened. The result itself sits in the attachment, the same size either way. */
function headline({ kind, call }: Post): string {
  const sym = call.token.symbol
  if (kind === 'opened') return `Opened a pool on ${sym} with ${mon(call.callerStake)} of their own`
  if (kind === 'bought') return `Bought ${sym} for the pool with ${mon(call.totalIn)} from ${people(call.depositors)}, one price for all`
  if (call.state === 'Settled') return `Their pool on ${sym} sold on ${REASON[call.saleReason ?? 'max_hold']}`
  if (call.state === 'Refunded') return call.negligent ? `Did not buy for the pool on ${sym}; every deposit was refunded` : `Their pool on ${sym} did not go ahead; every deposit was refunded`
  return `Their pool on ${sym} could not be sold; each participant took their share of the tokens`
}

function RulesLine({ call }: { call: Call }) {
  const r = call.rules
  return (
    <p className="num flex flex-wrap gap-x-3 gap-y-1 text-[12.5px] text-ink-3">
      <span>TP {r.takeProfitBps ? `+${pct(r.takeProfitBps)}` : 'none'}</span>
      <span>SL −{pct(r.stopLossBps)}</span>
      <span>Hold {duration(r.maxHold)}</span>
      <span>{pct(r.shareBps)} of profit to the caller</span>
    </p>
  )
}

const TONE = { gain: 'text-gain', loss: 'text-loss', flat: 'text-ink-2' } as const

/** Entry, then the latest price (or the exit), and the move between them. Price only: the result for participants is shown apart. */
function Ticker({ call }: { call: Call }) {
  const entry = call.series[0]!
  const last = call.series[call.series.length - 1]!
  const bps = Math.round((last / entry - 1) * 10_000)
  const tone = toneOf(bps)
  const sold = call.state === 'Settled'
  return (
    <div className="num mt-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-[12.5px]">
      <span className="text-ink-3">
        Entry <span className="text-ink">{price(entry)}</span> → {sold ? 'Exit' : 'Last'} <span className="text-ink">{price(last)}</span> MON
      </span>
      <span className={`flex items-center gap-1 font-medium ${TONE[tone]}`}>
        {tone !== 'flat' && <Triangle size={9} fill="currentColor" strokeWidth={0} className={bps < 0 ? 'rotate-180' : ''} />}
        {signedPct(bps)}
      </span>
    </div>
  )
}

/** Where the price sits between the stop-loss and the take-profit: one thin bar, the entry marked, a dot for now. */
function RangeBar({ call }: { call: Call }) {
  const r = call.rules
  const entry = call.series[0]!
  const last = call.series[call.series.length - 1]!
  const down = r.stopLossBps / 10_000
  const up = (r.takeProfitBps || r.stopLossBps) / 10_000
  const lo = entry * (1 - down)
  const hi = entry * (1 + up)
  const at = (v: number) => Math.min(100, Math.max(0, ((v - lo) / (hi - lo)) * 100))
  const tone = toneOf(last - entry)
  return (
    <div className="mt-2.5">
      <div className="relative h-1.5 rounded-full bg-ink/[0.06]">
        <span className="absolute inset-y-[-3px] w-px bg-ink-3/60" style={{ left: `${at(entry)}%` }} />
        <span
          className={`absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface ${tone === 'loss' ? 'bg-loss' : tone === 'gain' ? 'bg-gain' : 'bg-ink-2'}`}
          style={{ left: `${at(last)}%` }}
        />
      </div>
      <div className="num mt-1.5 flex justify-between text-[11px] text-ink-3">
        <span>SL −{pct(r.stopLossBps)}</span>
        <span>{r.takeProfitBps ? `TP +${pct(r.takeProfitBps)}` : `no TP · +${pct(r.stopLossBps)}`}</span>
      </div>
    </div>
  )
}

/** The pool as it stands now, attached under the post like a link preview. */
function Attachment({ post }: { post: Post }) {
  const { call, kind } = post
  const open = call.state === 'Open' && call.rules.windowEnd > Date.now()
  return (
    <Link
      to={`/app/calls/${call.id}`}
      className="mt-3 block rounded-xl border border-line bg-surface p-3.5 transition-colors hover:border-line-strong hover:bg-subtle sm:p-4"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <TokenIcon token={call.token} size={28} />
          <p className="flex items-baseline gap-1.5 text-[14px] font-semibold">
            {call.token.symbol}
            <span className="num text-[12px] font-normal text-ink-3">#{call.id}</span>
          </p>
        </div>
        <StateTag state={call.state} size="sm" />
      </div>

      {kind === 'opened' ? (
        open && (
          <div className="mt-3">
            <div className="flex items-baseline justify-between text-[12.5px] text-ink-3">
              <span>
                Raised · closes in <Countdown at={call.rules.windowEnd} done="now" short className="text-accent-deep" />
              </span>
              <span className="num">
                <span className="font-medium text-ink">{mon(call.totalIn)}</span> of {mon(capOf(call))}
              </span>
            </div>
            <Fill value={call.totalIn} max={capOf(call)} className="mt-2" />
          </div>
        )
      ) : kind === 'bought' && call.state !== 'Holding' ? (
        <p className="num mt-3 text-[12.5px] text-ink-3">
          Entry <span className="text-ink">{price(call.series[0] ?? 0)}</span> MON for every participant
        </p>
      ) : call.series.length > 0 && call.state !== 'Refunded' ? (
        <>
          <Ticker call={call} />
          <RangeBar call={call} />
        </>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        {kind === 'opened' ? (
          <RulesLine call={call} />
        ) : kind === 'ended' && call.state === 'Settled' && call.netReturnBps !== undefined ? (
          <p className="flex items-center gap-2 text-[13px] text-ink-2">
            <Signed bps={call.netReturnBps} pill /> for every participant, on the record
          </p>
        ) : (
          <p className="num text-[12.5px] text-ink-3">
            {mon(call.totalIn)} from {people(call.depositors)}
          </p>
        )}
        <span className="flex items-center gap-1 text-[12px] text-ink-3">
          View pool <ArrowUpRight size={13} />
        </span>
      </div>
    </Link>
  )
}

function PostItem({ post, caller }: { post: Post; caller?: Caller }) {
  const { call, kind } = post
  const name = nameOf(call.caller, caller)
  return (
    <li className="flex gap-3 px-4 py-4 sm:px-5">
      <Link to={`/app/callers/${call.caller}`} className="shrink-0" aria-label={name}>
        <CallerAvatar address={call.caller} size={40} />
      </Link>
      <div className="min-w-0 flex-1">
        <p className="min-w-0 truncate text-[13.5px]">
          <Link to={`/app/callers/${call.caller}`} className="font-semibold hover:underline">
            {name}
          </Link>
          <span className="text-ink-3">
            {' '}
            · Tier <span className="num">{caller?.tier ?? call.tier}</span> · <span title={date(post.at)}>{ago(post.at)}</span>
          </span>
        </p>
        <p className="mt-0.5 text-[14px] leading-[1.5] text-ink-2">{headline(post)}.</p>
        {kind === 'opened' && call.thesis && <p className="mt-2 whitespace-pre-line text-[14.5px] leading-[1.55] text-ink">{call.thesis}</p>}
        <Attachment post={post} />
        <p className="mt-2.5 flex items-center gap-4 text-[12px] text-ink-3">
          <span className="flex items-center gap-1">
            <Eye size={13} /> <span className="num">{call.watchers}</span> watching
          </span>
          <span className="flex items-center gap-1">
            <Users size={13} /> {people(call.depositors)}
          </span>
        </p>
      </div>
    </li>
  )
}

/** Who to look at. Ordered by last activity, never by returns. */
function CallerList({ callers, me }: { callers: Caller[]; me?: string }) {
  const sorted = [...callers].sort((a, b) => b.record.lastActive - a.record.lastActive)
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[15px] font-semibold">Callers</p>
        <Link to="/app/callers" className="flex items-center gap-1 text-[12.5px] font-medium text-accent-deep hover:underline">
          Leaderboard <ArrowRight size={13} />
        </Link>
      </div>
      <p className="mt-0.5 text-[12.5px] text-ink-3">By last activity, never by returns.</p>
      <ul className="mt-3 space-y-1">
        {sorted.map((c) => (
          <li key={c.address} className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-subtle">
            <Link to={`/app/callers/${c.address}`} className="flex min-w-0 flex-1 items-center gap-3">
              <CallerAvatar address={c.address} size={36} />
              <div className="min-w-0">
                <p className="truncate text-[13.5px] font-semibold">{nameOf(c.address, c)}</p>
                <p className="text-[12px] leading-[1.45] text-ink-3">
                  <span className="whitespace-nowrap">
                    <span className="num">{c.record.settled}</span> settled
                  </span>{' '}
                  ·{' '}
                  <span className="whitespace-nowrap">
                    <span className="num">{c.record.losses}</span> at a loss
                  </span>
                  {c.record.settled > 0 && (
                    <span className="whitespace-nowrap">
                      {' '}
                      · <Signed bps={averageBps(c.record)} />
                    </span>
                  )}
                </p>
              </div>
            </Link>
            {me === c.address.toLowerCase() ? (
              <span className="rounded-full bg-accent-fill px-2.5 py-1 text-[12px] font-medium text-accent-deep">You</span>
            ) : (
              <FollowButton address={c.address} handle={c.handle} variant="secondary" compact />
            )}
          </li>
        ))}
      </ul>
    </Card>
  )
}

const PAGE = 20

/** What callers did, as a timeline: every pool opened, bought and ended, losses as plainly as gains. */
export default function ExplorePage() {
  useTitle('Explore · trustpool')
  const data = useLoad(load, [])
  const calls = useLocalCalls(data?.calls)
  const [tab, setTab] = useState<'everyone' | 'following'>('everyone')
  const [q, setQ] = useState('')
  const [shown, setShown] = useState(PAGE)
  const { authenticated, login, address } = useSession()
  const me = address?.toLowerCase()
  const following = useStore((s) => s.following)

  const byAddress = new Map((data?.callers ?? []).map((c) => [c.address.toLowerCase(), c]))
  const followed = new Set(following.map((a) => a.toLowerCase()))
  const needle = q.trim().toLowerCase()
  const posts = postsOf(calls ?? []).filter(({ call }) => {
    if (tab === 'following' && !followed.has(call.caller.toLowerCase())) return false
    if (!needle) return true
    const c = byAddress.get(call.caller.toLowerCase())
    return (c?.handle ?? '').toLowerCase().includes(needle) || call.caller.toLowerCase().includes(needle) || call.token.symbol.toLowerCase().includes(needle)
  })

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h1 className="text-[26px] font-semibold tracking-[-0.03em] sm:text-[30px]">Explore</h1>
          <label className="flex h-10 w-full items-center gap-2 rounded-xl border border-line bg-surface px-3 text-ink-3 focus-within:border-accent/50 focus-within:shadow-ring sm:w-[260px]">
            <Search size={15} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Caller or token" className="w-full bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-3" />
          </label>
        </div>
        <Tabs
          id="explore-feed"
          value={tab}
          onChange={(v) => {
            setTab(v)
            setShown(PAGE)
          }}
          options={[
            { v: 'everyone', label: 'Everyone' },
            { v: 'following', label: 'Following' },
          ]}
          className="w-fit"
        />

        {!data ? (
          <SkeletonRows rows={4} />
        ) : tab === 'following' && !authenticated ? (
          <Card>
            <Empty icon={<Users size={18} />} title="Sign in to see the callers you follow" action={<Button onClick={login}>Sign in</Button>} />
          </Card>
        ) : posts.length === 0 ? (
          <Card>
            <Empty
              icon={<Users size={18} />}
              title={needle ? 'Nothing matches that search' : tab === 'following' ? 'No activity from callers you follow yet' : 'No activity yet'}
              action={
                needle ? (
                  <Button variant="secondary" onClick={() => setQ('')}>
                    Clear search
                  </Button>
                ) : undefined
              }
            />
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <ul className="divide-y divide-line">
              {posts.slice(0, shown).map((p) => (
                <PostItem key={p.key} post={p} caller={byAddress.get(p.call.caller.toLowerCase())} />
              ))}
            </ul>
            {posts.length > shown && (
              <div className="border-t border-line p-3 text-center">
                <Button variant="ghost" size="sm" onClick={() => setShown((n) => n + PAGE)}>
                  Show more
                </Button>
              </div>
            )}
          </Card>
        )}
      </div>

      <aside className="hidden space-y-4 lg:sticky lg:top-20 lg:block lg:self-start">{data && <CallerList callers={data.callers} me={me} />}</aside>
    </div>
  )
}

import { ArrowRight, ArrowUpRight, Eye, Search, Users } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { averageBps, type Call, type Caller } from '@trustpool/core'
import { Button, CallerAvatar, Card, Empty, Fill, Signed, SkeletonRows, Sparkline, StateTag, Tabs, TokenIcon } from '@/components/ui'
import { ago, date, duration, mon, pct, shortAddress } from '@/lib/format'
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
  if (kind === 'opened') return `opened a pool on ${sym} with ${mon(call.callerStake)} of their own`
  if (kind === 'bought') return `bought ${sym} for the pool with ${mon(call.totalIn)} from ${people(call.depositors)}, one price for all`
  if (call.state === 'Settled') return `pool on ${sym} sold on ${REASON[call.saleReason ?? 'max_hold']}`
  if (call.state === 'Refunded') return call.negligent ? `did not buy for the pool on ${sym}; every deposit was refunded` : `pool on ${sym} did not go ahead; every deposit was refunded`
  return `pool on ${sym} could not be sold; each participant took their share of the tokens`
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

      {kind === 'opened' && open ? (
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
      ) : call.series.length > 1 ? (
        <div className="-mx-1 mt-2">
          <Sparkline data={call.series} width={520} height={44} />
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        {kind === 'opened' ? (
          <RulesLine call={call} />
        ) : call.state === 'Settled' && call.netReturnBps !== undefined ? (
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

function PostItem({ post, caller, me }: { post: Post; caller?: Caller; me?: string }) {
  const { call, kind } = post
  const name = nameOf(call.caller, caller)
  return (
    <li className="flex gap-3 px-4 py-4 sm:px-5">
      <Link to={`/app/callers/${call.caller}`} className="shrink-0" aria-label={name}>
        <CallerAvatar address={call.caller} size={40} />
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 truncate text-[13.5px]">
            <Link to={`/app/callers/${call.caller}`} className="font-semibold hover:underline">
              {name}
            </Link>
            <span className="text-ink-3">
              {' '}
              · Tier <span className="num">{caller?.tier ?? call.tier}</span> · <span title={date(post.at)}>{ago(post.at)}</span>
            </span>
          </p>
          {kind === 'opened' && me !== call.caller.toLowerCase() && <FollowButton address={call.caller} handle={caller?.handle} variant="secondary" compact />}
        </div>
        <p className="mt-0.5 text-[14px] leading-[1.5] text-ink-2">{headline(post)}.</p>
        {kind === 'opened' && call.thesis && <p className="mt-2 whitespace-pre-line text-[14.5px] leading-[1.55] text-ink">{call.thesis}</p>}
        <Attachment post={post} />
        <p className="mt-2.5 flex items-center gap-4 text-[12px] text-ink-3">
          <span className="flex items-center gap-1">
            <Eye size={13} /> <span className="num">{call.watchers}</span> watching
          </span>
          <span className="flex items-center gap-1">
            <Users size={13} /> <span className="num">{call.depositors}</span> in
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
                  <span className="num">{c.record.settled}</span> settled · <span className="num">{c.record.losses}</span> at a loss
                  {c.record.settled > 0 && (
                    <>
                      {' '}
                      · <Signed bps={averageBps(c.record)} />
                    </>
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
                <PostItem key={p.key} post={p} caller={byAddress.get(p.call.caller.toLowerCase())} me={me} />
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

      <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">{data && <CallerList callers={data.callers} me={me} />}</aside>
    </div>
  )
}

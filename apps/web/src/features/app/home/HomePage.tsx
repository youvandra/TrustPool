import { ArrowUpRight, BellRing, Lock, Receipt, Shield } from 'lucide-react'
import { Link } from 'react-router'
import { averageBps, returnBps, type Call, type Caller } from '@trustpool/core'
import { useSession } from '@/auth/session'
import { Button, Card, CallerAvatar, Empty, SeeAll, SectionHead, Signed, Skeleton, Stat } from '@/components/ui'
import { mon } from '@/lib/format'
import { useLoad, useTitle } from '@/lib/hooks'
import { source } from '@/lib/data'
import { isFollowing, useStore } from '@/lib/store'
import { useLocalCalls } from '@/lib/view'
import CallCard, { CallRow } from '../components/CallCard'
import Countdown from '../components/Countdown'

async function load() {
  const [calls, callers] = await Promise.all([source.listCalls(), source.listCallers()])
  return { calls, callers }
}

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

/** Four numbers that describe the whole board right now. */
function Pulse({ calls, callers }: { calls: Call[]; callers: Caller[] }) {
  const exiting = calls.filter((c) => c.state === 'Exiting').sort((a, b) => a.exitAt! - b.exitAt!)
  const locked = calls.filter((c) => c.state === 'Locked')
  const done = calls.filter((c) => c.state === 'Settled' || c.state === 'Released')
  const losses = done.filter((c) => returnBps(c)! < 0).length
  const bonded = callers.reduce((s, c) => s + c.bond, 0)
  const tiles = [
    {
      icon: BellRing,
      label: 'Exits announced',
      value: exiting.length,
      foot: exiting[0] ? (
        <>
          next in <Countdown at={exiting[0].exitAt!} className="text-accent-deep" />
        </>
      ) : (
        'none pending'
      ),
      accent: true,
    },
    { icon: Lock, label: 'Locked now', value: locked.length, foot: `${mon(locked.reduce((s, c) => s + c.monIn, 0), 0)} of callers' own money` },
    { icon: Receipt, label: 'Settled', value: done.length, foot: `${losses} of them at a loss` },
    { icon: Shield, label: 'Bonded', value: mon(bonded, 0), foot: `across ${callers.length} callers` },
  ]
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tiles.map((t) => (
        <Card key={t.label} className={`p-4 sm:p-5 ${t.accent ? 'border-accent/30 bg-accent-soft' : ''}`}>
          <div className={`grid h-8 w-8 place-items-center rounded-lg ${t.accent ? 'bg-accent text-white' : 'bg-subtle text-ink-2 ring-1 ring-inset ring-line'}`}>
            <t.icon size={15} />
          </div>
          <Stat className="mt-4" label={t.label} value={t.value} foot={t.foot} />
        </Card>
      ))}
    </div>
  )
}

function FollowingList({ callers }: { callers: Caller[] }) {
  const following = useStore((s) => s.following)
  const { authenticated } = useSession()
  const mine = callers.filter((c) => authenticated && following.some((f) => f.toLowerCase() === c.address.toLowerCase()))
  const suggest = callers.filter((c) => !mine.includes(c)).slice(0, 3)
  return (
    <Card className="p-5">
      <SectionHead title={mine.length ? 'Following' : 'Callers to look at'} sub={mine.length ? 'Their next call reaches your alerts' : 'Newest activity first'} action={<SeeAll to="/app/callers" />} />
      <ul className="mt-4 space-y-1">
        {(mine.length ? mine : suggest).map((c) => (
          <li key={c.address}>
            <Link to={`/app/callers/${c.address}`} className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-subtle">
              <CallerAvatar address={c.address} size={36} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-medium">{c.handle}</p>
                <p className="text-[12px] text-ink-3">
                  {c.record.settled + c.record.released} settled · {c.record.losses} at a loss
                </p>
              </div>
              <Signed bps={averageBps(c.record)} pill />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  )
}

function HowCard() {
  const steps = ['Caller buys with their own MON and it locks', 'To sell, they announce it publicly first', 'You get the notice period as a head start', 'The result lands on their record, losses too']
  return (
    <Card className="overflow-hidden">
      <div className="dots bg-subtle px-5 pb-5 pt-5">
        <p className="eyebrow text-ink-3">New here</p>
        <p className="mt-2 text-[16px] font-semibold tracking-[-0.01em]">How a call protects you</p>
      </div>
      <ol className="space-y-3 p-5">
        {steps.map((s, i) => (
          <li key={s} className="flex gap-3 text-[13.5px] text-ink-2">
            <span className="num grid h-5 w-5 shrink-0 place-items-center rounded-full bg-ink text-[10.5px] text-white">{i + 1}</span>
            {s}
          </li>
        ))}
      </ol>
      <Link to="/#how" className="flex items-center justify-between border-t border-line px-5 py-3 text-[13px] font-medium text-ink-2 hover:text-ink">
        Read the full mechanism <ArrowUpRight size={14} />
      </Link>
    </Card>
  )
}

export default function HomePage() {
  useTitle('Home · trustpool')
  const s = useSession()
  const data = useLoad(load, [])
  const calls = useLocalCalls(data?.calls)
  const watching = useStore((st) => st.watching)
  const followed = useStore((st) => st)
  const by = (a: string) => data?.callers.find((c) => c.address.toLowerCase() === a.toLowerCase())

  if (!data || !calls)
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-72" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[136px] rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-[320px] rounded-2xl" />
      </div>
    )

  const exiting = calls.filter((c) => c.state === 'Exiting').sort((a, b) => a.exitAt! - b.exitAt!)
  const fresh = calls.filter((c) => c.state === 'Locked').slice(0, 3)
  const mineFirst = (c: Call) => (watching.includes(c.id) || isFollowing(followed, c.caller) ? 0 : 1)

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-semibold tracking-[-0.03em] sm:text-[30px]">{s.authenticated ? `${greeting()}, ${s.label?.split(' ')[0] ?? 'there'}` : 'Today on trustpool'}</h1>
          <p className="mt-1 text-[14px] text-ink-3">Every caller here bought first. This is where they stand.</p>
        </div>
        {source.kind === 'demo' && <span className="rounded-full border border-dashed border-line-strong px-3 py-1 text-[12px] text-ink-3">Demo data</span>}
      </div>

      <Pulse calls={calls} callers={data.callers} />

      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <Card className="p-2 sm:p-3">
            <SectionHead
              className="px-3 pb-2 pt-3"
              title="Exiting soon"
              sub="Callers who announced they are selling. The clock is your head start."
              action={<SeeAll to="/app/calls?tab=exiting" />}
            />
            {exiting.length === 0 ? (
              <Empty icon={<BellRing size={18} />} title="No exits announced" body="When a caller announces one, it shows here hours before it can execute." />
            ) : (
              <div className="divide-y divide-line">
                {[...exiting].sort((a, b) => mineFirst(a) - mineFirst(b)).map((c) => (
                  <CallRow key={c.id} call={c} caller={by(c.caller)} />
                ))}
              </div>
            )}
          </Card>

          <div>
            <SectionHead title="New calls" sub="Opened recently. The entry you see is the caller's own fill." action={<SeeAll to="/app/calls" />} />
            <div className="mt-4 grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
              {fresh.map((c) => (
                <CallCard key={c.id} call={c} caller={by(c.caller)} />
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <FollowingList callers={data.callers} />
          <HowCard />
          {!s.authenticated && (
            <Card className="p-5">
              <p className="text-[15px] font-semibold">Get exit alerts</p>
              <p className="mt-1 text-[13.5px] leading-[1.5] text-ink-3">Sign in to follow callers and hear about exits the moment they are announced.</p>
              <Button className="mt-4" onClick={s.login}>
                Sign in
              </Button>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

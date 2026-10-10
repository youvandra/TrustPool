import { Search, Users } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { averageBps } from '@trustpool/core'
import { Button, CallerAvatar, Card, Empty, Signed, SkeletonRows } from '@/components/ui'
import { ago, compact, date, mon } from '@/lib/format'
import { source } from '@/lib/data'
import { useLoad, useTitle } from '@/lib/hooks'
import { useSession } from '@/auth/session'
import { FollowButton } from '../components/Social'

/** Every caller with a bond. Ordered by last activity, never by returns. */
export default function CallersPage() {
  useTitle('Callers · trustpool')
  const callers = useLoad(() => source.listCallers(), [])
  const [q, setQ] = useState('')
  const me = useSession().address?.toLowerCase()
  const shown = (callers ?? [])
    .filter((c) => !q || (c.handle ?? '').toLowerCase().includes(q.toLowerCase()) || c.address.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b.record.lastActive - a.record.lastActive)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-semibold tracking-[-0.03em] sm:text-[30px]">Callers</h1>
        </div>
        <label className="flex h-10 w-full items-center gap-2 rounded-xl border border-line bg-surface px-3 text-ink-3 focus-within:border-accent/50 focus-within:shadow-ring sm:w-[260px]">
          <Search size={15} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a caller" className="w-full bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-3" />
        </label>
      </div>

      {!callers ? (
        <SkeletonRows rows={4} />
      ) : shown.length === 0 ? (
        <Card>
          <Empty
            icon={<Users size={18} />}
            title="No caller by that name"
            action={
              <Button variant="secondary" onClick={() => setQ('')}>
                Clear search
              </Button>
            }
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="hidden grid-cols-[minmax(0,1fr)_72px_80px_96px_96px_72px_104px] gap-4 border-b border-line bg-subtle px-5 py-3 text-[12px] text-ink-3 lg:grid">
            <span>Caller</span>
            <span className="text-right">Settled</span>
            <span className="text-right">At a loss</span>
            <span className="text-right">Average</span>
            <span className="text-right">Bond</span>
            <span className="text-right">Slashed</span>
            <span />
          </div>
          <ul className="divide-y divide-line">
            {shown.map((c) => (
              <li key={c.address}>
                <Link
                  to={`/app/callers/${c.address}`}
                  className="grid cursor-pointer grid-cols-[1fr_auto] items-center gap-4 px-4 py-4 transition-colors hover:bg-subtle sm:px-5 lg:grid-cols-[minmax(0,1fr)_72px_80px_96px_96px_72px_104px]"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <CallerAvatar address={c.address} size={40} />
                    <div className="min-w-0">
                      <p className="truncate text-[14.5px] font-semibold">{c.handle}</p>
                      <p className="truncate text-[12.5px] text-ink-3">
                        {compact(c.followers)} followers · <span title={date(c.record.lastActive)}>active {ago(c.record.lastActive)}</span>
                      </p>
                      <p className="mt-1 flex flex-wrap gap-x-1 text-[12.5px] text-ink-2 lg:hidden">
                        <span className="whitespace-nowrap">
                          <span className="num">{c.record.settled + c.record.released}</span> settled, <span className="num">{c.record.losses}</span> at a loss
                        </span>
                        <span className="whitespace-nowrap">
                          · <Signed bps={averageBps(c.record)} />
                        </span>
                      </p>
                    </div>
                  </div>
                  <span className="num hidden text-right text-[14px] lg:block">{c.record.settled + c.record.released}</span>
                  <span className="num hidden text-right text-[14px] lg:block">{c.record.losses}</span>
                  <span className="hidden text-right text-[14px] lg:block">
                    <Signed bps={averageBps(c.record)} />
                  </span>
                  <span className="num hidden text-right text-[14px] lg:block">{mon(c.bond)}</span>
                  <span className={`num hidden text-right text-[14px] lg:block ${c.record.slashes ? 'text-loss' : 'text-ink-3'}`}>{c.record.slashes}</span>
                  <span className="flex justify-end" onClick={(e) => e.preventDefault()}>
                    {me === c.address.toLowerCase() ? (
                      <span className="rounded-full bg-accent-fill px-2.5 py-1 text-[12px] font-medium text-accent-deep">You</span>
                    ) : (
                      <FollowButton address={c.address} handle={c.handle} variant="secondary" compact />
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}

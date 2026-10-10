import { useMemo, useState } from 'react'
import Container from '@/components/site/Container'
import { DemoNote, Segmented } from '@/components/ui'
import { source } from '@/lib/data'
import { useLoad, useTitle } from '@/lib/hooks'
import type { Call, Caller, CallState } from '@/lib/types'
import CallCard from './components/CallCard'

type Tab = 'open' | 'exiting' | 'done'
const IN_TAB: Record<Tab, CallState[]> = { open: ['Locked'], exiting: ['Exiting'], done: ['Settled', 'Released'] }

async function loadFeed(): Promise<{ calls: Call[]; callers: Record<string, Caller> }> {
  const calls = await source.listCalls()
  const addrs = [...new Set(calls.map((c) => c.caller))]
  const callers = await Promise.all(addrs.map((a) => source.getCaller(a)))
  return { calls, callers: Object.fromEntries(callers.filter((c): c is Caller => !!c).map((c) => [c.address, c])) }
}

/** Every call, newest first. Finished calls sit one tab away and carry the same weight as open ones. */
export default function FeedPage() {
  useTitle('Calls · trustpool')
  const data = useLoad(loadFeed, [])
  const [tab, setTab] = useState<Tab>('open')
  const counts = useMemo(() => {
    const n = (t: Tab) => data?.calls.filter((c) => IN_TAB[t].includes(c.state)).length ?? 0
    return { open: n('open'), exiting: n('exiting'), done: n('done') }
  }, [data])
  const shown = data?.calls.filter((c) => IN_TAB[tab].includes(c.state)) ?? []

  return (
    <main className="min-h-screen pb-24 pt-28 sm:pt-32">
      <Container>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="eyebrow text-ink-quiet">Calls</p>
            <h1 className="mt-3 text-[30px] font-semibold tracking-[-0.02em]">Every call on the record</h1>
            <p className="mt-3 max-w-[56ch] text-[15px] leading-[1.6] text-ink-quiet">
              Each caller bought with their own money before posting. Positions stay locked until the lock ends, and every exit is announced here first.
            </p>
          </div>
          {!source.live && <DemoNote />}
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4">
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { v: 'open', label: 'Locked', count: counts.open },
              { v: 'exiting', label: 'Exit announced', count: counts.exiting },
              { v: 'done', label: 'Settled', count: counts.done },
            ]}
          />
          <p className="text-[13px] text-ink-quiet">Newest first. No ranking.</p>
        </div>

        {!data ? (
          <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-[220px] rounded-panel border border-line bg-surface/60" />
            ))}
          </div>
        ) : shown.length === 0 ? (
          <p className="mt-10 max-w-[48ch] text-[15px] text-ink-quiet">
            {tab === 'exiting' ? 'No exits announced right now. When a caller announces one, it appears here hours before it can execute.' : 'Nothing here yet.'}
          </p>
        ) : (
          <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {shown.map((c) => {
              const who = data.callers[c.caller]
              return <CallCard key={c.id} call={c} record={who?.record} handle={who?.handle} />
            })}
          </div>
        )}
      </Container>
    </main>
  )
}

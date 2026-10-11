import { LayoutGrid, List, Search, SearchX } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import type { Call, CallState } from '@trustpool/core'
import { Button, Card, Empty, Skeleton, Tabs, TokenIcon } from '@/components/ui'
import { source } from '@/lib/data'
import { useLoad, useTitle } from '@/lib/hooks'
import { useLocalCalls } from '@/lib/view'
import CallCard, { CallRow } from '../components/CallCard'

type Tab = 'all' | 'open' | 'holding' | 'done'
const IN: Record<Tab, CallState[] | null> = { all: null, open: ['Open'], holding: ['Holding'], done: ['Settled', 'Refunded', 'Split'] }
type Sort = 'open' | 'new' | 'clock'

/** The next moment that matters for a call: its window closing, or its max hold. */
const clockOf = (c: Call) => (c.state === 'Open' ? c.rules.windowEnd : c.state === 'Holding' ? c.holdUntil! : Number.MAX_SAFE_INTEGER)

async function load() {
  const [calls, callers, tokens] = await Promise.all([source.listCalls(), source.listCallers(), source.listTokens()])
  return { calls, callers, tokens }
}

/** All calls, open windows first, then newest. No ranking by results, on purpose. */
export default function CallsPage() {
  useTitle('Calls · trustpool')
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab) ?? 'all'
  const q = params.get('q') ?? ''
  const token = params.get('token') ?? ''
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [sort, setSort] = useState<Sort>('open')
  const data = useLoad(load, [])
  const calls = useLocalCalls(data?.calls)

  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params)
    if (v) next.set(k, v)
    else next.delete(k)
    setParams(next, { replace: true })
  }

  const by = (a: string) => data?.callers.find((c) => c.address.toLowerCase() === a.toLowerCase())
  const matches = (c: Call) => {
    if (!q) return true
    const n = q.toLowerCase()
    return c.token.symbol.toLowerCase().includes(n) || c.token.name.toLowerCase().includes(n) || (by(c.caller)?.handle ?? '').toLowerCase().includes(n) || c.caller.toLowerCase().includes(n)
  }
  const shown = useMemo(() => {
    let out = (calls ?? []).filter((c) => (!IN[tab] || IN[tab]!.includes(c.state)) && (!token || c.token.symbol === token) && matches(c))
    if (sort === 'open') out = [...out].sort((a, b) => Number(b.state === 'Open') - Number(a.state === 'Open') || b.openedAt - a.openedAt)
    if (sort === 'clock') out = [...out].sort((a, b) => clockOf(a) - clockOf(b))
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calls, tab, token, q, sort])
  const count = (t: Tab) => (calls ?? []).filter((c) => !IN[t] || IN[t]!.includes(c.state)).length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[26px] font-semibold tracking-[-0.03em] sm:text-[30px]">Calls</h1>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Tabs
          id="calls"
          value={tab}
          onChange={(v) => set('tab', v === 'all' ? '' : v)}
          options={[
            { v: 'all', label: 'All', count: count('all') },
            { v: 'open', label: 'Window open', count: count('open') },
            { v: 'holding', label: 'Holding', count: count('holding') },
            { v: 'done', label: 'Ended', count: count('done') },
          ]}
        />
        <div className="flex items-center gap-2">
          <label className="flex h-10 flex-1 items-center gap-2 rounded-xl border border-line bg-surface px-3 text-ink-3 focus-within:border-accent/50 focus-within:shadow-ring lg:w-[220px] lg:flex-none">
            <Search size={15} />
            <input value={q} onChange={(e) => set('q', e.target.value)} placeholder="Token or caller" className="w-full bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-3" />
          </label>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            className="h-10 cursor-pointer rounded-xl border border-line bg-surface px-3 text-[13.5px] text-ink-2 outline-none focus:border-accent/50 focus:shadow-ring"
            aria-label="Sort"
          >
            <option value="open">Open windows first</option>
            <option value="new">Newest</option>
            <option value="clock">Next clock first</option>
          </select>
          <div className="hidden rounded-xl border border-line bg-surface p-1 sm:flex">
            {(['grid', 'list'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={`grid h-10 w-10 place-items-center rounded-lg sm:h-8 sm:w-8 ${view === v ? 'bg-ink text-white' : 'text-ink-3 hover:text-ink'}`}
                aria-label={v === 'grid' ? 'Grid view' : 'List view'}
              >
                {v === 'grid' ? <LayoutGrid size={15} /> : <List size={15} />}
              </button>
            ))}
          </div>
        </div>
      </div>

      {data && (
        <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1">
          {[{ symbol: '', name: 'All tokens' }, ...data.tokens].map((t) => {
            const on = token === t.symbol
            const full = data.tokens.find((x) => x.symbol === t.symbol)
            return (
              <button
                key={t.symbol || 'all'}
                type="button"
                onClick={() => set('token', t.symbol)}
                className={`flex h-9 shrink-0 items-center gap-2 rounded-full border pl-1.5 pr-3.5 text-[13px] font-medium transition-colors ${
                  on ? 'border-ink bg-ink text-white' : 'border-line bg-surface text-ink-2 hover:border-line-strong'
                } ${t.symbol ? '' : 'pl-3.5'}`}
              >
                {full && <TokenIcon token={full} size={24} />}
                {t.symbol || t.name}
              </button>
            )
          })}
        </div>
      )}

      {!calls ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-[312px] rounded-2xl" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <Card>
          <Empty
            icon={<SearchX size={18} />}
            title="No calls match"
            action={
              <Button variant="secondary" onClick={() => setParams(new URLSearchParams(), { replace: true })}>
                Clear filters
              </Button>
            }
          />
        </Card>
      ) : view === 'grid' ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((c) => (
            <CallCard key={c.id} call={c} caller={by(c.caller)} />
          ))}
        </div>
      ) : (
        <Card className="divide-y divide-line p-2">
          {shown.map((c) => (
            <CallRow key={c.id} call={c} caller={by(c.caller)} />
          ))}
        </Card>
      )}
    </div>
  )
}

import { LayoutGrid, List, Search, SearchX } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import type { Call, CallState } from '@trustpool/core'
import { Card, Empty, Skeleton, Tabs, TokenIcon } from '@/components/ui'
import { source } from '@/lib/data'
import { useLoad, useTitle } from '@/lib/hooks'
import { useLocalCalls } from '@/lib/view'
import CallCard, { CallRow } from '../components/CallCard'

type Tab = 'all' | 'locked' | 'exiting' | 'done'
const IN: Record<Tab, CallState[] | null> = { all: null, locked: ['Locked'], exiting: ['Exiting'], done: ['Settled', 'Released'] }
type Sort = 'new' | 'exit'

async function load() {
  const [calls, callers, tokens] = await Promise.all([source.listCalls(), source.listCallers(), source.listTokens()])
  return { calls, callers, tokens }
}

/** All calls, newest first by default. No ranking by results, on purpose. */
export default function CallsPage() {
  useTitle('Calls · trustpool')
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab) ?? 'all'
  const q = params.get('q') ?? ''
  const token = params.get('token') ?? ''
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [sort, setSort] = useState<Sort>('new')
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
    if (sort === 'exit') out = [...out].sort((a, b) => (a.exitAt ?? a.unlockAt) - (b.exitAt ?? b.unlockAt))
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
            { v: 'exiting', label: 'Exit announced', count: count('exiting') },
            { v: 'locked', label: 'Locked', count: count('locked') },
            { v: 'done', label: 'Settled', count: count('done') },
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
            className="h-10 rounded-xl border border-line bg-surface px-3 text-[13.5px] text-ink-2 outline-none focus:border-accent/50"
            aria-label="Sort"
          >
            <option value="new">Newest</option>
            <option value="exit">Next clock first</option>
          </select>
          <div className="hidden rounded-xl border border-line bg-surface p-1 sm:flex">
            {(['grid', 'list'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={`grid h-8 w-8 place-items-center rounded-lg ${view === v ? 'bg-ink text-white' : 'text-ink-3 hover:text-ink'}`}
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
            <Skeleton key={i} className="h-[300px] rounded-2xl" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <Card>
          <Empty icon={<SearchX size={18} />} title="No calls match" body="Try another token." />
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

import { ArrowLeft } from 'lucide-react'
import { Link, useParams } from 'react-router'
import Container from '@/components/site/Container'
import { Address, DemoNote, Panel, Signed, StateTag } from '@/components/ui'
import { date, mon, price } from '@/lib/format'
import { source } from '@/lib/data'
import { useLoad, useTitle } from '@/lib/hooks'
import { averageBps, entryPrice, returnBps } from '@/lib/types'

async function load(address: string) {
  const caller = await source.getCaller(address)
  if (!caller) return undefined
  const calls = (await source.listCalls()).filter((c) => c.caller === caller.address)
  return { caller, calls }
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-l border-line pl-4 first:border-l-0 first:pl-0">
      <p className="text-[12px] text-ink-quiet">{label}</p>
      <p className="num mt-1 text-[22px] tracking-[-0.01em]">{children}</p>
    </div>
  )
}

/** A caller's whole record. Every call is listed in the same table, whatever its result. */
export default function CallerPage() {
  const address = useParams().address ?? ''
  const data = useLoad(() => load(address), [address])
  useTitle(data?.caller.handle ? `${data.caller.handle} · trustpool` : 'Caller · trustpool')

  if (data === undefined) return <main className="min-h-screen pt-32" />
  if (data === null) {
    return (
      <main className="min-h-[70vh] pt-32">
        <Container>
          <p className="text-[15px] text-ink-quiet">This address has no calls on trustpool.</p>
        </Container>
      </main>
    )
  }
  const { caller, calls } = data
  const r = caller.record

  return (
    <main className="min-h-screen pb-24 pt-28 sm:pt-32">
      <Container>
        <Link to="/calls" className="inline-flex items-center gap-2 text-[13px] text-ink-quiet hover:text-ink">
          <ArrowLeft size={14} /> All calls
        </Link>
        <div className="mt-6 flex flex-wrap items-start justify-between gap-6">
          <div>
            <p className="eyebrow text-ink-quiet">Caller</p>
            <h1 className="mt-3 text-[30px] font-semibold tracking-[-0.02em]">{caller.handle ?? 'Unnamed caller'}</h1>
            <div className="mt-1">
              <Address value={caller.address} link={false} />
            </div>
          </div>
          {!source.live && <DemoNote />}
        </div>

        <Panel className="mt-8 grid grid-cols-2 gap-6 p-6 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Settled">{r.settled + r.released}</Stat>
          <Stat label="At a loss">{r.losses}</Stat>
          <Stat label="Released unsold">{r.released}</Stat>
          <Stat label="Open now">{r.open}</Stat>
          <Stat label="Average result">
            <Signed bps={averageBps(r)} />
          </Stat>
          <Stat label="Bond">{mon(caller.bond, 0)}</Stat>
        </Panel>

        <h2 className="mt-12 text-[19px] font-semibold">All calls</h2>
        <div className="mt-4 overflow-x-auto rounded-panel border border-line bg-surface">
          <table className="w-full min-w-[640px] text-left text-[14px]">
            <thead>
              <tr className="border-b border-line text-[12px] text-ink-quiet">
                <th className="px-5 py-3 font-normal">Call</th>
                <th className="px-5 py-3 font-normal">State</th>
                <th className="px-5 py-3 font-normal">Opened</th>
                <th className="px-5 py-3 text-right font-normal">In, MON</th>
                <th className="px-5 py-3 text-right font-normal">Entry</th>
                <th className="px-5 py-3 text-right font-normal">Result</th>
              </tr>
            </thead>
            <tbody>
              {calls.map((c) => {
                const res = returnBps(c)
                return (
                  <tr key={c.id} className="border-b border-line last:border-b-0 hover:bg-mist/60">
                    <td className="px-5 py-3">
                      <Link to={`/calls/${c.id}`} className="font-medium hover:underline hover:underline-offset-4">
                        {c.token.symbol} <span className="text-ink-quiet">#{c.id}</span>
                      </Link>
                    </td>
                    <td className="px-5 py-3">
                      <StateTag state={c.state} />
                    </td>
                    <td className="num px-5 py-3 text-[13px] text-ink-quiet">{date(c.openedAt)}</td>
                    <td className="num px-5 py-3 text-right text-[13.5px]">{c.monIn.toFixed(2)}</td>
                    <td className="num px-5 py-3 text-right text-[13.5px]">{price(entryPrice(c))}</td>
                    <td className="px-5 py-3 text-right text-[13.5px]">{res === undefined ? <span className="text-ink-quiet">open</span> : <Signed bps={res} />}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <h2 className="mt-12 text-[19px] font-semibold">Bond slashes</h2>
        {caller.slashHistory.length === 0 ? (
          <p className="mt-3 text-[14px] text-ink-quiet">None. A slash would appear here with its reason.</p>
        ) : (
          <ul className="mt-4 divide-y divide-line rounded-panel border border-line bg-surface">
            {caller.slashHistory.map((s, i) => (
              <li key={i} className="flex flex-wrap items-baseline justify-between gap-4 px-5 py-4 text-[14px]">
                <span>{s.reason}</span>
                <span className="num text-[13px] text-loss">
                  −{mon(s.amount)} · {date(s.at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Container>
    </main>
  )
}

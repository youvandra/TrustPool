import { ArrowLeft, ShieldAlert } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { averageBps, returnBps } from '@trustpool/core'
import { ButtonLink, Card, CallerAvatar, Empty, Signed, Skeleton, Stat, StateTag, Tabs, TokenIcon } from '@/components/ui'
import { compact, date, mon, price, shortAddress } from '@/lib/format'
import { entryPrice } from '@trustpool/core'
import { source } from '@/lib/data'
import { useLoad, useTitle } from '@/lib/hooks'
import { useLocalCalls } from '@/lib/view'
import { ClockCell } from '../components/CallCard'
import { FollowButton } from '../components/Social'

async function load(address: string) {
  const caller = await source.getCaller(address)
  if (!caller) return undefined
  return { caller, calls: await source.listCalls({ caller: caller.address }) }
}

/** A caller's whole record. Every call sits in one table, whatever its result. */
export default function CallerPage() {
  const address = useParams().address ?? ''
  const data = useLoad(() => load(address), [address])
  const calls = useLocalCalls(data?.calls)
  const [tab, setTab] = useState<'calls' | 'slashes'>('calls')
  useTitle(data?.caller.handle ? `${data.caller.handle} · trustpool` : 'Caller · trustpool')

  if (data === undefined) return <Skeleton className="h-[480px] rounded-2xl" />
  if (data === null)
    return (
      <Card>
        <Empty title="This address has no calls on trustpool" action={<ButtonLink to="/app/callers">All callers</ButtonLink>} />
      </Card>
    )
  const { caller } = data
  const r = caller.record

  return (
    <div className="space-y-6">
      <Link to="/app/callers" className="inline-flex items-center gap-1.5 text-[13px] text-ink-3 hover:text-ink">
        <ArrowLeft size={14} /> Callers
      </Link>

      <Card className="overflow-hidden">
        <div className="relative h-24 overflow-hidden bg-accent sm:h-28">
          <div className="absolute inset-0 opacity-[0.18] [background-image:radial-gradient(rgba(255,255,255,0.9)_1px,transparent_1px)] [background-size:18px_18px]" />
          <div className="absolute inset-x-0 top-1/2 h-[3px] bg-white/25" />
        </div>
        <div className="px-5 pb-6 sm:px-7">
          <div className="-mt-10 flex flex-wrap items-end justify-between gap-4">
            <CallerAvatar address={caller.address} size={80} className="ring-4 ring-surface" />
            <FollowButton address={caller.address} handle={caller.handle} size="md" />
          </div>
          <h1 className="mt-4 text-[24px] font-semibold tracking-[-0.03em]">{caller.handle}</h1>
          <p className="num mt-0.5 text-[12.5px] text-ink-3">{shortAddress(caller.address, 8, 6)}</p>
          {caller.bio && <p className="mt-3 max-w-[60ch] text-[14.5px] leading-[1.55] text-ink-2">{caller.bio}</p>}
          <p className="mt-3 text-[13px] text-ink-3">
            {compact(caller.followers)} followers · on trustpool since {date(caller.joinedAt).split(',')[0]}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-px border-t border-line bg-line sm:grid-cols-3 lg:grid-cols-6">
          {[
            ['Settled', r.settled + r.released],
            ['At a loss', r.losses],
            ['Released unsold', r.released],
            ['Open now', r.open],
            ['Average result', <Signed key="a" bps={averageBps(r)} />],
            ['Bond', mon(caller.bond, 0)],
          ].map(([l, v]) => (
            <Stat key={String(l)} label={String(l)} value={v} className="bg-surface px-5 py-4" />
          ))}
        </div>
      </Card>

      <Tabs
        id="caller"
        value={tab}
        onChange={setTab}
        options={[
          { v: 'calls', label: 'All calls', count: calls?.length },
          { v: 'slashes', label: 'Bond slashes', count: caller.slashHistory.length },
        ]}
        className="w-fit"
      />

      {tab === 'calls' ? (
        <Card className="overflow-hidden">
          <div className="hidden grid-cols-[1.4fr_1fr_1fr_1fr_1fr] gap-4 border-b border-line bg-subtle px-5 py-3 text-[12px] text-ink-3 md:grid">
            <span>Call</span>
            <span>State</span>
            <span className="text-right">Caller in</span>
            <span className="text-right">Entry</span>
            <span className="text-right">Result or clock</span>
          </div>
          <ul className="divide-y divide-line">
            {(calls ?? []).map((c) => {
              const res = returnBps(c)
              return (
                <li key={c.id}>
                  <Link to={`/app/calls/${c.id}`} className="grid grid-cols-[1fr_auto] items-center gap-4 px-4 py-3.5 hover:bg-subtle sm:px-5 md:grid-cols-[1.4fr_1fr_1fr_1fr_1fr]">
                    <span className="flex items-center gap-3">
                      <TokenIcon token={c.token} size={32} />
                      <span>
                        <span className="block text-[14px] font-semibold">
                          {c.token.symbol} <span className="num text-[11.5px] font-normal text-ink-3">#{c.id}</span>
                        </span>
                        <span className="num block text-[12px] text-ink-3">{date(c.openedAt)}</span>
                      </span>
                    </span>
                    <span className="hidden md:block">
                      <StateTag state={c.state} size="sm" />
                    </span>
                    <span className="num hidden text-right text-[13.5px] md:block">{mon(c.monIn, 0)}</span>
                    <span className="num hidden text-right text-[13.5px] md:block">{price(entryPrice(c))}</span>
                    <span className="text-right text-[13.5px]">{res === undefined ? <ClockCell call={c} /> : <Signed bps={res} pill />}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </Card>
      ) : caller.slashHistory.length === 0 ? (
        <Card>
          <Empty icon={<ShieldAlert size={18} />} title="No slashes" body="If this caller's bond is ever cut, it shows here with the reason, permanently." />
        </Card>
      ) : (
        <Card className="divide-y divide-line">
          {caller.slashHistory.map((s, i) => (
            <div key={i} className="flex flex-wrap items-start justify-between gap-4 p-5">
              <div className="flex gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-loss-fill text-loss">
                  <ShieldAlert size={16} />
                </span>
                <div>
                  <p className="text-[14px] font-medium">{s.reason}</p>
                  <p className="num mt-0.5 text-[12px] text-ink-3">{date(s.at)}</p>
                </div>
              </div>
              <span className="num text-[14px] font-medium text-loss">−{mon(s.amount)}</span>
            </div>
          ))}
        </Card>
      )}
    </div>
  )
}

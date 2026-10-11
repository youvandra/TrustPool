import { ArrowLeft, ShieldAlert } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { averageBps, returnBps, TIERS } from '@trustpool/core'
import { ButtonLink, CallerAvatar, Card, Empty, Signed, Skeleton, SkeletonRows, Stat, StateTag, Tabs, TokenIcon } from '@/components/ui'
import { compact, date, mon, price, shortAddress } from '@/lib/format'
import { entryPrice } from '@trustpool/core'
import { source } from '@/lib/data'
import { useLoad, useTitle } from '@/lib/hooks'
import { useLocalCalls } from '@/lib/view'
import { ClockCell } from '../components/CallCard'
import { EmbedBadgeButton, FollowButton, ShareButton } from '../components/Social'
import { EditProfileButton } from './ProfileEditor'

async function load(address: string) {
  const caller = await source.getCaller(address)
  if (!caller) return undefined
  return { caller, calls: await source.listCalls({ caller: caller.address }) }
}

/** A caller's whole record. Every call sits in one table, whatever its result. */
export default function CallerPage() {
  const address = useParams().address ?? ''
  const [version, setVersion] = useState(0)
  const data = useLoad(() => load(address), [address, version])
  const calls = useLocalCalls(data?.calls)
  const [tab, setTab] = useState<'calls' | 'slashes'>('calls')
  useTitle(data?.caller.handle ? `${data.caller.handle} · trustpool` : 'Caller · trustpool')

  if (data === undefined)
    return (
      <div className="space-y-6">
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-[244px] rounded-2xl" />
        <SkeletonRows rows={4} />
      </div>
    )
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
        <div className="flex flex-wrap items-start justify-between gap-5 p-5 sm:p-7">
          <div className="flex min-w-0 items-center gap-4">
            <CallerAvatar address={caller.address} size={64} />
            <div className="min-w-0">
              <div className="flex items-center gap-1">
                <h1 className="min-w-0 truncate text-[24px] font-semibold tracking-[-0.03em]">{caller.handle}</h1>
                <EditProfileButton caller={caller} onSaved={() => setVersion((v) => v + 1)} />
              </div>
              <p className="mt-0.5 text-[13px] text-ink-3">
                <span className="num">{shortAddress(caller.address)}</span> · {compact(caller.followers)} followers
              </p>
              {caller.bio && <p className="mt-2 max-w-[60ch] text-[14.5px] text-ink-2">{caller.bio}</p>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <FollowButton address={caller.address} handle={caller.handle} size="md" />
            <ShareButton path={`/callers/${caller.address}`} />
            <EmbedBadgeButton address={caller.address} handle={caller.handle} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-px border-t border-line bg-line sm:grid-cols-3 lg:grid-cols-6">
          {[
            ['Settled', r.settled],
            ['At a loss', r.losses],
            ['Average net result', r.settled ? <Signed key="a" bps={averageBps(r)} /> : '—'],
            ['Never bought', <span key="n" className={r.negligent ? 'text-loss' : ''}>{r.negligent}</span>],
            ['Tier', caller.tier],
            ['Bond', mon(caller.bond)],
          ].map(([l, v]) => (
            <Stat key={String(l)} label={String(l)} value={v} className="bg-surface px-5 py-4" />
          ))}
        </div>
        <p className="border-t border-line px-5 py-3 text-[12.5px] text-ink-3 sm:px-7">
          Next pool: up to <span className="num text-ink-2">{mon(caller.bond * TIERS[caller.tier]!.multiple, 0)}</span> ({TIERS[caller.tier]!.multiple}x the bond), and at most{' '}
          <span className="num text-ink-2">{TIERS[caller.tier]!.maxShareBps / 100}%</span> of profit. {r.refunded ? `${r.refunded} refunded with no fault. ` : ''}
          {r.split ? `${r.split} split unsold. ` : ''}
          <span className="num">{r.active}</span> active now.
        </p>
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
            <span className="text-right">Pool</span>
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
                    <span className="num hidden text-right text-[13.5px] md:block">{mon(c.totalIn)}</span>
                    <span className="num hidden text-right text-[13.5px] md:block">{entryPrice(c) === undefined ? '—' : price(entryPrice(c)!)}</span>
                    <span className="text-right text-[13.5px]">{res === undefined ? <ClockCell call={c} /> : <Signed bps={res} pill />}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </Card>
      ) : caller.slashHistory.length === 0 ? (
        <Card>
          <Empty icon={<ShieldAlert size={18} />} title="No slashes" body="A slash would show here with its reason." />
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

import { Eye } from 'lucide-react'
import { Link } from 'react-router'
import { averageBps, entryPrice, returnBps, type Call, type Caller } from '@trustpool/core'
import { CallerAvatar, Signed, Sparkline, StateTag, TokenIcon } from '@/components/ui'
import { mon, price } from '@/lib/format'
import Countdown from './Countdown'

function Cell({ label, children, tone }: { label: string; children: React.ReactNode; tone?: 'accent' }) {
  return (
    <div className="min-w-0">
      <p className="text-[11.5px] text-ink-3">{label}</p>
      <div className={`num mt-1 truncate text-[14px] font-medium ${tone === 'accent' ? 'text-accent-deep' : 'text-ink'}`}>{children}</div>
    </div>
  )
}

/** The clock cell: lock time while locked, exit time once announced, the result when done. */
export function ClockCell({ call }: { call: Call }) {
  if (call.state === 'Locked') return <Cell label="Lock ends in">{<Countdown at={call.unlockAt} done="ended" />}</Cell>
  if (call.state === 'Exiting')
    return (
      <Cell label="Exit in" tone="accent">
        <Countdown at={call.exitAt!} done="executable" />
      </Cell>
    )
  return (
    <Cell label="Result">
      <Signed bps={returnBps(call)!} />
    </Cell>
  )
}

export default function CallCard({ call, caller, interactive = true }: { call: Call; caller?: Caller; interactive?: boolean }) {
  const exiting = call.state === 'Exiting'
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <TokenIcon token={call.token} size={40} />
          <div className="min-w-0">
            <p className="flex items-baseline gap-1.5 text-[16px] font-semibold tracking-[-0.01em]">
              {call.token.symbol}
              <span className="num text-[12px] font-normal text-ink-3">#{call.id}</span>
            </p>
            <p className="mt-0.5 flex items-center gap-1.5 truncate text-[12.5px] text-ink-3">
              <CallerAvatar address={call.caller} size={16} />
              {caller?.handle ?? 'caller'}
            </p>
          </div>
        </div>
        <StateTag state={call.state} size="sm" />
      </div>

      <div className="-mx-1 mt-4">
        <Sparkline data={call.series} width={280} height={52} />
      </div>

      <div className="mt-3 grid grid-cols-3 gap-3">
        <Cell label="Caller in">{mon(call.monIn, 0)}</Cell>
        <Cell label="Entry">{price(entryPrice(call))}</Cell>
        <ClockCell call={call} />
      </div>

      <p className="mt-4 line-clamp-2 min-h-[40px] text-[13.5px] leading-[1.5] text-ink-2">{call.thesis}</p>

      <div className="mt-4 flex items-center justify-between border-t border-line pt-3 text-[12px] text-ink-3">
        {caller ? (
          <span className="flex items-center gap-1.5">
            {caller.record.settled + caller.record.released} settled · {caller.record.losses} at a loss · avg <Signed bps={averageBps(caller.record)} />
          </span>
        ) : (
          <span />
        )}
        <span className="flex items-center gap-1">
          <Eye size={13} /> <span className="num">{call.watchers}</span>
        </span>
      </div>
    </>
  )
  const cls = `group block rounded-2xl border bg-surface p-4 shadow-card transition-[border-color,box-shadow,transform] duration-300 ease-out sm:p-5 ${
    exiting ? 'border-accent/40 ring-4 ring-accent/[0.06]' : 'border-line'
  } ${interactive ? 'hover:-translate-y-0.5 hover:border-line-strong hover:shadow-pop' : ''}`
  return interactive ? (
    <Link to={`/app/calls/${call.id}`} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  )
}

/** Dense row for lists: token, caller, state, the clock, and a tiny chart. */
export function CallRow({ call, caller, action }: { call: Call; caller?: Caller; action?: React.ReactNode }) {
  return (
    <Link
      to={`/app/calls/${call.id}`}
      className="group grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-subtle sm:grid-cols-[auto_1.2fr_1fr_90px_auto] sm:gap-5"
    >
      <TokenIcon token={call.token} size={36} />
      <div className="min-w-0">
        <p className="flex items-baseline gap-1.5 text-[14px] font-semibold">
          {call.token.symbol} <span className="num text-[11.5px] font-normal text-ink-3">#{call.id}</span>
        </p>
        <p className="mt-0.5 flex items-center gap-1.5 truncate text-[12.5px] text-ink-3">
          <CallerAvatar address={call.caller} size={14} />
          {caller?.handle ?? 'caller'} · {mon(call.monIn, 0)}
        </p>
      </div>
      <div className="hidden sm:block">
        <StateTag state={call.state} size="sm" />
      </div>
      <div className="hidden sm:block">
        <Sparkline data={call.series} width={90} height={28} showEntry={false} />
      </div>
      <div className="flex items-center gap-3 text-right">
        <div className="min-w-[88px]">
          <ClockCell call={call} />
        </div>
        {action}
      </div>
    </Link>
  )
}

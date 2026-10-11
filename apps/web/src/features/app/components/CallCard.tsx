import { Eye } from 'lucide-react'
import { Link } from 'react-router'
import { averageBps, callerShareBps, markedBps, returnBps, type Call, type Caller } from '@trustpool/core'
import { CallerAvatar, Fill, Signed, Sparkline, StateTag, TokenIcon } from '@/components/ui'
import { mon, pct } from '@/lib/format'
import Countdown from './Countdown'

function Cell({ label, children, tone }: { label: string; children: React.ReactNode; tone?: 'accent' }) {
  return (
    <div className="min-w-0">
      <p className="text-[11.5px] text-ink-3">{label}</p>
      <div className={`num mt-1 truncate text-[14px] font-medium ${tone === 'accent' ? 'text-accent-deep' : 'text-ink'}`}>{children}</div>
    </div>
  )
}

/** The cap a joiner can still fill: the live one while the window is open, else the bond cap. */
export const capOf = (call: Call) => call.liveCap ?? call.rules.cap

/** The clock cell: the window while it is open, max hold while holding, the end once ended. */
export function ClockCell({ call }: { call: Call }) {
  switch (call.state) {
    case 'Open':
      return (
        <Cell label="Closes in" tone="accent">
          <Countdown at={call.rules.windowEnd} done="closed" short />
        </Cell>
      )
    case 'Holding':
      return (
        <Cell label="Max hold in">
          <Countdown at={call.holdUntil!} done="reached" short />
        </Cell>
      )
    case 'Settled':
      return (
        <Cell label="Result">
          <Signed bps={returnBps(call)!} />
        </Cell>
      )
    case 'Refunded':
      return <Cell label="Ended">{call.negligent ? 'Not bought' : 'Refunded'}</Cell>
    default:
      return <Cell label="Ended">Split</Cell>
  }
}

/** The caller's record in one line, for card footers. */
export function RecordLine({ caller }: { caller: Caller }) {
  const r = caller.record
  return (
    <span className="flex flex-wrap items-center gap-x-1.5">
      Tier <span className="num">{caller.tier}</span> · {r.settled} settled · {r.losses} at a loss
      {r.settled > 0 && (
        <>
          {' '}
          · avg <Signed bps={averageBps(r)} />
        </>
      )}
    </span>
  )
}

export default function CallCard({ call, caller, interactive = true }: { call: Call; caller?: Caller; interactive?: boolean }) {
  const open = call.state === 'Open'
  const marked = markedBps(call)
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
              <span className="truncate">{caller?.handle ?? 'caller'}</span>
            </p>
          </div>
        </div>
        <StateTag state={call.state} size="sm" />
      </div>

      {open ? (
        <div className="mt-5 h-[52px]">
          <div className="flex items-baseline justify-between text-[12.5px] text-ink-3">
            <span>Raised</span>
            <span className="num">
              <span className="font-medium text-ink">{mon(call.totalIn)}</span> of {mon(capOf(call), 0)}
            </span>
          </div>
          <Fill value={call.totalIn} max={capOf(call)} className="mt-2" />
          <p className="mt-2 text-[12px] text-ink-3">
            <span className="num">{call.depositors}</span> {call.depositors === 1 ? 'participant' : 'participants'}
          </p>
        </div>
      ) : call.series.length > 1 ? (
        <div className="-mx-1 mt-4">
          <Sparkline data={call.series} width={280} height={52} />
        </div>
      ) : (
        <div className="mt-4 grid h-[52px] place-items-center rounded-xl bg-subtle text-[12.5px] text-ink-3">Never bought: every deposit back 1:1</div>
      )}

      <div className="mt-3 grid grid-cols-3 gap-3">
        <Cell label={open ? "Caller's share" : 'Pool'}>{open ? pct(callerShareBps(call)) : mon(call.totalIn, call.totalIn >= 100 ? 0 : 2)}</Cell>
        {call.state === 'Holding' && marked !== undefined ? (
          <Cell label="Marked">
            <Signed bps={marked} />
          </Cell>
        ) : (
          <Cell label="Profit share">{pct(call.rules.shareBps)}</Cell>
        )}
        <ClockCell call={call} />
      </div>

      <p className="mt-4 line-clamp-2 min-h-[40px] text-[13.5px] leading-[1.5] text-ink-2">{call.thesis}</p>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-3 text-[12px] text-ink-3">
        {caller ? <RecordLine caller={caller} /> : <span />}
        <span className="flex shrink-0 items-center gap-1">
          <Eye size={13} /> <span className="num">{call.watchers}</span>
        </span>
      </div>
    </>
  )
  const cls = `group block rounded-2xl border bg-surface p-4 shadow-card transition-[border-color,box-shadow,transform] duration-300 ease-out sm:p-5 ${
    open ? 'border-accent/40 ring-4 ring-accent/[0.06]' : 'border-line'
  } ${interactive ? 'hover:-translate-y-0.5 hover:border-line-strong hover:shadow-pop' : ''}`
  return interactive ? (
    <Link to={`/app/calls/${call.id}`} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  )
}

/** Dense row for lists: token, caller, state, the pool or chart, and the clock. */
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
          {caller?.handle ?? 'caller'} · {mon(call.totalIn)}
        </p>
      </div>
      <div className="hidden sm:block">
        <StateTag state={call.state} size="sm" />
      </div>
      <div className="hidden sm:block">
        {call.state === 'Open' ? (
          <Fill value={call.totalIn} max={capOf(call)} />
        ) : (
          call.series.length > 1 && <Sparkline data={call.series} width={90} height={28} showEntry={false} />
        )}
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

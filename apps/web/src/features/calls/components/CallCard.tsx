import { Link } from 'react-router'
import { Address, Signed, StateTag } from '@/components/ui'
import { duration, mon, price } from '@/lib/format'
import { useNow } from '@/lib/hooks'
import type { Call, CallerRecord } from '@/lib/types'
import { entryPrice, returnBps } from '@/lib/types'

/** The third number on a card changes with the state: time left while open, the result once done. */
function Clock({ call, now }: { call: Call; now: number }) {
  if (call.state === 'Locked') {
    const left = call.unlockAt - now
    return <Cell label={left > 0 ? 'Lock ends in' : 'Lock ended'} value={left > 0 ? duration(left) : 'no exit announced'} />
  }
  if (call.state === 'Exiting') {
    const left = (call.exitAt ?? now) - now
    return <Cell label="Exit executes in" value={left > 0 ? duration(left) : 'any moment'} accent />
  }
  return <Cell label="Result" value={<Signed bps={returnBps(call)!} />} />
}

function Cell({ label, value, accent = false }: { label: string; value: React.ReactNode; accent?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-[12px] text-ink-quiet">{label}</p>
      <p className={`num mt-1 truncate text-[15px] ${accent ? 'text-accent-deep' : 'text-ink'}`}>{value}</p>
    </div>
  )
}

export function recordLine(r: CallerRecord): string {
  const done = r.settled + r.released
  if (done === 0) return 'No settled calls yet'
  return `${done} ${done === 1 ? 'call' : 'calls'} settled, ${r.losses} at a loss`
}

export default function CallCard({ call, record, handle, static: isStatic = false }: { call: Call; record?: CallerRecord; handle?: string; static?: boolean }) {
  const now = useNow(30_000)
  const body = (
    <>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[19px] font-semibold tracking-[-0.01em]">
            {call.token.symbol}
            <span className="ml-2 text-[13px] font-normal text-ink-quiet">#{call.id}</span>
          </p>
          <div className="mt-1 text-[13px]">
            <Address value={call.caller} handle={handle} link={false} />
          </div>
        </div>
        <StateTag state={call.state} />
      </div>
      <div className="mt-5 grid grid-cols-3 gap-4 border-t border-line pt-4">
        <Cell label="Caller put in" value={mon(call.monIn, 0)} />
        <Cell label="Entry, MON" value={price(entryPrice(call))} />
        <Clock call={call} now={now} />
      </div>
      <p className="mt-4 line-clamp-1 text-[14px] text-ink-quiet">“{call.thesis}”</p>
      {record && <p className="mt-3 border-t border-line pt-3 text-[12px] text-ink-quiet">{recordLine(record)}</p>}
    </>
  )
  const cls = `block rounded-panel border bg-surface p-5 transition-colors duration-300 ease-calm ${call.state === 'Exiting' ? 'border-accent' : 'border-line'}`
  return isStatic ? (
    <div className={cls}>{body}</div>
  ) : (
    <Link to={`/calls/${call.id}`} className={`${cls} hover:border-ink`}>
      {body}
    </Link>
  )
}

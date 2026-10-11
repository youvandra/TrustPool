import type { Call } from '@trustpool/core'
import { date } from '@/lib/format'

interface Step {
  label: string
  at?: number
  done: boolean
  note?: string
  active?: boolean
}

const REASON = { take_profit: 'take-profit', stop_loss: 'stop-loss', max_hold: 'max hold' } as const

/** Window opens → closes → one buy → one sale (or a refund, or a split) → on the record. Future steps are hollow. */
export default function Timeline({ call, now }: { call: Call; now: number }) {
  const r = call.rules
  const steps: Step[] = [
    { label: 'Window opened', at: call.openedAt, done: true, active: call.state === 'Open' && now < r.windowEnd },
    { label: 'Window closes', at: r.windowEnd, done: now >= r.windowEnd || call.state !== 'Open' },
  ]
  if (call.state === 'Refunded') {
    steps.push({ label: call.negligent ? 'Never bought · refunded, recorded as negligent' : 'Below the minimum · refunded', at: call.closedAt, done: true })
  } else {
    steps.push({
      label: 'Bought together, one price',
      at: call.boughtAt ?? r.buyDeadline,
      done: call.boughtAt !== undefined,
      note: call.boughtAt === undefined ? `The caller must buy before ${date(r.buyDeadline)}, or anyone can refund the pool.` : undefined,
    })
    // A sale on take-profit or stop-loss comes before max hold, which then never happens.
    const soldEarly = call.state === 'Settled' && call.saleReason !== 'max_hold'
    if (!soldEarly)
      steps.push({
        label: 'Max hold: anyone may sell',
        at: call.holdUntil,
        done: call.holdUntil !== undefined && now >= call.holdUntil,
        active: call.state === 'Holding',
      })
    if (call.state === 'Split') steps.push({ label: 'Could not be sold · tokens split', at: call.closedAt, done: true })
    else
      steps.push({
        label: call.saleReason ? `Sold together on ${REASON[call.saleReason]} · on the record` : 'Sold together · on the record',
        at: call.closedAt,
        done: call.state === 'Settled',
      })
  }
  return (
    <ol>
      {steps.map((s, i) => (
        <li key={s.label} className="relative flex gap-3.5 pb-5 last:pb-0">
          {i < steps.length - 1 && <span className={`absolute left-[7px] top-5 h-[calc(100%-12px)] w-[2px] rounded-full ${s.done ? 'bg-ink' : 'bg-line'}`} aria-hidden="true" />}
          <span
            className={`relative mt-[3px] grid h-4 w-4 shrink-0 place-items-center rounded-full ${
              s.active ? 'bg-accent animate-pulse2' : s.done ? 'bg-ink' : 'bg-surface ring-2 ring-inset ring-line-strong'
            }`}
          >
            {s.done && !s.active && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
          </span>
          <div className="min-w-0">
            <p className={`text-[14px] ${s.done ? 'font-medium text-ink' : 'text-ink-3'}`}>{s.label}</p>
            {s.at !== undefined && <p className="num mt-0.5 text-[12px] text-ink-3">{date(s.at)}</p>}
            {s.note && <p className="mt-0.5 text-[12.5px] text-ink-3">{s.note}</p>}
          </div>
        </li>
      ))}
    </ol>
  )
}

import type { Call } from '@trustpool/core'
import { date } from '@/lib/format'

interface Step {
  label: string
  at?: number
  done: boolean
  note?: string
  active?: boolean
}

/** Opened → lock ends → exit announced → executes → on the record. Future steps are hollow. */
export default function Timeline({ call, now }: { call: Call; now: number }) {
  const finished = call.state === 'Settled' || call.state === 'Released'
  const steps: Step[] = [
    { label: 'Bought and locked', at: call.openedAt, done: true },
    { label: 'Lock ends', at: call.unlockAt, done: now >= call.unlockAt },
    {
      label: 'Exit announced',
      at: call.announcedAt,
      done: call.state !== 'Locked',
      active: call.state === 'Exiting',
      note: call.state === 'Locked' ? 'Not yet. Watchers get an alert the moment it happens.' : undefined,
    },
    { label: 'Exit can execute', at: call.exitAt, done: finished || (call.exitAt !== undefined && now >= call.exitAt) },
    { label: call.state === 'Released' ? 'Released unsold · recorded −100%' : 'Result on the record', done: finished },
  ]
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

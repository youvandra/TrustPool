import { date } from '@/lib/format'
import type { Call } from '@/lib/types'

interface Step {
  label: string
  at?: number
  done: boolean
  note?: string
}

/** Opened → lock ends → exit announced → exit executes → settled. Future steps are drawn hollow. */
export default function Timeline({ call, now }: { call: Call; now: number }) {
  const done = call.state === 'Settled' || call.state === 'Released'
  const steps: Step[] = [
    { label: 'Opened and locked', at: call.openedAt, done: true },
    { label: 'Lock ends', at: call.unlockAt, done: now >= call.unlockAt },
    {
      label: 'Exit announced',
      at: call.announcedAt,
      done: call.state !== 'Locked',
      note: call.state === 'Locked' ? 'Not yet. You will see it here first.' : undefined,
    },
    { label: 'Exit can execute', at: call.exitAt, done: call.exitAt !== undefined && now >= call.exitAt },
    { label: call.state === 'Released' ? 'Released unsold, recorded −100%' : 'Settled on the record', done },
  ]
  return (
    <ol className="relative">
      {steps.map((s, i) => (
        <li key={s.label} className="relative flex gap-4 pb-6 last:pb-0">
          {i < steps.length - 1 && <span className={`absolute left-[5px] top-4 h-full w-px ${s.done ? 'bg-ink' : 'bg-line'}`} aria-hidden="true" />}
          <span className={`relative mt-[5px] h-[11px] w-[11px] shrink-0 rounded-full border-2 ${s.done ? 'border-ink bg-ink' : 'border-line bg-surface'}`} />
          <div className="min-w-0">
            <p className={`text-[14px] ${s.done ? 'text-ink' : 'text-ink-quiet'}`}>{s.label}</p>
            {s.at !== undefined && <p className="num mt-0.5 text-[12px] text-ink-quiet">{date(s.at)}</p>}
            {s.note && <p className="mt-0.5 text-[12px] text-ink-quiet">{s.note}</p>}
          </div>
        </li>
      ))}
    </ol>
  )
}

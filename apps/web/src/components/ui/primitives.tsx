import { Lock } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { shortAddress, signedPct, toneOf } from '@/lib/format'
import type { CallState } from '@/lib/types'

/** Numbered section marker: ink circle plus outlined label. */
export function Badge({ n, label, dark = false }: { n: ReactNode; label: string; dark?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span
        className={`num flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-medium sm:h-7 sm:w-7 ${dark ? 'bg-deep-text text-deep' : 'bg-ink text-mist'}`}
      >
        {n}
      </span>
      <span className={`eyebrow rounded-full border px-3 py-1 sm:px-4 sm:py-1.5 ${dark ? 'border-deep-text/25 text-deep-text' : 'border-line text-ink'}`}>{label}</span>
    </div>
  )
}

const STATE_LABEL: Record<CallState, string> = {
  Locked: 'Locked',
  Exiting: 'Exit announced',
  Settled: 'Settled',
  Released: 'Released unsold',
}

/**
 * One accent per screen: the only state that pulses is an announced exit,
 * because that is the moment a follower needs to see.
 */
export function StateTag({ state }: { state: CallState }) {
  const exiting = state === 'Exiting'
  return (
    <span
      className={`inline-flex items-center gap-2 whitespace-nowrap rounded-full border px-3 py-1 text-[12px] font-medium ${
        exiting ? 'border-accent bg-accent-fill text-accent-deep' : 'border-line text-ink'
      }`}
    >
      {state === 'Locked' ? (
        <Lock size={11} aria-hidden="true" />
      ) : (
        <span className={`h-1.5 w-1.5 rounded-full ${exiting ? 'animate-pulse2 bg-accent motion-reduce:animate-none' : 'bg-ink-quiet'}`} />
      )}
      {STATE_LABEL[state]}
    </span>
  )
}

/** A signed result. Gains and losses share size, weight and position; only sign and colour differ. */
export function Signed({ bps, className = '' }: { bps: number; className?: string }) {
  const t = toneOf(bps)
  return <span className={`num ${t === 'gain' ? 'text-gain' : t === 'loss' ? 'text-loss' : 'text-ink'} ${className}`}>{signedPct(bps)}</span>
}

export function Address({ value, handle, link = true }: { value: string; handle?: string; link?: boolean }) {
  const body = (
    <span className="inline-flex items-baseline gap-2">
      {handle && <span className="font-medium text-ink">{handle}</span>}
      <span className="num text-[12.5px] text-ink-quiet">{shortAddress(value)}</span>
    </span>
  )
  return link ? (
    <Link to={`/callers/${value}`} className="hover:underline hover:decoration-line hover:underline-offset-4">
      {body}
    </Link>
  ) : (
    body
  )
}

/** Flat panel: hierarchy from lines and spacing, no shadow. */
export function Panel({ className = '', children }: { className?: string; children: ReactNode }) {
  return <div className={`rounded-panel border border-line bg-surface ${className}`}>{children}</div>
}

/** Label / value row used in rule lists and summaries. */
export function Row({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-6 border-t border-line py-3 text-[14px] first:border-t-0">
      <span className="text-ink-quiet">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { v: T; label: string; count?: number }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="inline-flex shrink-0 rounded-full border border-line bg-surface p-[3px]" role="tablist">
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          role="tab"
          aria-selected={value === o.v}
          onClick={() => onChange(o.v)}
          className={`inline-flex min-h-[32px] items-center gap-2 rounded-full px-4 text-[13px] font-medium transition-colors duration-300 ease-calm ${
            value === o.v ? 'bg-ink text-mist' : 'text-ink-quiet hover:text-ink'
          }`}
        >
          {o.label}
          {o.count !== undefined && <span className={`num text-[11px] ${value === o.v ? 'text-mist/60' : 'text-ink-quiet/70'}`}>{o.count}</span>}
        </button>
      ))}
    </div>
  )
}

/** Shown wherever demo data stands in for chain reads. */
export function DemoNote() {
  return (
    <p className="inline-flex items-center gap-2 rounded-full border border-dashed border-line px-3 py-1 text-[12px] text-ink-quiet">
      Demo data. Chain reads are the next step.
    </p>
  )
}

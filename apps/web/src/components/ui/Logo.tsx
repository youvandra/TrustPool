import { Link } from 'react-router'

/**
 * Concept A, "Vessel": a pool in section with one flat surface line — one price for
 * everyone in it. Stroke follows the text colour; the line is the accent.
 */
export function Mark({ className = 'h-7 w-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={`shrink-0 ${className}`} aria-hidden="true">
      <path d="M13 13 V49 H51 V13" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="square" />
      <rect x="13" y="29" width="38" height="6" className="fill-accent" />
    </svg>
  )
}

/** Lockup: mark left, lowercase name right, about a third of the mark's width apart. */
export function Wordmark({ className = '', size = 28 }: { className?: string; size?: number }) {
  return (
    <span className={`inline-flex items-center ${className}`} style={{ gap: size / 3 }}>
      <Mark className="" />
      <span className="font-semibold tracking-[-0.02em]" style={{ fontSize: size * 0.68, lineHeight: 1 }}>
        trustpool
      </span>
    </span>
  )
}

export function LogoLink() {
  return (
    <Link to="/" aria-label="trustpool home" className="flex items-center gap-2.5 rounded-full px-2 py-1 text-ink">
      <Mark className="h-7 w-7" />
      <span className="text-[19px] font-semibold tracking-[-0.02em]">trustpool</span>
    </Link>
  )
}

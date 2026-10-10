import { Link } from 'react-router'

/** Concept A, "Vessel": a pool in section with one flat surface line — one price line. */
export function Mark({ className = 'h-7 w-7', line = '#1F6E9C' }: { className?: string; line?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={`shrink-0 ${className}`} aria-hidden="true">
      <path d="M13 13 V49 H51 V13" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="square" />
      <rect x="13" y="29" width="38" height="6" fill={line} />
    </svg>
  )
}

export function Wordmark({ to = '/', className = '' }: { to?: string; className?: string }) {
  return (
    <Link to={to} aria-label="trustpool home" className={`inline-flex items-center gap-2 text-ink ${className}`}>
      <Mark className="h-[26px] w-[26px]" />
      <span className="text-[18px] font-semibold tracking-[-0.03em]">trustpool</span>
    </Link>
  )
}

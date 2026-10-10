/** Formatting rules from docs/brand.md: signed results, tabular numbers, addresses cut in the middle. */

/** 0x1234…cdef — the start and end are what tell two addresses apart. */
export function shortAddress(a: string, head = 6, tail = 4): string {
  return a.length <= head + tail + 1 ? a : `${a.slice(0, head)}…${a.slice(-tail)}`
}

/** Always carries a sign, including zero, so colour is never the only signal. */
export function signedPct(bps: number, digits = 2): string {
  const v = bps / 100
  const sign = v > 0 ? '+' : v < 0 ? '−' : '±'
  return `${sign}${Math.abs(v).toFixed(digits)}%`
}

/** MON amounts are rounded down, never up. */
export function mon(x: number, digits = 2): string {
  const f = 10 ** digits
  return `${(Math.floor(x * f) / f).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })} MON`
}

export function tokens(x: number): string {
  return x.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

export function price(x: number): string {
  return x < 0.01 ? x.toFixed(6) : x.toFixed(4)
}

/** "2d 4h", "3h 12m", "45m" — the two largest units only. */
export function duration(ms: number): string {
  const m = Math.max(0, Math.floor(ms / 60_000))
  const d = Math.floor(m / 1440)
  const h = Math.floor((m % 1440) / 60)
  const mm = m % 60
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${mm}m`
  return `${mm}m`
}

export function date(ms: number): string {
  return new Date(ms).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
}

export type Tone = 'gain' | 'loss' | 'flat'
export const toneOf = (bps: number): Tone => (bps > 0 ? 'gain' : bps < 0 ? 'loss' : 'flat')

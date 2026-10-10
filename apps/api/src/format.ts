/** The web app's formatting rules (apps/web/src/lib/format.ts), for text the API renders. */

/** 0x1234…cdef — the start and end are what tell two addresses apart. */
export function shortAddress(a: string, head = 6, tail = 4): string {
  return a.length <= head + tail + 1 ? a : `${a.slice(0, head)}…${a.slice(-tail)}`
}

/** Always carries a sign, including zero, so colour is never the only signal. */
export function signedPct(bps: number, digits = 1): string {
  const v = bps / 100
  const sign = v > 0 ? '+' : v < 0 ? '−' : '±'
  return `${sign}${Math.abs(v).toFixed(digits)}%`
}

/** MON amounts are rounded down, never up. */
export function mon(x: number, digits = 2): string {
  const f = 10 ** digits
  return `${(Math.floor(x * f) / f).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })} MON`
}

/** "2d 4h", "3h 12m", "45m" — the two largest units only. */
export function duration(ms: number): string {
  const m = Math.max(0, Math.floor(ms / 60_000))
  const d = Math.floor(m / 1440)
  const h = Math.floor((m % 1440) / 60)
  const mm = m % 60
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return mm ? `${h}h ${mm}m` : `${h}h`
  return `${mm}m`
}

import { averageBps, type Caller } from '@trustpool/core'
import { mon, signedPct } from '../format'
import { esc } from './cards'

/** The badge text, read from the same record as the caller page. */
export function badgeText(caller: Caller): string {
  const r = caller.record
  const parts = [`${r.settled} settled`, `${r.losses} ${r.losses === 1 ? 'loss' : 'losses'}`]
  if (r.settled) parts.push(`avg ${signedPct(averageBps(r))}`)
  if (r.negligent) parts.push(`${r.negligent} not bought`)
  parts.push(`tier ${caller.tier}`, `${mon(caller.bond, 0)} bond`)
  return parts.join(' · ')
}

/**
 * A small light badge for READMEs and bios: "trustpool" on the brand blue, then the record.
 * Widths come from `textLength`, so it lays out the same whatever font the viewer has.
 */
export function badgeSvg(text: string): string {
  const size = 11
  const char = 6 // average advance at 11px across Geist and the fallback fonts
  const left = 'trustpool'
  const lw = Math.round(left.length * char + 16)
  const rw = Math.round(text.length * char + 16)
  const w = lw + rw
  const label = `${left}: ${text}`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="22" viewBox="0 0 ${w} 22" role="img" aria-label="${esc(label)}">
<title>${esc(label)}</title>
<clipPath id="r"><rect width="${w}" height="22" rx="6"/></clipPath>
<g clip-path="url(#r)">
<rect width="${lw}" height="22" fill="#1F6E9C"/>
<rect x="${lw}" width="${rw}" height="22" fill="#FFFFFF"/>
</g>
<rect x="0.5" y="0.5" width="${w - 1}" height="21" rx="5.5" fill="none" stroke="#CCD5DC"/>
<g font-family="Geist, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif" font-size="${size}">
<text x="8" y="15" fill="#FFFFFF" font-weight="600" textLength="${lw - 16}">${left}</text>
<text x="${lw + 8}" y="15" fill="#0F1D24" textLength="${rw - 16}">${esc(text)}</text>
</g>
</svg>`
}

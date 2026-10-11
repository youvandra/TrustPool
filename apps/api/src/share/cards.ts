import { Resvg } from '@resvg/resvg-js'
import { averageBps, callerShareBps, entryPrice, returnBps, type Call, type Caller, type CallState } from '@trustpool/core'
import { fileURLToPath } from 'node:url'
import { duration, mon, shortAddress, signedPct } from '../format'

/**
 * Share cards (1200x630 PNG) for calls and callers, drawn as SVG and rasterised with resvg.
 * Colours and type follow docs/design.md: light ground, ink text, one blue, and a loss
 * drawn exactly like a gain apart from sign and colour.
 */

const C = {
  bg: '#F2F5F7',
  surface: '#FFFFFF',
  line: '#E2E8EC',
  ink: '#0F1D24',
  ink2: '#364852',
  ink3: '#66777F',
  accent: '#1F6E9C',
  accentFill: '#DBEAF4',
  accentDeep: '#123F5A',
  subtle: '#F6F8FA',
  gain: '#0A8A5F',
  gainFill: '#DCF3E8',
  loss: '#D23A2F',
  lossFill: '#FDE8E5',
}

/** Geist (SIL OFL 1.1, see assets/fonts/OFL.txt), the web app's typeface. */
const FONTS = ['Regular', 'Medium', 'SemiBold'].map((w) => fileURLToPath(new URL(`../../assets/fonts/Geist-${w}.ttf`, import.meta.url)))

const STATE: Record<CallState, { label: string; fg: string; bg: string }> = {
  Open: { label: 'Window open', fg: '#FFFFFF', bg: C.accent },
  Holding: { label: 'Bought together', fg: C.ink, bg: '#E7EBEE' },
  Settled: { label: 'On the record', fg: C.ink2, bg: C.subtle },
  Refunded: { label: 'Refunded', fg: C.ink2, bg: C.subtle },
  Split: { label: 'Split, unsold', fg: C.loss, bg: C.lossFill },
}

export const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`)
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
const tone = (bps: number) => (bps > 0 ? C.gain : bps < 0 ? C.loss : C.ink)
const pctOf = (bps: number) => `${(bps / 100).toFixed(bps % 100 ? 1 : 0)}%`
const price = (x: number) => (x < 0.01 ? x.toPrecision(3) : x.toFixed(4))

/** Rough Geist advance widths, enough to size a pill around its label. */
const textWidth = (s: string, size: number) => s.length * size * 0.56

function pill(label: string, right: number, y: number, fg: string, bg: string): { svg: string; width: number } {
  const size = 22
  const width = textWidth(label, size) + 40
  const x = right - width
  return {
    width,
    svg: `<rect x="${x}" y="${y}" width="${width}" height="44" rx="22" fill="${bg}"/><text x="${x + width / 2}" y="${y + 29}" font-size="${size}" font-weight="500" fill="${fg}" text-anchor="middle">${esc(label)}</text>`,
  }
}

function frame(body: string, pills: { label: string; fg: string; bg: string }[]): string {
  let right = 1088
  const drawn = pills.map((p) => {
    const d = pill(p.label, right, 98, p.fg, p.bg)
    right -= d.width + 12
    return d.svg
  })
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" font-family="Geist">
<rect width="1200" height="630" fill="${C.bg}"/>
<rect x="48" y="48" width="1104" height="534" rx="32" fill="${C.surface}" stroke="${C.line}" stroke-width="2"/>
<text x="112" y="131" font-size="30" font-weight="600" fill="${C.accent}" letter-spacing="-0.5">trustpool</text>
${drawn.join('\n')}
${body}
<text x="112" y="540" font-size="21" fill="${C.ink3}">One buy and one sale for everyone. Every call goes on the caller's record.</text>
</svg>`
}

/** A row of label-over-value facts across the card; `w` weights a column's share of the width. */
function facts(items: { label: string; value: string; fill?: string; w?: number }[]): string {
  const total = items.reduce((n, f) => n + (f.w ?? 1), 0)
  let x = 112
  return items
    .map((f) => {
      const at = x
      x += (976 * (f.w ?? 1)) / total
      return `<text x="${at}" y="398" font-size="21" fill="${C.ink3}">${esc(f.label)}</text>
<text x="${at}" y="446" font-size="36" font-weight="500" fill="${f.fill ?? C.ink}" letter-spacing="-0.5">${esc(f.value)}</text>`
    })
    .join('\n')
}

const rule = `<line x1="112" y1="340" x2="1088" y2="340" stroke="${C.line}" stroke-width="2"/>`

export function callCardSvg(call: Call, caller?: Caller): string {
  const who = caller?.handle ?? shortAddress(call.caller)
  const pills = [STATE[call.state]]
  if (call.negligent) pills.push({ label: 'Never bought', fg: C.loss, bg: C.lossFill })
  const bps = returnBps(call)
  const result =
    bps === undefined
      ? ''
      : `<text x="1088" y="250" font-size="84" font-weight="600" fill="${tone(bps)}" text-anchor="end" letter-spacing="-3">${esc(signedPct(bps, 2))}</text>
<text x="1088" y="296" font-size="24" fill="${C.ink3}" text-anchor="end">on the record</text>`
  const body = `<text x="112" y="250" font-size="84" font-weight="600" fill="${C.ink}" letter-spacing="-3">${esc(clip(call.token.symbol, 12))}</text>
<text x="112" y="296" font-size="26" fill="${C.ink2}">#${call.id} · called by ${esc(clip(who, 24))}</text>
${result}
${rule}
${facts([
  { label: 'Pool', value: mon(call.totalIn), w: 1.2 },
  { label: "Caller's share", value: pctOf(callerShareBps(call)), w: 0.9 },
  entryPrice(call) === undefined
    ? { label: 'Window', value: duration(call.rules.windowEnd - call.openedAt), w: 1.1 }
    : { label: 'Entry price', value: `${price(entryPrice(call)!)} MON`, w: 1.1 },
  { label: 'Profit share', value: pctOf(call.rules.shareBps), w: 0.8 },
])}`
  return frame(body, pills)
}

export function callerCardSvg(caller: Caller): string {
  const r = caller.record
  const avg = averageBps(r)
  const closed = r.settled
  const body = `<text x="112" y="250" font-size="84" font-weight="600" fill="${C.ink}" letter-spacing="-3">${esc(clip(caller.handle ?? shortAddress(caller.address), 20))}</text>
<text x="112" y="296" font-size="26" fill="${C.ink2}">${esc(shortAddress(caller.address))} · tier ${caller.tier} · ${r.active} active</text>
${rule}
${facts([
  { label: 'Settled', value: String(closed), w: 0.8 },
  { label: 'At a loss', value: String(r.losses), w: 0.8 },
  { label: 'Average result', value: closed ? signedPct(avg, 2) : '—', fill: closed ? tone(avg) : C.ink3, w: 1.1 },
  { label: 'Bond', value: mon(caller.bond), w: 1.3 },
  { label: 'Not bought', value: String(r.negligent), w: 0.7 },
])}`
  return frame(body, [{ label: 'Caller', fg: C.accentDeep, bg: C.accentFill }])
}

/** Renders a card. Cards are cached by everything drawn on them, so a new state draws anew. */
export class CardRenderer {
  private readonly cache = new Map<string, Uint8Array>()
  constructor(private readonly max = 500) {}

  png(svg: string): Uint8Array {
    const hit = this.cache.get(svg)
    if (hit) return hit
    const png = new Resvg(svg, { font: { fontFiles: FONTS, loadSystemFonts: false, defaultFontFamily: 'Geist' } }).render().asPng()
    if (this.cache.size >= this.max) this.cache.delete(this.cache.keys().next().value!)
    this.cache.set(svg, png)
    return png
  }
}

/** A tiny page for crawlers: Open Graph and Twitter tags, then a redirect to the real page. */
export function sharePage(p: { title: string; description: string; image: string; url: string }): string {
  const t = esc(p.title)
  const d = esc(p.description)
  const u = esc(p.url)
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${t}</title>
    <meta name="description" content="${d}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="trustpool" />
    <meta property="og:title" content="${t}" />
    <meta property="og:description" content="${d}" />
    <meta property="og:url" content="${u}" />
    <meta property="og:image" content="${esc(p.image)}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${t}" />
    <meta name="twitter:description" content="${d}" />
    <meta name="twitter:image" content="${esc(p.image)}" />
    <link rel="canonical" href="${u}" />
    <meta http-equiv="refresh" content="0; url=${u}" />
  </head>
  <body>
    <a href="${u}">${t}</a>
  </body>
</html>`
}

/** One sentence for the share description. */
export function callSummary(call: Call): string {
  const bps = returnBps(call)
  const base = `${mon(call.totalIn)} pooled by ${call.depositors} ${call.depositors === 1 ? 'participant' : 'participants'}, the caller ${pctOf(callerShareBps(call))} of it, ${pctOf(call.rules.shareBps)} of profit to the caller.`
  if (bps !== undefined) return `${base} ${signedPct(bps)} for every participant, on the record.`
  if (call.state === 'Open') return `${base} Window open.`
  if (call.state === 'Holding') return `${base} Bought together, one price for all.`
  if (call.state === 'Refunded') return `${base} Refunded.`
  return `${base} Could not be sold; split.`
}

export function callerSummary(caller: Caller): string {
  const r = caller.record
  return `${r.settled} settled, ${r.losses} at a loss, average ${r.settled ? signedPct(averageBps(r)) : '—'}. Tier ${caller.tier}, ${mon(caller.bond)} bond.`
}

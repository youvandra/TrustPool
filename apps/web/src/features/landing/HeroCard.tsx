import { AnimatePresence, motion } from 'motion/react'
import { BellRing, Lock, Receipt } from 'lucide-react'
import type { Call, Caller } from '@trustpool/core'
import { entryPrice, returnBps } from '@trustpool/core'
import { CallerAvatar, Signed, StateTag, TokenIcon } from '@/components/ui'
import { duration, mon, price } from '@/lib/format'
import Countdown from '@/features/app/components/Countdown'

const W = 400
const H = 190

/** Catmull-Rom through the points, as cubic Béziers: a smooth line that still passes every price. */
function smooth(pts: [number, number][]): string {
  let d = `M${pts[0]![0]},${pts[0]![1]}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]!
    const p1 = pts[i]!
    const p2 = pts[i + 1]!
    const p3 = pts[i + 2] ?? p2
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
    d += `C${c1[0]!.toFixed(1)},${c1[1]!.toFixed(1)} ${c2[0]!.toFixed(1)},${c2[1]!.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`
  }
  return d
}

/** Price since the caller's entry, with the moment they bought pinned on the line. */
function Chart({ call, caller }: { call: Call; caller?: Caller }) {
  const s = call.series
  const min = Math.min(...s)
  const max = Math.max(...s)
  const pad = 18
  const x = (i: number) => (i / (s.length - 1)) * W
  const y = (v: number) => pad + (1 - (v - min) / (max - min || 1)) * (H - pad * 2)
  const pts = s.map((v, i) => [x(i), y(v)] as [number, number])
  const line = smooth(pts)
  const up = s[s.length - 1]! >= s[0]!
  const color = up ? '#0A8A5F' : '#D23A2F'
  const entryY = y(s[0]!)
  const end = pts[pts.length - 1]!
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-[190px] w-full" aria-hidden="true">
        <path d={`${line}L${W},${H}L0,${H}Z`} fill={color} opacity={0.08} />
        <line x1="0" x2={W} y1={entryY} y2={entryY} stroke="#66777F" strokeDasharray="4 4" strokeWidth="1" opacity="0.7" />
        <path d={line} fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" />
        <circle cx={end[0] - 2} cy={end[1]} r="5" fill={color} />
        <circle cx={end[0] - 2} cy={end[1]} r="10" fill={color} opacity="0.15" />
      </svg>
      {/* The caller's buy, pinned where the line starts. */}
      <div
        className="absolute left-2 flex -translate-y-1/2 items-center gap-1.5 rounded-full bg-ink py-1 pl-1 pr-2.5 text-[11px] font-medium text-white shadow-card"
        style={{ top: entryY * (190 / H) }}
      >
        <CallerAvatar address={call.caller} size={18} />
        {caller?.handle} bought here
      </div>
      <span className="num absolute right-2 text-[10.5px] text-ink-3" style={{ top: entryY * (190 / H) + 4 }}>
        entry {price(entryPrice(call))}
      </span>
    </div>
  )
}

function Footer({ call }: { call: Call }) {
  const clock =
    call.state === 'Locked' ? (
      <>
        <p className="text-[11.5px] text-ink-3">Lock ends in</p>
        <Countdown at={call.unlockAt} className="mt-0.5 block text-[15px] font-medium" />
      </>
    ) : call.state === 'Exiting' ? (
      <>
        <p className="text-[11.5px] text-ink-3">Can sell in</p>
        <Countdown at={call.exitAt!} className="mt-0.5 block text-[15px] font-medium text-accent-strong" />
      </>
    ) : (
      <>
        <p className="text-[11.5px] text-ink-3">Result</p>
        <Signed bps={returnBps(call)!} className="mt-0.5 block text-[15px] font-medium" />
      </>
    )
  return (
    <div className="grid grid-cols-3 gap-3 border-t border-line px-5 py-4">
      <div>
        <p className="text-[11.5px] text-ink-3">Caller put in</p>
        <p className="num mt-0.5 text-[15px] font-medium">{mon(call.monIn, 0)}</p>
      </div>
      <div>
        <p className="text-[11.5px] text-ink-3">Locked for</p>
        <p className="num mt-0.5 text-[15px] font-medium">{duration(call.unlockAt - call.openedAt)}</p>
      </div>
      <div>{clock}</div>
    </div>
  )
}

const NOTE = {
  Locked: {
    icon: Lock,
    tone: 'bg-ink text-white',
    title: (h: string, c: Call) => `${h} bought ${c.token.symbol}`,
    body: () => 'Own money in. Locked.',
  },
  Exiting: {
    icon: BellRing,
    tone: 'bg-accent text-white',
    title: (h: string) => `${h} announced an exit`,
    body: () => 'Your head start begins now.',
  },
  Settled: {
    icon: Receipt,
    tone: 'bg-loss-fill text-loss',
    title: () => 'Result on the record',
    body: (c: Call) => `${((returnBps(c) ?? 0) / 100).toFixed(2)}%, kept like a gain.`,
  },
} as const

/**
 * The hero visual: one call as a trading app shows a position. The notification above it
 * changes with the state, so the three moments the product exists for play in turn.
 */
export default function HeroCard({ call, caller }: { call: Call; caller?: Caller }) {
  const handle = caller?.handle ?? 'caller'
  const note = NOTE[call.state === 'Released' ? 'Settled' : call.state]
  const last = call.series[call.series.length - 1]!
  // Once settled, show the recorded result so the two numbers on the card always agree.
  const move = returnBps(call) ?? Math.round(((last - call.series[0]!) / call.series[0]!) * 10_000)
  return (
    <div className="relative">
      {/* Positioned by a plain wrapper: motion owns the transform of the note itself. */}
      <div className="absolute inset-x-0 -top-8 z-10 flex justify-center">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={call.state}
            initial={{ y: 12, scale: 0.97 }}
            animate={{ y: 0, scale: 1 }}
            exit={{ y: -8, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 360, damping: 30 }}
            className="flex w-[320px] items-center gap-3 rounded-2xl border border-line bg-surface/95 p-3 shadow-pop backdrop-blur"
          >
            <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${note.tone}`}>
              <note.icon size={17} />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[13.5px] font-semibold">{note.title(handle, call)}</span>
              <span className="block truncate text-[12px] text-ink-3">{note.body(call)}</span>
            </span>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="overflow-hidden rounded-[28px] border border-line bg-surface shadow-pop">
        <div className="flex items-start justify-between gap-3 px-5 pb-1 pt-12">
          <div className="flex items-center gap-3">
            <TokenIcon token={call.token} size={42} />
            <div>
              <p className="text-[17px] font-semibold tracking-[-0.02em]">{call.token.symbol}</p>
              <p className="flex items-center gap-2">
                <span className="num text-[13px]">{price(last)} MON</span>
                <Signed bps={move} pill className="!h-5 !text-[11px]" />
              </p>
            </div>
          </div>
          <StateTag state={call.state} size="sm" />
        </div>
        <Chart call={call} caller={caller} />
        <Footer call={call} />
      </div>
    </div>
  )
}

import { Lock } from 'lucide-react'
import type { Call, Caller } from '@trustpool/core'
import { averageBps, entryPrice, returnBps } from '@trustpool/core'
import { CallerAvatar, Signed, StateTag, TokenIcon } from '@/components/ui'
import { duration, mon, price } from '@/lib/format'
import Countdown from '@/features/app/components/Countdown'

const TOP = 262 // px: where the ticket tears

/** Deterministic bars from the call id: decoration that reads as a receipt code. */
function Barcode({ seed }: { seed: number }) {
  const bars = Array.from({ length: 46 }, (_, i) => 1 + ((Math.sin(seed * 13.7 + i * 2.31) + 1) * 1.6) | 0)
  let x = 0
  return (
    <svg viewBox="0 0 180 34" className="h-[34px] w-full" preserveAspectRatio="none" aria-hidden="true">
      {bars.map((w, i) => {
        const rect = i % 2 === 0 ? <rect key={i} x={x} y={0} width={w} height={34} fill="#0F1D24" /> : null
        x += w + 1
        return rect
      })}
    </svg>
  )
}

/** The headline number for each state: lock clock, exit clock, or the result. */
function Headline({ call }: { call: Call }) {
  if (call.state === 'Exiting')
    return (
      <div className="rounded-2xl bg-accent px-4 py-3.5 text-white">
        <p className="text-[12px] text-white/75">Exit announced · can sell in</p>
        <Countdown at={call.exitAt!} className="mt-1.5 block text-[38px] font-medium leading-none tracking-[-0.03em]" />
      </div>
    )
  if (call.state === 'Locked')
    return (
      <div className="rounded-2xl bg-ink px-4 py-3.5 text-white">
        <p className="flex items-center gap-1.5 text-[12px] text-white/60">
          <Lock size={11} /> Locked · lock ends in
        </p>
        <Countdown at={call.unlockAt} className="mt-1.5 block text-[38px] font-medium leading-none tracking-[-0.03em]" />
      </div>
    )
  const r = returnBps(call)!
  return (
    <div className={`rounded-2xl px-4 py-3.5 ${r < 0 ? 'bg-loss-fill' : 'bg-gain-fill'}`}>
      <p className="text-[12px] text-ink-2">Settled · from the caller&apos;s own fill</p>
      <Signed bps={r} className="mt-1.5 block text-[38px] font-medium leading-none tracking-[-0.03em]" />
    </div>
  )
}

/**
 * A call as a ticket: the stub above the tear says where it stands now; the
 * part below is what was fixed when it opened. The notches are cut with a mask
 * so the shader shows through them.
 */
export default function CallTicket({ call, caller }: { call: Call; caller?: Caller }) {
  const cut = `radial-gradient(circle 15px at 0 ${TOP}px, #0000 97%, #000 100%), radial-gradient(circle 15px at 100% ${TOP}px, #0000 97%, #000 100%)`
  return (
    <div className="[filter:drop-shadow(0_30px_50px_rgba(15,29,36,0.22))]">
      <div className="relative w-full rounded-[28px] bg-surface" style={{ WebkitMaskImage: cut, maskImage: cut, WebkitMaskComposite: 'source-in', maskComposite: 'intersect' }}>
        <div className="flex flex-col p-6" style={{ height: TOP }}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <TokenIcon token={call.token} size={46} />
              <div>
                <p className="flex items-baseline gap-1.5 text-[20px] font-semibold tracking-[-0.02em]">
                  {call.token.symbol} <span className="num text-[12px] font-normal text-ink-3">#{call.id}</span>
                </p>
                <p className="text-[12.5px] text-ink-3">{call.token.name}</p>
              </div>
            </div>
            <StateTag state={call.state} size="sm" />
          </div>
          <div className="mt-4 flex items-center gap-2.5 rounded-xl bg-subtle px-3 py-2.5">
            <CallerAvatar address={call.caller} size={28} />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold">{caller?.handle}</p>
              <p className="text-[11.5px] text-ink-3">
                {caller ? `${caller.record.settled + caller.record.released} settled · ${caller.record.losses} at a loss` : ''}
              </p>
            </div>
            {caller && <Signed bps={averageBps(caller.record)} pill />}
          </div>
          <div className="mt-auto">
            <Headline call={call} />
          </div>
        </div>

        <div className="mx-6 border-t-2 border-dashed border-line-strong" />

        <div className="p-6 pt-5">
          <div className="grid grid-cols-3 gap-3">
            {[
              ['Caller in', mon(call.monIn, 0)],
              ['Entry', price(entryPrice(call))],
              ['Notice', duration(call.notice)],
            ].map(([l, v]) => (
              <div key={l}>
                <p className="text-[11px] text-ink-3">{l}</p>
                <p className="num mt-0.5 text-[14.5px] font-medium">{v}</p>
              </div>
            ))}
          </div>
          <div className="mt-4">
            <Barcode seed={call.id + 3} />
            <p className="num mt-1.5 flex justify-between text-[10.5px] text-ink-3">
              <span>fixed at open</span>
              <span>0x8f3a…{(4096 + call.id * 977).toString(16)}</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

import { AnimatePresence, motion } from 'motion/react'
import { BellRing, Eye, Lock, Receipt, ShieldCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { CALLERS, CALLS } from '@trustpool/core'
import { ArrowLink, CallerAvatar, Signed, Sparkline, StateTag, TokenIcon } from '@/components/ui'
import { mon } from '@/lib/format'
import { usePageVisible } from '@/lib/hooks'
import Countdown from '@/features/app/components/Countdown'

const by = (a: string) => CALLERS.find((c) => c.address === a)
const EXITING = CALLS.filter((c) => c.state === 'Exiting')
const RECENT = CALLS.filter((c) => c.state === 'Settled' || c.state === 'Released').slice(-3).reverse()

/** A small, real slice of the app: the "Exiting soon" panel, built from the same components. */
function ProductShot() {
  return (
    <div className="relative rounded-[28px] border border-line bg-surface p-2 shadow-pop">
      <div className="flex items-center gap-1.5 px-3 pb-2 pt-1">
        <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
        <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
        <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
        <span className="num ml-3 rounded-md bg-subtle px-2 py-0.5 text-[11px] text-ink-3">trustpool.app/app</span>
      </div>
      <div className="rounded-[22px] bg-bg p-4">
        <div className="grid grid-cols-3 gap-2.5">
          {[
            { l: 'Exits announced', v: EXITING.length, a: true },
            { l: 'Locked now', v: CALLS.filter((c) => c.state === 'Locked').length },
            { l: 'Settled', v: RECENT.length + 4 },
          ].map((t) => (
            <div key={t.l} className={`rounded-xl border p-3 ${t.a ? 'border-accent/30 bg-accent-soft' : 'border-line bg-surface'}`}>
              <p className="text-[10.5px] text-ink-3">{t.l}</p>
              <p className="num mt-1 text-[20px] font-medium">{t.v}</p>
            </div>
          ))}
        </div>
        <div className="mt-2.5 rounded-xl border border-line bg-surface p-1.5">
          <p className="px-2 pb-1 pt-1.5 text-[12px] font-semibold">Exiting soon</p>
          {EXITING.map((c) => (
            <div key={c.id} className="flex items-center gap-2.5 rounded-lg px-2 py-2">
              <TokenIcon token={c.token} size={28} />
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] font-semibold">{c.token.symbol}</p>
                <p className="flex items-center gap-1 text-[10.5px] text-ink-3">
                  <CallerAvatar address={c.caller} size={12} /> {by(c.caller)?.handle} · {mon(c.monIn, 0)}
                </p>
              </div>
              <div className="w-16">
                <Sparkline data={c.series} width={64} height={22} showEntry={false} />
              </div>
              <Countdown at={c.exitAt!} className="w-[64px] text-right text-[11.5px] font-medium text-accent-deep" />
            </div>
          ))}
        </div>
        <div className="mt-2.5 rounded-xl border border-line bg-surface p-1.5">
          <p className="px-2 pb-1 pt-1.5 text-[12px] font-semibold">Recently settled</p>
          {RECENT.map((c) => (
            <div key={c.id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
              <TokenIcon token={c.token} size={24} />
              <p className="flex-1 text-[12px]">
                <span className="font-semibold">{c.token.symbol}</span> <span className="text-ink-3">by {by(c.caller)?.handle}</span>
              </p>
              <Signed bps={Math.round(((c.monOut ?? 0) - c.monIn) / c.monIn * 10_000)} pill className="!h-5 !text-[11px]" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

const NOTES = [
  { icon: BellRing, title: 'marisa announced an exit', body: 'MOE · sells in 9h at the earliest', tone: 'bg-accent text-white' },
  { icon: Lock, title: 'ade bought MOYAKI and locked it', body: '250 MON of their own · 7 day lock', tone: 'bg-ink text-white' },
  { icon: Receipt, title: 'olu settled CHOG at −30.07%', body: 'On the record, same as a gain', tone: 'bg-loss-fill text-loss' },
]

/** One notification at a time, cycling: the three moments the product exists for. */
function FloatingNote() {
  const visible = usePageVisible()
  const [i, setI] = useState(0)
  useEffect(() => {
    if (!visible) return
    const id = setInterval(() => setI((n) => (n + 1) % NOTES.length), 3400)
    return () => clearInterval(id)
  }, [visible])
  const n = NOTES[i]!
  return (
    <div className="absolute -bottom-8 -left-10 hidden w-[300px] xl:block">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={i}
          initial={{ y: 18, scale: 0.97 }}
          animate={{ y: 0, scale: 1 }}
          exit={{ y: -12, opacity: 0, scale: 0.98 }}
          transition={{ type: 'spring', stiffness: 360, damping: 30 }}
          className="flex items-center gap-3 rounded-2xl border border-line bg-surface/95 p-3 shadow-pop backdrop-blur"
        >
          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${n.tone}`}>
            <n.icon size={17} />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[13.5px] font-semibold">{n.title}</span>
            <span className="block truncate text-[12px] text-ink-3">{n.body}</span>
          </span>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

function LockBadge() {
  const c = CALLS.find((x) => x.state === 'Locked')!
  return (
    <div className="absolute -right-4 -top-6 hidden w-[230px] rounded-2xl border border-line bg-surface p-4 shadow-pop xl:block">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-[13px] font-semibold">
          <TokenIcon token={c.token} size={24} /> {c.token.symbol}
        </span>
        <StateTag state="Locked" size="sm" />
      </div>
      <p className="mt-3 text-[11.5px] text-ink-3">Lock ends in</p>
      <Countdown at={c.unlockAt} className="mt-0.5 block text-[22px] font-medium tracking-[-0.02em]" />
      <p className="mt-2 flex items-center gap-1 text-[11.5px] text-ink-3">
        <Eye size={12} /> {c.watchers} watching for the exit
      </p>
    </div>
  )
}

const WORDS = ['Follow', 'callers', 'who', 'buy', 'first.']

export default function Hero() {
  const visible = usePageVisible()
  return (
    <section className="relative overflow-hidden pb-20 pt-32 sm:pt-36 lg:pb-28">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[720px] dots opacity-70 [mask-image:linear-gradient(to_bottom,black,transparent)]" aria-hidden="true" />
      <div className="relative mx-auto grid max-w-[1240px] items-center gap-16 px-5 sm:px-8 lg:grid-cols-[1.05fr_1fr]">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface py-1 pl-1 pr-3 text-[13px] shadow-card">
            <span className="rounded-full bg-accent-fill px-2 py-0.5 text-[11.5px] font-medium text-accent-deep">Monad</span>
            <span className="text-ink-2">Accountable calls, on chain</span>
          </span>
          <h1 className="mt-7 text-[clamp(2.7rem,6.6vw,5.4rem)] font-semibold leading-[0.98] tracking-[-0.05em]">
            <span className="block">
              {WORDS.map((w, i) => (
                <motion.span
                  key={w}
                  className="mr-[0.22em] inline-block"
                  initial={visible ? { y: 28 } : false}
                  animate={{ y: 0 }}
                  transition={{ delay: 0.05 * i, type: 'spring', stiffness: 220, damping: 24 }}
                >
                  {w}
                </motion.span>
              ))}
            </span>
            <span className="block text-ink-3">Hear before they sell.</span>
          </h1>
          <p className="mt-7 max-w-[50ch] text-[17px] leading-[1.6] text-ink-2 sm:text-[18px]">
            On trustpool a caller buys with their own money before anyone sees the call. The position is locked, every exit is announced hours ahead, and every
            result stays on their record. Losses included.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <ArrowLink to="/app">Launch app</ArrowLink>
            <a href="#how" className="inline-flex h-12 items-center rounded-full px-5 text-[15px] font-medium text-ink-2 transition-colors hover:text-ink">
              How it works
            </a>
          </div>
          <ul className="mt-10 flex flex-wrap gap-x-6 gap-y-3 text-[13.5px] text-ink-2">
            {[
              [Lock, 'Caller money locked first'],
              [BellRing, 'Exits announced ahead'],
              [ShieldCheck, 'Bond at stake'],
            ].map(([I, t]) => {
              const Icon = I as typeof Lock
              return (
                <li key={t as string} className="flex items-center gap-2">
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-surface text-accent ring-1 ring-inset ring-line">
                    <Icon size={13} />
                  </span>
                  {t as string}
                </li>
              )
            })}
          </ul>
        </div>
        <motion.div className="relative" initial={visible ? { y: 40 } : false} animate={{ y: 0 }} transition={{ delay: 0.15, duration: 1, ease: [0.22, 1, 0.36, 1] }}>
          <div className="absolute -inset-6 rounded-[40px] bg-accent-fill/70 sm:-inset-10" aria-hidden="true" />
          <div className="relative">
            <ProductShot />
            <FloatingNote />
            <LockBadge />
          </div>
        </motion.div>
      </div>
    </section>
  )
}

import { motion } from 'motion/react'
import { ArrowLeft, ArrowRight, Check, Loader2, Lock } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { TIERS, type Call, type Token } from '@trustpool/core'
import { useSession } from '@/auth/session'
import { Button, Card, Modal, Row, Skeleton, TokenIcon } from '@/components/ui'
import { date, duration, mon as monText, pct } from '@/lib/format'
import { DEFAULT_PARAMS, readParams } from '@/lib/chain'
import { source } from '@/lib/data'
import { useLoad, usePageVisible, useTitle } from '@/lib/hooks'
import { useTrustPool } from '@/lib/tx'
import CallCard from '../components/CallCard'
import RequireAuth from '../shell/RequireAuth'

const MAX_THESIS = 280
const M = 60

const STEPS = ['Token', 'Stake', 'Rules', 'Review'] as const

function Stepper({ step }: { step: number }) {
  return (
    <ol className="flex items-center gap-2">
      {STEPS.map((s, i) => (
        <li key={s} className="flex items-center gap-2">
          <span
            className={`num grid h-7 w-7 place-items-center rounded-full text-[12px] font-medium transition-colors ${
              i < step ? 'bg-accent-fill text-accent-strong' : i === step ? 'bg-accent text-white' : 'bg-surface text-ink-3 ring-1 ring-inset ring-line-strong'
            }`}
          >
            {i < step ? <Check size={13} /> : i + 1}
          </span>
          <span className={`hidden text-[13px] sm:inline ${i === step ? 'font-medium text-ink' : 'text-ink-3'}`}>{s}</span>
          {i < STEPS.length - 1 && <span className={`mx-1 h-px w-6 sm:w-10 ${i < step ? 'bg-accent' : 'bg-line-strong'}`} />}
        </li>
      ))}
    </ol>
  )
}

const input = 'w-full rounded-xl border border-line bg-surface px-4 text-ink outline-none transition-shadow focus:border-accent/50 focus:shadow-ring'

function Slider({ label, value, show, min, max, step = 1, onChange, hint }: { label: string; value: number; show: string; min: number; max: number; step?: number; onChange: (v: number) => void; hint: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <p className="text-[14px] font-medium">{label}</p>
        <p className="num text-[20px] font-medium tracking-[-0.02em]">{show}</p>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="mt-3 w-full accent-[#1F6E9C]" />
      <p className="mt-1 text-[12.5px] text-ink-3">{hint}</p>
    </div>
  )
}

/** Minutes, rounded to a slider step that suits the range. */
const stepFor = (maxMinutes: number) => (maxMinutes > 24 * 60 ? 60 : maxMinutes > 6 * 60 ? 30 : maxMinutes > 60 ? 5 : 1)

function Flow({ address }: { address: string }) {
  const navigate = useNavigate()
  const visible = usePageVisible()
  const data = useLoad(
    async () => ({ tokens: await source.listTokens(), me: await source.getCaller(address), params: source.kind === 'api' ? await readParams().catch(() => DEFAULT_PARAMS) : DEFAULT_PARAMS }),
    [address],
  )
  const p = data?.params ?? DEFAULT_PARAMS
  const [step, setStep] = useState(0)
  const [token, setToken] = useState<Token | null>(null)
  const [amount, setAmount] = useState('')
  const [windowM, setWindowM] = useState<number>()
  const [holdM, setHoldM] = useState<number>()
  const [tp, setTp] = useState(2500)
  const [sl, setSl] = useState(2000)
  const [share, setShare] = useState(0)
  const [thesis, setThesis] = useState('')
  const [agree, setAgree] = useState(false)
  const [signing, setSigning] = useState<'idle' | 'wait' | 'done'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [openedId, setOpenedId] = useState<number>()
  const tx = useTrustPool()

  const bond = data?.me?.bond ?? 0
  const tier = data?.me?.tier ?? 0
  const limits = TIERS[tier]!
  const stake = Number(amount) || 0
  // The cap is bond x tier multiple, fixed at open: it must cover the stake and the minimum pool,
  // or the pool could never go ahead. Round up to a whole MON.
  const bondNeeded = Math.max(p.minBond, Math.ceil(Math.max(stake, p.minPool) / limits.multiple))
  const needsBond = bond < bondNeeded
  const bondAfter = Math.max(bond, bondNeeded)
  const win = windowM ?? Math.min(p.maxWindow / M, Math.max(p.minWindow / M, 60))
  const hold = holdM ?? Math.min(p.maxHold / M, Math.max(p.minHold / M, 24 * 60))
  const slv = Math.min(Math.max(sl, p.minStopLossBps), p.maxStopLossBps)
  const sharev = Math.min(share, limits.maxShareBps)
  const cap = bondAfter * limits.multiple
  // Joiners can never take the caller under the least stake: the pool tops out at stake / minCallerBps.
  const stakeCeiling = (stake * 10_000) / p.minCallerBps
  const ok = [!!token, stake > 0, thesis.length <= MAX_THESIS, agree][step]

  const preview: Call | null = useMemo(() => {
    if (!token) return null
    const now = Date.now()
    const s = stake || 1
    return {
      id: 0,
      caller: address,
      token,
      tier,
      rules: {
        windowEnd: now + win * M * 1000,
        buyDeadline: now + win * M * 1000,
        maxHold: hold * M * 1000,
        takeProfitBps: tp,
        stopLossBps: slv,
        shareBps: sharev,
        minCallerBps: p.minCallerBps,
        maxImpactBps: p.maxImpactBps,
        sellToleranceBps: 200,
        keeperBps: 10,
        checkpointGap: p.checkpointGap * 1000,
        splitGrace: 0,
        cap,
        minPool: p.minPool,
      },
      thesis: thesis || 'Your thesis appears here, fixed once the call opens.',
      openedAt: now,
      state: 'Open',
      totalIn: s,
      callerStake: s,
      depositors: 1,
      checkpoints: [],
      series: [],
      watchers: 0,
    }
  }, [token, stake, win, hold, tp, slv, sharev, thesis, address, tier, cap, p])

  /** Posts the missing bond if needed, then opens the call with the stake in one more transaction. */
  async function submit() {
    setError(null)
    setSigning('wait')
    if (!tx.enabled || !token) return // demo: the modal offers a simulated signature
    if (needsBond) {
      const r = await tx.run('Posting your bond', (t) => t.postBond(bondNeeded - bond))
      if (!r.ok) return setError(r.error)
    }
    const r = await tx.run('Opening the pool', (t) =>
      t.openCall({
        token: token.address as `0x${string}`,
        stake,
        windowSeconds: win * M,
        takeProfitBps: tp,
        stopLossBps: slv,
        maxHoldSeconds: hold * M,
        shareBps: sharev,
        thesis: thesis.trim(),
      }),
    )
    if (!r.ok) return setError(r.error)
    setOpenedId(r.value.id)
    setSigning('done')
  }

  if (!data) return <Skeleton className="h-[480px] rounded-2xl" />

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <Card className="p-5 sm:p-7">
        <Stepper step={step} />
        <div className="mt-8 min-h-[340px]">
          {/* Only transform animates: the step is readable from its first frame, even in a hidden tab. */}
          <motion.div key={step} initial={visible ? { x: 16 } : false} animate={{ x: 0 }} transition={{ type: 'spring', stiffness: 420, damping: 36 }}>
              {step === 0 && (
                <>
                  <h2 className="text-[20px] font-semibold tracking-[-0.02em]">Which token?</h2>
                  <p className="mt-1 text-[14px] text-ink-3">Allowed tokens only.</p>
                  <div className="mt-6 grid gap-3 sm:grid-cols-2">
                    {data.tokens.map((t) => {
                      const on = token?.address === t.address
                      return (
                        <button
                          key={t.address}
                          type="button"
                          onClick={() => setToken(t)}
                          className={`flex items-center gap-3 rounded-2xl border p-4 text-left transition-[border-color,box-shadow] ${on ? 'border-accent bg-accent-soft shadow-ring' : 'border-line hover:border-line-strong'}`}
                        >
                          <TokenIcon token={t} size={40} />
                          <span className="min-w-0 flex-1">
                            <span className="block text-[15px] font-semibold">{t.symbol}</span>
                            <span className="block text-[12.5px] text-ink-3">{t.name}</span>
                          </span>
                          <span className={`grid h-5 w-5 place-items-center rounded-full ${on ? 'bg-accent text-white' : 'ring-1 ring-inset ring-line-strong'}`}>{on && <Check size={12} />}</span>
                        </button>
                      )
                    })}
                  </div>
                </>
              )}
              {step === 1 && (
                <>
                  <h2 className="text-[20px] font-semibold tracking-[-0.02em]">How much of your own MON goes in?</h2>
                  <p className="mt-1 text-[14px] text-ink-3">Your stake goes into the pool like everyone else&apos;s, at the same price.</p>
                  <label className="mt-6 block">
                    <span className="flex h-16 items-center rounded-2xl border border-line bg-surface px-5 focus-within:border-accent/50 focus-within:shadow-ring">
                      <input
                        autoFocus
                        inputMode="decimal"
                        placeholder="0"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                        className="num w-full bg-transparent text-[28px] font-medium tracking-[-0.02em] outline-none placeholder:text-ink-3/50"
                      />
                      <span className="text-[15px] font-medium text-ink-3">MON</span>
                    </span>
                  </label>
                  <div className="mt-6 space-y-2 rounded-2xl bg-subtle p-4 text-[13.5px] leading-[1.55] text-ink-2">
                    <p>
                      You must hold at least <span className="num">{pct(p.minCallerBps)}</span> of the pool when it buys, so with this stake it can reach{' '}
                      <span className="num font-medium text-ink">{monText(stakeCeiling)}</span>.
                    </p>
                    <p>
                      Your cap is <span className="num font-medium text-ink">{monText(cap, 0)}</span>: tier <span className="num">{tier}</span> allows{' '}
                      <span className="num">{limits.multiple}x</span> your bond, and one buy may move the price at most {pct(p.maxImpactBps)}, which can lower it further.
                    </p>
                    <p>
                      The pool needs <span className="num">{monText(p.minPool)}</span> to go ahead; below that every deposit goes back 1:1.
                    </p>
                  </div>
                  <div className={`mt-3 rounded-2xl p-4 text-[13.5px] leading-[1.55] ${needsBond ? 'bg-accent-soft text-accent-deep ring-1 ring-inset ring-accent/20' : 'bg-subtle text-ink-2'}`}>
                    {needsBond
                      ? `This call needs a bond of ${bondNeeded} MON: at least ${p.minBond}, and enough that ${limits.multiple}x it covers your stake and the ${p.minPool} MON minimum. You have ${monText(bond)}; the rest is sent first. It stays locked while any of your calls is open or holding.`
                      : `Your bond of ${monText(bond)} is behind this call. It stays locked while any of your calls is open or holding.`}
                  </div>
                </>
              )}
              {step === 2 && (
                <div className="space-y-7">
                  <div>
                    <h2 className="text-[20px] font-semibold tracking-[-0.02em]">Set the rules</h2>
                    <p className="mt-1 text-[14px] text-ink-3">Fixed once the call opens. Nobody can change them, you included.</p>
                  </div>
                  <Slider
                    label="Window"
                    value={win}
                    show={duration(win * M * 1000)}
                    min={p.minWindow / M}
                    max={p.maxWindow / M}
                    step={stepFor(p.maxWindow / M)}
                    onChange={setWindowM}
                    hint="How long anyone can join, or take their MON back. Then you buy for the whole pool."
                  />
                  <Slider
                    label="Take-profit"
                    value={tp}
                    show={tp ? `+${pct(tp)}` : 'None'}
                    min={0}
                    max={20_000}
                    step={500}
                    onChange={setTp}
                    hint="Sold for everyone once two price records a gap apart are both this far above entry."
                  />
                  <Slider
                    label="Stop-loss"
                    value={slv}
                    show={`−${pct(slv)}`}
                    min={p.minStopLossBps}
                    max={p.maxStopLossBps}
                    step={100}
                    onChange={setSl}
                    hint="Sold for everyone once two price records a gap apart are both this far below entry."
                  />
                  <Slider
                    label="Max hold"
                    value={hold}
                    show={duration(hold * M * 1000)}
                    min={p.minHold / M}
                    max={p.maxHold / M}
                    step={stepFor(p.maxHold / M)}
                    onChange={setHoldM}
                    hint="After this anyone may sell, whatever the price."
                  />
                  <Slider
                    label="Your share of profit"
                    value={sharev}
                    show={pct(sharev)}
                    min={0}
                    max={limits.maxShareBps}
                    step={50}
                    onChange={setShare}
                    hint={`Of profit only, nothing on a loss. Tier ${tier} allows up to ${pct(limits.maxShareBps)}.`}
                  />
                  <div>
                    <p className="text-[14px] font-medium">Thesis</p>
                    <textarea
                      value={thesis}
                      maxLength={MAX_THESIS}
                      onChange={(e) => setThesis(e.target.value)}
                      placeholder="One or two sentences. Why this token, why now. No price targets."
                      className={`${input} mt-3 min-h-[96px] resize-y py-3 text-[14.5px]`}
                    />
                    <p className="num mt-1 text-right text-[12px] text-ink-3">
                      {thesis.length}/{MAX_THESIS}
                    </p>
                  </div>
                </div>
              )}
              {step === 3 && (
                <>
                  <h2 className="text-[20px] font-semibold tracking-[-0.02em]">Review and open</h2>
                  <p className="mt-1 text-[14px] text-ink-3">
                    {needsBond ? 'Two transactions: one posts your bond, the next opens the pool with your stake.' : 'One transaction opens the pool with your stake.'}
                  </p>
                  <div className="mt-6 rounded-2xl bg-subtle p-5">
                    <Row label="Token">{token?.symbol}</Row>
                    <Row label="Your stake">
                      <span className="num">{monText(stake)}</span>
                    </Row>
                    {needsBond && (
                      <Row label="Added to your bond">
                        <span className="num">{monText(bondNeeded - bond)}</span>
                      </Row>
                    )}
                    <Row label="Window closes">
                      <span className="num">{date(Date.now() + win * M * 1000)}</span>
                    </Row>
                    <Row label="Take-profit">
                      <span className="num">{tp ? `+${pct(tp)}` : 'None'}</span>
                    </Row>
                    <Row label="Stop-loss">
                      <span className="num">−{pct(slv)}</span>
                    </Row>
                    <Row label="Max hold">
                      <span className="num">{duration(hold * M * 1000)}</span>
                    </Row>
                    <Row label="Your share of profit">
                      <span className="num">{pct(sharev)}</span>
                    </Row>
                  </div>
                  <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-2xl border border-line p-4">
                    <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#1F6E9C]" />
                    <span className="text-[13.5px] leading-[1.55] text-ink-2">
                      I understand I cannot take my stake out, I must buy for the pool when the window closes or the record counts it as negligent, I cannot sell on my own, and the
                      result goes on my record whatever it is.
                    </span>
                  </label>
                </>
              )}
          </motion.div>
        </div>
        <div className="mt-8 flex items-center justify-between border-t border-line pt-5">
          <Button variant="ghost" icon={ArrowLeft} onClick={() => (step ? setStep(step - 1) : navigate(-1))}>
            Back
          </Button>
          {step < 3 ? (
            <Button iconRight={ArrowRight} disabled={!ok} onClick={() => setStep(step + 1)}>
              Continue
            </Button>
          ) : (
            <Button variant="accent" icon={Lock} disabled={!ok} onClick={() => void submit()}>
              Open the pool
            </Button>
          )}
        </div>
      </Card>

      <div className="space-y-3 lg:sticky lg:top-24 lg:self-start">
        <p className="eyebrow text-ink-3">Preview</p>
        {preview ? (
          <CallCard call={preview} caller={data.me} interactive={false} />
        ) : (
          <div className="grid h-[300px] place-items-center rounded-2xl border border-dashed border-line-strong text-[13.5px] text-ink-3">Pick a token to see your call</div>
        )}
      </div>

      <Modal
        open={signing !== 'idle'}
        onClose={() => (signing === 'done' || error) && setSigning('idle')}
        title={signing === 'done' ? 'Your call is live' : error ? 'Nothing was opened' : 'Confirm in your wallet'}
      >
        {signing === 'wait' && error ? (
          <div className="py-2">
            <p className="text-[14px] leading-[1.55] text-ink-2">{error}</p>
            <div className="mt-6 flex gap-2">
              <Button variant="secondary" block onClick={() => setSigning('idle')}>
                Back to the form
              </Button>
              <Button variant="accent" block onClick={() => void submit()}>
                Try again
              </Button>
            </div>
          </div>
        ) : signing === 'wait' ? (
          <div className="flex flex-col items-center py-6 text-center">
            <Loader2 size={28} className="animate-spin text-accent" />
            <p className="mt-4 text-[14px] text-ink-2">{tx.pending ? `${tx.pending}…` : 'Waiting for your signature…'}</p>
            {tx.enabled ? (
              <p className="mt-1 text-[12.5px] text-ink-3">{needsBond ? 'Two transactions: the bond, then the pool.' : 'One transaction: the pool and your stake.'}</p>
            ) : (
              <>
                <p className="mt-1 text-[12.5px] text-ink-3">Demo: no wallet or deployment, so nothing is sent.</p>
                <Button className="mt-6" variant="secondary" onClick={() => setSigning('done')}>
                  Simulate signature
                </Button>
              </>
            )}
          </div>
        ) : (
          <div>
            <p className="text-[14px] leading-[1.55] text-ink-2">
              The pool on {token?.symbol} is open until {date(Date.now() + win * M * 1000)}. Anyone can join until then. When it closes, come back to buy for the whole pool.
            </p>
            <div className="mt-6 flex gap-2">
              <Button variant="secondary" block onClick={() => navigate('/app/calls')}>
                See all calls
              </Button>
              <Button block onClick={() => navigate(openedId !== undefined ? `/app/calls/${openedId}` : '/app/portfolio')}>
                {openedId !== undefined ? 'See your call' : 'Go to portfolio'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

export default function NewCallPage() {
  useTitle('Open a call · trustpool')
  const s = useSession()
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[26px] font-semibold tracking-[-0.03em] sm:text-[30px]">Open a call</h1>
      </div>
      <RequireAuth title="Sign in to open a call" body="You set the rules, put in your own stake, and buy for everyone at once.">
        {s.address ? <Flow address={s.address} /> : <Skeleton className="h-[480px] rounded-2xl" />}
      </RequireAuth>
    </div>
  )
}

import { motion } from 'motion/react'
import { ArrowLeft, ArrowRight, Check, Loader2, Lock } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import type { Call, Token } from '@trustpool/core'
import { useSession } from '@/auth/session'
import { Button, Card, Modal, Row, Skeleton, TokenIcon } from '@/components/ui'
import { date, duration } from '@/lib/format'
import { source } from '@/lib/data'
import { useLoad, usePageVisible, useTitle } from '@/lib/hooks'
import { useTrustPool } from '@/lib/tx'
import CallCard from '../components/CallCard'
import RequireAuth from '../shell/RequireAuth'

// Mirrors contracts/src/TrustPool.sol defaults.
const MIN_BOND = 10
const MIN_LOCK_D = 1
const MAX_LOCK_D = 30
const MIN_NOTICE_H = 6
const MAX_THESIS = 280
const H = 3_600_000
const D = 24 * H

const STEPS = ['Token', 'Size', 'Rules', 'Review'] as const

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

function Slider({ label, value, unit, min, max, step = 1, onChange, hint }: { label: string; value: number; unit: string; min: number; max: number; step?: number; onChange: (v: number) => void; hint: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <p className="text-[14px] font-medium">{label}</p>
        <p className="num text-[20px] font-medium tracking-[-0.02em]">
          {value}
          <span className="ml-1 text-[13px] text-ink-3">{unit}</span>
        </p>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="mt-3 w-full accent-[#1F6E9C]" />
      <p className="mt-1 text-[12.5px] text-ink-3">{hint}</p>
    </div>
  )
}

function Flow({ address }: { address: string }) {
  const navigate = useNavigate()
  const visible = usePageVisible()
  const data = useLoad(async () => ({ tokens: await source.listTokens(), me: await source.getCaller(address) }), [address])
  const [step, setStep] = useState(0)
  const [token, setToken] = useState<Token | null>(null)
  const [amount, setAmount] = useState('')
  const [lockD, setLockD] = useState(3)
  const [noticeH, setNoticeH] = useState(12)
  const [thesis, setThesis] = useState('')
  const [agree, setAgree] = useState(false)
  const [signing, setSigning] = useState<'idle' | 'wait' | 'done'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [openedId, setOpenedId] = useState<number>()
  const tx = useTrustPool()

  const bond = data?.me?.bond ?? 0
  const needsBond = bond < MIN_BOND
  const mon = Number(amount) || 0
  const ok = [!!token, mon > 0, thesis.trim().length > 0, agree][step]

  const preview: Call | null = useMemo(() => {
    if (!token) return null
    const now = Date.now()
    const p = 0.002
    return {
      id: 0,
      caller: address,
      token,
      monIn: mon || 100,
      tokens: (mon || 100) / p,
      openedAt: now,
      unlockAt: now + lockD * D,
      notice: noticeH * H,
      state: 'Locked',
      thesis: thesis || 'Your thesis appears here, fixed once the call opens.',
      series: [p, p],
      watchers: 0,
    }
  }, [token, mon, lockD, noticeH, thesis, address])

  /** Posts the missing bond if needed, then buys and locks in one more transaction. */
  async function submit() {
    setError(null)
    setSigning('wait')
    if (!tx.enabled || !token) return // demo: the modal offers a simulated signature
    if (needsBond) {
      const r = await tx.run('Posting your bond', (t) => t.postBond(MIN_BOND - bond))
      if (!r.ok) return setError(r.error)
    }
    const r = await tx.run('Buying and locking', (t) =>
      t.openCall({ token: token.address as `0x${string}`, mon, lockSeconds: lockD * 86_400, noticeSeconds: noticeH * 3_600, thesis: thesis.trim() }),
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
                  <p className="mt-1 text-[14px] text-ink-3">Only tokens on the allow list. The list is public and kept by the admin.</p>
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
                  <h2 className="text-[20px] font-semibold tracking-[-0.02em]">How much of your own MON?</h2>
                  <p className="mt-1 text-[14px] text-ink-3">All of it buys {token?.symbol} in one swap. Your fill becomes the entry everyone sees.</p>
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
                  <div className="mt-3 flex gap-2">
                    {[50, 100, 250, 500].map((v) => (
                      <button key={v} type="button" onClick={() => setAmount(String(v))} className="num h-8 rounded-lg bg-subtle px-3 text-[13px] text-ink-2 ring-1 ring-inset ring-line hover:text-ink">
                        {v}
                      </button>
                    ))}
                  </div>
                  <div className={`mt-6 rounded-2xl p-4 text-[13.5px] leading-[1.55] ${needsBond ? 'bg-accent-soft text-accent-deep ring-1 ring-inset ring-accent/20' : 'bg-subtle text-ink-2'}`}>
                    {needsBond
                      ? `You need a bond of at least ${MIN_BOND} MON before opening a call. It is added to this transaction, and it stays behind every call you make.`
                      : `Your bond of ${bond} MON covers this call. It stays locked while any call is open.`}
                  </div>
                </>
              )}
              {step === 2 && (
                <div className="space-y-7">
                  <div>
                    <h2 className="text-[20px] font-semibold tracking-[-0.02em]">Set the rules</h2>
                    <p className="mt-1 text-[14px] text-ink-3">These lock with the call. You will not be able to change them.</p>
                  </div>
                  <Slider label="Lock" value={lockD} unit={lockD === 1 ? 'day' : 'days'} min={MIN_LOCK_D} max={MAX_LOCK_D} onChange={setLockD} hint="No exit can execute before this ends." />
                  <Slider label="Exit notice" value={noticeH} unit="hours" min={MIN_NOTICE_H} max={72} step={6} onChange={setNoticeH} hint="Between announcing an exit and being able to sell. Followers get this head start." />
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
                  <h2 className="text-[20px] font-semibold tracking-[-0.02em]">Review and lock</h2>
                  <p className="mt-1 text-[14px] text-ink-3">{needsBond ? 'Two transactions: one posts your bond, the next buys the token and locks it.' : 'One transaction buys the token and locks it.'} The minimum fill allows 1% slippage.</p>
                  <div className="mt-6 rounded-2xl bg-subtle p-5">
                    <Row label="Token">{token?.symbol}</Row>
                    <Row label="Your MON">
                      <span className="num">{mon}</span>
                    </Row>
                    {needsBond && (
                      <Row label="Bond">
                        <span className="num">{MIN_BOND - bond} MON</span>
                      </Row>
                    )}
                    <Row label="Lock ends">
                      <span className="num">{date(Date.now() + lockD * D)}</span>
                    </Row>
                    <Row label="Exit notice">
                      <span className="num">{duration(noticeH * H)}</span>
                    </Row>
                  </div>
                  <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-2xl border border-line p-4">
                    <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#1F6E9C]" />
                    <span className="text-[13.5px] leading-[1.55] text-ink-2">
                      I understand I cannot sell before the lock ends, every exit is announced {noticeH} hours ahead, and this call stays on my record whatever the result.
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
              Buy and lock
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
        <p className="text-[12.5px] leading-[1.5] text-ink-3">This is how followers will see it, with your real fill in place of the estimate.</p>
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
              <p className="mt-1 text-[12.5px] text-ink-3">{needsBond ? 'Two transactions: the bond, then the buy.' : 'One transaction: the buy and the lock.'}</p>
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
              {token?.symbol} is bought and locked. Followers can see your entry now. Your first chance to sell is after {date(Date.now() + lockD * D)}, with {noticeH} hours of notice.
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
        <p className="mt-1 text-[14px] text-ink-3">Buy first, then it goes public. Four short steps.</p>
      </div>
      <RequireAuth title="Sign in to open a call" body="Opening a call buys the token with your own MON and locks it. You need a wallet; Privy creates one if you have none.">
        {s.address ? <Flow address={s.address} /> : <Skeleton className="h-[480px] rounded-2xl" />}
      </RequireAuth>
    </div>
  )
}

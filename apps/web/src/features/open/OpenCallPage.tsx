import { Lock } from 'lucide-react'
import { useState } from 'react'
import Container from '@/components/site/Container'
import { ArrowButton, Panel, Row } from '@/components/ui'
import { source } from '@/lib/data'
import { useLoad, useTitle } from '@/lib/hooks'

// Mirrors the contract defaults in contracts/src/TrustPool.sol.
const MIN_LOCK_DAYS = 1
const MAX_LOCK_DAYS = 30
const MIN_NOTICE_HOURS = 6
const MAX_THESIS = 280

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block border-t border-line py-5 first:border-t-0 first:pt-0">
      <span className="text-[14px] font-medium">{label}</span>
      {hint && <span className="mt-1 block text-[13px] text-ink-quiet">{hint}</span>}
      <div className="mt-3">{children}</div>
    </label>
  )
}

const input =
  'w-full rounded-panel border border-line bg-mist px-3 py-2.5 text-[15px] text-ink outline-none transition-colors focus:border-ink [font-variant-numeric:tabular-nums]'

/** Opening a call. Everything entered here becomes fixed the moment the transaction lands. */
export default function OpenCallPage() {
  useTitle('Open a call · trustpool')
  const tokens = useLoad(() => source.listTokens(), []) ?? []
  const [token, setToken] = useState('')
  const [amount, setAmount] = useState('')
  const [lockDays, setLockDays] = useState(3)
  const [noticeHours, setNoticeHours] = useState(12)
  const [thesis, setThesis] = useState('')
  const sym = tokens.find((t) => t.address === token)?.symbol

  return (
    <main className="min-h-screen pb-24 pt-28 sm:pt-32">
      <Container className="max-w-[1000px]">
        <p className="eyebrow text-ink-quiet">Open a call</p>
        <h1 className="mt-3 text-[30px] font-semibold tracking-[-0.02em]">Buy first, then tell people</h1>
        <p className="mt-3 max-w-[60ch] text-[15px] leading-[1.6] text-ink-quiet">
          Your MON buys the token through trustpool and stays locked there. The call goes public with your fill already on the record. You need a bond posted
          before you can open one.
        </p>

        <div className="mt-10 grid gap-6 lg:grid-cols-[1.3fr_1fr]">
          <Panel className="p-6">
            <Field label="Token" hint="Only tokens on the allow list. The list is kept by the admin, in the open.">
              <select className={input} value={token} onChange={(e) => setToken(e.target.value)}>
                <option value="">Choose a token</option>
                {tokens.map((t) => (
                  <option key={t.address} value={t.address}>
                    {t.symbol} · {t.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Your MON" hint="All of it buys the token in one swap. The record keeps what actually arrived.">
              <input className={input} inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} />
            </Field>
            <Field label={`Lock: ${lockDays} ${lockDays === 1 ? 'day' : 'days'}`} hint={`Between ${MIN_LOCK_DAYS} and ${MAX_LOCK_DAYS} days. No exit can execute before it ends.`}>
              <input
                type="range"
                min={MIN_LOCK_DAYS}
                max={MAX_LOCK_DAYS}
                value={lockDays}
                onChange={(e) => setLockDays(Number(e.target.value))}
                className="w-full accent-[rgb(var(--ink))]"
              />
            </Field>
            <Field label={`Exit notice: ${noticeHours} hours`} hint={`At least ${MIN_NOTICE_HOURS} hours between announcing an exit and selling.`}>
              <input
                type="range"
                min={MIN_NOTICE_HOURS}
                max={72}
                step={6}
                value={noticeHours}
                onChange={(e) => setNoticeHours(Number(e.target.value))}
                className="w-full accent-[rgb(var(--ink))]"
              />
            </Field>
            <Field label="Thesis" hint="One or two sentences, public and fixed. No price targets.">
              <textarea className={`${input} min-h-[96px] resize-y`} maxLength={MAX_THESIS} value={thesis} onChange={(e) => setThesis(e.target.value)} />
              <span className="num mt-1 block text-right text-[12px] text-ink-quiet">
                {thesis.length}/{MAX_THESIS}
              </span>
            </Field>
          </Panel>

          <div className="space-y-4 lg:sticky lg:top-28 lg:self-start">
            <Panel className="p-6">
              <div className="flex items-center justify-between">
                <p className="eyebrow text-ink-quiet">What gets fixed</p>
                <Lock size={14} className="text-ink-quiet" />
              </div>
              <div className="mt-4">
                <Row label="Token">{sym ?? '—'}</Row>
                <Row label="Your MON">
                  <span className="num">{amount || '—'}</span>
                </Row>
                <Row label="Earliest exit">
                  <span className="num">{lockDays}d</span> after open
                </Row>
                <Row label="Notice">
                  <span className="num">{noticeHours}h</span> before every exit
                </Row>
              </div>
              <p className="mt-4 border-t border-line pt-4 text-[13px] leading-[1.6] text-ink-quiet">
                Once this lands you cannot change any of it, sell early, or remove the call from your record.
              </p>
            </Panel>
            <ArrowButton block size="lg" text="Connect a wallet to open" disabled />
            <p className="text-center text-[12px] text-ink-quiet">Wallet connection is the next build step.</p>
          </div>
        </div>
      </Container>
    </main>
  )
}

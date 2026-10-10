import { BellRing, Lock, Plus, Shield, Wallet } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { averageBps, returnBps, type Call } from '@trustpool/core'
import { useSession } from '@/auth/session'
import { Button, ButtonLink, Card, Empty, Modal, Row, SectionHead, Signed, Skeleton, Stat, StateTag, TokenIcon, toast } from '@/components/ui'
import { date, duration, mon } from '@/lib/format'
import { source } from '@/lib/data'
import { useLoad, useTitle } from '@/lib/hooks'
import { actions } from '@/lib/store'
import { useLocalCalls } from '@/lib/view'
import Countdown from '../components/Countdown'
import RequireAuth from '../shell/RequireAuth'

async function load(address: string) {
  const [caller, calls] = await Promise.all([source.getCaller(address), source.listCalls({ caller: address })])
  return { caller, calls }
}

/** One open position with the only actions a caller has: announce, then execute. */
function OpenPosition({ call, onAnnounce }: { call: Call; onAnnounce: (c: Call) => void }) {
  const unlocked = Date.now() >= call.unlockAt
  return (
    <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
      <Link to={`/app/calls/${call.id}`} className="flex items-center gap-3">
        <TokenIcon token={call.token} size={40} />
        <div>
          <p className="flex items-center gap-2 text-[15px] font-semibold">
            {call.token.symbol} <span className="num text-[12px] font-normal text-ink-3">#{call.id}</span>
            <StateTag state={call.state} size="sm" />
          </p>
          <p className="mt-0.5 text-[12.5px] text-ink-3">
            {mon(call.monIn, 0)} locked ·{' '}
            {call.state === 'Exiting' ? (
              <>
                executable in <Countdown at={call.exitAt!} done="now" className="text-accent-deep" />
              </>
            ) : unlocked ? (
              'lock ended'
            ) : (
              <>
                lock ends in <Countdown at={call.unlockAt} />
              </>
            )}
          </p>
        </div>
      </Link>
      {call.state === 'Locked' ? (
        <Button variant="secondary" icon={BellRing} onClick={() => onAnnounce(call)}>
          Announce exit
        </Button>
      ) : (
        <Button disabled={Date.now() < call.exitAt!} title="Available once the notice period ends">
          Sell and settle
        </Button>
      )}
    </div>
  )
}

function Inner({ address }: { address: string }) {
  const data = useLoad(() => load(address), [address])
  const calls = useLocalCalls(data?.calls)
  const [confirm, setConfirm] = useState<Call | null>(null)

  if (!data || !calls) return <Skeleton className="h-[480px] rounded-2xl" />
  const { caller } = data
  const open = calls.filter((c) => c.state === 'Locked' || c.state === 'Exiting')
  const done = calls.filter((c) => !open.includes(c))

  if (!caller)
    return (
      <Card>
        <Empty
          icon={<Wallet size={18} />}
          title="You have not opened a call yet"
          body="Post a bond, buy with your own MON, and the call goes public with your entry already on the record."
          action={
            <ButtonLink to="/app/new" icon={Plus}>
              Open your first call
            </ButtonLink>
          }
        />
      </Card>
    )

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr_1.2fr]">
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent-fill text-accent-deep">
              <Shield size={16} />
            </span>
            <span className="rounded-full bg-subtle px-2.5 py-1 text-[11.5px] text-ink-2 ring-1 ring-inset ring-line">{open.length ? 'Locked by open calls' : 'Withdrawable after 7 days'}</span>
          </div>
          <Stat className="mt-4" label="Bond" value={mon(caller.bond)} foot={`Slashed ${caller.record.slashes} times`} />
          <div className="mt-4 flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => toast('Bond top-up arrives with the contract wiring')}>
              Add
            </Button>
            <Button size="sm" variant="ghost" disabled={open.length > 0}>
              Withdraw
            </Button>
          </div>
        </Card>
        <Card className="p-5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-subtle text-ink-2 ring-1 ring-inset ring-line">
            <Lock size={16} />
          </span>
          <Stat className="mt-4" label="Locked in open calls" value={mon(open.reduce((s, c) => s + c.monIn, 0))} foot={`${open.length} open`} />
        </Card>
        <Card className="p-5">
          <p className="text-[13px] text-ink-3">Your public record</p>
          <div className="mt-3 grid grid-cols-3 gap-3">
            <Stat label="Settled" value={caller.record.settled + caller.record.released} />
            <Stat label="At a loss" value={caller.record.losses} />
            <Stat label="Average" value={<Signed bps={averageBps(caller.record)} />} />
          </div>
          <Link to={`/app/callers/${caller.address}`} className="mt-3 inline-block text-[13px] font-medium text-ink-3 hover:text-ink">
            See it as followers do →
          </Link>
        </Card>
      </div>

      <Card>
        <SectionHead
          className="px-5 pt-5"
          title="Open calls"
          sub="Announcing starts the public notice clock. It cannot be taken back."
          action={
            <ButtonLink to="/app/new" size="sm" icon={Plus}>
              New call
            </ButtonLink>
          }
        />
        {open.length === 0 ? (
          <Empty title="No open calls" body="Your next call will show here with its lock and exit controls." />
        ) : (
          <div className="mt-2 divide-y divide-line">
            {open.map((c) => (
              <OpenPosition key={c.id} call={c} onAnnounce={setConfirm} />
            ))}
          </div>
        )}
      </Card>

      <Card>
        <SectionHead className="px-5 pt-5" title="History" sub="Everything here is public and permanent." />
        <ul className="mt-2 divide-y divide-line">
          {done.map((c) => (
            <li key={c.id}>
              <Link to={`/app/calls/${c.id}`} className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-subtle">
                <span className="flex items-center gap-3">
                  <TokenIcon token={c.token} size={32} />
                  <span>
                    <span className="block text-[14px] font-semibold">{c.token.symbol}</span>
                    <span className="num block text-[12px] text-ink-3">{date(c.openedAt)}</span>
                  </span>
                </span>
                <Signed bps={returnBps(c)!} pill />
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      <Modal open={!!confirm} onClose={() => setConfirm(null)} title="Announce your exit?">
        {confirm && (
          <>
            <p className="text-[14px] leading-[1.55] text-ink-2">
              Everyone watching {confirm.token.symbol} #{confirm.id} is alerted now. You can sell after the notice period, and not before.
            </p>
            <div className="mt-5 rounded-xl bg-subtle p-4">
              <Row label="Notice">
                <span className="num">{duration(confirm.notice)}</span>
              </Row>
              <Row label="Earliest sale">
                <span className="num">{date(Math.max(confirm.unlockAt, Date.now() + confirm.notice))}</span>
              </Row>
            </div>
            <div className="mt-6 flex gap-2">
              <Button variant="secondary" block onClick={() => setConfirm(null)}>
                Keep holding
              </Button>
              <Button
                block
                onClick={() => {
                  actions.announce(confirm.id)
                  setConfirm(null)
                  toast(`Exit announced. ${confirm.watchers} watchers alerted.`)
                }}
              >
                Announce
              </Button>
            </div>
          </>
        )}
      </Modal>
    </div>
  )
}

export default function PortfolioPage() {
  useTitle('Portfolio · trustpool')
  const s = useSession()
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[26px] font-semibold tracking-[-0.03em] sm:text-[30px]">Portfolio</h1>
        <p className="mt-1 text-[14px] text-ink-3">Your bond, your open calls and the record they leave.</p>
      </div>
      <RequireAuth title="Sign in to see your calls" body="Your bond, open positions and the controls to announce an exit live here.">
        {s.address ? <Inner address={s.address} /> : <Skeleton className="h-[320px] rounded-2xl" />}
      </RequireAuth>
    </div>
  )
}

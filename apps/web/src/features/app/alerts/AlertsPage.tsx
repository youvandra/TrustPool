import { Bell, BellRing, CheckCheck, Lock, Receipt, Sparkles, Split, Undo2, type LucideIcon } from 'lucide-react'
import { Link } from 'react-router'
import type { AlertKind } from '@trustpool/core'
import { Button, ButtonLink, CallerAvatar, Card, Empty, SkeletonRows, TokenIcon } from '@/components/ui'
import { ago, date } from '@/lib/format'
import { source } from '@/lib/data'
import { useLoad, useTitle } from '@/lib/hooks'
import { useLiveVersion } from '@/lib/live'
import { actions, useStore } from '@/lib/store'
import RequireAuth from '../shell/RequireAuth'

const quiet = 'bg-subtle text-ink-2 ring-1 ring-inset ring-line'
const KIND: Record<AlertKind, { icon: LucideIcon; verb: string; tone: string }> = {
  window_opened: { icon: Sparkles, verb: 'opened a pool on', tone: 'bg-accent text-white' },
  window_closing: { icon: BellRing, verb: 'has a pool closing soon on', tone: 'bg-accent-fill text-accent-deep' },
  bought: { icon: Lock, verb: 'bought for the pool on', tone: quiet },
  sold: { icon: Receipt, verb: 'sold the pool on', tone: quiet },
  refunded: { icon: Undo2, verb: 'had every deposit refunded on', tone: quiet },
  split: { icon: Split, verb: 'could not sell, and split, the pool on', tone: quiet },
}

async function load() {
  const [alerts, calls, callers] = await Promise.all([source.alerts(), source.listCalls(), source.listCallers()])
  return { alerts, calls, callers }
}

function List() {
  const data = useLoad(load, [useLiveVersion()])
  const read = useStore((s) => s.read)
  if (!data) return <SkeletonRows rows={5} className="mt-12" />
  if (!data.alerts.length)
    return (
      <Card>
        <Empty
          icon={<Bell size={18} />}
          title="Nothing yet"
          body="Follow a caller to hear when they open a pool. Watch a call to hear when it buys and sells."
          action={
            <ButtonLink to="/app/calls" variant="secondary">
              Browse calls
            </ButtonLink>
          }
        />
      </Card>
    )
  const unread = data.alerts.filter((a) => !a.read && !read.includes(a.id))
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[13.5px] text-ink-3">{unread.length ? `${unread.length} unread` : 'All caught up'}</p>
        <Button size="sm" variant="ghost" icon={CheckCheck} disabled={!unread.length} onClick={() => actions.markRead(data.alerts.map((a) => a.id))}>
          Mark all read
        </Button>
      </div>
      <Card className="divide-y divide-line overflow-hidden">
        {data.alerts.map((a) => {
          const call = data.calls.find((c) => c.id === a.callId)
          const who = call && data.callers.find((c) => c.address === call.caller)
          if (!call) return null
          const k = KIND[a.kind]
          const isNew = !a.read && !read.includes(a.id)
          return (
            <Link
              key={a.id}
              to={`/app/calls/${call.id}`}
              onClick={() => actions.markRead([a.id])}
              className={`flex items-center gap-4 px-4 py-4 transition-colors hover:bg-subtle sm:px-5 ${isNew ? 'bg-accent-soft shadow-[inset_3px_0_0_#1F6E9C]' : ''}`}
            >
              <span className="relative">
                <CallerAvatar address={call.caller} size={40} />
                <span className={`absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full ring-2 ring-surface ${k.tone}`}>
                  <k.icon size={11} />
                </span>
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] leading-[1.45]">
                  <span className="font-semibold">{who?.handle}</span> <span className="text-ink-2">{k.verb}</span> <span className="font-semibold">{call.token.symbol}</span>
                </p>
                <p className="mt-0.5 text-[12.5px] text-ink-3" title={date(a.at)}>{ago(a.at)}</p>
              </div>
              <TokenIcon token={call.token} size={30} />
              {isNew && <span className="h-2 w-2 shrink-0 rounded-full bg-accent" />}
            </Link>
          )
        })}
      </Card>
    </div>
  )
}

export default function AlertsPage() {
  useTitle('Alerts · trustpool')
  return (
    <div className="mx-auto max-w-[760px] space-y-6">
      <div>
        <h1 className="text-[26px] font-semibold tracking-[-0.03em] sm:text-[30px]">Alerts</h1>
      </div>
      <RequireAuth title="Sign in for alerts" body="Hear when a pool opens, closes, buys and sells.">
        <List />
      </RequireAuth>
    </div>
  )
}

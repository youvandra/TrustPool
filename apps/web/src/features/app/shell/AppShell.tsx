import { Bell, Plus, Search } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { useSession } from '@/auth/session'
import { ButtonLink, LoadBoundary, Toaster, Wordmark } from '@/components/ui'
import { source } from '@/lib/data'
import { useLoad } from '@/lib/hooks'
import { useLiveAlerts, useLiveVersion } from '@/lib/live'
import { useServerState, useStore } from '@/lib/store'
import Account from './Account'
import { MOBILE_NAV, NAV } from './nav'

function useUnread() {
  const read = useStore((s) => s.read)
  const { authenticated } = useSession()
  const live = useLiveVersion()
  const alerts = useLoad(() => (authenticated ? source.alerts().catch(() => []) : Promise.resolve([])), [authenticated, live])
  return authenticated && alerts ? alerts.filter((a) => !a.read && !read.includes(a.id)).length : 0
}

function Sidebar() {
  const unread = useUnread()
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r border-line bg-surface lg:flex">
      <div className="flex h-16 items-center px-5">
        <Wordmark to="/app" />
      </div>
      <nav className="scroll-quiet flex-1 overflow-y-auto px-3 pt-2" aria-label="App">
        {NAV.map((g) => (
          <div key={g.group} className="mb-5">
            <p className="eyebrow px-3 pb-2 text-ink-3">{g.group}</p>
            <ul className="space-y-0.5">
              {g.items.map((it) => (
                <li key={it.to}>
                  <NavLink
                    to={it.to}
                    end={it.end}
                    className={({ isActive }) =>
                      `group flex h-9 items-center gap-2.5 rounded-lg px-3 text-[14px] transition-colors ${
                        isActive
                          ? 'bg-accent-fill font-medium text-accent-deep [&_svg]:text-accent'
                          : 'text-ink-2 hover:bg-ink/[0.04] hover:text-ink [&_svg]:text-ink-3'
                      }`
                    }
                  >
                    <it.icon size={17} strokeWidth={1.9} />
                    <span className="flex-1">{it.label}</span>
                    {it.label === 'Alerts' && unread > 0 && (
                      <span className="num grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1.5 text-[11px] text-white">{unread}</span>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <div className="space-y-3 p-3">
        <div className="relative overflow-hidden rounded-2xl bg-accent-soft p-4 ring-1 ring-inset ring-accent/15">
          <p className="relative text-[13.5px] font-semibold text-accent-deep">Have a call?</p>
          <p className="relative mt-1 text-[12.5px] leading-[1.5] text-ink-2">Your stake in first, the rules fixed, then anyone joins.</p>
          <ButtonLink to="/app/new" size="sm" variant="accent" icon={Plus} className="relative mt-3" block>
            Open a call
          </ButtonLink>
        </div>
        <div className="border-t border-line pt-3">
          <Account />
        </div>
      </div>
    </aside>
  )
}

const TITLES: [RegExp, string][] = [
  [/^\/app\/?$/, 'Home'],
  [/^\/app\/calls\/\d+/, 'Call'],
  [/^\/app\/calls/, 'Calls'],
  [/^\/app\/callers\/.+/, 'Caller'],
  [/^\/app\/callers/, 'Callers'],
  [/^\/app\/portfolio/, 'Portfolio'],
  [/^\/app\/alerts/, 'Alerts'],
  [/^\/app\/new/, 'Open a call'],
]

function Topbar() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const unread = useUnread()
  const [q, setQ] = useState('')
  const title = TITLES.find(([re]) => re.test(pathname))?.[1] ?? ''
  const submit = (e: FormEvent) => {
    e.preventDefault()
    navigate(`/app/calls${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`)
  }
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-surface/90 backdrop-blur-md">
      <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
        <div className="lg:hidden">
          <Wordmark to="/app" />
        </div>
        <p className="hidden text-[14px] text-ink-3 lg:block">
          <Link to="/app" className="hover:text-ink">
            trustpool
          </Link>
          <span className="mx-2 text-ink-3/50">/</span>
          <span className="font-medium text-ink">{title}</span>
        </p>
        <form onSubmit={submit} className="ml-auto hidden w-full max-w-[340px] md:block">
          <label className="flex h-10 items-center gap-2 rounded-xl border border-line bg-subtle px-3 text-ink-3 transition-shadow focus-within:border-accent/50 focus-within:bg-surface focus-within:shadow-ring">
            <Search size={16} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search tokens or callers"
              className="w-full bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-3"
            />
          </label>
        </form>
        <Link
          to="/app/alerts"
          className="relative ml-auto grid h-10 w-10 place-items-center rounded-xl text-ink-2 hover:bg-ink/[0.04] md:ml-0"
          aria-label="Alerts"
        >
          <Bell size={18} />
          {unread > 0 && <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-accent ring-2 ring-surface" />}
        </Link>
        <div className="lg:hidden">
          <Account compact />
        </div>
      </div>
    </header>
  )
}

function MobileTabs() {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
      aria-label="App"
    >
      <ul className="grid grid-cols-5">
        {MOBILE_NAV.slice(0, 2).map((it) => (
          <Tab key={it.to} {...it} />
        ))}
        <li className="grid place-items-center">
          <Link to="/app/new" className="grid h-11 w-11 place-items-center rounded-2xl bg-accent text-white shadow-card" aria-label="Open a call">
            <Plus size={20} />
          </Link>
        </li>
        {MOBILE_NAV.slice(2).map((it) => (
          <Tab key={it.to} {...it} />
        ))}
      </ul>
    </nav>
  )
}

function Tab({ to, label, icon: Icon, end }: (typeof MOBILE_NAV)[number]) {
  return (
    <li>
      <NavLink
        to={to}
        end={end}
        className={({ isActive }) =>
          `flex h-16 flex-col items-center justify-center gap-1 text-[10.5px] ${isActive ? 'font-medium text-accent' : 'text-ink-3'}`
        }
      >
        <Icon size={19} strokeWidth={1.9} />
        {label}
      </NavLink>
    </li>
  )
}

/** The product: sidebar on desktop, top bar plus bottom tabs on phones. */
export default function AppShell() {
  const { authenticated } = useSession()
  const { pathname } = useLocation()
  useServerState(authenticated)
  useLiveAlerts(authenticated)
  return (
    <div className="min-h-screen bg-bg">
      <Sidebar />
      <div className="lg:pl-[248px]">
        <Topbar />
        <main className="mx-auto w-full max-w-[1400px] px-4 pb-28 pt-6 sm:px-6 lg:px-10 lg:pb-16 lg:pt-8">
          <LoadBoundary key={pathname}>
            <Outlet />
          </LoadBoundary>
        </main>
      </div>
      <MobileTabs />
      <Toaster />
    </div>
  )
}

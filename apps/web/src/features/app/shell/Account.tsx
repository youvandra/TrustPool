import { ChevronsUpDown, LogOut } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useSession } from '@/auth/session'
import { Button, CallerAvatar } from '@/components/ui'
import { shortAddress } from '@/lib/format'

/** Sign-in button, or the account chip with a small menu once signed in. */
export default function Account({ compact = false }: { compact?: boolean }) {
  const s = useSession()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  if (!s.ready) return <div className="skeleton h-10 w-full rounded-xl" />
  if (!s.authenticated)
    return (
      <Button block={!compact} size={compact ? 'sm' : 'md'} onClick={s.login}>
        Sign in
      </Button>
    )
  const addr = s.address ?? '0x0000000000000000000000000000000000000000'
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center gap-2.5 rounded-xl text-left transition-colors hover:bg-ink/[0.04] ${compact ? 'p-1' : 'p-2'}`}
        aria-expanded={open}
      >
        <CallerAvatar address={addr} size={compact ? 30 : 34} />
        {!compact && (
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13.5px] font-medium">{s.label ?? shortAddress(addr)}</span>
            <span className="num block truncate text-[11.5px] text-ink-3">{s.address ? shortAddress(s.address) : 'Creating wallet…'}</span>
          </span>
        )}
        {!compact && <ChevronsUpDown size={14} className="text-ink-3" />}
      </button>
      {open && (
        <div className={`absolute z-50 w-56 rounded-xl border border-line bg-surface p-1.5 shadow-pop ${compact ? 'right-0 top-full mt-2' : 'bottom-full left-0 mb-2'}`}>
          <p className="px-2.5 py-2 text-[12px] text-ink-3">{s.mode === 'demo' ? 'Demo session' : 'Signed in with Privy'}</p>
          <button type="button" onClick={s.logout} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[13.5px] text-ink-2 hover:bg-subtle hover:text-ink">
            <LogOut size={14} /> Sign out
          </button>
        </div>
      )}
    </div>
  )
}

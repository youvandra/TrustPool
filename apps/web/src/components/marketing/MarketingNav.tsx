import { Menu, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { ArrowLink, Wordmark } from '@/components/ui'
import { useScrolled } from '@/lib/hooks'

const LINKS = [
  { label: 'How it works', to: '/#how' },
  { label: 'Docs', to: '/docs' },
]

export default function MarketingNav() {
  const scrolled = useScrolled(12)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    if (open) document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = ''
      document.removeEventListener('keydown', onKey)
    }
  }, [open])
  return (
    <header className="fixed inset-x-0 top-0 z-50">
      <div className="mx-auto max-w-[1240px] px-3 pt-3">
        <div
          className={`flex h-14 items-center justify-between rounded-full border pl-4 pr-1.5 transition-[background-color,border-color,box-shadow] duration-500 ease-calm ${
            scrolled || open ? 'border-line bg-surface/90 shadow-card backdrop-blur-md' : 'border-transparent bg-transparent'
          }`}
        >
          <div className="flex items-center gap-10">
            <Wordmark />
            <nav className="hidden items-center gap-1 md:flex">
              {LINKS.map((l) => (
                <Link key={l.to} to={l.to} className="rounded-full px-3 py-2 text-[14px] text-ink-2 transition-colors hover:text-ink">
                  {l.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/app" className="hidden rounded-full px-4 py-2 text-[14px] font-medium text-ink-2 hover:text-ink sm:block">
              Sign in
            </Link>
            <div className="hidden sm:block">
              <ArrowLink to="/app" className="h-11 text-[14px]">
                Launch app
              </ArrowLink>
            </div>
            <button type="button" onClick={() => setOpen((v) => !v)} className="grid h-11 w-11 place-items-center rounded-full bg-ink text-white sm:hidden" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open}>
              {open ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>
      </div>
      {open && (
        <div className="fixed inset-0 -z-10 bg-bg px-5 pt-24 sm:hidden">
          <nav className="flex flex-col">
            {LINKS.map((l) => (
              <Link key={l.to} to={l.to} onClick={() => setOpen(false)} className="border-b border-line py-4 text-[28px] font-medium tracking-[-0.03em]">
                {l.label}
              </Link>
            ))}
          </nav>
          <ArrowLink to="/app" className="mt-8 w-full justify-between">
            Launch app
          </ArrowLink>
        </div>
      )}
    </header>
  )
}

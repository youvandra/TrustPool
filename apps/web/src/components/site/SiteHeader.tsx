import { Menu, X } from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { ArrowLink, LogoLink } from '@/components/ui'
import { usePageVisible, useScrolled } from '@/lib/hooks'
import { HEADER_LINKS } from './links'

const isActive = (to: string, pathname: string) => !to.includes('#') && pathname.startsWith(to)

/** A floating pill that gains a line once the page scrolls; a full sheet on phones. */
export default function SiteHeader() {
  const { pathname } = useLocation()
  const scrolled = useScrolled(12)
  const visible = usePageVisible()
  // The menu belongs to the page it was opened on, so navigating closes it.
  const [openOn, setOpenOn] = useState<string | null>(null)
  const open = openOn === pathname
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  return (
    <header className="fixed inset-x-0 top-0 z-50">
      <div className="mx-auto max-w-[1440px] p-2 sm:p-3">
        <div
          className={`flex items-center justify-between gap-3 rounded-full border bg-surface/90 p-[5px] pl-2 backdrop-blur-md transition-colors duration-500 ease-calm ${
            scrolled ? 'border-line' : 'border-transparent'
          }`}
        >
          <div className="flex min-w-0 items-center gap-8">
            <LogoLink />
            <nav className="hidden items-center gap-1 lg:flex" aria-label="Main">
              {HEADER_LINKS.map((l) => (
                <Link
                  key={l.to}
                  to={l.to}
                  className={`rounded-full px-3 py-2 text-[14px] transition-colors duration-300 ${isActive(l.to, pathname) ? 'bg-mist text-ink' : 'text-ink-quiet hover:text-ink'}`}
                >
                  {l.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <ArrowLink className="hidden md:inline-flex" text="Open a call" to="/open" />
            <button
              type="button"
              onClick={() => setOpenOn(open ? null : pathname)}
              className="flex items-center gap-2 rounded-full bg-ink px-4 py-2.5 text-[13px] font-medium text-mist lg:hidden"
              aria-expanded={open}
              aria-controls="site-menu"
            >
              <span>{open ? 'Close' : 'Menu'}</span>
              {open ? <X size={16} /> : <Menu size={16} />}
            </button>
          </div>
        </div>
      </div>

      {/* The sheet appears at full opacity; only its links slide, so nothing waits on an animation to be readable. */}
      {open && (
        <div id="site-menu" className="fixed inset-0 -z-10 bg-mist px-5 pb-8 pt-24 lg:hidden">
          <nav className="flex flex-col" aria-label="Main">
            {HEADER_LINKS.map((l, i) => (
              <motion.div
                key={l.to}
                initial={visible ? { y: 16 } : false}
                animate={{ y: 0 }}
                transition={{ delay: 0.03 * i, type: 'spring', stiffness: 380, damping: 32 }}
              >
                <Link to={l.to} onClick={() => setOpenOn(null)} className="block border-b border-line py-4 text-[30px] font-medium tracking-[-0.02em] text-ink">
                  {l.label}
                </Link>
              </motion.div>
            ))}
          </nav>
          <div className="mt-8 flex flex-col gap-3">
            <ArrowLink block size="lg" text="Open a call" to="/open" />
            <ArrowLink block size="lg" variant="outline" text="Browse calls" to="/calls" />
          </div>
        </div>
      )}
    </header>
  )
}

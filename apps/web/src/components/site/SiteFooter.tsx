import { Link } from 'react-router'
import { Mark } from '@/components/ui'
import { REPO_URL } from './links'

const COLUMNS = [
  {
    title: 'Product',
    links: [
      { label: 'Calls', to: '/calls' },
      { label: 'Open a call', to: '/open' },
      { label: 'How it works', to: '/#how-it-works' },
    ],
  },
  {
    title: 'Honesty',
    links: [
      { label: 'Known limits', to: '/#limits' },
      { label: 'Source code', to: REPO_URL, external: true },
    ],
  },
]

export default function SiteFooter() {
  return (
    <footer className="bg-deep text-deep-text">
      <div className="mx-auto max-w-[1200px] px-4 pb-10 pt-16 sm:px-8 lg:pt-24">
        <div className="grid gap-12 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <span className="inline-flex items-center gap-3 [&_rect]:fill-[#8CC3DE]">
              <Mark className="h-9 w-9" />
              <span className="text-[24px] font-semibold tracking-[-0.02em]">trustpool</span>
            </span>
            <p className="mt-5 max-w-[40ch] text-[15px] leading-[1.6] text-deep-text/60">
              The caller enters at their own price, locks the position, and tells you before they leave. Every call stays on the record, losses included.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-10">
            {COLUMNS.map((col) => (
              <div key={col.title}>
                <p className="eyebrow text-deep-text/40">{col.title}</p>
                <ul className="mt-4 space-y-3">
                  {col.links.map((l) => (
                    <li key={l.label}>
                      {'external' in l ? (
                        <a href={l.to} target="_blank" rel="noopener" className="text-[14px] text-deep-text/80 transition-colors hover:text-deep-text">
                          {l.label}
                        </a>
                      ) : (
                        <Link to={l.to} className="text-[14px] text-deep-text/80 transition-colors hover:text-deep-text">
                          {l.label}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-16 flex flex-wrap items-end justify-between gap-6 border-t border-deep-text/10 pt-8">
          <p className="max-w-[60ch] text-[12px] leading-[1.6] text-deep-text/40">
            A record of what callers did with their own money. Nothing here is a recommendation. Built for Monad Metropolis, 2026.
          </p>
          <p className="text-[12px] text-deep-text/40">© 2026 trustpool</p>
        </div>
      </div>
    </footer>
  )
}

import { Link } from 'react-router'
import { Mark } from '@/components/ui'

const REPO = 'https://github.com/youvandra/TrustPool'

export default function MarketingFooter() {
  return (
    <footer className="border-t border-line bg-surface">
      <div className="mx-auto grid max-w-[1240px] gap-10 px-5 py-14 sm:px-8 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
        <div>
          <span className="inline-flex items-center gap-2">
            <Mark className="h-7 w-7" />
            <span className="text-[19px] font-semibold tracking-[-0.03em]">trustpool</span>
          </span>
          <p className="mt-4 max-w-[36ch] text-[14px] leading-[1.6] text-ink-3">A public record of callers who put their own money in first. Nothing here is a recommendation.</p>
        </div>
        {[
          { t: 'Product', l: [['Launch app', '/app'], ['Explore', '/app/explore'], ['Calls', '/app/calls'], ['Callers', '/app/callers'], ['Open a call', '/app/new']] },
          { t: 'Learn', l: [['How it works', '/#how'], ['Docs', '/docs'], ['Known limits', '/docs#limits']] },
          { t: 'Build', l: [['Contracts', '/docs#contracts'], ['API reference', '/api/docs'], ['Source code', REPO]] },
        ].map((col) => (
          <div key={col.t}>
            <p className="eyebrow text-ink-3">{col.t}</p>
            <ul className="mt-4 space-y-2.5">
              {col.l.map(([label, to]) => (
                <li key={label}>
                  {to!.startsWith('http') || to!.startsWith('/api') ? (
                    <a href={to} target="_blank" rel="noopener" className="text-[14px] text-ink-2 hover:text-ink">
                      {label}
                    </a>
                  ) : (
                    <Link to={to!} className="text-[14px] text-ink-2 hover:text-ink">
                      {label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mx-auto flex max-w-[1240px] flex-wrap justify-between gap-4 border-t border-line px-5 py-6 text-[12.5px] text-ink-3 sm:px-8">
        <span>© 2026 trustpool · Built on Monad for Metropolis</span>
        <span>Records, never advice.</span>
      </div>
    </footer>
  )
}

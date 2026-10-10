import { ArrowRight, type LucideIcon } from 'lucide-react'
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react'
import { Link } from 'react-router'

type Variant = 'primary' | 'secondary' | 'ghost' | 'accent' | 'soft' | 'danger'
type Size = 'sm' | 'md' | 'lg'

const variants: Record<Variant, string> = {
  primary: 'bg-ink text-white hover:bg-ink/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]',
  secondary: 'bg-surface text-ink ring-1 ring-inset ring-line-strong hover:bg-subtle',
  ghost: 'text-ink-2 hover:bg-ink/[0.05] hover:text-ink',
  accent: 'bg-accent text-white hover:bg-accent-strong shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]',
  soft: 'bg-accent-fill text-accent-deep ring-1 ring-inset ring-accent/20 hover:bg-accent-fill/70',
  danger: 'bg-surface text-loss ring-1 ring-inset ring-loss/30 hover:bg-loss-fill',
}
const sizes: Record<Size, string> = {
  sm: 'h-8 gap-1.5 px-3 text-[13px] rounded-lg',
  md: 'h-10 gap-2 px-4 text-[14px] rounded-xl',
  lg: 'h-12 gap-2 px-5 text-[15px] rounded-xl',
}

interface Common {
  variant?: Variant
  size?: Size
  icon?: LucideIcon
  iconRight?: LucideIcon
  block?: boolean
  children: ReactNode
}

const cls = (v: Variant, s: Size, block?: boolean, extra = '') =>
  `inline-flex select-none items-center justify-center whitespace-nowrap font-medium transition-[background-color,box-shadow,transform,color] duration-200 ease-calm active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 ${variants[v]} ${sizes[s]} ${block ? 'w-full min-w-0 flex-1' : 'shrink-0'} ${extra}`

function Inner({ icon: I, iconRight: R, children, size = 'md' }: Pick<Common, 'icon' | 'iconRight' | 'children' | 'size'>) {
  const px = size === 'sm' ? 14 : 16
  return (
    <>
      {I && <I size={px} strokeWidth={2} />}
      {children}
      {R && <R size={px} strokeWidth={2} />}
    </>
  )
}

export function Button({ variant = 'primary', size = 'md', icon, iconRight, block, className = '', children, ...rest }: Common & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={cls(variant, size, block, className)} {...rest}>
      <Inner icon={icon} iconRight={iconRight} size={size}>
        {children}
      </Inner>
    </button>
  )
}

/** `to` stays in the app, `href` leaves it. */
export function ButtonLink({
  variant = 'primary',
  size = 'md',
  icon,
  iconRight,
  block,
  className = '',
  children,
  to,
  ...rest
}: Common & AnchorHTMLAttributes<HTMLAnchorElement> & { to?: string }) {
  const inner = (
    <Inner icon={icon} iconRight={iconRight} size={size}>
      {children}
    </Inner>
  )
  return to ? (
    <Link to={to} className={cls(variant, size, block, className)} {...rest}>
      {inner}
    </Link>
  ) : (
    <a className={cls(variant, size, block, className)} {...rest}>
      {inner}
    </a>
  )
}

/** Marketing call to action: label rolls on hover, the knob turns. Ported from Kinsign. */
export function ArrowLink({ to, children, tone = 'dark', className = '' }: { to: string; children: string; tone?: 'dark' | 'light'; className?: string }) {
  const dark = tone === 'dark'
  return (
    <Link
      to={to}
      className={`group inline-flex h-12 items-center gap-3 rounded-full pl-6 pr-1.5 text-[15px] font-medium transition-[background-color,transform] duration-300 ease-calm active:scale-[0.98] ${
        dark ? 'bg-ink text-white hover:bg-ink/90' : 'bg-surface text-ink ring-1 ring-inset ring-line-strong hover:bg-subtle'
      } ${className}`}
    >
      <span className="relative block h-[20px] overflow-hidden">
        <span className="flex flex-col transition-transform duration-500 ease-calm group-hover:-translate-y-1/2 motion-reduce:transition-none">
          <span className="block h-[20px] leading-[20px]">{children}</span>
          <span className="block h-[20px] leading-[20px]" aria-hidden="true">
            {children}
          </span>
        </span>
      </span>
      <span className={`grid h-9 w-9 place-items-center rounded-full ${dark ? 'bg-white text-ink' : 'bg-ink text-white'}`}>
        <ArrowRight size={16} className="transition-transform duration-500 ease-calm group-hover:-rotate-45 motion-reduce:transition-none" />
      </span>
    </Link>
  )
}

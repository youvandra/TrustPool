import { ArrowRight, type LucideIcon } from 'lucide-react'
import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from 'react'
import { Link } from 'react-router'
import RollText from './RollText'

/** Primary actions are ink. The accent stays for identity, per docs/brand.md. */
type Variant = 'dark' | 'outline' | 'light'

const shell: Record<Variant, string> = {
  dark: 'bg-ink text-mist hover:bg-ink/90',
  outline: 'bg-transparent text-ink ring-1 ring-inset ring-line hover:ring-ink',
  light: 'bg-surface text-ink hover:bg-accent-fill',
}
const knob: Record<Variant, string> = {
  dark: 'bg-mist text-ink',
  outline: 'bg-ink text-mist',
  light: 'bg-ink text-mist',
}

interface Common {
  text: string
  variant?: Variant
  icon?: LucideIcon
  size?: 'md' | 'lg'
  block?: boolean
}

function Inner({ text, variant = 'dark', icon: Icon = ArrowRight, size = 'md' }: Common) {
  const k = size === 'lg' ? 'h-8 w-8' : 'h-7 w-7'
  return (
    <>
      <RollText text={text} />
      <span className={`flex ${k} shrink-0 items-center justify-center rounded-full ${knob[variant]}`}>
        <Icon size={16} className="transition-transform duration-500 ease-calm group-hover:-rotate-45 motion-reduce:transition-none" />
      </span>
    </>
  )
}

const base = (v: Variant, size: 'md' | 'lg', block?: boolean) =>
  `group inline-flex items-center justify-between gap-3 rounded-full py-2 pr-2 font-medium transition-[background-color,box-shadow,transform] duration-300 ease-calm active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100 ${
    size === 'lg' ? 'pl-6 text-[14px]' : 'pl-5 text-[13px]'
  } ${block ? 'w-full' : ''} ${shell[v]}`

export function ArrowButton({ text, variant = 'dark', icon, size = 'md', block, className = '', ...rest }: Common & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={`${base(variant, size, block)} ${className}`} {...rest}>
      <Inner text={text} variant={variant} icon={icon} size={size} />
    </button>
  )
}

/** A link styled as an arrow button. `to` navigates inside the app; `href` leaves it. */
export function ArrowLink({
  text,
  variant = 'dark',
  icon,
  size = 'md',
  block,
  className = '',
  to,
  ...rest
}: Common & AnchorHTMLAttributes<HTMLAnchorElement> & { to?: string }) {
  const inner = <Inner text={text} variant={variant} icon={icon} size={size} />
  const cls = `${base(variant, size, block)} ${className}`
  return to ? (
    <Link to={to} className={cls} {...rest}>
      {inner}
    </Link>
  ) : (
    <a className={cls} {...rest}>
      {inner}
    </a>
  )
}

import { Bell, BookOpen, Compass, Home, LayoutGrid, Newspaper, Trophy, type LucideIcon } from 'lucide-react'

export interface NavItem {
  label: string
  to: string
  icon: LucideIcon
  end?: boolean
  auth?: boolean
}

export const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: 'Discover',
    items: [
      { label: 'Home', to: '/app', icon: Home, end: true },
      { label: 'Explore', to: '/app/explore', icon: Newspaper },
      { label: 'Calls', to: '/app/calls', icon: Compass },
      { label: 'Callers', to: '/app/callers', icon: Trophy },
    ],
  },
  {
    group: 'You',
    items: [
      { label: 'Portfolio', to: '/app/portfolio', icon: LayoutGrid, auth: true },
      { label: 'Alerts', to: '/app/alerts', icon: Bell, auth: true },
    ],
  },
  {
    group: 'Learn',
    items: [{ label: 'Docs', to: '/docs', icon: BookOpen }],
  },
]

/** Four slots around the open button. Home is the wordmark and Alerts the bell; Docs stays off as before. */
export const MOBILE_NAV: NavItem[] = NAV.flatMap((g) => g.items).filter((i) => !['/app', '/docs', '/app/alerts'].includes(i.to))

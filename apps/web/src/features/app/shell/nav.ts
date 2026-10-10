import { Bell, BookOpen, Compass, Home, LayoutGrid, Users, type LucideIcon } from 'lucide-react'

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
      { label: 'Calls', to: '/app/calls', icon: Compass },
      { label: 'Callers', to: '/app/callers', icon: Users },
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

export const MOBILE_NAV: NavItem[] = NAV.flatMap((g) => g.items).filter((i) => i.to !== '/docs')

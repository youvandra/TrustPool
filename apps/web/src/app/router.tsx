import type { ComponentType } from 'react'
import { createBrowserRouter, type RouteObject } from 'react-router'
import AppShell from '@/features/app/shell/AppShell'
import RootLayout from './RootLayout'

/** Each page ships as its own chunk. */
const page =
  (load: () => Promise<{ default: ComponentType }>): RouteObject['lazy'] =>
  async () => ({ Component: (await load()).default })

export const routes: RouteObject[] = [
  {
    element: <RootLayout />,
    HydrateFallback: () => <div className="min-h-screen bg-bg" />,
    children: [
      { index: true, lazy: page(() => import('@/features/landing/LandingPage')) },
      { path: 'docs', lazy: page(() => import('@/features/docs/DocsPage')) },
      {
        path: 'app',
        element: <AppShell />,
        children: [
          { index: true, lazy: page(() => import('@/features/app/home/HomePage')) },
          { path: 'explore', lazy: page(() => import('@/features/app/explore/ExplorePage')) },
          { path: 'calls', lazy: page(() => import('@/features/app/calls/CallsPage')) },
          { path: 'calls/:id', lazy: page(() => import('@/features/app/calls/CallPage')) },
          { path: 'callers', lazy: page(() => import('@/features/app/callers/CallersPage')) },
          { path: 'callers/:address', lazy: page(() => import('@/features/app/callers/CallerPage')) },
          { path: 'portfolio', lazy: page(() => import('@/features/app/portfolio/PortfolioPage')) },
          { path: 'alerts', lazy: page(() => import('@/features/app/alerts/AlertsPage')) },
          { path: 'new', lazy: page(() => import('@/features/app/new/NewCallPage')) },
        ],
      },
      { path: '*', lazy: page(() => import('@/features/not-found/NotFoundPage')) },
    ],
  },
]

export const router = createBrowserRouter(routes)

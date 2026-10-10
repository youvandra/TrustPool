import type { ComponentType } from 'react'
import { createBrowserRouter, type RouteObject } from 'react-router'
import RootLayout from './layouts/RootLayout'
import SiteLayout from './layouts/SiteLayout'

/** Turns a page module's default export into a route's lazy component, so each page ships its own code. */
const page =
  (load: () => Promise<{ default: ComponentType }>): RouteObject['lazy'] =>
  async () => ({ Component: (await load()).default })

export const routes: RouteObject[] = [
  {
    element: <RootLayout />,
    HydrateFallback: () => <div className="min-h-screen bg-mist" />,
    children: [
      {
        element: <SiteLayout />,
        children: [
          { index: true, lazy: page(() => import('@/features/landing/LandingPage')) },
          { path: 'calls', lazy: page(() => import('@/features/calls/FeedPage')) },
          { path: 'calls/:id', lazy: page(() => import('@/features/calls/CallPage')) },
          { path: 'callers/:address', lazy: page(() => import('@/features/callers/CallerPage')) },
          { path: 'open', lazy: page(() => import('@/features/open/OpenCallPage')) },
          { path: '*', lazy: page(() => import('@/features/not-found/NotFoundPage')) },
        ],
      },
    ],
  },
]

export const router = createBrowserRouter(routes)

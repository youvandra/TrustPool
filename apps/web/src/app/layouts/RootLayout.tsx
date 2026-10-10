import { useEffect } from 'react'
import { Outlet, ScrollRestoration, useLocation } from 'react-router'

/**
 * Scroll handling for every page: restored on back and forward, at the top
 * on a new page, and at the anchor when the address has a hash.
 */
export default function RootLayout() {
  const { pathname, hash } = useLocation()
  useEffect(() => {
    if (!hash) return
    const id = setTimeout(() => document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView({ block: 'start' }), 0)
    return () => clearTimeout(id)
  }, [pathname, hash])
  return (
    <>
      <ScrollRestoration getKey={(location) => (location.hash ? location.key : location.pathname)} />
      <Outlet />
    </>
  )
}

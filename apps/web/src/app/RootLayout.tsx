import { useEffect } from 'react'
import { Outlet, ScrollRestoration, useLocation } from 'react-router'

/** Scroll restored on back and forward, top on a new page, the anchor when the address has a hash. */
export default function RootLayout() {
  const { pathname, hash } = useLocation()
  useEffect(() => {
    if (!hash) return
    const id = setTimeout(() => document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 0)
    return () => clearTimeout(id)
  }, [pathname, hash])
  return (
    <>
      <ScrollRestoration getKey={(l) => (l.hash ? l.key : l.pathname)} />
      <Outlet />
    </>
  )
}

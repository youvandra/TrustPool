import { useEffect, useState } from 'react'

/** Current time in ms, ticking every `ms`. */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(id)
  }, [ms])
  return now
}

/**
 * False while the page is hidden. Browsers stop animation frames in hidden
 * pages, so anything animated while hidden would stall half-way; callers use
 * this to place elements at their final state instead of animating.
 */
export function usePageVisible(): boolean {
  const [visible, setVisible] = useState(() => document.visibilityState === 'visible')
  useEffect(() => {
    const onChange = () => setVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', onChange)
    return () => document.removeEventListener('visibilitychange', onChange)
  }, [])
  return visible
}

/** True once the page has scrolled past `offset` pixels. */
export function useScrolled(offset = 0): boolean {
  const [scrolled, setScrolled] = useState(() => window.scrollY > offset)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > offset)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [offset])
  return scrolled
}

/** Sets the document title while the page is mounted. */
export function useTitle(title: string): void {
  useEffect(() => {
    document.title = title
  }, [title])
}

/**
 * Loads once per key change. `undefined` while loading, `null` when the loader found nothing.
 * A failed load is thrown during render, so the page's `LoadBoundary` shows it with a retry.
 */
export function useLoad<T>(load: () => Promise<T | undefined>, deps: unknown[]): T | null | undefined {
  const [state, setState] = useState<{ key: string; value: T | null; error?: unknown } | undefined>()
  const key = JSON.stringify(deps)
  useEffect(() => {
    let live = true
    load().then(
      (v) => live && setState({ key, value: v ?? null }),
      (error) => live && setState({ key, value: null, error: error ?? new Error('load failed') }),
    )
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  if (state?.key === key && state.error) throw state.error
  return state?.key === key ? state.value : undefined
}

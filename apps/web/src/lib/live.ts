import { useEffect, useSyncExternalStore } from 'react'
import type { Alert, AlertKind } from '@trustpool/core'
import { toast } from '@/components/ui'
import { headers, source } from './data'

/**
 * Live alerts from the API's /me/stream (server-sent events, read with fetch because
 * EventSource cannot send the access token). Each alert shows a toast and bumps a version
 * that pages depend on, so the unread badge and the Alerts page reload by themselves.
 * Reconnects with backoff. Nothing to do in the demo.
 */
let version = 0
const subs = new Set<() => void>()
const bump = () => {
  version++
  subs.forEach((f) => f())
}

export function useLiveVersion(): number {
  return useSyncExternalStore(
    (f) => {
      subs.add(f)
      return () => subs.delete(f)
    },
    () => version,
  )
}

const SAY: Record<AlertKind, string> = {
  exit_announced: 'A caller you follow announced an exit',
  exit_executable: 'An announced exit can now execute',
  call_opened: 'A caller you follow opened a call',
  call_settled: 'A call you watch settled',
  call_released: 'A call you watch was released at −100%',
  call_stale: 'A call you watch went stale',
}

export function useLiveAlerts(authenticated: boolean) {
  useEffect(() => {
    if (source.kind !== 'api' || !authenticated) return
    const abort = new AbortController()
    let delay = 1_000

    const connect = async () => {
      while (!abort.signal.aborted) {
        try {
          const res = await fetch('/api/me/stream', { headers: await headers(), signal: abort.signal })
          if (!res.ok || !res.body) throw new Error(`stream: ${res.status}`)
          delay = 1_000
          await read(res.body, (event, data) => {
            if (event !== 'alert') return
            const alert = JSON.parse(data) as Alert
            toast(`${SAY[alert.kind] ?? 'New alert'} · #${alert.callId}`)
            bump()
          })
        } catch {
          if (abort.signal.aborted) return
        }
        await new Promise((r) => setTimeout(r, delay))
        delay = Math.min(delay * 2, 30_000)
      }
    }
    void connect()
    return () => abort.abort()
  }, [authenticated])
}

/** Parses an SSE byte stream into (event, data) pairs until it ends. */
async function read(body: ReadableStream<Uint8Array>, on: (event: string, data: string) => void) {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) return
    buffer += decoder.decode(value, { stream: true })
    let cut: number
    while ((cut = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, cut)
      buffer = buffer.slice(cut + 2)
      let event = 'message'
      const data: string[] = []
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim()
        else if (line.startsWith('data:')) data.push(line.slice(5).trimStart())
      }
      on(event, data.join('\n'))
    }
  }
}

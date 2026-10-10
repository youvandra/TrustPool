import { describe, expect, test } from 'bun:test'
import { createApp } from '../src/http/app'
import { openapi } from '../src/http/openapi'
import { demoStore } from '../src/store/demo'

const app = createApp({ store: demoStore(), requestLog: false })
const paths = openapi.paths as Record<string, Record<string, unknown>>

describe('OpenAPI', () => {
  test('documents every route the app serves, and nothing it does not', () => {
    const served = new Set(
      app.routes
        .filter((r) => ['GET', 'POST', 'PUT', 'DELETE'].includes(r.method) && !r.path.includes('*'))
        .map((r) => `${r.method.toLowerCase()} ${r.path.replace(/^\/api/, '').replace(/:(\w+)(\{[^}]*\})?/g, '{$1}')}`),
    )
    const documented = new Set(Object.entries(paths).flatMap(([path, ops]) => Object.keys(ops).map((m) => `${m} ${path}`)))
    expect([...served].filter((r) => !documented.has(r))).toEqual([])
    expect([...documented].filter((r) => !served.has(r))).toEqual([])
  })

  test('every $ref points at a schema that exists', () => {
    const refs = [...JSON.stringify(openapi).matchAll(/"#\/components\/schemas\/(\w+)"/g)].map((m) => m[1]!)
    const schemas = Object.keys(openapi.components.schemas)
    expect(refs.filter((r) => !schemas.includes(r))).toEqual([])
  })

  test('is served, and so are the docs', async () => {
    expect(((await (await app.request('/api/openapi.json')).json()) as { openapi: string }).openapi).toBe('3.1.0')
    const docs = await app.request('/api/docs')
    expect(docs.headers.get('content-type')).toContain('text/html')
    expect(await docs.text()).toContain('/api/openapi.json')
  })
})

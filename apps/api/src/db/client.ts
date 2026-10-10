import { PGlite } from '@electric-sql/pglite'
import { eq, sql } from 'drizzle-orm'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite'
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator'
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js'
import { migrate as migratePostgres } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { log } from '../log'
import * as schema from './schema'

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>
/** A transaction or the database itself: anything that can run queries. */
export type Executor = Db | Parameters<Parameters<Db['transaction']>[0]>[0]

export interface Database {
  db: Db
  /** 'postgres' for a server, 'pglite' for the embedded engine (local dev and tests). */
  kind: 'postgres' | 'pglite'
  /**
   * Takes the indexer lock, a Postgres advisory lock held on one dedicated connection, so
   * only one API instance indexes while any number serve reads. False if another holds it.
   */
  tryIndexerLock(): Promise<boolean>
  close(): Promise<void>
}

const MIGRATIONS = fileURLToPath(new URL('../../drizzle', import.meta.url))
/** Arbitrary but fixed: "trustpool" as a 64-bit key for pg_try_advisory_lock. */
const INDEXER_LOCK = 0x7472757374706f6fn

/**
 * Opens the database and runs pending migrations.
 *
 * - `postgres://...` or `postgresql://...`: a Postgres server (production).
 * - `pglite://<dir>`: embedded Postgres persisted in a directory (local dev).
 * - `pglite://memory` or empty: embedded and in memory (tests, demos).
 */
export async function openDatabase(url = ''): Promise<Database> {
  if (/^postgres(ql)?:\/\//.test(url)) {
    const client = postgres(url, { max: Number(process.env.DB_POOL ?? 10), onnotice: () => {} })
    const db = drizzlePostgres(client, { schema }) as unknown as Db
    await migratePostgres(drizzlePostgres(client), { migrationsFolder: MIGRATIONS })
    let reserved: postgres.ReservedSql | undefined
    log.info('database ready', { kind: 'postgres' })
    return {
      db,
      kind: 'postgres',
      async tryIndexerLock() {
        reserved ??= await client.reserve()
        const [row] = await reserved`SELECT pg_try_advisory_lock(${INDEXER_LOCK.toString()}::bigint) AS locked`
        return row?.locked === true
      },
      async close() {
        reserved?.release()
        await client.end({ timeout: 5 })
      },
    }
  }

  const dir = url.replace(/^pglite:\/\//, '')
  const persist = dir !== '' && dir !== 'memory'
  if (persist) mkdirSync(dir, { recursive: true })
  const client = new PGlite(persist ? dir : undefined)
  const db = drizzlePglite(client, { schema }) as unknown as Db
  await migratePglite(drizzlePglite(client), { migrationsFolder: MIGRATIONS })
  log.info('database ready', { kind: 'pglite', dir: dir || 'memory' })
  return {
    db,
    kind: 'pglite',
    async tryIndexerLock() {
      const { rows } = await client.query<{ locked: boolean }>(`SELECT pg_try_advisory_lock(${INDEXER_LOCK}::bigint) AS locked`)
      return rows[0]?.locked === true
    },
    close: () => client.close(),
  }
}

export const metaKv = {
  async get(db: Executor, key: string): Promise<string | undefined> {
    const [row] = await db.select({ value: schema.meta.value }).from(schema.meta).where(eq(schema.meta.key, key))
    return row?.value
  },
  async set(db: Executor, key: string, value: string | number | bigint) {
    await db
      .insert(schema.meta)
      .values({ key, value: String(value) })
      .onConflictDoUpdate({ target: schema.meta.key, set: { value: sql`excluded.value` } })
  },
}

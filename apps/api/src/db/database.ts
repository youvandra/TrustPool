import { Database } from 'bun:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { log } from '../log'
import { MIGRATIONS } from './migrations'

/** Opens (or creates) the database and brings its schema up to date. `:memory:` for tests. */
export function openDatabase(path: string): Database {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
  const db = new Database(path, { create: true, strict: true })
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA synchronous = NORMAL')
  db.exec('PRAGMA foreign_keys = ON')
  db.exec('PRAGMA busy_timeout = 5000')
  migrate(db)
  return db
}

function migrate(db: Database) {
  const { user_version: from } = db.query<{ user_version: number }, []>('PRAGMA user_version').get()!
  for (let v = from; v < MIGRATIONS.length; v++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[v]!)
      db.exec(`PRAGMA user_version = ${v + 1}`)
    })()
    log.info('migrated', { version: v + 1 })
  }
}

export const meta = {
  get(db: Database, key: string): string | undefined {
    return db.query<{ value: string }, [string]>('SELECT value FROM meta WHERE key = ?').get(key)?.value
  },
  set(db: Database, key: string, value: string | number | bigint) {
    db.query('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value').run(key, String(value))
  },
}

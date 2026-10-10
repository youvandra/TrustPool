/**
 * Schema history. Append only: never edit a migration that has shipped, add the next one.
 * `PRAGMA user_version` records how many have run.
 *
 * Amounts are kept twice: exact wei as TEXT (the source of truth) and MON as REAL for
 * reading. Times are ms. Addresses are checksummed and compared case-insensitively.
 */
export const MIGRATIONS: string[] = [
  `
  CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);

  CREATE TABLE tokens (
    address  TEXT PRIMARY KEY COLLATE NOCASE,
    symbol   TEXT NOT NULL,
    name     TEXT NOT NULL,
    decimals INTEGER NOT NULL,
    hue      INTEGER NOT NULL
  );

  CREATE TABLE callers (
    address           TEXT PRIMARY KEY COLLATE NOCASE,
    bond_wei          TEXT NOT NULL DEFAULT '0',
    bond              REAL NOT NULL DEFAULT 0,
    withdraw_ready_at INTEGER,
    first_seen        INTEGER NOT NULL,
    settled           INTEGER NOT NULL DEFAULT 0,
    losses            INTEGER NOT NULL DEFAULT 0,
    released          INTEGER NOT NULL DEFAULT 0,
    open              INTEGER NOT NULL DEFAULT 0,
    slashes           INTEGER NOT NULL DEFAULT 0,
    stale             INTEGER NOT NULL DEFAULT 0,
    sum_return_bps    INTEGER NOT NULL DEFAULT 0,
    last_active       INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE calls (
    id           INTEGER PRIMARY KEY,
    caller       TEXT NOT NULL COLLATE NOCASE,
    token        TEXT NOT NULL COLLATE NOCASE,
    adapter      TEXT NOT NULL,
    mon_in_wei   TEXT NOT NULL,
    tokens_wei   TEXT NOT NULL,
    mon_out_wei  TEXT,
    mon_in       REAL NOT NULL,
    tokens       REAL NOT NULL,
    mon_out      REAL,
    opened_at    INTEGER NOT NULL,
    unlock_at    INTEGER NOT NULL,
    notice       INTEGER NOT NULL,
    announced_at INTEGER,
    exit_at      INTEGER,
    closed_at    INTEGER,
    state        TEXT NOT NULL CHECK (state IN ('Locked', 'Exiting', 'Settled', 'Released')),
    stale        INTEGER NOT NULL DEFAULT 0,
    return_bps   INTEGER,
    thesis       TEXT NOT NULL,
    marked_value REAL,
    marked_at    INTEGER,
    open_tx      TEXT NOT NULL
  );
  CREATE INDEX calls_caller ON calls (caller);
  CREATE INDEX calls_state ON calls (state);

  CREATE TABLE slashes (
    id     INTEGER PRIMARY KEY AUTOINCREMENT,
    caller TEXT NOT NULL COLLATE NOCASE,
    amount REAL NOT NULL,
    reason TEXT NOT NULL,
    at     INTEGER NOT NULL,
    tx     TEXT NOT NULL
  );
  CREATE INDEX slashes_caller ON slashes (caller);

  CREATE TABLE prices (
    call_id INTEGER NOT NULL REFERENCES calls (id),
    at      INTEGER NOT NULL,
    price   REAL NOT NULL,
    PRIMARY KEY (call_id, at)
  ) WITHOUT ROWID;

  CREATE TABLE follows (
    user_id TEXT NOT NULL,
    caller  TEXT NOT NULL COLLATE NOCASE,
    at      INTEGER NOT NULL,
    PRIMARY KEY (user_id, caller)
  );
  CREATE INDEX follows_caller ON follows (caller);

  CREATE TABLE watches (
    user_id TEXT NOT NULL,
    call_id INTEGER NOT NULL,
    at      INTEGER NOT NULL,
    PRIMARY KEY (user_id, call_id)
  );
  CREATE INDEX watches_call ON watches (call_id);

  CREATE TABLE alerts (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    kind    TEXT NOT NULL,
    call_id INTEGER NOT NULL,
    at      INTEGER NOT NULL,
    read    INTEGER NOT NULL DEFAULT 0,
    UNIQUE (user_id, kind, call_id)
  );
  CREATE INDEX alerts_user ON alerts (user_id, at DESC);
  `,
]

# Persistence (`src/db/`)

SQLite via `better-sqlite3` + drizzle. `getDb()` / `getSqlite()` in `src/db/client.ts` are process singletons; repositories are the only callers (`mem:conventions`).

## Boot sequence (all in `getDb()`)

1. `resolveUserDataDir()` — `MC_USER_DATA_DIR` override, else `~/Library/Application Support/MissionControl` (Darwin) / `AppData/Roaming` / `~/.config`. Dir created `0700`.
2. Pragmas: `journal_mode = WAL`; `synchronous = NORMAL` **only if WAL actually took** (rollback-journal + NORMAL would leave a power-loss corruption window); `busy_timeout = 5000`; `foreign_keys = ON`.
3. `restrictDbFilePermissions()` chmods `missioncontrol.db` + `-wal` + `-shm` to `0600` — the file stores the API bearer and sandbox pairing tokens in cleartext.
4. Schema: fresh DB (no `projects` table) → `ensureSchema()` then migrations marked applied-only. Existing DB → migrations, then `ensureSchema()`.
5. `migrateMultiSandbox()` one-time parity pass, `reconcileStaleSessionsOnBoot()` (`running`/`needs-input` → `disconnected`, because PTYs die with the process; `ready` is left alone), and `DELETE FROM user_terminals WHERE start_command IS NOT NULL` (launch-spawned terminals are session-only).

## Two schema mechanisms — keep both in sync

- `src/db/schema.ts` — drizzle table defs, source of the TS row types (`Project`, `Task`, `Group`, `UserTerminal`, …) imported all over the app.
- `ensureSchema(sqlite)` in `client.ts` — hand-written idempotent `CREATE TABLE IF NOT EXISTS` / column backfills; this is the runtime authority.
- `src/db/migrations/NNNN_*.sql` — numbered files loaded with `import.meta.glob(..., ?raw)` and tracked in `schema_migrations`.

Adding/altering a column means **all three**: schema.ts + ensureSchema + a new numbered migration. `drizzle-kit` (`pnpm db:generate|db:push`) is a dev diffing aid only — the app never runs drizzle migrations.

FTS: `project_memory` has an FTS5 index; `PRAGMA integrity_check` doesn't cover FTS shadow tables, hence the dedicated repair path (`__tests__/memory-fts-repair.test.ts`).

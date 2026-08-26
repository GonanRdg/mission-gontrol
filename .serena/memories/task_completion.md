# Definition of done

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Add when relevant:
- `pnpm scan:secrets` — touched anything that could embed a key/token.
- `pnpm audit --audit-level high` — touched dependencies; fixes go in `pnpm-workspace.yaml` `overrides`.
- `pnpm build` — touched vite/electron build config, route generation, or bundled skills copying.

CI (`.github/workflows/ci.yml`) runs typecheck / unit-tests / lint / dependency-audit / secret-scan on every PR, plus an unsigned Linux AppImage package job. Merges to `main` auto-release — see `mem:release`.

Extra obligations by area:
- DB shape changed → `src/db/schema.ts` **and** `ensureSchema()` **and** a new numbered `src/db/migrations/NNNN_*.sql` (`mem:db/core`).
- New `/api` route → router entry + controller + service + repo + `src/lib/api.ts` method + query key/options if the UI reads it (`mem:server/core`, `mem:frontend/core`).
- New server event type → add to the `AppEvent` union in `src/server/events.ts` and handle it in the renderer's SSE listener.
- New IPC channel → `electron/ipc-channels.ts` + `src/shared/electron-contract.ts` + preload + `ipcSafeHandle` in main.
- Commits/PRs: no AI attribution, no process narration (global user rule).

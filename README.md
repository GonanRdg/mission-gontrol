# Mission Gontrol

Desktop control surface for managing agentic coding work (Claude Code / Codex / Cursor CLI) across many projects. Built as an Electron app that wraps a TanStack Start server, with SQLite + Drizzle for local persistence and real PTYs (via `node-pty` + `xterm.js`) so you can run real interactive CLI agents inside the app.

## Why this exists

Cursor and Codex bury your projects in a collapsable left rail. Mission Gontrol flips it: every project gets a card on a single home view, with at-a-glance counts of how many agents are running, awaiting input, or done. Click into a project, see its tasks split by status, toggle three of them on at once and three real terminals split horizontally on the right. External CLI tools can POST status back to the app over a localhost API.

## Features

- Mission Gontrol grid with pinned / grouped / ungrouped sections, density toggle, and search
- Project add/edit/remove (remove only unlinks — never touches files)
- Project grouping with colored dots
- Project detail view: tasks split into Needs-input / Running / Done columns
- Multi-select tasks → split-pane terminals (cap of 4)
- New-agent launcher for Claude Code / Codex / Cursor CLI / plain shell
- External REST API + Server-Sent Events for live UI updates
- Bearer-token auth for the writable endpoints
- Bound to `127.0.0.1` only — never exposed to LAN
- Dark + light themes matching the prototype's design tokens

## Stack

- Electron 41+ shell
- TanStack Start (file-based React routes + server file routes for `/api/*`)
- Vite 7 + Tailwind v4 + Geist / Geist Mono
- SQLite (`better-sqlite3`) + Drizzle ORM
- `node-pty` + `@xterm/xterm` + `@xterm/addon-fit`
- Server-Sent Events for live updates (no socket.io / Redis)

## Repo layout

```
mission-gontrol/
├── electron/               Electron main + preload + PTY manager
│   ├── main.ts
│   ├── preload.ts
│   └── pty-manager.ts
├── src/
│   ├── client.tsx          TanStack Start client entry
│   ├── ssr.tsx             TanStack Start server entry
│   ├── router.tsx
│   ├── styles.css          Design tokens + keyframes
│   ├── routes/
│   │   ├── __root.tsx
│   │   ├── index.tsx       Mission Gontrol
│   │   ├── projects.$id.tsx
│   │   ├── archive.tsx
│   │   ├── settings.tsx
│   │   └── api/            Server file routes (REST + SSE)
│   ├── components/
│   │   ├── ui/             Icon, Btn, Modal, TextField, etc.
│   │   └── views/          ProjectCard, TaskCard, TerminalPane, dialogs
│   ├── server/
│   │   ├── auth.ts         Bearer token middleware + json helpers
│   │   ├── events.ts       In-process event bus for SSE
│   │   └── services/       projects, groups, tasks
│   ├── db/
│   │   ├── schema.ts       Drizzle schemas
│   │   ├── client.ts       better-sqlite3 + ensureSchema
│   │   └── settings.ts     api_token + key/value helpers
│   └── lib/
│       ├── api.ts          Typed fetch client
│       ├── electron.ts     window.electronAPI typed bridge
│       └── design-meta.ts  Agent + status metadata
├── designs/                Original HTML+JSX prototype (source of truth)
├── SPEC.md                 Approved product spec
└── README.md
```

## Download

This is a fork. Builds here are **unsigned and not notarized**, and **automatic updates are off** — this fork does not run an update server, and it deliberately does not use the upstream project's. Update by downloading a newer release and replacing the app.

- **GitHub Releases:** [GonanRdg/mission-gontrol/releases](https://github.com/GonanRdg/mission-gontrol/releases) — unsigned macOS builds, installed manually
- **Build it yourself:** `pnpm install:local` builds and swaps the app in place, signing on your own machine (no Gatekeeper prompt at all)

After download on macOS: open the `.dmg` and drag the app to Applications. Because the build is unsigned, Gatekeeper will refuse it with *"Mission Gontrol is damaged and can't be opened"* — clear the quarantine flag once:

```bash
xattr -dr com.apple.quarantine "/Applications/Mission Gontrol.app"
```

Upstream's signed installers and in-app updates live at [AgentSystemLabs/mission-control](https://github.com/AgentSystemLabs/mission-control).

## Getting started

```bash
pnpm install            # installs deps; postinstall rebuilds Electron PTY bindings
pnpm dev:electron       # runs Vite dev server + Electron
```

Projects and settings use `~/Library/Application Support/MissionControl/missioncontrol.db` (macOS) or the equivalent on Linux/Windows, preserving existing installations.

## Logs

Main-process logs are written via `electron-log`. In a packaged build they persist to:

- **macOS:** `~/Library/Logs/Mission Gontrol/main.log`
- **Windows:** `%USERPROFILE%\AppData\Roaming\MissionControl\logs\main.log`
- **Linux:** `~/.config/MissionControl/logs/main.log`

## Credits

Mission Gontrol is an independent fork of Mission Control, created by **AgentSystem Labs**
([AgentSystemLabs/mission-control](https://github.com/AgentSystemLabs/mission-control)).

This repository is an independent fork, evolved and maintained by
**[GonanRdg](https://github.com/GonanRdg)**

## License

[MIT](LICENSE) — copyright AgentSystem Labs, with fork modifications copyright
GonanRdg. The original notice is preserved as the license requires.


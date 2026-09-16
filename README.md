# Lavish Library

A private, local-first browser library for finding and reopening Lavish review surfaces on a Mac.

## What it does

- Reads Lavish's central session history from `~/.lavish-axi/state.json`
- Automatically groups known artifacts by project
- Finds additional HTML artifacts in project `.lavish` folders
- Indexes Desktop drops in `~/Desktop/from-mini/firstmate` so they open in a phone browser over Tailscale
- Shows session state, server availability, last-used time, edit time, and file size
- Searches, filters, sorts, and switches between grid and list views
- Opens or reopens an artifact with `lavish-axi`
- Reveals an artifact in Finder
- Adds project folders with a native macOS folder picker or a pasted path
- Creates content-addressed snapshots whenever a watched Lavish changes
- Copies each HTML file and its linked local assets into a chosen archive folder
- Shows an artifact timeline with size/line deltas, archived previews, and safe restore
- Records local searches, opens, reveals, restores, feedback, and outcomes from v0.2 onward
- Classifies recurring topics and artifact shapes without uploading content
- Combines Lavish sessions, protected versions, local interactions, and project Git activity into a plan-evolution timeline
- Provides a Signal Observatory, periodic Lavish Review, dormant gems, template candidates, and an explainable recommendation queue
- Lets you tune on-demand, weekly, monthly, and contextual reflection prompts

All project paths and preferences stay on the Mac in `~/.lavish-tracker/config.json`. Insights and feedback stay in `~/.lavish-tracker/analytics.json`. Nothing is uploaded by the app, and foreground-time tracking is deliberately excluded.

## Insights

The sidebar exposes two complementary destinations directly:

- **Signal Observatory** shows the evidence: activity, repeat-use signals, topic shelves, searches, recurring Lavish shapes, and the evolving timeline of versions, sessions, restores, feedback, and Git commits.
- **Lavish Review** turns that evidence into a calm narrative, an actionable recommendation queue, dormant work worth revisiting, possible templates, and quick value/outcome labels.

The app distinguishes recorded evidence from unknown history. It can backfill file dates, known Lavish sessions, protected versions, and local Git commits; searches and library interactions begin recording with v0.2.

## Versions

- `v0.1.0` — local Lavish library and protected version archive
- `v0.2.0` — Signal Observatory, Lavish Review, feedback, recommendations, and plan evolution

Releases follow semantic versioning. Conventional `fix:`, `feat:`, and breaking-change commits are collected by Release Please into a version-and-changelog pull request; merging that pull request creates the matching GitHub Release and `vX.Y.Z` tag. The project is not published to npm.

See [CHANGELOG.md](CHANGELOG.md) for the release history.

## Version archive

Choose **Set up archive** in the app and select any local or synced folder. The app creates a readable `Lavish Library Archive` beneath it, grouped by project and artifact. Each version has its own HTML file, local assets, checksum, timestamps, and manifest entry.

The first scan creates a baseline. While the app is running, watched files are backed up shortly after each saved change; a 30-second reconciliation scan catches new artifacts and anything a watcher missed. Restoring an older version always archives the current file first. Pausing backups never deletes existing copies.

## Run it

Requires Node.js 22.13 or newer and the [`lavish-axi` CLI](https://github.com/kunchenguid/lavish-axi#session-hook). Install Lavish globally, then install this project's dependencies:

```bash
npm install -g lavish-axi
npm install
npm run dev
```

The app expects Lavish at `/opt/homebrew/bin/lavish-axi` by default. If `command -v lavish-axi` reports another location, pass it when starting the app:

```bash
LAVISH_AXI_BIN="$(command -v lavish-axi)" npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). The library refreshes when the page loads and whenever you press the refresh button.

Both the UI and the companion API bind `127.0.0.1` only. If something else already owns port 3000 (on this Mac, Tailscale Serve), pick a free loopback port and point Serve at it:

```bash
LAVISH_TRACKER_UI_PORT=3007 npm run dev
```

Tailscale Serve, not Funnel, publishes the library on the tailnet. The browser uses `http://127.0.0.1:4318` on loopback and `https://<tailnet-host>:4318` when the UI is opened through Serve. Allow that UI origin on the companion API:

```bash
LAVISH_TRACKER_UI_PORT=3007 \
LAVISH_TRACKER_PUBLIC_HOST=mac-studio.tail1c136e.ts.net \
LAVISH_TRACKER_PUBLIC_ORIGIN=https://mac-studio.tail1c136e.ts.net:3000 \
npm start
```

```bash
tailscale serve --bg 3000 http://127.0.0.1:3007
tailscale serve --bg 4318 http://127.0.0.1:4318
```

Files dropped in `~/Desktop/from-mini/firstmate` show up as the **from-mini** project. Open on the tailnet serves the file at `/api/artifacts/file?id=…` instead of a Mac path. Override the folder with `LAVISH_TRACKER_DROP_DIR`, or set it empty to disable.

## Production-style local run

```bash
npm run build
npm start
```

The web UI listens on `127.0.0.1` and its filesystem companion service listens on `127.0.0.1:4318`. The companion service accepts browser requests only from `localhost` or `127.0.0.1` on the configured UI port (plus `LAVISH_TRACKER_PUBLIC_ORIGIN` when set), issues a fresh in-memory authorization token each time it starts, and limits artifact operations to files discovered by the same bounded scan used to build the library. Known drop files can be opened with a top-level GET to `/api/artifacts/file` so a phone can view them.

## License

[MIT](LICENSE) © 2026 Jarad Smith

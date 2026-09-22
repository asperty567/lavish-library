# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

- Add durable project-specific notes here as they are discovered through real work.

## Local hosting

Match RetailScribe on `:3003`: listen on `127.0.0.1:3000` and Tailscale Serve `:3000` to that same loopback port. Do not bind `0.0.0.0`. `vinext start` ignores `vite.config.ts` and must stay on an internal port (`LAVISH_TRACKER_SITE_PORT`); `scripts/ui-proxy.mjs` owns `:3000`. If a loaded LaunchAgent still has `LAVISH_TRACKER_UI_PORT=3007`, `scripts/ui-proxy-ports.mjs` also binds `:3000` whenever `LAVISH_TRACKER_PUBLIC_ORIGIN` is the catalog.

Studio Serve mapping and LaunchAgent env live in `scripts/macos/com.scribe.lavish-library.plist`. Hostname `/` on 443 proxies to `127.0.0.1:3000` so a desktop click without `:3000` is not Funnel 404. Opening a Lavish session from the tailnet UI must be `https://mac-studio.tail1c136e.ts.net:4389/session/<id>` (Serve `:4389` → local `:4387`). Never return port 4387 or plain `http://mac-studio` links. `POST /api/artifacts/open` resolves `id` or a 12-hex `file` value to the real artifact in `artifactFromOpenInput`; session URL rewrite lives in `reviewUrlForClient` in `scripts/local-api.mjs`. Reload LaunchAgent `com.scribe.lavish-library` after changing that file so live Open on `:3000`/`:4318` serves the fix.

Desktop drops default to `~/Desktop/from-mini/firstmate` (`LAVISH_TRACKER_DROP_DIR`). Markdown and plain text are not Lavish artifacts. Medik8 product photos under `beautyline-SC-135269/packshots`, and titles that are only a `P` plus 4–6 digit code with an optional photo label, stay out of the catalog via `excludedFromCatalog` in `scripts/local-api.mjs`. Do not delete those jpg files. `https://mac-studio.tail1c136e.ts.net:3000/` is the library catalog (All lavishes). Drop Open stays on `/api/artifacts/file?id=…` for HTML and media only. `scripts/run-local.mjs` proxies `/api` on the UI port.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.

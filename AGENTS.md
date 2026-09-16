# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

- Add durable project-specific notes here as they are discovered through real work.

## Local hosting

Match RetailScribe on `:3003`: listen on `127.0.0.1:3000` and Tailscale Serve `:3000` to that same loopback port. Do not bind `0.0.0.0`. `vinext start` ignores `vite.config.ts` and must stay on an internal port (`LAVISH_TRACKER_SITE_PORT`); `scripts/ui-proxy.mjs` owns `:3000`.

Studio Serve mapping and LaunchAgent env live in `scripts/macos/com.scribe.lavish-library.plist`. Hostname `/` on 443 proxies to `127.0.0.1:3000` so a desktop click without `:3000` is not Funnel 404. Opening a Lavish session from the tailnet UI follows the lavish-axi MagicDNS URL on port 4387, rewriting `127.0.0.1` in `scripts/local-api.mjs`.

Desktop drops default to `~/Desktop/from-mini/firstmate` (`LAVISH_TRACKER_DROP_DIR`). A document GET of `/` on the UI origin serves `relay-onboard-home-notify-welcome.portable.html` (`LAVISH_TRACKER_LANDING_FILE`). Open for other drops stays on `/api/artifacts/file?id=…`. `scripts/run-local.mjs` proxies `/api` on the UI port.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.

# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

- Add durable project-specific notes here as they are discovered through real work.

## Local hosting

Do not bind the UI to `0.0.0.0:3000`. Tailscale Serve already owns TCP 3000 and proxies to loopback. `scripts/run-local.mjs` must pass `-H 127.0.0.1` and `-p` because `vinext start` ignores `vite.config.ts` and defaults to all interfaces on 3000.

Studio Serve mapping and LaunchAgent env live in `scripts/macos/com.scribe.lavish-library.plist`. `:3000` is tailnet Serve to `127.0.0.1:3007`. Hostname `/` on 443 must also proxy to `127.0.0.1:3007` so a desktop click of `https://mac-studio.tail1c136e.ts.net/` is the storyboard instead of Funnel `404 page not found`. Opening a Lavish session from the tailnet UI follows the lavish-axi MagicDNS URL on port 4387, rewriting `127.0.0.1` in `scripts/local-api.mjs`.

Desktop drops default to `~/Desktop/from-mini/firstmate` (`LAVISH_TRACKER_DROP_DIR`). A document GET of `/` on the UI origin serves `relay-onboard-home-notify-welcome.portable.html` (`LAVISH_TRACKER_LANDING_FILE`). Open for other drops stays on `/api/artifacts/file?id=…`. `scripts/run-local.mjs` proxies `/api` on the UI port.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.

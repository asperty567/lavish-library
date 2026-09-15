# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

- Add durable project-specific notes here as they are discovered through real work.

## Local hosting

Do not bind the UI to `0.0.0.0:3000`. Tailscale Serve already owns TCP 3000 and proxies to loopback. `scripts/run-local.mjs` must pass `-H 127.0.0.1` and `-p` because `vinext start` ignores `vite.config.ts` and defaults to all interfaces on 3000.

Studio Serve mapping and LaunchAgent env live in `scripts/macos/com.scribe.lavish-library.plist`. Not Funnel. Opening an artifact from the tailnet UI follows the lavish-axi MagicDNS URL on port 4387, rewriting `127.0.0.1` in `scripts/local-api.mjs`.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.

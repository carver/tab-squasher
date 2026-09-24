# 008 Sign on AMO and install on both devices

See ADR 0002.

## What to build

- A `/wizard` for the human steps: create or log into the Mozilla account, generate AMO API credentials, and store them in the host's secret store. The keys never live in the repo or the sandbox.
- `npm run sign`: bump the version, build, lint, then `web-ext sign --channel unlisted`. The signed `.xpi` lands in `extension/artifacts/` (gitignored).
- Install steps for desktop and Android in `extension/README.md`. On Android, confirm how an unlisted signed `.xpi` gets installed on release Firefox 155 (file install from settings, or opening the `.xpi` URL). Check that on your phone before writing it down.
- Updates: decide between a manual reinstall per version and an `update_url` served by the tab-squasher server. Manual is fine to start.

## Acceptance

- The signed build stays installed across a restart on desktop and on the phone, and sends a Spark from both.

# tab-squasher

Close browser tabs without losing why you kept them open. A Firefox extension (desktop and Android) saves what a page inspired as a **Spark**: your Note, an optional Quote, and the page it came from. A small server on your laptop keeps every Spark in an **Inbox**, and other tools pull them from there. The first one is `../anki-cards`, which turns Sparks into flashcards.

Vocabulary is in [CONTEXT.md](CONTEXT.md). Decisions are in [docs/adr](docs/adr). Work is tracked in [GitHub issues](https://github.com/carver/tab-squasher/issues), and [uncertainties.md](uncertainties.md) lists the judgment calls made along the way.

## Layout

| Path | What |
|------|------|
| [spec/](spec/README.md) | The Spark format: JSON Schema, rules, and fixtures every part tests against |
| [server/](server/README.md) | Rust server that receives Sparks into the Inbox; runs on the host, reached over Tailscale |
| [extension/](extension/README.md) | Firefox MV3 extension in TypeScript: popup, Outbox, right-click item, Android chip |
| `data/inbox/` | The Inbox, one JSON Lines file per year. Gitignored |

## Setup

In the sandbox, `./install_sandbox.sh` enables the git hooks, installs npm packages, and downloads the Firefox and geckodriver the e2e tests use. sandbox-setup runs it after every recreate.

On the host:

1. `server/tailscale-wizard.sh` for Tailscale HTTPS and the first server install. After that, `server/install-host.sh` upgrades.
2. `extension/scripts/amo-wizard.sh` to sign the extension and install it on desktop and Android. After that, `npm run sign` in `extension/`.

## Development

The pre-commit hook (`.githooks/pre-commit`) lints and runs the fast tests for whichever parts a commit touches.

```bash
(cd server && cargo test)
(cd extension && npm test && npm run test:e2e && npm run lint)
python3 spec/make_fixtures.py   # after changing a case in it
```

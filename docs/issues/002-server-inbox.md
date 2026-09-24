# 002 Server receives Sparks into the Inbox

Rust service in `server/`. See ADR 0001 for why it runs on the host and never writes into other projects.

## What to build

- `POST /sparks` takes one Spark (001), validates it, adds `received_at`, and appends it as one line to `data/inbox/<YYYY>.jsonl`. `received_at` is when the Spark enters the Inbox, and `YYYY` is its UTC year. Today that's the moment of receipt. Once 010 adds a Hold, it's the moment the Hold ends. The server creates the directory and file if needed. It never renames, moves or rewrites a file.
- 201 means "accepted, the server owns it now", not "written to the Inbox". The body is `{"id": ..., "status": "inbox"}`. 010 will add `{"status": "held", "editable_until": ...}`, so clients must not assume `inbox`.
- Idempotency by `id`. The same `id` with identical content returns 200 with the same body shape and writes nothing. The same `id` with different content returns 409. A new Spark returns 201. POST never edits. `PUT` and `DELETE /sparks/{id}` are reserved for 010. The server loads the set of ids from whatever Inbox files exist at startup, and a missing past year isn't an error. Keep the "known ids" check behind one function, since 010 adds held Sparks as a second source.
- Errors: 400 with a short JSON reason for invalid Sparks, and 413 over 64 KB. The body limit is enforced before parsing.
- `GET /health` returns 200 and the server version. The popup uses it to show whether it can reach the server.
- Binds to `127.0.0.1` only (port configurable, default 3816). Tailscale serve provides the outside access (003).
- Appending a line is a single `write` of the full line plus `\n`, followed by `fsync`. Readers treat a last line with no trailing newline as still being written and skip it.
- Add `data/` to `.gitignore`.
- CORS: allow the `moz-extension://` origin for these two routes only. The extension should call from its background script with host permission, but a popup-page fetch shouldn't break.

## Constraints

It runs all the time, so memory and CPU stay small. It should use no CPU when idle and a few MB of memory. A single-threaded async runtime (for example axum on tokio `current_thread`) or a small synchronous server both fit. Pick one and say why in the PR.

## Tests

- Validation runs against every fixture from 001.
- Integration tests call the HTTP routes against a temp Inbox dir: 201, then 200 on repeat, 409 on a changed repeat, 400, 413. A restart keeps idempotency. Crossing a year boundary writes to the new file, using an injected clock.
- A property test: any sequence of valid Sparks, some of them repeated, produces an Inbox with exactly one line per unique `id`, and every line parses.

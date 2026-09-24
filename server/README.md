# tab-squasher server

Receives Sparks from the extension and appends them to the Inbox, one JSON Lines file per UTC year. It runs on the host, not in the sandbox, and listens on loopback only. `tailscale serve` exposes it to the tailnet. See [ADR 0001](../docs/adr/0001-host-server-sandbox-llm-destinations-pull.md) and [spec/](../spec/README.md).

## Routes

- `POST /sparks` takes one Spark. Responses:
  - 201 `{"id", "status": "inbox"}` when the server accepts a new Spark. 201 means the server owns it now, not necessarily that it's in the Inbox, so clients must read `status`.
  - 200, same body, when the Spark is already there with identical content. Retries are safe.
  - 409 `{"error"}` when another Spark has this id with different content.
  - 400 `{"error"}` for an invalid Spark, with the reason in words.
  - 413 when the body is over 64 KB.
- `GET /health` returns `{"status": "ok", "version"}`.

## Run

```bash
cargo build --release
TAB_SQUASHER_INBOX_DIR=../data/inbox target/release/tab-squasher-server
```

`TAB_SQUASHER_PORT` overrides the default port, 3816.

## Develop

```bash
cargo test
cargo clippy --all-targets -- -D warnings
```

The tests drive the HTTP app with a temporary Inbox and a settable clock. `tests/fixtures.rs` checks the validator against every file in `spec/fixtures/`.

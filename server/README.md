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

## Install on the host

First time: `./tailscale-wizard.sh`. It turns on MagicDNS and HTTPS certificates for the tailnet, lets your user manage `tailscale serve`, runs the installer, and has you check the address from your phone. It assumes Tailscale is already set up on the laptop and phone (`rental-finder/scripts/tailscale-wizard.sh` covers that).

After that, `./install-host.sh` does everything, and running it again upgrades in place. It:

- builds with `cargo build --release` into `~/.cache/tab-squasher/host-target`, apart from the sandbox's builds in `target/`, and copies the binary to `~/.local/lib/tab-squasher/`
- installs and restarts the systemd user unit `tab-squasher.service`, with the Inbox at `<repo>/data/inbox`
- runs `loginctl enable-linger`, so the service runs without anyone logged in
- runs `tailscale serve --bg --https=8443 http://127.0.0.1:3816`
- checks `/health` on loopback and on the tailnet, and prints the address for the extension's settings

It refuses to run inside the sandbox. `./install-host.sh --uninstall` removes the service and the serve config, and leaves the Inbox alone.

Logs: `journalctl --user -u tab-squasher`.

## "Can't reach the server"

Check in this order, and stop at the first one that fails:

1. The service: `systemctl --user status tab-squasher`
2. Loopback: `curl http://127.0.0.1:3816/health` on the laptop
3. Serve: `tailscale serve status` should list `https://<name>:8443` proxying to `127.0.0.1:3816`
4. The client: is the phone's Tailscale app connected? Try `https://<name>:8443/health` in its browser.

If 1 to 3 pass, the problem is on the client's side.

## Run by hand

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

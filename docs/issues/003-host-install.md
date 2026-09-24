# 003 Run the server on the host behind tailscale serve

The server must keep running when the sandbox is closed (ADR 0001).

## What to build

- `server/install-host.sh`, run on the host. It refuses to run inside the sandbox. It runs `cargo build --release` and installs a systemd user unit, `tab-squasher.service`, with `Restart=on-failure` and the Inbox path set to `<repo>/data/inbox`. It enables and starts the unit, and runs `loginctl enable-linger` so the service starts without a login session. It prints status at the end. Running it again upgrades in place.
- The same script configures `tailscale serve --bg --https=8443 http://127.0.0.1:3816`, then prints the resulting `https://<machine>.<tailnet>.ts.net:8443` URL to paste into the extension options. It uses a dedicated port so it doesn't clash with anything already served on 443.
- A `/wizard` script for the one-time Tailscale steps only a human can do: enable MagicDNS and HTTPS certificates for the tailnet, and put the phone on the tailnet. It ends by curling `/health` from the host through the ts.net URL.
- `server/README.md` covers install, upgrade, logs (`journalctl --user -u tab-squasher`), uninstall, and a triage order for "can't reach server": the unit, then loopback curl, then the tailscale serve status, then the client network.

## Acceptance

- After a host reboot, with no login, `curl https://<machine>.<tailnet>.ts.net:8443/health` from the phone's network returns 200.
- Closing the sandbox doesn't affect the service.

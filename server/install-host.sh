#!/usr/bin/env bash
# Installs the tab-squasher server on the host as a systemd user service and
# exposes it to the tailnet with tailscale serve (issue #3, ADR 0001).
# Run on the host, not in the sandbox. Re-run to upgrade in place.
#
#   ./install-host.sh              build, install or upgrade, start, check
#   ./install-host.sh --uninstall  stop and remove the service and the serve config
#
# One-time Tailscale setup (MagicDNS, HTTPS certificates, the phone on the
# tailnet) is in ./tailscale-wizard.sh.
set -euo pipefail

REPO=$(cd "$(dirname "$0")/.." && pwd)
PORT=3816
HTTPS_PORT=8443
UNIT=tab-squasher.service
UNIT_FILE="$HOME/.config/systemd/user/$UNIT"
INSTALL_DIR="$HOME/.local/lib/tab-squasher"
BINARY="$INSTALL_DIR/tab-squasher-server"
INBOX_DIR="$REPO/data/inbox"
# The sandbox builds into server/target on the shared mount, against its own
# glibc. The host keeps its builds apart so neither overwrites the other's.
export CARGO_TARGET_DIR="$HOME/.cache/tab-squasher/host-target"

say() { echo "tab-squasher: $*"; }
fail() { echo "tab-squasher: $*" >&2; exit 1; }

refuse_sandbox() {
  if [ -n "${SANDBOX_VM_ID:-}" ] || [ -e /run/sandbox ]; then
    fail "this looks like the sandbox. The server runs on the host, so it keeps working while the sandbox is closed."
  fi
}

require() {
  command -v "$1" >/dev/null || fail "$1 is not installed. $2"
}

write_unit() {
  mkdir -p "$(dirname "$UNIT_FILE")"
  cat > "$UNIT_FILE" <<UNIT
[Unit]
Description=tab-squasher Inbox server
Documentation=file://$REPO/server/README.md

[Service]
ExecStart=$BINARY
Environment=TAB_SQUASHER_INBOX_DIR=$INBOX_DIR
Environment=TAB_SQUASHER_PORT=$PORT
Restart=on-failure
RestartSec=5
NoNewPrivileges=yes

[Install]
WantedBy=default.target
UNIT
}

install_service() {
  say "building (cargo build --release)"
  cargo build --release --quiet --manifest-path "$REPO/server/Cargo.toml"
  mkdir -p "$INSTALL_DIR" "$INBOX_DIR"
  # Copy to a temp name, then rename, so a running service never sees a half-written binary.
  install -m 755 "$CARGO_TARGET_DIR/release/tab-squasher-server" "$BINARY.new"
  mv "$BINARY.new" "$BINARY"
  write_unit
  systemctl --user daemon-reload
  systemctl --user enable --quiet "$UNIT"
  systemctl --user restart "$UNIT"
  say "service installed and (re)started: $UNIT"
}

enable_linger() {
  if [ "$(loginctl show-user "$(id -un)" --property=Linger --value 2>/dev/null)" = "yes" ]; then
    return
  fi
  say "letting user services run without a login session (loginctl enable-linger)"
  loginctl enable-linger "$(id -un)" 2>/dev/null || sudo loginctl enable-linger "$(id -un)"
}

serve_on_tailnet() {
  if tailscale serve --bg --https="$HTTPS_PORT" "http://127.0.0.1:$PORT" >/dev/null 2>&1; then
    return
  fi
  say "tailscale serve needs permission; retrying with sudo"
  sudo tailscale serve --bg --https="$HTTPS_PORT" "http://127.0.0.1:$PORT" >/dev/null
}

tailnet_url() {
  local name
  name=$(tailscale status --json | python3 -c 'import json, sys; print(json.load(sys.stdin)["Self"]["DNSName"].rstrip("."))')
  echo "https://$name:$HTTPS_PORT"
}

wait_for_health() {
  local url=$1
  for _ in $(seq 1 20); do
    curl -fsS --max-time 3 "$url/health" >/dev/null 2>&1 && return 0
    sleep 0.5
  done
  return 1
}

check() {
  local url
  if wait_for_health "http://127.0.0.1:$PORT"; then
    say "loopback health check OK"
  else
    fail "the service isn't answering on 127.0.0.1:$PORT. See: journalctl --user -u $UNIT -n 50"
  fi
  url=$(tailnet_url)
  if wait_for_health "$url"; then
    say "tailnet health check OK"
  else
    say "the tailnet URL isn't answering yet. If this is the first install, run ./tailscale-wizard.sh"
  fi
  echo
  say "server address for the extension's settings:"
  echo "    $url"
}

uninstall() {
  systemctl --user disable --now "$UNIT" 2>/dev/null || true
  rm -f "$UNIT_FILE"
  systemctl --user daemon-reload
  tailscale serve --https="$HTTPS_PORT" off 2>/dev/null || sudo tailscale serve --https="$HTTPS_PORT" off || true
  rm -rf "$INSTALL_DIR"
  say "uninstalled. The Inbox at $INBOX_DIR was left alone."
}

main() {
  refuse_sandbox
  if [ "${1:-}" = "--uninstall" ]; then
    uninstall
    return
  fi
  require cargo "Install Rust from https://rustup.rs"
  require tailscale "Install Tailscale from https://tailscale.com/download"
  require curl "Install it with your package manager"
  install_service
  enable_linger
  serve_on_tailnet
  check
}

main "$@"

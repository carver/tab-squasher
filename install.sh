#!/usr/bin/env bash
# Sets up tab-squasher development in the sandbox. Idempotent; sandbox-setup
# runs it after every recreate.
#   --update   also replace Firefox with the latest release
set -euo pipefail
cd "$(dirname "$0")"

CACHE="$HOME/.cache/tab-squasher"
GECKODRIVER_VERSION="0.37.1"

say() { echo "tab-squasher: $*"; }

git config core.hooksPath .githooks
say "git hooks enabled (.githooks)"

if [ ! -d extension/node_modules ] || [ extension/package-lock.json -nt extension/node_modules ]; then
  say "installing extension dependencies"
  (cd extension && npm ci --silent && touch node_modules)
fi

mkdir -p "$CACHE"
if [ ! -x "$CACHE/firefox/firefox" ] || [ "${1:-}" = "--update" ]; then
  say "downloading the latest Firefox for e2e tests"
  rm -rf "$CACHE/firefox"
  curl -fsSL "https://download.mozilla.org/?product=firefox-latest-ssl&os=linux64&lang=en-US" | tar xJ -C "$CACHE"
fi
if ! "$CACHE/geckodriver" --version 2>/dev/null | grep -q "$GECKODRIVER_VERSION"; then
  say "downloading geckodriver $GECKODRIVER_VERSION"
  curl -fsSL "https://github.com/mozilla/geckodriver/releases/download/v$GECKODRIVER_VERSION/geckodriver-v$GECKODRIVER_VERSION-linux64.tar.gz" \
    | tar xz -C "$CACHE"
fi
say "$("$CACHE/firefox/firefox" --version 2>/dev/null), geckodriver $GECKODRIVER_VERSION"

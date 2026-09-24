#!/usr/bin/env bash
# Runs the built extension in a throwaway Firefox profile. Run on the host.
#   firefox-desktop
#   firefox-android   phone on USB with USB debugging on, and Firefox >
#                     Settings > Remote debugging via USB turned on.
#                     FIREFOX_APK overrides the package (default org.mozilla.firefox).
set -euo pipefail
cd "$(dirname "$0")/.."
target="${1:?usage: $0 firefox-desktop|firefox-android}"

case "$target" in
  firefox-android)
    device=$(adb devices | awk 'NR>1 && $2=="device" {print $1; exit}')
    [ -n "$device" ] || { echo "no adb device; check USB debugging" >&2; exit 1; }
    exec npx web-ext run -t firefox-android --android-device "$device" \
      --firefox-apk "${FIREFOX_APK:-org.mozilla.firefox}"
    ;;
  firefox-desktop)
    # Snap Firefox has a private /tmp, so it can't read web-ext's temporary
    # profile there. /usr/bin/firefox is only a launcher, so ask snap.
    if command -v snap >/dev/null && snap list firefox >/dev/null 2>&1; then
      export TMPDIR="$HOME/snap/firefox/common/web-ext-tmp"
      mkdir -p "$TMPDIR"
    fi
    exec npx web-ext run -t firefox-desktop
    ;;
  *) echo "unknown target $target" >&2; exit 2 ;;
esac

#!/usr/bin/env bash
# Builds, lints and signs the extension on AMO's unlisted channel (ADR 0002),
# leaving the signed .xpi in extension/artifacts/. Run on the host: the AMO
# API keys live in the host's secret store and never enter the sandbox.
#
#   ./scripts/sign.sh           bump the patch version, then sign
#   ./scripts/sign.sh --no-bump sign the current version (after a failed attempt)
#
# Keys are read with secret-tool (see ./scripts/amo-wizard.sh to store them).
set -euo pipefail
cd "$(dirname "$0")/.."

fail() { echo "sign: $*" >&2; exit 1; }

if [ -n "${SANDBOX_VM_ID:-}" ] || [ -e /run/sandbox ]; then
  fail "run this on the host; the AMO keys stay out of the sandbox."
fi
command -v secret-tool >/dev/null || fail "secret-tool is missing (package libsecret-tools)."
# The source zip AMO gets is built from git, which can't see untracked files.
untracked=$(git -C .. ls-files --others --exclude-standard -- extension spec)
[ -z "$untracked" ] || fail "commit or remove these untracked files first:
$untracked"

WEB_EXT_API_KEY=$(secret-tool lookup service tab-squasher-amo field jwt-issuer) \
  || fail "no AMO key in the secret store. Run ./scripts/amo-wizard.sh first."
WEB_EXT_API_SECRET=$(secret-tool lookup service tab-squasher-amo field jwt-secret) \
  || fail "no AMO secret in the secret store. Run ./scripts/amo-wizard.sh first."
export WEB_EXT_API_KEY WEB_EXT_API_SECRET

if [ "${1:-}" != "--no-bump" ]; then
  npm version patch --no-git-tag-version >/dev/null
fi
version=$(node -p 'require("./package.json").version')
echo "sign: version $version"

npm ci --silent
npm run -s lint
npm test -s

# The bundle is generated from TypeScript, so AMO gets the source too: the
# working tree as it is now (stash create snapshots it without touching it).
mkdir -p artifacts
source_zip="artifacts/tab-squasher-$version-source.zip"
snapshot=$(git stash create)
git -C .. archive --format=zip -o "extension/$source_zip" "${snapshot:-HEAD}" extension spec

npx web-ext sign --channel unlisted --upload-source-code "$source_zip"
echo "sign: done. Signed .xpi in extension/artifacts/. Commit the version bump in package.json."

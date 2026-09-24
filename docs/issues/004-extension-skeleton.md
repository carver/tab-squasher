# 004 Extension skeleton

MV3, TypeScript, in `extension/`. Use the spike on `spike/android-popup` as reference, not as a starting point.

## What to build

- Build with a small bundler (esbuild) into `extension/dist/`. `npm run build`, `npm test`, `npm run lint` (tsc, eslint, `web-ext lint` with zero warnings) and `npm run dev:android` / `npm run dev:desktop` (web-ext run; keep the snap TMPDIR fix from the spike).
- Manifest: gecko id, `strict_min_version` 142 for desktop and Android, `data_collection_permissions: {required: ["none"]}`, permissions `activeTab`, `scripting`, `tabs`, `storage`, `alarms`, `menus`, and host permission `<all_urls>` (the Android chip needs a content script everywhere).
- An options page with one field, the server URL. On save it calls `/health` and shows the result. Stored in `storage.local`. The popup shows a "set the server URL" state until one works.
- Pure logic lives in modules with no `browser.*` calls, so vitest can test them directly. The `browser.*` glue stays thin.

## Acceptance

- `npm run build && npm test && npm run lint` pass from a clean checkout.
- `npm run dev:desktop` loads the extension, and the options page saves a URL and reports health.

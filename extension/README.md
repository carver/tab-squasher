# tab-squasher extension

Firefox extension (MV3, TypeScript) for desktop and Android. The popup is where you write a Spark (ADR 0003). The background script owns the Outbox and sends Sparks to the server (see [server/](../server/README.md)).

## Layout

- `src/lib/` holds the logic, free of DOM and `browser.*` calls where possible, and unit-tested:
  - `spark.ts`: the Spark format and its validator, tested against `spec/fixtures`.
  - `draft.ts`: building a Spark from the popup form and the page.
  - `send.ts`: one POST to the server.
  - `outbox.ts`: the queue every Spark passes through.
  - `present.ts`: text the popup shows.
- `src/background.ts` queues, sends and retries: every 5 minutes while anything waits, when the popup opens, and at browser startup.
- `src/popup/` is the popup UI. It also runs as a tab, `popup.html?tab=<id>`, which is how Android shows it.
- `src/options/` is the settings page, with the server address.
- `static/` is copied into `dist/` as is: the manifest, HTML, CSS and icon.

## Commands

```bash
npm run build        # dist/
npm test             # unit tests (vitest)
npm run test:e2e     # headless Firefox via geckodriver, a real server, a local test site
npm run lint         # tsc, eslint, build, web-ext lint (warnings are errors)
npm run dev:desktop  # web-ext run on the host
npm run dev:android  # web-ext run on a phone over adb, from the host
```

`../install_sandbox.sh` downloads the Firefox and geckodriver the e2e tests use into `~/.cache/tab-squasher`. `FIREFOX_BIN` and `GECKODRIVER` override those paths.

The e2e tests open extension pages from Firefox's chrome context, because WebDriver refuses to navigate to `moz-extension://` URLs (Firefox 156). They drive the popup as a tab, since WebDriver can't click the toolbar button. The toolbar popup itself is covered by manual testing.

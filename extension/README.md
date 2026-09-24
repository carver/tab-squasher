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
- `src/chip/` is the Android selection chip, a content script. `place.ts` keeps it on screen at any zoom.
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

`../install.sh` downloads the Firefox and geckodriver the e2e tests use into `~/.cache/tab-squasher`. `FIREFOX_BIN` and `GECKODRIVER` override those paths.

The e2e tests open extension pages from Firefox's chrome context, because WebDriver refuses to navigate to `moz-extension://` URLs (Firefox 156). They drive the popup as a tab, since WebDriver can't click the toolbar button. The toolbar popup itself is covered by manual testing.

## Signing and installing (ADR 0002)

On the host, the first time: `./scripts/amo-wizard.sh`. It gets AMO API credentials and stores them in your keyring with `secret-tool`. It then signs the first version and walks through installing it on desktop and Android.

After that, `npm run sign` on the host bumps the patch version, runs lint and the unit tests, and signs on AMO's unlisted channel. It uploads the source alongside the build, since the bundle is generated from TypeScript. The signed `.xpi` lands in `artifacts/` (gitignored). Commit the version bump afterwards. `./scripts/sign.sh --no-bump` retries a failed attempt without using up a version number.

To install on desktop Firefox:

1. Open `about:addons`, click the gear icon, then "Install Add-on From File...".
2. Pick the `.xpi` from `artifacts/` and approve the permissions.
3. In the add-on's settings, set the server address (the one `server/install-host.sh` prints).

To install on Firefox for Android:

1. Copy the `.xpi` to the phone. `tailscale file cp artifacts/<file>.xpi <phone>:` works over the tailnet. First pick a folder for received files in the phone's Tailscale app, or the transfer sits at 0%. Android won't grant access to Downloads itself, so pick a subfolder.
2. In Firefox, go to Settings, About Firefox, and tap the Firefox logo 5 times to turn on the debug menu.
3. Back in Settings, open "Install extension from file" and pick the `.xpi`.
4. In Add-ons, tab-squasher, set the server address.

Both installs have been checked by hand: the add-on survives a browser restart and sends Sparks to the Inbox. Updates are manual for now: sign, then install the new `.xpi` over the old one on each device.

## Debugging on Android

Plug the phone in over USB and turn on "Remote debugging via USB" in Firefox's settings. Once `adb devices` lists the phone, open `about:debugging` in desktop Firefox, connect to the phone, and click Inspect on tab-squasher. Web pages open on the phone are listed there too.

`browser is not defined` in the extension's console means the background script is asleep: MV3 background scripts stop when idle. Open the Spark tab on the phone to wake it, then run the command again. The console's frame picker can also switch to an open extension page, which has `browser` as well.

Useful checks:

- `await browser.scripting.getRegisteredContentScripts()` in the extension's console lists `spark-chip` once the chip is registered.
- `document.querySelector('tab-squasher-chip')` in a page's console finds the chip while text is selected. If it's there but you can't see it, compare `innerWidth` with `visualViewport.width` and `visualViewport.scale`.

A warning about the `menus` permission (`Value "menus" must either ...`) appears on every load. It's harmless. Firefox for Android has no context-menu API, so it drops the permission and loads the rest of the manifest. The desktop right-click item needs `menus`, and a manifest can't list permissions per platform, so the warning stays unless Android gets its own build. The code calls `browser.menus?.` so Android skips it.

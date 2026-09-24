# 005 Popup writes and sends a Spark

The heart of the extension. The same page runs as the toolbar popup and as a tab (`popup.html?tab=<id>`, opened by the Android chip, see ADR 0003 and 007).

## What to build

- On open, find the page tab (from `?tab=`, otherwise the active tab). Read the live Selection and the first `<video>`'s `currentTime` with `scripting.executeScript`, plus the tab's URL and title. Never use a stored Selection; the spike showed that goes stale.
- Form:
  - Note: free text.
  - Quote: prefilled with the Selection and freely editable. The hint text explains the marks: `...` for a Cut, `[..]` for a Rewrite. A clear button empties it.
  - Source line: title, domain, and `m:ss` when there's a video time.
- Buttons: **Send** and **Send & close**. Both are disabled until the Spark is valid (001 rules, including the 64 KB limit). The popup names the rule that isn't met, for example "Add a Note or a Quote" or "Quote is too long, trim it".
- Send builds the Spark (new UUID, `captured_at` now, empty strings to `null`, Selection dropped if the Quote is empty) and hands it to the background script. The background POSTs it to the server. Any failure other than a 4xx goes to the Outbox (006). A 4xx means the Spark itself is bad, so the popup shows the error and keeps the form.
- Send clears the form so another Spark from the same page is quick. Send & close also closes the page tab, then `window.close()`, and that works even if the Spark only reached the Outbox.

## Tests

- Unit (vitest): building a Spark from form state against the 001 fixtures, the Selection/Quote rule, trimming and nulls, size limit, `m:ss` formatting.
- Property: any form state the popup accepts produces a Spark that passes the 001 schema. Any state it rejects names a reason.
- E2E: headless Firefox through geckodriver. Install the built extension as a temporary add-on and open a local test page with text and a `<video>`. Select text, open `popup.html?tab=<id>`, send to a server started on a temp Inbox dir, and check the Inbox line. Cover Send & close too.

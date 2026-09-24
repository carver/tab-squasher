# 007 Entry points: right-click and Android chip

## What to build

- Desktop: a context-menu item, "Spark this", on page, selection, link and video. Clicking it calls `action.openPopup()` right away, inside the handler. The popup reads the page itself (005), so the menu passes nothing along.
- Android: when text is selected, a content script shows a floating "Spark" button in a closed shadow root. It prevents default on `pointerdown`/`mousedown`/`touchstart` to keep the selection, and acts on `pointerup`, not `click`. It messages the background, which opens `popup.html?tab=<sender tab id>` as a new tab. Skip `openPopup()` on Android: it resolves but shows nothing (Firefox 155, see the spike). Pick the platform with `runtime.getPlatformInfo()`, not the user agent.
- The chip hides when the selection clears, and it never shows on the extension's own pages.
- Send & close from the tab version closes the page tab and the Spark tab. Plain Send closes the Spark tab and brings the page tab back to the front.

## Acceptance

- Desktop: select, right-click, Spark this, and the popup shows the Quote prefilled.
- Android, checked by hand on your phone: select, tap the chip, and the Spark tab opens with the Quote prefilled. Send returns to the page. Send & close lands on the next tab.

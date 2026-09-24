# The popup is the only UI

Firefox for Android has no context menus and no sidebar. So the extension popup is where every Spark gets written, on both platforms. On desktop the right-click menu item just opens that popup. We rejected an in-page overlay because it has to fight each page's CSS and CSP, and it's hard to use on a phone.

## Consequences

Android can't add an entry to the long-press selection menu. Those entries are Android apps, and they receive only the text, not the URL. So while text is selected, a content script shows a floating Spark button. On Android, `action.openPopup()` resolves but shows nothing (tested on Firefox 155), so the button opens the popup page as a tab and passes along the page's tab id. The button only opens the popup and never holds the form itself, so the popup is still the only place a Spark gets written.

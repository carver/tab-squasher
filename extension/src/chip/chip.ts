// Android only (registered by the background script): a floating Spark
// button while text is selected. Android extensions can't add to the
// long-press menu, and openPopup() shows nothing there (ADR 0003), so the
// button asks the background to open the popup page as a tab.

import type { Message } from "../lib/messages";
import { placeChip } from "./place";

// Page CSS can still style the host element; hiding undefined custom
// elements is common. Important rules from inside the shadow root win.
const STYLE = `
  :host { all: initial !important; }
  button {
    position: fixed; left: 0; top: 0; z-index: 2147483647; transform-origin: 0 0;
    font: 600 16px system-ui, sans-serif; padding: 12px 18px; border: 0; border-radius: 24px;
    background: #ff7139; color: #fff; box-shadow: 0 2px 8px #0006;
  }`;

function createChip(): { host: HTMLElement; button: HTMLButtonElement } {
  const host = document.createElement("tab-squasher-chip");
  const root = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = STYLE;
  const button = document.createElement("button");
  button.textContent = "✦ Spark";
  root.append(style, button);
  return { host, button };
}

function hasSelection(): boolean {
  return String(getSelection()).trim() !== "";
}

const { host, button } = createChip();

// Tapping must not clear the selection, so the default of every press
// event is prevented. On mobile that also cancels the synthesized click,
// so the action runs on pointerup.
for (const type of ["pointerdown", "mousedown", "touchstart"]) {
  button.addEventListener(type, (event) => event.preventDefault(), { passive: false });
}
button.addEventListener("pointerup", () => {
  void browser.runtime.sendMessage({ type: "openSparkTab" } satisfies Message);
});

function place(): void {
  if (!visualViewport) return;
  const { right, bottom, size } = placeChip(visualViewport);
  button.style.transform = `translate(${right}px, ${bottom}px) scale(${size}) translate(-100%, -100%)`;
}

document.addEventListener("selectionchange", () => {
  if (hasSelection() && !host.isConnected) {
    place();
    document.documentElement.append(host);
  }
  if (!hasSelection() && host.isConnected) host.remove();
});
visualViewport?.addEventListener("resize", place);
visualViewport?.addEventListener("scroll", place);

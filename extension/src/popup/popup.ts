// The Spark popup. It also runs as a tab (popup.html?tab=<id>) when the
// Android chip opens it, since openPopup() shows nothing there (ADR 0003).

import type { Message } from "../lib/messages";
import { onOutboxChange, readOutbox } from "../lib/outbox-storage";
import { readPage } from "../lib/page";
import { loadServerUrl } from "../lib/settings";
import { startCompose, startEdit } from "./compose";
import { renderOutbox } from "./outbox-view";

async function pageTab(): Promise<{ tab: browser.tabs.Tab; openedAsTab: boolean }> {
  const tabParam = new URLSearchParams(location.search).get("tab");
  if (tabParam !== null) return { tab: await browser.tabs.get(Number(tabParam)), openedAsTab: true };
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab) throw new Error("no active tab");
  return { tab, openedAsTab: false };
}

async function closeSelf(): Promise<void> {
  if (new URLSearchParams(location.search).has("tab")) {
    const self = await browser.tabs.getCurrent();
    if (self?.id !== undefined) await browser.tabs.remove(self.id);
  }
  window.close();
}

async function main(): Promise<void> {
  const { tab, openedAsTab } = await pageTab();
  const tabId = tab.id!;

  const setup = document.querySelector<HTMLElement>("#setup")!;
  setup.hidden = (await loadServerUrl()) !== null;
  document.querySelector("#open-settings")!.addEventListener("click", () => void browser.runtime.openOptionsPage());

  startCompose(await readPage(tabId), {
    afterSend: async (result) => {
      if (openedAsTab && result.outcome === "sent") {
        await browser.tabs.update(tabId, { active: true });
        await closeSelf();
      }
    },
    closeAll: async () => {
      await browser.tabs.remove(tabId);
      await closeSelf();
    },
  });

  renderOutbox(await readOutbox(), startEdit);
  onOutboxChange((outbox) => renderOutbox(outbox, startEdit));
  void browser.runtime.sendMessage({ type: "flush" } satisfies Message);
}

void main();

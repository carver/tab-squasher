// The Spark popup. It also runs as a tab (popup.html?tab=<id>) when the
// Android chip opens it, since openPopup() shows nothing there (ADR 0003).

import type { Message } from "../lib/messages";
import { onOutboxChange, readOutbox } from "../lib/outbox-storage";
import { readPage } from "../lib/page";
import { sentence } from "../lib/present";
import { checkServer } from "../lib/server";
import { loadServerUrl } from "../lib/settings";
import { startCompose, startEdit } from "./compose";
import { renderOutbox } from "./outbox-view";

/** Set when the Android chip opened this page as a tab for the page tab with this id. */
const tabParam = new URLSearchParams(location.search).get("tab");

async function pageTab(): Promise<browser.tabs.Tab> {
  if (tabParam !== null) return browser.tabs.get(Number(tabParam));
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab) throw new Error("no active tab");
  return tab;
}

async function closeSelf(): Promise<void> {
  if (tabParam !== null) {
    const self = await browser.tabs.getCurrent();
    if (self?.id !== undefined) await browser.tabs.remove(self.id);
  }
  window.close();
}

/** Says, without blocking the form, when Sparks will have to wait in the Outbox. */
async function showServerNotice(): Promise<void> {
  const notice = document.querySelector<HTMLElement>("#server-notice")!;
  const text = document.querySelector<HTMLElement>("#server-notice-text")!;
  document.querySelector("#open-settings")!.addEventListener("click", () => void browser.runtime.openOptionsPage());
  const url = await loadServerUrl();
  const problem = url === null ? "No server address yet" : await checkServer(url).then((h) => (h.ok ? null : h.problem));
  notice.hidden = problem === null;
  if (problem) text.textContent = `${sentence(problem)} Sparks will wait in the Outbox.`;
}

async function main(): Promise<void> {
  const tab = await pageTab();
  const tabId = tab.id!;
  void showServerNotice();

  startCompose(await readPage(tabId), {
    afterSend: async (result) => {
      if (tabParam !== null && result.outcome === "sent") {
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

// The background script owns the Outbox: it queues, sends and retries.
// Popups and the page chip ask it through messages (lib/messages.ts).

import type { Message, SendResult } from "./lib/messages";
import { createStore, flush } from "./lib/outbox";
import { storageBackend } from "./lib/outbox-storage";
import { type Attempt, sendSpark } from "./lib/send";
import { loadServerUrl } from "./lib/settings";
import type { Spark } from "./lib/spark";

const RETRY_ALARM = "retry-outbox";
const RETRY_MINUTES = 5;
const NO_SERVER = "No server address is set yet (see the extension's settings)";

const store = createStore(storageBackend);
let flushing: Promise<Map<string, Attempt>> = Promise.resolve(new Map());

/** Runs a flush after any flush already underway, so each one sees the newest Outbox. */
function flushOutbox(): Promise<Map<string, Attempt>> {
  flushing = flushing.catch(() => new Map<string, Attempt>()).then(sendWaiting);
  return flushing;
}

async function sendWaiting(): Promise<Map<string, Attempt>> {
  const url = await loadServerUrl();
  const results = url ? await flush(store, (spark) => sendSpark(url, JSON.stringify(spark))) : new Map();
  await scheduleRetry();
  return results;
}

/** Keeps a retry alarm while anything is waiting to be sent, and none otherwise. */
async function scheduleRetry(): Promise<void> {
  const waiting = (await store.load()).some((entry) => entry.problem === null);
  if (!waiting) {
    await browser.alarms.clear(RETRY_ALARM);
  } else if (!(await browser.alarms.get(RETRY_ALARM))) {
    browser.alarms.create(RETRY_ALARM, { periodInMinutes: RETRY_MINUTES });
  }
}

async function queueAndSend(spark: Spark, wait: boolean): Promise<SendResult> {
  const flushed = flushOutbox();
  if (!wait) return { outcome: "saved" };
  return resultFor((await flushed).get(spark.id));
}

async function resultFor(attempt: Attempt | undefined): Promise<SendResult> {
  if (!attempt) {
    const problem = (await loadServerUrl()) ? "Waiting behind older Sparks" : NO_SERVER;
    return { outcome: "queued", problem };
  }
  switch (attempt.kind) {
    case "accepted":
      return { outcome: "sent" };
    case "rejected":
      return { outcome: "rejected", problem: attempt.problem };
    case "failed":
      return { outcome: "queued", problem: attempt.problem };
  }
}

/** Opens the popup page as a tab for `pageTab`: the Android route (ADR 0003). */
async function openSparkTab(pageTab: browser.tabs.Tab | undefined): Promise<void> {
  if (pageTab?.id === undefined) return;
  await browser.tabs.create({
    url: browser.runtime.getURL(`popup.html?tab=${pageTab.id}`),
    openerTabId: pageTab.id,
    ...(pageTab.windowId === undefined ? {} : { windowId: pageTab.windowId }),
  });
}

async function handle(message: Message, sender: browser.runtime.MessageSender): Promise<SendResult | undefined> {
  switch (message.type) {
    case "send":
      await store.enqueue(message.spark);
      return queueAndSend(message.spark, message.wait);
    case "edit":
      await store.edit(message.spark);
      return queueAndSend(message.spark, true);
    case "delete":
      await store.remove(message.id);
      await scheduleRetry();
      return undefined;
    case "flush":
      void flushOutbox();
      return undefined;
    case "openSparkTab":
      await openSparkTab(sender.tab);
      return undefined;
  }
}

browser.runtime.onMessage.addListener((message: Message, sender) => handle(message, sender));
browser.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === RETRY_ALARM) void flushOutbox();
});
browser.runtime.onStartup.addListener(() => void flushOutbox());

// Entry points (issue #7). Desktop gets a right-click item that opens the
// popup; Android, which has no context menus, gets the selection chip.

const CHIP_SCRIPT = "spark-chip";
const MENU_ITEM = "spark-this";

async function setUpEntryPoints(): Promise<void> {
  const { os } = await browser.runtime.getPlatformInfo();
  if (os === "android") {
    const registered = await browser.scripting.getRegisteredContentScripts({ ids: [CHIP_SCRIPT] });
    if (registered.length === 0) {
      await browser.scripting.registerContentScripts([
        { id: CHIP_SCRIPT, matches: ["<all_urls>"], js: ["chip.js"], runAt: "document_idle" },
      ]);
    }
  } else {
    await browser.menus.removeAll();
    browser.menus.create({ id: MENU_ITEM, title: "Spark this", contexts: ["page", "selection", "link", "video"] });
  }
}

// Both are idempotent, and an update can drop registered content scripts.
browser.runtime.onInstalled.addListener(() => void setUpEntryPoints());
browser.runtime.onStartup.addListener(() => void setUpEntryPoints());
browser.menus?.onClicked.addListener((info) => {
  // openPopup() must run inside the click handler, before any await.
  if (info.menuItemId === MENU_ITEM) void browser.action.openPopup();
});

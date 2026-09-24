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

async function handle(message: Message): Promise<SendResult | undefined> {
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
      return undefined;
  }
}

browser.runtime.onMessage.addListener((message: Message) => handle(message));
browser.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === RETRY_ALARM) void flushOutbox();
});
browser.runtime.onStartup.addListener(() => void flushOutbox());

// The Spark form: writing a new Spark, or editing one in the Outbox.

import { buildSpark, type Page, type Stamp } from "../lib/draft";
import type { Message, SendResult } from "../lib/messages";
import type { Entry } from "../lib/outbox";
import { describeSendResult, domainOf, formatVideoTime, type Tone } from "../lib/present";

type Mode = { kind: "new"; page: Page } | { kind: "edit"; page: Page; stamp: Stamp };

/** Only for checking the form as you type; real Sparks get a fresh stamp on Send. */
const CHECK_STAMP_ID = "00000000-0000-4000-8000-000000000000";

const el = {
  form: document.querySelector<HTMLFormElement>("#compose")!,
  source: document.querySelector<HTMLElement>("#source")!,
  note: document.querySelector<HTMLTextAreaElement>("#note")!,
  quote: document.querySelector<HTMLTextAreaElement>("#quote")!,
  clearQuote: document.querySelector<HTMLButtonElement>("#clear-quote")!,
  problem: document.querySelector<HTMLElement>("#problem")!,
  send: document.querySelector<HTMLButtonElement>("#send")!,
  sendClose: document.querySelector<HTMLButtonElement>("#send-close")!,
  cancelEdit: document.querySelector<HTMLButtonElement>("#cancel-edit")!,
  status: document.querySelector<HTMLElement>("#status")!,
};

export interface ComposeHooks {
  /** Called after Send (not Send & close) once the background has answered. */
  afterSend(result: SendResult): void;
  /** Close the page tab and the popup. */
  closeAll(): Promise<void>;
}

let mode: Mode;
let hooks: ComposeHooks;
/** The page this popup is for. Editing an Outbox entry shows that entry's page instead, for a while. */
let homePage: Page;

export function startCompose(page: Page, composeHooks: ComposeHooks): void {
  hooks = composeHooks;
  homePage = page;
  el.form.addEventListener("input", check);
  el.form.addEventListener("submit", (event) => {
    event.preventDefault();
    void submit(false);
  });
  el.sendClose.addEventListener("click", () => void submit(true));
  el.clearQuote.addEventListener("click", () => {
    el.quote.value = "";
    check();
  });
  el.cancelEdit.addEventListener("click", () => showNew(homePage));
  showNew(page);
}

export function startEdit(entry: Entry): void {
  const { spark } = entry;
  const page: Page = {
    url: spark.source.url,
    title: spark.source.title ?? "",
    selection: spark.selection ?? "",
    videoSeconds: spark.source.video_seconds,
  };
  mode = { kind: "edit", page, stamp: { id: spark.id, capturedAt: spark.captured_at } };
  fill(spark.note ?? "", spark.quote ?? "", page);
  showStatus(entry.problem ? `Server said: ${entry.problem}` : "", "bad");
  el.note.focus();
}

function showNew(page: Page): void {
  mode = { kind: "new", page };
  fill("", page.selection.trim(), page);
  showStatus("", "muted");
}

function fill(note: string, quote: string, page: Page): void {
  const editing = mode.kind === "edit";
  el.note.value = note;
  el.quote.value = quote;
  el.quote.disabled = page.selection.trim() === "";
  el.clearQuote.disabled = el.quote.disabled;
  el.source.textContent = describeSource(page);
  el.send.textContent = editing ? "Save changes" : "Send";
  el.sendClose.hidden = editing;
  el.cancelEdit.hidden = !editing;
  check();
}

function describeSource(page: Page): string {
  let domain = page.url;
  try {
    domain = domainOf(page.url);
  } catch {
    // Not a URL we can shorten; show it whole.
  }
  const parts = [page.title.trim() || domain, domain];
  if (page.videoSeconds) parts.push(formatVideoTime(page.videoSeconds));
  return [...new Set(parts)].join(" · ");
}

function build(stamp: Stamp) {
  return buildSpark({ note: el.note.value, quote: el.quote.value }, mode.page, stamp);
}

function check(): void {
  const built = build({ id: CHECK_STAMP_ID, capturedAt: new Date().toISOString() });
  el.problem.textContent = built.ok ? "" : built.problem;
  el.send.disabled = !built.ok;
  el.sendClose.disabled = !built.ok;
}

async function submit(thenClose: boolean): Promise<void> {
  const stamp = mode.kind === "edit" ? mode.stamp : { id: crypto.randomUUID(), capturedAt: new Date().toISOString() };
  const built = build(stamp);
  if (!built.ok) return;
  el.send.disabled = el.sendClose.disabled = true;
  showStatus(thenClose ? "Saving..." : "Sending...", "muted");
  const message: Message =
    mode.kind === "edit" ? { type: "edit", spark: built.spark } : { type: "send", spark: built.spark, wait: !thenClose };
  const result = (await browser.runtime.sendMessage(message)) as SendResult;
  if (thenClose) {
    await hooks.closeAll();
    return;
  }
  const described = describeSendResult(result);
  mode = { kind: "new", page: homePage };
  fill("", "", homePage);
  showStatus(described.message, described.tone);
  hooks.afterSend(result);
}

function showStatus(message: string, tone: Tone): void {
  el.status.textContent = message;
  el.status.className = tone;
}

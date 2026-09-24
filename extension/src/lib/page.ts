// Reading the page a Spark is about.

import type { Page } from "./draft";

interface Probe {
  selection: string;
  videoSeconds: number | null;
}

/**
 * The tab's URL and title, plus its live selection and video time. Pages
 * that refuse scripts (about:, the add-ons site) come back with neither.
 */
export async function readPage(tabId: number): Promise<Page> {
  const tab = await browser.tabs.get(tabId);
  let probe: Probe = { selection: "", videoSeconds: null };
  try {
    // The published typings declare func as returning void; its result comes back all the same.
    const func = probePage as () => void;
    const [injection] = await browser.scripting.executeScript({ target: { tabId }, func });
    if (injection?.result) probe = injection.result as Probe;
  } catch {
    // Scripts aren't allowed on this page; a Note-only Spark still works.
  }
  return { url: tab.url ?? "", title: tab.title ?? "", ...probe };
}

/** Runs inside the page, so it must not refer to anything outside itself. */
function probePage(): Probe {
  let selection = String(getSelection());
  const field = document.activeElement;
  if (!selection && (field instanceof HTMLTextAreaElement || field instanceof HTMLInputElement)) {
    selection = field.value.slice(field.selectionStart ?? 0, field.selectionEnd ?? 0);
  }
  const video = Array.from(document.querySelectorAll("video")).find((v) => v.currentTime > 0);
  return { selection, videoSeconds: video ? video.currentTime : null };
}

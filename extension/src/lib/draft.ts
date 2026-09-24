// Turning what's in the popup into a Spark.

import { type Spark, validateSparkBody } from "./spark";

/** The popup's form fields, as typed. */
export interface Draft {
  note: string;
  quote: string;
}

/** What the popup read from the page. `selection` is "" when nothing was selected. */
export interface Page {
  url: string;
  title: string;
  selection: string;
  videoSeconds: number | null;
}

/** Identity of the Spark: a fresh one on first Send, the original when editing. */
export interface Stamp {
  id: string;
  capturedAt: string;
}

export type Built = { ok: true; spark: Spark; body: string } | { ok: false; problem: string };

export function buildSpark(draft: Draft, page: Page, stamp: Stamp): Built {
  const quote = textOrNull(draft.quote);
  if (quote !== null && page.selection.trim() === "") {
    return { ok: false, problem: "Select text on the page to quote it" };
  }
  const spark: Spark = {
    v: 1,
    id: stamp.id,
    destination: "anki",
    note: textOrNull(draft.note),
    quote,
    selection: quote === null ? null : page.selection,
    source: { url: page.url, title: textOrNull(page.title), video_seconds: playbackSeconds(page.videoSeconds) },
    captured_at: stamp.capturedAt,
  };
  const body = JSON.stringify(spark);
  const checked = validateSparkBody(body);
  return checked.ok ? { ok: true, spark, body } : checked;
}

function textOrNull(text: string): string | null {
  const trimmed = text.trim();
  return trimmed === "" ? null : trimmed;
}

/** A video at 0 s hasn't started, so there's no moment worth linking to. */
function playbackSeconds(seconds: number | null): number | null {
  return seconds !== null && Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

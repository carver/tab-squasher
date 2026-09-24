// Text the popup shows. Kept free of DOM and browser calls so it's testable.

import type { SendResult } from "./messages";
import type { Entry } from "./outbox";

const SUMMARY_CHARS = 50;

export type Tone = "good" | "bad" | "muted";

export interface EntrySummary {
  text: string;
  domain: string;
  age: string;
  problem: string | null;
}

/** 754.38 -> "12:34", 3725 -> "1:02:05". */
export function formatVideoTime(seconds: number): string {
  const whole = Math.floor(seconds);
  const [h, m, s] = [Math.floor(whole / 3600), Math.floor((whole % 3600) / 60), whole % 60];
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

export function domainOf(url: string): string {
  return new URL(url).hostname.replace(/^www\./, "");
}

/** One line per Outbox entry: what it says, where it's from, how old it is. */
export function summarizeEntry(entry: Entry, now: Date): EntrySummary {
  const { spark } = entry;
  const text = spark.note ? truncate(spark.note) : `“${truncate(spark.quote ?? "")}”`;
  return {
    text,
    domain: domainOf(spark.source.url),
    age: ageOf(new Date(spark.captured_at), now),
    problem: entry.problem,
  };
}

export function describeSendResult(result: SendResult): { message: string; tone: Tone } {
  switch (result.outcome) {
    case "sent":
      return { message: "Sent", tone: "good" };
    case "saved":
      return { message: "Saved in the Outbox", tone: "muted" };
    case "queued":
      return { message: `${result.problem}. Saved in the Outbox; it will retry.`, tone: "muted" };
    case "rejected":
      return {
        message: `The server refused it: ${result.problem}. Fix or delete it in the Outbox below.`,
        tone: "bad",
      };
  }
}

function truncate(text: string): string {
  const chars = [...text];
  return chars.length <= SUMMARY_CHARS ? text : `${chars.slice(0, SUMMARY_CHARS).join("")}…`;
}

function ageOf(then: Date, now: Date): string {
  const minutes = Math.floor((now.getTime() - then.getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} d ago`;
}

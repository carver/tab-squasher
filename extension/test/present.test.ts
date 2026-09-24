import { describe, expect, it } from "vitest";

import { describeSendResult, formatVideoTime, sentence, summarizeEntry } from "../src/lib/present";
import { ALREADY_RECEIVED } from "../src/lib/send";
import type { Spark } from "../src/lib/spark";

describe("formatVideoTime", () => {
  it.each([
    [0.4, "0:00"],
    [7, "0:07"],
    [754.38, "12:34"],
    [3600, "1:00:00"],
    [3725.9, "1:02:05"],
  ])("%d s is %s", (seconds, text) => {
    expect(formatVideoTime(seconds)).toBe(text);
  });
});

const SPARK: Spark = {
  v: 1,
  id: "3f0c1d9e-6a57-4e57-9d64-2b1b4f0f6c11",
  destination: "anki",
  note: null,
  quote: "Debezium is a set of distributed services ... [that capture] row-level changes",
  selection: "Debezium is a set of distributed services",
  source: { url: "https://www.debezium.io/documentation/x", title: "Debezium", video_seconds: null },
  captured_at: "2026-09-24T03:00:00.000Z",
};

describe("summarizeEntry", () => {
  const now = new Date("2026-09-24T05:30:00.000Z");

  it("shows the start of the Note, or of the Quote when there's no Note", () => {
    expect(summarizeEntry({ spark: { ...SPARK, note: "Remember CDC" }, problem: null }, now).text).toBe("Remember CDC");
    expect(summarizeEntry({ spark: SPARK, problem: null }, now).text).toBe(
      "“Debezium is a set of distributed services ... [tha…”",
    );
  });

  it("suggests deleting a copy the Inbox already has in another version", () => {
    expect(summarizeEntry({ spark: SPARK, problem: ALREADY_RECEIVED }, now).advice).toBe(
      "The Inbox already has the first version. Delete this copy unless the change matters.",
    );
    expect(summarizeEntry({ spark: SPARK, problem: "A Spark needs a Note, a Quote, or both." }, now).advice).toBe(
      "Edit it to fix, or delete it.",
    );
    expect(summarizeEntry({ spark: SPARK, problem: null }, now).advice).toBeNull();
  });

  it("shows the domain without www, the age, and any problem", () => {
    expect(summarizeEntry({ spark: SPARK, problem: ALREADY_RECEIVED }, now)).toMatchObject({
      domain: "debezium.io",
      age: "2 h ago",
      problem: "Already received, with different content",
    });
  });

  it.each([
    ["2026-09-24T05:29:40.000Z", "just now"],
    ["2026-09-24T05:25:00.000Z", "5 min ago"],
    ["2026-09-21T05:30:00.000Z", "3 d ago"],
  ])("a Spark captured at %s is %s", (capturedAt, age) => {
    expect(summarizeEntry({ spark: { ...SPARK, captured_at: capturedAt }, problem: null }, now).age).toBe(age);
  });
});

describe("sentence", () => {
  it("ends text with a period unless it already ends a sentence", () => {
    expect(sentence("No server address yet")).toBe("No server address yet.");
    expect(sentence("Is this device on the tailnet?")).toBe("Is this device on the tailnet?");
    expect(sentence("Done.")).toBe("Done.");
  });
});

describe("describeSendResult", () => {
  it("says Sent without promising the Spark is final", () => {
    expect(describeSendResult({ outcome: "sent" })).toEqual({ message: "Sent", tone: "good" });
  });

  it("explains a Spark kept for retry", () => {
    expect(describeSendResult({ outcome: "waiting", problem: "Couldn't reach the server" })).toEqual({
      message: "Couldn't reach the server. Saved in the Outbox; it will retry.",
      tone: "muted",
    });
  });

  it("explains a refused Spark and where to fix it", () => {
    expect(describeSendResult({ outcome: "rejected", problem: "Already received, with different content" })).toEqual({
      message: "The server refused it: Already received, with different content. Fix or delete it in the Outbox below.",
      tone: "bad",
    });
  });
});

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { buildSpark, type Draft, type Page } from "../src/lib/draft";
import { validateSparkBody } from "../src/lib/spark";

const PAGE: Page = {
  url: "https://debezium.io/documentation/reference/stable/architecture.html",
  title: "Debezium Architecture",
  selection: "Debezium records all row-level changes",
  videoSeconds: null,
};
const STAMP = { id: "3f0c1d9e-6a57-4e57-9d64-2b1b4f0f6c11", capturedAt: "2026-09-24T03:12:45.120Z" };

function build(draft: Partial<Draft>, page: Partial<Page> = {}) {
  return buildSpark({ note: "", quote: "", ...draft }, { ...PAGE, ...page }, STAMP);
}

describe("buildSpark", () => {
  it("builds a Spark from the form, the page and the stamp", () => {
    expect(build({ note: "  Remember CDC  ", quote: " Debezium records ... changes\n" })).toEqual({
      ok: true,
      spark: {
        v: 1,
        id: STAMP.id,
        destination: "anki",
        note: "Remember CDC",
        quote: "Debezium records ... changes",
        selection: "Debezium records all row-level changes",
        source: { url: PAGE.url, title: "Debezium Architecture", video_seconds: null },
        captured_at: STAMP.capturedAt,
      },
      body: expect.any(String),
    });
  });

  it("sends empty text as null and drops the Selection when the Quote is cleared", () => {
    const built = build({ note: "Just a note", quote: "   " });
    expect(built).toMatchObject({ ok: true, spark: { note: "Just a note", quote: null, selection: null } });
  });

  it("needs a Note or a Quote", () => {
    expect(build({ note: " ", quote: "" })).toEqual({ ok: false, problem: "Add a Note or a Quote" });
  });

  it("can't quote a page with nothing selected", () => {
    expect(build({ quote: "typed by hand" }, { selection: "" })).toEqual({
      ok: false,
      problem: "Select text on the page to quote it",
    });
  });

  it("keeps a video's playback time, but not a video that hasn't started", () => {
    expect(build({ note: "n" }, { videoSeconds: 754.38 })).toMatchObject({ spark: { source: { video_seconds: 754.38 } } });
    expect(build({ note: "n" }, { videoSeconds: 0 })).toMatchObject({ spark: { source: { video_seconds: null } } });
    expect(build({ note: "n" }, { videoSeconds: Number.NaN })).toMatchObject({ spark: { source: { video_seconds: null } } });
  });

  it("stores a blank page title as null", () => {
    expect(build({ note: "n" }, { title: "  " })).toMatchObject({ spark: { source: { title: null } } });
  });

  it("refuses pages that aren't http or https", () => {
    expect(build({ note: "n" }, { url: "about:reader?url=x" })).toEqual({
      ok: false,
      problem: "Only http and https pages can be Sparked",
    });
  });

  it("refuses a Spark over the size limit and says so", () => {
    const built = build({ quote: "é".repeat(40_000) }, { selection: "é".repeat(40_000) });
    expect(built).toMatchObject({ ok: false, problem: expect.stringMatching(/over the 64 KB limit/) });
  });

  it("produces only bodies that pass validation, or names a problem", () => {
    const text = fc.string({ unit: "grapheme", maxLength: 60 });
    const page = fc.record({
      url: fc.constantFrom("https://example.com/a", "http://localhost/x", "about:blank", "moz-extension://x/p.html"),
      title: text,
      selection: text,
      videoSeconds: fc.option(fc.double(), { nil: null }),
    });
    fc.assert(
      fc.property(fc.record({ note: text, quote: text }), page, (draft, pageInfo) => {
        const built = buildSpark(draft, pageInfo, STAMP);
        if (built.ok) {
          expect(validateSparkBody(built.body)).toEqual({ ok: true, spark: built.spark });
        } else {
          expect(built.problem).not.toBe("");
        }
      }),
    );
  });
});

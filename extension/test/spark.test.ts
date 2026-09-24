import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { validateSparkBody } from "../src/lib/spark";

const FIXTURES = join(import.meta.dirname, "../../spec/fixtures");
// The extension only validates JSON it serialized itself, which can't
// contain a duplicate key. See spec/README.md.
const NOT_APPLICABLE = new Set(["duplicate_key.json"]);

function fixtures(kind: "valid" | "invalid"): [string, string][] {
  return readdirSync(join(FIXTURES, kind))
    .filter((name) => !NOT_APPLICABLE.has(name))
    .map((name) => [name, readFileSync(join(FIXTURES, kind, name), "utf8")]);
}

describe("validateSparkBody", () => {
  it.each(fixtures("valid"))("accepts valid/%s", (_name, body) => {
    expect(validateSparkBody(body)).toMatchObject({ ok: true });
  });

  it.each(fixtures("invalid"))("rejects invalid/%s", (_name, body) => {
    expect(validateSparkBody(body)).toMatchObject({ ok: false });
  });

  it("explains a missing Note and Quote in words", () => {
    const body = readFileSync(join(FIXTURES, "invalid/neither_note_nor_quote.json"), "utf8");
    expect(validateSparkBody(body)).toEqual({ ok: false, problem: "Add a Note or a Quote" });
  });

  it("explains an oversized Spark in kilobytes", () => {
    const body = readFileSync(join(FIXTURES, "invalid/one_byte_over_max_size.json"), "utf8");
    expect(validateSparkBody(body)).toEqual({
      ok: false,
      problem: "This Spark is 65 KB, over the 64 KB limit. Shorten the Quote or Note.",
    });
  });
});

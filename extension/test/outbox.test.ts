import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { type Entry, flush, memoryStore, type Outbox, type OutboxStore } from "../src/lib/outbox";
import type { Attempt } from "../src/lib/send";
import type { Spark } from "../src/lib/spark";

function spark(id: string, note = "a note"): Spark {
  return {
    v: 1,
    id,
    destination: "anki",
    note,
    quote: null,
    selection: null,
    source: { url: "https://example.com", title: null, video_seconds: null },
    captured_at: "2026-09-24T03:12:45.120Z",
  };
}

const ACCEPTED: Attempt = { kind: "accepted", status: "inbox" };
const REJECTED: Attempt = { kind: "rejected", problem: "nope" };
const FAILED: Attempt = { kind: "failed", problem: "down" };

function ids(outbox: Outbox): string[] {
  return outbox.map((entry) => entry.spark.id);
}

async function withSparks(...sparks: Spark[]): Promise<OutboxStore> {
  const store = memoryStore();
  for (const s of sparks) await store.enqueue(s);
  return store;
}

describe("flush", () => {
  it("sends Sparks oldest first and removes the accepted ones", async () => {
    const store = await withSparks(spark("a"), spark("b"));
    const sent: string[] = [];

    await flush(store, async (s) => (sent.push(s.id), ACCEPTED));

    expect(sent).toEqual(["a", "b"]);
    expect(await store.load()).toEqual([]);
  });

  it("stops at the first failure and keeps everything not yet accepted", async () => {
    const store = await withSparks(spark("a"), spark("b"), spark("c"));
    const answers = [ACCEPTED, FAILED];
    const sent: string[] = [];

    await flush(store, async (s) => (sent.push(s.id), answers.shift()!));

    expect(sent).toEqual(["a", "b"]);
    expect(ids(await store.load())).toEqual(["b", "c"]);
  });

  it("marks a rejected Spark with the reason, keeps going, and doesn't resend it", async () => {
    const store = await withSparks(spark("a"), spark("b"));
    await flush(store, async (s) => (s.id === "a" ? REJECTED : ACCEPTED));
    const sent: string[] = [];

    await flush(store, async (s) => (sent.push(s.id), ACCEPTED));

    expect(await store.load()).toEqual([{ spark: spark("a"), problem: "nope" }]);
    expect(sent).toEqual([]);
  });

  it("resends a rejected Spark once it has been edited", async () => {
    const store = await withSparks(spark("a"));
    await flush(store, async () => REJECTED);
    await store.edit(spark("a", "fixed"));
    const sent: Spark[] = [];

    await flush(store, async (s) => (sent.push(s), ACCEPTED));

    expect(sent).toEqual([spark("a", "fixed")]);
    expect(await store.load()).toEqual([]);
  });

  it("reports what happened to each Spark it tried", async () => {
    const store = await withSparks(spark("a"), spark("b"));

    const results = await flush(store, async (s) => (s.id === "a" ? REJECTED : FAILED));

    expect(results).toEqual(new Map<string, Attempt>([["a", REJECTED], ["b", FAILED]]));
  });

  it("keeps a Spark added while a flush is running", async () => {
    const store = await withSparks(spark("a"));

    await flush(store, async (s) => {
      if (s.id !== "a") return FAILED;
      await store.enqueue(spark("late"));
      return ACCEPTED;
    });

    expect(ids(await store.load())).toEqual(["late"]);
  });

  it("keeps an edit made while the old version was being sent", async () => {
    const store = await withSparks(spark("a"));

    await flush(store, async () => {
      await store.edit(spark("a", "edited mid-send"));
      return ACCEPTED;
    });

    expect(await store.load()).toEqual([{ spark: spark("a", "edited mid-send"), problem: null }]);
  });
});

describe("the Outbox under any sequence of events", () => {
  type Event =
    | { kind: "enqueue" }
    | { kind: "edit"; pick: number }
    | { kind: "delete"; pick: number }
    | { kind: "flush"; answers: Attempt[] };

  const event: fc.Arbitrary<Event> = fc.oneof(
    fc.constant({ kind: "enqueue" as const }),
    fc.record({ kind: fc.constant("edit" as const), pick: fc.nat() }),
    fc.record({ kind: fc.constant("delete" as const), pick: fc.nat() }),
    fc.record({
      kind: fc.constant("flush" as const),
      answers: fc.array(fc.constantFrom(ACCEPTED, REJECTED, FAILED), { maxLength: 6 }),
    }),
  );

  it("never loses, duplicates or resends an accepted Spark", async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(event, { maxLength: 30 }), async (events) => {
        const store = memoryStore();
        const expected = new Set<string>();
        const accepted = new Set<string>();
        let next = 0;
        for (const e of events) {
          const current = await store.load();
          const picked: Entry | undefined = current[("pick" in e ? e.pick : 0) % Math.max(current.length, 1)];
          if (e.kind === "enqueue") {
            const id = `s${next++}`;
            await store.enqueue(spark(id));
            expected.add(id);
          } else if (e.kind === "edit" && picked) {
            await store.edit(spark(picked.spark.id, `edited ${next++}`));
          } else if (e.kind === "delete" && picked) {
            await store.remove(picked.spark.id);
            expected.delete(picked.spark.id);
          } else if (e.kind === "flush") {
            const answers = [...e.answers];
            await flush(store, async (s) => {
              expect(accepted.has(s.id)).toBe(false);
              const answer = answers.shift() ?? FAILED;
              if (answer.kind === "accepted") accepted.add(s.id);
              return answer;
            });
          }
          const remaining = ids(await store.load());
          expect(new Set(remaining).size).toBe(remaining.length);
          expect(new Set(remaining)).toEqual(new Set([...expected].filter((id) => !accepted.has(id))));
        }
      }),
    );
  });
});

// The Outbox: Sparks saved on this device that the server hasn't accepted
// yet. Every Send goes through it, so a Spark survives the popup closing,
// the tab closing, and the server being unreachable.

import type { Attempt } from "./send";
import type { Spark } from "./spark";

/** `problem` is the server's reason for rejecting this Spark, if it did. */
export interface Entry {
  spark: Spark;
  problem: string | null;
}

export type Outbox = readonly Entry[];

export interface OutboxStore {
  load(): Promise<Outbox>;
  enqueue(spark: Spark): Promise<void>;
  /** Replaces a queued Spark with an edited version (same id) and clears its problem. */
  edit(spark: Spark): Promise<void>;
  remove(id: string): Promise<void>;
  /** Applies `change` to the latest state; changes run one at a time, in call order. */
  update(change: (outbox: Outbox) => Outbox): Promise<Outbox>;
}

/** Where an OutboxStore keeps its state. */
export interface Backend {
  read(): Promise<Outbox>;
  write(outbox: Outbox): Promise<void>;
}

export function createStore(backend: Backend): OutboxStore {
  let queue: Promise<unknown> = Promise.resolve();
  const update = (change: (outbox: Outbox) => Outbox): Promise<Outbox> => {
    const run = queue.then(async () => {
      const next = change(await backend.read());
      await backend.write(next);
      return next;
    });
    queue = run.catch(() => undefined);
    return run;
  };
  return {
    load: () => update((outbox) => outbox),
    update,
    enqueue: async (spark) => void (await update((outbox) => enqueue(outbox, spark))),
    edit: async (spark) => void (await update((outbox) => edit(outbox, spark))),
    remove: async (id) => void (await update((outbox) => remove(outbox, id))),
  };
}

export function memoryStore(): OutboxStore {
  let state: Outbox = [];
  return createStore({
    read: async () => state,
    write: async (outbox) => {
      state = outbox;
    },
  });
}

/**
 * Sends each Spark without a problem, oldest first, one at a time. Stops at
 * the first failure, since the rest would most likely fail the same way.
 * Returns what happened to each Spark it tried.
 */
export async function flush(
  store: OutboxStore,
  send: (spark: Spark) => Promise<Attempt>,
): Promise<Map<string, Attempt>> {
  const results = new Map<string, Attempt>();
  for (;;) {
    const next = (await store.load()).find((entry) => entry.problem === null && !results.has(entry.spark.id));
    if (!next) break;
    const attempt = await send(next.spark);
    results.set(next.spark.id, attempt);
    await store.update((outbox) => afterAttempt(outbox, next.spark, attempt));
    if (attempt.kind === "failed") break;
  }
  return results;
}

function enqueue(outbox: Outbox, spark: Spark): Outbox {
  return [...remove(outbox, spark.id), { spark, problem: null }];
}

function edit(outbox: Outbox, spark: Spark): Outbox {
  return outbox.map((entry) => (entry.spark.id === spark.id ? { spark, problem: null } : entry));
}

function remove(outbox: Outbox, id: string): Outbox {
  return outbox.filter((entry) => entry.spark.id !== id);
}

/**
 * Records the result of sending `sent`. If the entry was edited while the
 * send was in flight, the result is about stale content and is dropped: the
 * edited version stays queued, and the server will answer it on its own.
 */
function afterAttempt(outbox: Outbox, sent: Spark, attempt: Attempt): Outbox {
  const current = outbox.find((entry) => entry.spark.id === sent.id);
  if (!current || JSON.stringify(current.spark) !== JSON.stringify(sent)) return outbox;
  switch (attempt.kind) {
    case "accepted":
      return remove(outbox, sent.id);
    case "rejected":
      return outbox.map((entry) => (entry === current ? { ...entry, problem: attempt.problem } : entry));
    case "failed":
      return outbox;
  }
}

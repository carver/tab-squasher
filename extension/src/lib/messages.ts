// Messages between the popup, the page chip and the background script.
// The background script owns the Outbox; everything else asks it.

import type { Spark } from "./spark";

export type Message =
  | { type: "send"; spark: Spark; wait: boolean }
  | { type: "edit"; spark: Spark }
  | { type: "delete"; id: string }
  | { type: "flush" }
  | { type: "openSparkTab" };

/**
 * sent:     the server accepted it.
 * saved:    it's in the Outbox; the caller didn't wait to find out more.
 * queued:   it's in the Outbox because the server couldn't take it now.
 * rejected: it's in the Outbox, marked with the server's reason.
 */
export type SendResult =
  | { outcome: "sent" }
  | { outcome: "saved" }
  | { outcome: "queued"; problem: string }
  | { outcome: "rejected"; problem: string };

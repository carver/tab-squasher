// One attempt to hand a Spark to the server.

/**
 * accepted: the server owns the Spark now (201 new, 200 already had it).
 * rejected: the Spark itself is the problem (4xx); resending won't help.
 * failed:   the server or network is; resending later might.
 */
export type Attempt =
  | { kind: "accepted"; status: string }
  | { kind: "rejected"; problem: string }
  | { kind: "failed"; problem: string };

export const ALREADY_RECEIVED = "Already received, with different content";

const SEND_TIMEOUT_MS = 15_000;
/** 4xx answers that mean "not now" rather than "not this Spark". */
const TRY_AGAIN_LATER = new Set([408, 429]);

export async function sendSpark(url: string, body: string, fetchFn: typeof fetch = fetch): Promise<Attempt> {
  let response: Response;
  try {
    response = await fetchFn(`${url}/sparks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
  } catch {
    return { kind: "failed", problem: "Couldn't reach the server" };
  }
  const answer: unknown = await response.json().catch(() => null);
  if (response.ok) {
    return { kind: "accepted", status: field(answer, "status") ?? "unknown" };
  }
  if (response.status === 409) {
    return { kind: "rejected", problem: ALREADY_RECEIVED };
  }
  if (response.status >= 400 && response.status < 500 && !TRY_AGAIN_LATER.has(response.status)) {
    return { kind: "rejected", problem: field(answer, "error") ?? `The server refused it (${response.status})` };
  }
  return { kind: "failed", problem: `The server answered ${response.status}` };
}

function field(answer: unknown, name: string): string | null {
  if (typeof answer !== "object" || answer === null || !(name in answer)) return null;
  const value = (answer as Record<string, unknown>)[name];
  return typeof value === "string" ? value : null;
}

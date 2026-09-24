// Talking to the tab-squasher server: where it is, and whether it answers.

export type ServerUrl = { ok: true; url: string } | { ok: false; problem: string };
export type Health = { ok: true; version: string } | { ok: false; problem: string };

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const HEALTH_TIMEOUT_MS = 5000;

/** Checks and normalizes the server address typed into the options page. */
export function parseServerUrl(input: string): ServerUrl {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return { ok: false, problem: "Enter a full address, like https://laptop.example.ts.net:8443" };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, problem: "Use an https:// address" };
  }
  if (url.protocol === "http:" && !LOCAL_HOSTS.has(url.hostname)) {
    return { ok: false, problem: "Use https:// (plain http:// is only allowed for localhost)" };
  }
  if (url.search || url.hash) {
    return { ok: false, problem: "Leave off the ?query or #fragment" };
  }
  return { ok: true, url: `${url.origin}${url.pathname.replace(/\/+$/, "")}` };
}

/** Asks the server at `url` (as returned by parseServerUrl) whether it's up. */
export async function checkServer(url: string, fetchFn: typeof fetch = fetch): Promise<Health> {
  let response: Response;
  try {
    response = await fetchFn(`${url}/health`, { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) });
  } catch {
    return { ok: false, problem: "Couldn't reach the server. Is this device on the tailnet?" };
  }
  if (!response.ok) {
    return { ok: false, problem: `The server answered ${response.status}` };
  }
  const body: unknown = await response.json().catch(() => null);
  if (!isHealth(body)) {
    return { ok: false, problem: "That address answered, but it isn't a tab-squasher server" };
  }
  return { ok: true, version: body.version };
}

function isHealth(body: unknown): body is { status: "ok"; version: string } {
  return (
    typeof body === "object" &&
    body !== null &&
    "status" in body &&
    body.status === "ok" &&
    "version" in body &&
    typeof body.version === "string"
  );
}

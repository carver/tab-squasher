import { describe, expect, it } from "vitest";

import { checkServer, parseServerUrl } from "../src/lib/server";

describe("parseServerUrl", () => {
  it("accepts a tailnet HTTPS address and drops a trailing slash", () => {
    expect(parseServerUrl("  https://laptop.tail1234.ts.net:8443/ ")).toEqual({
      ok: true,
      url: "https://laptop.tail1234.ts.net:8443",
    });
  });

  it("keeps a path prefix", () => {
    expect(parseServerUrl("https://laptop.tail1234.ts.net/tab-squasher/")).toEqual({
      ok: true,
      url: "https://laptop.tail1234.ts.net/tab-squasher",
    });
  });

  it("allows plain HTTP only on this machine", () => {
    expect(parseServerUrl("http://127.0.0.1:3816")).toEqual({ ok: true, url: "http://127.0.0.1:3816" });
    expect(parseServerUrl("http://localhost:3816")).toEqual({ ok: true, url: "http://localhost:3816" });
    expect(parseServerUrl("http://laptop.tail1234.ts.net:3816")).toEqual({
      ok: false,
      problem: "Use https:// (plain http:// is only allowed for localhost)",
    });
  });

  it.each(["", "laptop:8443", "ftp://laptop.ts.net", "https://laptop.ts.net/?x=1", "https://laptop.ts.net/#top"])(
    "rejects %j",
    (input) => {
      expect(parseServerUrl(input).ok).toBe(false);
    },
  );
});

function respond(status: number, body: unknown): typeof fetch {
  return async () => new Response(JSON.stringify(body), { status });
}

describe("checkServer", () => {
  it("reports the version of a healthy server", async () => {
    const seen: string[] = [];
    const fetchFn: typeof fetch = async (input) => {
      seen.push(String(input));
      return new Response(JSON.stringify({ status: "ok", version: "0.1.0" }));
    };

    expect(await checkServer("https://laptop.ts.net:8443", fetchFn)).toEqual({ ok: true, version: "0.1.0" });
    expect(seen).toEqual(["https://laptop.ts.net:8443/health"]);
  });

  it("explains an error status", async () => {
    expect(await checkServer("https://laptop.ts.net", respond(502, {}))).toEqual({
      ok: false,
      problem: "The server answered 502",
    });
  });

  it("notices something that isn't a tab-squasher server", async () => {
    expect(await checkServer("https://laptop.ts.net", respond(200, { hello: "world" }))).toEqual({
      ok: false,
      problem: "That address answered, but it isn't a tab-squasher server",
    });
  });

  it("explains an unreachable server", async () => {
    const fetchFn: typeof fetch = async () => {
      throw new TypeError("NetworkError when attempting to fetch resource.");
    };

    expect(await checkServer("https://laptop.ts.net", fetchFn)).toEqual({
      ok: false,
      problem: "Couldn't reach the server. Is this device on the tailnet?",
    });
  });
});

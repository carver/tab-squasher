import { describe, expect, it } from "vitest";

import { sendSpark } from "../src/lib/send";

const URL = "https://laptop.ts.net:8443";
const BODY = '{"id":"x"}';

function answer(status: number, body: unknown): typeof fetch {
  return async () => new Response(JSON.stringify(body), { status });
}

describe("sendSpark", () => {
  it("posts the body as JSON to /sparks", async () => {
    const requests: { url: string; init: RequestInit | undefined }[] = [];
    const fetchFn: typeof fetch = async (input, init) => {
      requests.push({ url: String(input), init });
      return new Response(JSON.stringify({ id: "x", status: "inbox" }), { status: 201 });
    };

    await sendSpark(URL, BODY, fetchFn);

    expect(requests).toEqual([
      {
        url: `${URL}/sparks`,
        init: expect.objectContaining({ method: "POST", body: BODY, headers: { "content-type": "application/json" } }),
      },
    ]);
  });

  it.each([201, 200])("treats %i as accepted and passes on where the Spark went", async (status) => {
    expect(await sendSpark(URL, BODY, answer(status, { id: "x", status: "inbox" }))).toEqual({
      kind: "accepted",
      status: "inbox",
    });
  });

  it("passes on the server's reason for refusing an invalid Spark", async () => {
    expect(await sendSpark(URL, BODY, answer(400, { error: "A Spark needs a Note, a Quote, or both." }))).toEqual({
      kind: "rejected",
      problem: "A Spark needs a Note, a Quote, or both.",
    });
  });

  it("explains a conflict as a different Spark already received", async () => {
    expect(await sendSpark(URL, BODY, answer(409, { error: "..." }))).toEqual({
      kind: "rejected",
      problem: "Already received, with different content",
    });
  });

  it("treats server errors as worth retrying", async () => {
    expect(await sendSpark(URL, BODY, answer(502, {}))).toEqual({
      kind: "failed",
      problem: "The server answered 502",
    });
  });

  it("treats an unreachable server as worth retrying", async () => {
    const fetchFn: typeof fetch = async () => {
      throw new TypeError("NetworkError when attempting to fetch resource.");
    };
    expect(await sendSpark(URL, BODY, fetchFn)).toEqual({ kind: "failed", problem: "Couldn't reach the server" });
  });
});

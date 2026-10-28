/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { describe, expect, it, vi } from "vitest";
import { FalClient, testFalKey } from "./fal";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const QUEUED = {
  request_id: "req-1",
  status_url: "https://queue.fal.run/fal-ai/flux/requests/req-1/status",
  response_url: "https://queue.fal.run/fal-ai/flux/requests/req-1",
  cancel_url: "https://queue.fal.run/fal-ai/flux/requests/req-1/cancel",
};

async function submitted(...responses: Response[]) {
  const fetchFn = vi.fn<typeof fetch>();
  fetchFn.mockResolvedValueOnce(json(QUEUED));
  for (const response of responses) fetchFn.mockResolvedValueOnce(response);
  const client = new FalClient(async () => "fal-secret-key", fetchFn);
  await client.submit("fal-ai/flux", { prompt: "a cat" });
  return { client, fetchFn };
}

describe("FalClient edge cases", () => {
  it.each([
    "https://evil.test/x",
    "../admin",
    "fal-ai/../../x",
    "",
    "fal-ai/flux?x=1",
    "fal-ai\\flux",
    "/fal-ai/flux",
  ])("rejects the endpoint %j without a request", async (endpoint) => {
    const fetchFn = vi.fn<typeof fetch>();
    const client = new FalClient(async () => "k", fetchFn);
    await expect(client.submit(endpoint, {})).rejects.toThrow(/Invalid fal.ai endpoint/);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("rejects a submit reply without the job urls and remembers nothing", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(json({ request_id: "req-x" }));
    const client = new FalClient(async () => "k", fetchFn);
    await expect(client.submit("fal-ai/flux", {})).rejects.toThrow(/did not return a request id/);
    await expect(client.poll("req-x")).rejects.toThrow(/Unknown fal.ai request/);
  });

  it("keeps jobs per client only (session memory, no persistence)", async () => {
    await submitted();
    const fresh = new FalClient(async () => "k", vi.fn<typeof fetch>());
    await expect(fresh.poll("req-1")).rejects.toThrow("Unknown fal.ai request: req-1");
  });

  it("sends no body on poll and cancel, but the auth header on both", async () => {
    const { client, fetchFn } = await submitted(json({ status: "IN_PROGRESS" }), json({}, 202));
    await client.poll("req-1");
    await client.cancel("req-1");
    for (const call of fetchFn.mock.calls.slice(1)) {
      expect(call[1]?.body).toBeUndefined();
      expect(call[1]?.headers).toMatchObject({ Authorization: "Key fal-secret-key" });
    }
  });

  it("serializes a structured job error", async () => {
    const { client } = await submitted(json({ status: "COMPLETED", error: { detail: "bad prompt" } }));
    expect(await client.poll("req-1")).toEqual({ status: "COMPLETED", error: '{"detail":"bad prompt"}' });
  });

  it("omits queuePosition when the server sends a non-number", async () => {
    const { client } = await submitted(json({ status: "IN_QUEUE", queue_position: "3" }));
    expect(await client.poll("req-1")).toEqual({ status: "IN_QUEUE" });
  });

  it("reports queue position 0", async () => {
    const { client } = await submitted(json({ status: "IN_QUEUE", queue_position: 0 }));
    expect(await client.poll("req-1")).toEqual({ status: "IN_QUEUE", queuePosition: 0 });
  });

  it("returns no files for a completed job with an empty result", async () => {
    const { client } = await submitted(json({ status: "COMPLETED" }), json({}));
    expect(await client.poll("req-1")).toEqual({ status: "COMPLETED", files: [] });
  });

  it("defaults the content type and file name, and skips entries without a url", async () => {
    const { client } = await submitted(
      json({ status: "COMPLETED" }),
      json({
        images: [{ url: "https://cdn.test/path/out.png" }, { content_type: "image/png" }, null, { url: 42 }],
        video: { url: "https://cdn.test/clip.mp4", content_type: 5 },
        audio: "not-an-object",
      }),
    );
    expect((await client.poll("req-1")).files).toEqual([
      { url: "https://cdn.test/path/out.png", contentType: "application/octet-stream", fileName: "out.png" },
      { url: "https://cdn.test/clip.mp4", contentType: "application/octet-stream", fileName: "clip.mp4" },
    ]);
  });

  it("ignores a non-array images field", async () => {
    const { client } = await submitted(json({ status: "COMPLETED" }), json({ images: { url: "https://cdn.test/a.png" } }));
    expect((await client.poll("req-1")).files).toEqual([]);
  });

  it("surfaces an HTTP error on poll with the fal detail", async () => {
    const { client } = await submitted(json({ detail: "Request not found" }, 404));
    await expect(client.poll("req-1")).rejects.toThrow("fal.ai request failed (404): Request not found");
  });

  it("surfaces a non-JSON error body as text", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(new Response("Bad Gateway", { status: 502 }));
    const client = new FalClient(async () => "k", fetchFn);
    await expect(client.submit("fal-ai/flux", {})).rejects.toThrow("fal.ai request failed (502): Bad Gateway");
  });

  it("propagates an offline (network) failure", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("fetch failed"));
    const client = new FalClient(async () => "k", fetchFn);
    await expect(client.submit("fal-ai/flux", {})).rejects.toThrow("fetch failed");
  });

  it("surfaces a failed cancel", async () => {
    const { client } = await submitted(json({ detail: "Already completed" }, 400));
    await expect(client.cancel("req-1")).rejects.toThrow(/Already completed/);
  });

  it("never puts the key in an error message", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(json({ detail: "nope" }, 401));
    const client = new FalClient(async () => "fal-secret-key", fetchFn);
    const error = (await client.submit("fal-ai/flux", {}).catch((e: unknown) => e)) as Error;
    expect(error.message).not.toContain("fal-secret-key");
  });

  it("does not call fetch for poll or cancel once the key is missing", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValueOnce(json(QUEUED));
    let haveKey = true;
    const client = new FalClient(async () => {
      if (!haveKey) throw new Error("MISSING_KEY: x");
      return "k";
    }, fetchFn);
    await client.submit("fal-ai/flux", {});
    haveKey = false;
    await expect(client.poll("req-1")).rejects.toThrow(/^MISSING_KEY: /);
    await expect(client.cancel("req-1")).rejects.toThrow(/^MISSING_KEY: /);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});

describe("testFalKey edge cases", () => {
  it("uses an authenticated request against the fal queue host", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(json({}, 404));
    await testFalKey("k", fetchFn);
    expect(String(fetchFn.mock.calls[0]![0])).toMatch(/^https:\/\/queue\.fal\.run\//);
  });

  it("reports an offline failure as ok:false with the reason", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("fetch failed"));
    expect(await testFalKey("k", fetchFn)).toEqual({ ok: false, error: "fetch failed" });
  });

  it.each([200, 404, 422, 500])("treats status %i as an accepted key (only 401/403 reject)", async (status) => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(json({}, status));
    expect(await testFalKey("k", fetchFn)).toEqual({ ok: true });
  });

  it("does not echo the key in the rejection", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(json({}, 401));
    const result = await testFalKey("fal-secret-key", fetchFn);
    expect(result.ok).toBe(false);
    expect(result.error).not.toContain("fal-secret-key");
    expect(result.error).not.toMatch(/\b(LTX|Lightricks)\b/i);
  });
});

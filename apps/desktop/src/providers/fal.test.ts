/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { describe, expect, it, vi } from "vitest";
import { missingKey } from "@hypergen/dapi";
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
  const client = new FalClient(async () => "fal-key", fetchFn);
  await client.submit("fal-ai/flux", { prompt: "a cat" });
  return { client, fetchFn };
}

describe("FalClient", () => {
  it("submits to the queue with the key and the input as body", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(json(QUEUED));
    const client = new FalClient(async () => "fal-key", fetchFn);
    expect(await client.submit("fal-ai/flux/dev", { prompt: "a cat" })).toEqual({ requestId: "req-1" });
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe("https://queue.fal.run/fal-ai/flux/dev");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({ Authorization: "Key fal-key", "Content-Type": "application/json" });
    expect(JSON.parse(init?.body as string)).toEqual({ prompt: "a cat" });
  });

  it("reports a queued job with its position", async () => {
    const { client, fetchFn } = await submitted(json({ status: "IN_QUEUE", queue_position: 3 }));
    expect(await client.poll("req-1")).toEqual({ status: "IN_QUEUE", queuePosition: 3 });
    expect(fetchFn.mock.calls[1]![0]).toBe(QUEUED.status_url);
    expect(fetchFn.mock.calls[1]![1]?.method).toBe("GET");
  });

  it("reports a running job", async () => {
    const { client } = await submitted(json({ status: "IN_PROGRESS" }));
    expect(await client.poll("req-1")).toEqual({ status: "IN_PROGRESS" });
  });

  it("collects the files of a completed job from images, video and audio", async () => {
    const { client, fetchFn } = await submitted(
      json({ status: "COMPLETED" }),
      json({
        images: [
          { url: "https://cdn.test/a.png", content_type: "image/png", file_name: "a.png" },
          { url: "https://cdn.test/b.jpg", content_type: "image/jpeg", file_name: "b.jpg" },
        ],
        video: { url: "https://cdn.test/v.mp4", content_type: "video/mp4", file_name: "v.mp4" },
        audio: { url: "https://cdn.test/s.wav", content_type: "audio/wav", file_name: "s.wav" },
      }),
    );
    expect(await client.poll("req-1")).toEqual({
      status: "COMPLETED",
      files: [
        { url: "https://cdn.test/a.png", contentType: "image/png", fileName: "a.png" },
        { url: "https://cdn.test/b.jpg", contentType: "image/jpeg", fileName: "b.jpg" },
        { url: "https://cdn.test/v.mp4", contentType: "video/mp4", fileName: "v.mp4" },
        { url: "https://cdn.test/s.wav", contentType: "audio/wav", fileName: "s.wav" },
      ],
    });
    expect(fetchFn.mock.calls[2]![0]).toBe(QUEUED.response_url);
  });

  it("collects a single image", async () => {
    const { client } = await submitted(
      json({ status: "COMPLETED" }),
      json({ image: { url: "https://cdn.test/one.png", content_type: "image/png", file_name: "one.png" } }),
    );
    expect((await client.poll("req-1")).files).toEqual([
      { url: "https://cdn.test/one.png", contentType: "image/png", fileName: "one.png" },
    ]);
  });

  it("reports a failed job without fetching its result", async () => {
    const { client, fetchFn } = await submitted(json({ status: "COMPLETED", error: "NSFW content detected" }));
    expect(await client.poll("req-1")).toEqual({ status: "COMPLETED", error: "NSFW content detected" });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("cancels with a PUT to the cancel url", async () => {
    const { client, fetchFn } = await submitted(json({ status: "CANCELLATION_REQUESTED" }, 202));
    await client.cancel("req-1");
    expect(fetchFn.mock.calls[1]![0]).toBe(QUEUED.cancel_url);
    expect(fetchFn.mock.calls[1]![1]?.method).toBe("PUT");
  });

  it("rejects an unknown request id", async () => {
    const fetchFn = vi.fn<typeof fetch>();
    const client = new FalClient(async () => "fal-key", fetchFn);
    await expect(client.poll("nope")).rejects.toThrow("Unknown fal.ai request: nope");
    await expect(client.cancel("nope")).rejects.toThrow("Unknown fal.ai request: nope");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("surfaces an HTTP error", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(json({ detail: "Invalid input" }, 422));
    const client = new FalClient(async () => "fal-key", fetchFn);
    await expect(client.submit("fal-ai/flux", {})).rejects.toThrow("fal.ai request failed (422): Invalid input");
  });

  it("fails with MISSING_KEY and no request when there is no key", async () => {
    const fetchFn = vi.fn<typeof fetch>();
    const message = `MISSING_KEY: ${missingKey("fal").message}`;
    const client = new FalClient(async () => { throw new Error(message); }, fetchFn);
    await expect(client.submit("fal-ai/flux", {})).rejects.toThrow(message);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe("testFalKey", () => {
  it.each([401, 403])("reports a key rejected with %i", async (status) => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(json({}, status));
    expect(await testFalKey("bad", fetchFn)).toMatchObject({ ok: false });
    expect(fetchFn.mock.calls[0]![1]?.headers).toMatchObject({ Authorization: "Key bad" });
  });

  it("accepts a key the server does not reject", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(json({}, 404));
    expect(await testFalKey("good", fetchFn)).toEqual({ ok: true });
  });
});

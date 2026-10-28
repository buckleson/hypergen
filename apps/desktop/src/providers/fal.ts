/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// fal.ai's queue API with the user's key: submit a job, poll it, collect its
// files. Jobs are remembered for this session only (ADR-015).

import type { KeyTestResult } from "./keys";

const QUEUE_URL = "https://queue.fal.run";
const ENDPOINT = /^[\w.-]+(\/[\w.-]+)*$/;

export type FalStatus = "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED";
export type FalFile = { url: string; contentType: string; fileName: string };
export type FalPollResult = { status: FalStatus; queuePosition?: number; error?: string; files?: FalFile[] };

type Job = { status_url: string; response_url: string; cancel_url: string };
type RawFile = { url?: unknown; content_type?: unknown; file_name?: unknown };

export class FalClient {
  private readonly jobs = new Map<string, Job>();
  private readonly key: () => Promise<string>;
  private readonly fetchFn: typeof fetch;

  constructor(key: () => Promise<string>, fetchFn: typeof fetch = fetch) {
    this.key = key;
    this.fetchFn = fetchFn;
  }

  async submit(endpoint: string, input: Record<string, unknown>): Promise<{ requestId: string }> {
    if (!ENDPOINT.test(endpoint) || /(^|\/)\.\.?(\/|$)/.test(endpoint)) throw new Error(`Invalid fal.ai endpoint: ${endpoint}`);
    const body = await this.request(`${QUEUE_URL}/${endpoint}`, "POST", input);
    const { request_id, status_url, response_url, cancel_url } = body as Record<string, string>;
    if (!request_id || !status_url || !response_url || !cancel_url) {
      throw new Error("fal.ai did not return a request id.");
    }
    this.jobs.set(request_id, { status_url, response_url, cancel_url });
    return { requestId: request_id };
  }

  async poll(requestId: string): Promise<FalPollResult> {
    const job = this.job(requestId);
    const body = (await this.request(job.status_url, "GET")) as {
      status: FalStatus;
      queue_position?: number;
      error?: unknown;
    };
    const result: FalPollResult = { status: body.status };
    if (typeof body.queue_position === "number") result.queuePosition = body.queue_position;
    if (body.error) result.error = typeof body.error === "string" ? body.error : JSON.stringify(body.error);
    if (body.status === "COMPLETED" && !result.error) {
      result.files = collectFiles(await this.request(job.response_url, "GET"));
    }
    return result;
  }

  async cancel(requestId: string): Promise<void> {
    await this.request(this.job(requestId).cancel_url, "PUT");
  }

  private job(requestId: string): Job {
    const job = this.jobs.get(requestId);
    if (!job) throw new Error(`Unknown fal.ai request: ${requestId}`);
    return job;
  }

  private async request(url: string, method: string, body?: unknown): Promise<unknown> {
    const key = await this.key();
    const response = await this.fetchFn(url, {
      method,
      headers: { Authorization: `Key ${key}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`fal.ai request failed (${response.status}): ${await errorText(response)}`);
    return response.json();
  }
}

/**
 * Whether fal.ai accepts `key`. Asks for the status of a request that does not
 * exist: checked by hand to answer 401 for a bad key (403 for a disabled one),
 * and anything else for a good one, without starting a job.
 */
export async function testFalKey(key: string, fetchFn: typeof fetch = fetch): Promise<KeyTestResult> {
  try {
    const response = await fetchFn(`${QUEUE_URL}/fal-ai/fast-sdxl/requests/00000000-0000-0000-0000-000000000000/status`, {
      headers: { Authorization: `Key ${key}` },
    });
    if (response.status === 401 || response.status === 403) {
      return { ok: false, error: `fal.ai rejected the key (${response.status}).` };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

function collectFiles(body: unknown): FalFile[] {
  const output = (body ?? {}) as { images?: unknown; image?: unknown; video?: unknown; audio?: unknown };
  const raw = [...(Array.isArray(output.images) ? output.images : []), output.image, output.video, output.audio];
  return raw.flatMap((file) => {
    const { url, content_type, file_name } = (file ?? {}) as RawFile;
    if (typeof url !== "string") return [];
    return [{
      url,
      contentType: typeof content_type === "string" ? content_type : "application/octet-stream",
      fileName: typeof file_name === "string" ? file_name : (url.split("/").pop() ?? "file"),
    }];
  });
}

async function errorText(response: Response): Promise<string> {
  const text = await response.text().catch(() => "");
  try {
    const parsed = JSON.parse(text) as { detail?: unknown; error?: { message?: unknown } };
    if (typeof parsed.detail === "string") return parsed.detail;
    if (typeof parsed.error?.message === "string") return parsed.error.message;
  } catch { }
  return text || response.statusText;
}

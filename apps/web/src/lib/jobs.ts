/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Generation jobs on fal.ai with the user's key: everything that produces a
 * file is one submit through the main process, then polled until it ends.
 * Jobs are kept for this session only (ADR-015).
 */

import { DapiError, HYPERGEN_MODELS, missingKey, toFalInput } from "@hypergen/dapi";

import { falCancel, falPoll, falSubmit, keyStatus } from "./providers";

import type { Job, ModelRequest } from "@hypergen/dapi";
import type { FalPollResult } from "@desktop/main-channels";

/** How often a running job is asked for its state. */
const POLL_INTERVAL = 1000;

/** How many polls in a row may fail before the job is given up on. */
const MAX_FAILURES = 5;

/** Every job started this session, by id, as last seen. */
const jobs = new Map<string, Job>();

export const isTerminal = (job: Job): boolean =>
  job.status === "succeeded" || job.status === "failed" || job.status === "canceled";

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** A job started this session, as last seen; undefined for one this session does not know. */
export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}

/** Cancels a job that has not ended; answers with the job as it stands. */
export async function cancelJob(id: string): Promise<Job | undefined> {
  const job = jobs.get(id);
  if (!job || isTerminal(job)) return job;
  await falCancel(id).catch(() => {});
  const canceled: Job = { ...job, status: "canceled", phase: null, etaRemainingSeconds: null, error: { code: "CANCELED", message: "The generation was canceled." } };
  jobs.set(id, canceled);
  return canceled;
}

/** A fal status as the fields of a `Job`. */
function fromFal(result: FalPollResult): Partial<Job> {
  switch (result.status) {
    case "IN_QUEUE":
      return { status: "queued" };
    case "IN_PROGRESS":
      return { status: "running" };
    case "COMPLETED":
      return result.error
        ? { status: "failed", error: { code: "FAILED", message: result.error } }
        : {
            status: "succeeded",
            assets: (result.files ?? []).map((file) => ({ url: file.url, filename: file.fileName, mimeType: file.contentType })),
          };
  }
}

/**
 * Starts a job for `request` and follows it to its end. `onUpdate` hears
 * every state the job is seen in, the first one included. Resolves with the
 * job as it ended — failed and canceled jobs included, which say why in
 * `error`; rejects only when the job could not be started or followed. When
 * `signal` aborts, the job is canceled and the abort reason thrown.
 */
export async function runJob(request: ModelRequest, onUpdate: (job: Job) => void, signal?: AbortSignal): Promise<Job> {
  const model = HYPERGEN_MODELS[request.model];
  if (!model) throw new DapiError("invalid-input", `Unknown model: ${request.model}`);
  if (!(await keyStatus()).fal) throw missingKey("fal");

  const { endpoint, input } = toFalInput(request);
  const { requestId: id } = await falSubmit(endpoint, input);
  const update = (fields: Partial<Job>) => {
    const job = { ...jobs.get(id)!, ...fields };
    jobs.set(id, job);
    onUpdate(job);
  };
  jobs.set(id, {
    id,
    model: request.model,
    request,
    status: "queued",
    etaSeconds: model.etaSeconds,
    etaRemainingSeconds: null,
    phase: null,
    progress: null,
    assets: [],
    error: null,
    createdAt: new Date().toISOString(),
  });
  update({});

  let failures = 0;
  while (!isTerminal(jobs.get(id)!)) {
    await sleep(POLL_INTERVAL);
    if (signal?.aborted) {
      await cancelJob(id);
      signal.throwIfAborted();
    }
    try {
      const result = await falPoll(id);
      failures = 0;
      // Canceled while the poll was out.
      if (isTerminal(jobs.get(id)!)) break;
      update(fromFal(result));
    } catch (error) {
      if (++failures >= MAX_FAILURES) {
        update({ status: "failed", error: { code: "FAILED", message: error instanceof Error ? error.message : String(error) } });
        throw error;
      }
    }
  }
  return jobs.get(id)!;
}

/** Why a job did not succeed, in a sentence for the user. */
export function jobFailure(job: Job): string {
  if (job.status === "canceled") return "The generation was canceled.";
  return job.error?.message || "The generation failed.";
}

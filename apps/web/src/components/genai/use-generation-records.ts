/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// How the selection was generated. A generated asset keeps the id of the job
// it came from (`Asset.job`); the job is this session's account of the run —
// what it was asked, which "Rerun" and "Reuse" work from. Jobs are kept for
// the session only (ADR-015), so an asset generated earlier has none.

import { createMemo } from "solid-js";
import { getJob } from "@/lib/jobs";
import { useMediaSelection } from "./selection";
import { toConfig } from "./requests";

import type { Job } from "@hypergen/dapi";
import type { GenerationConfig } from "./types";

export function useGenerationRecords() {
  const { media } = useMediaSelection();

  const jobIds = createMemo(
    () => [...new Set(media().map((entry) => entry.asset?.job).filter((id) => id !== undefined))],
    undefined,
    { equals: (a, b) => a.length === b.length && a.every((id, index) => id === b[index]) },
  );

  const jobs = createMemo(() => jobIds().map(getJob).filter((job) => job !== undefined));

  const isGenerated = createMemo(() => jobIds().length > 0);

  /** The job behind the first generated asset of the selection, when this session ran it. */
  const firstJob = (): Job | undefined => jobs()[0];

  /** The prompt box's settings for that job, when the prompt box makes such requests. */
  const firstConfig = (): GenerationConfig | undefined => {
    const job = firstJob();
    return job ? toConfig(job.request) : undefined;
  };

  return { isGenerated, firstJob, firstConfig };
}

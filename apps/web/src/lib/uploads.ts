/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Getting a file to where a model can read it: fal.ai takes a file inline,
 * as a data: URI in the request, so nothing is uploaded ahead of the job.
 */

import { DapiError } from "@hypergen/dapi";

/** The largest file a request carries inline. */
const MAX_BYTES = 10 * 1024 * 1024;

/** Lowercase hex sha256 of `blob`'s bytes. */
export async function sha256(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** `blob` as a data: URI, for a request field that takes a file. */
export async function uploadFile(blob: Blob): Promise<string> {
  if (blob.size > MAX_BYTES) {
    throw new DapiError(
      "invalid-input",
      `The file is ${(blob.size / 1024 / 1024).toFixed(1)} MB; a file sent to a model can be at most 10 MB.`,
    );
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return `data:${blob.type || "application/octet-stream"};base64,${btoa(binary)}`;
}

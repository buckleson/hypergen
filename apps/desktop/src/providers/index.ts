/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { mainBridge } from "../main-manager";
import { MAIN_CHANNELS } from "../main-channels";
import { FalClient, testFalKey } from "./fal";
import { generateWithGemini, testGeminiKey } from "./gemini";
import { KeyStore } from "./keys";

/** Serves the AI provider channels, with keys kept in `keysPath`. */
export function registerProviderHandlers(keysPath: string): void {
  const keys = new KeyStore(keysPath);
  const fal = new FalClient(() => keys.require("fal"));

  mainBridge.handle(MAIN_CHANNELS.PROVIDERS_KEYS_STATUS, () => keys.status());
  mainBridge.handle(MAIN_CHANNELS.PROVIDERS_KEYS_SET, ({ provider, key }) => keys.set(provider, key));
  mainBridge.handle(MAIN_CHANNELS.PROVIDERS_KEYS_REMOVE, ({ provider }) => keys.remove(provider));
  mainBridge.handle(MAIN_CHANNELS.PROVIDERS_KEYS_TEST, async ({ provider }) => {
    let key: string;
    try {
      key = await keys.require(provider);
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    }
    return provider === "gemini" ? testGeminiKey(key) : testFalKey(key);
  });
  mainBridge.handle(MAIN_CHANNELS.PROVIDERS_FAL_SUBMIT, ({ endpoint, input }) => fal.submit(endpoint, input));
  mainBridge.handle(MAIN_CHANNELS.PROVIDERS_FAL_POLL, ({ requestId }) => fal.poll(requestId));
  mainBridge.handle(MAIN_CHANNELS.PROVIDERS_FAL_CANCEL, ({ requestId }) => fal.cancel(requestId));
  mainBridge.handle(MAIN_CHANNELS.PROVIDERS_GEMINI_GENERATE, (request) =>
    generateWithGemini(() => keys.require("gemini"), request),
  );
}

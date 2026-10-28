/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { fromWireError } from "@hypergen/dapi";
import { MAIN_CHANNELS } from "@desktop/main-channels";
import type { MainRequestChannel, MainRequestMap, Provider } from "@desktop/main-channels";

import { mainBridge } from "@/lib/ipc";

type Request<C extends MainRequestChannel> = MainRequestMap[C]["request"];
type Response<C extends MainRequestChannel> = Promise<MainRequestMap[C]["response"]>;

// Keys live only in the main process; a missing one comes back as a `MISSING_KEY` DapiError.
async function call<C extends MainRequestChannel>(channel: C, data: Request<C>): Response<C> {
  try {
    return await mainBridge.call(channel, data);
  } catch (error) {
    throw fromWireError(error instanceof Error ? error.message : String(error));
  }
}

export const keyStatus = () => call(MAIN_CHANNELS.PROVIDERS_KEYS_STATUS, undefined);

export const setKey = (provider: Provider, key: string) => call(MAIN_CHANNELS.PROVIDERS_KEYS_SET, { provider, key });

export const removeKey = (provider: Provider) => call(MAIN_CHANNELS.PROVIDERS_KEYS_REMOVE, { provider });

export const testKey = (provider: Provider) => call(MAIN_CHANNELS.PROVIDERS_KEYS_TEST, { provider });

export const falSubmit = (endpoint: string, input: Record<string, unknown>) =>
  call(MAIN_CHANNELS.PROVIDERS_FAL_SUBMIT, { endpoint, input });

export const falPoll = (requestId: string) => call(MAIN_CHANNELS.PROVIDERS_FAL_POLL, { requestId });

export const falCancel = (requestId: string) => call(MAIN_CHANNELS.PROVIDERS_FAL_CANCEL, { requestId });

export const geminiGenerate = (prompt: string, media: Request<typeof MAIN_CHANNELS.PROVIDERS_GEMINI_GENERATE>["media"]) =>
  call(MAIN_CHANNELS.PROVIDERS_GEMINI_GENERATE, { prompt, media });

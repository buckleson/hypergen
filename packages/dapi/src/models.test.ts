/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { describe, expect, it } from "vitest";
import { HYPERGEN_MODELS, MODEL_IDS, toFalInput } from "./models";
import { LOCAL_MODEL_IDS } from "./local";
import { DapiError, fromWireError, missingKey } from "./errors";

describe("Hypergen models", () => {
  it("have unique ids, none a local model's", () => {
    expect(new Set(MODEL_IDS).size).toBe(MODEL_IDS.length);
    expect(Object.keys(HYPERGEN_MODELS)).toEqual([...MODEL_IDS]);
    expect(MODEL_IDS.filter((id) => (LOCAL_MODEL_IDS as string[]).includes(id))).toEqual([]);
  });

  it("name well-formed, distinct fal endpoints", () => {
    for (const model of Object.values(HYPERGEN_MODELS)) {
      expect(new Set(model.endpoints).size).toBe(model.endpoints.length);
      for (const endpoint of model.endpoints) expect(endpoint).toMatch(/^[a-z0-9-]+\/[\w./-]+$/);
      expect(model.etaSeconds).toBeGreaterThan(0);
    }
  });

  it("send nano-banana-pro to /edit only when given images", () => {
    expect(toFalInput({ model: "nano-banana-pro", prompt: "a fox", aspectRatio: "16:9", count: 2 })).toEqual({
      endpoint: "fal-ai/nano-banana-pro",
      input: { prompt: "a fox", aspect_ratio: "16:9", num_images: 2 },
    });
    expect(toFalInput({ model: "nano-banana-pro", prompt: "a fox", images: ["https://x.test/a.png"], resolution: "2K" })).toEqual({
      endpoint: "fal-ai/nano-banana-pro/edit",
      input: { prompt: "a fox", image_urls: ["https://x.test/a.png"], resolution: "2K" },
    });
  });

  it("send kling to image-to-video when given a start frame", () => {
    expect(toFalInput({ model: "kling-v3-pro", prompt: "a fox", duration: 5 }).endpoint).toBe("fal-ai/kling-video/v3/pro/text-to-video");
    expect(toFalInput({ model: "kling-v3-pro", prompt: "a fox", startFrame: "https://x.test/a.png", duration: 5 })).toEqual({
      endpoint: "fal-ai/kling-video/v3/pro/image-to-video",
      input: { prompt: "a fox", start_image_url: "https://x.test/a.png", duration: "5" },
    });
  });

  it("call only endpoints the model lists", () => {
    const requests = [
      { prompt: "a fox" },
      { prompt: "a fox", images: ["https://x.test/a.png"], startFrame: "https://x.test/a.png", image: "https://x.test/a.png", video: "https://x.test/a.mp4" },
    ];
    for (const model of MODEL_IDS) {
      for (const request of requests) expect(HYPERGEN_MODELS[model].endpoints).toContain(toFalInput({ model, ...request }).endpoint);
    }
  });
});

describe("MISSING_KEY", () => {
  it("names where to add the key", () => {
    const fal = missingKey("fal");
    expect(fal).toBeInstanceOf(DapiError);
    expect(fal.code).toBe("MISSING_KEY");
    expect(fal.message).toBe("Add your fal.ai API key in Hypergen > Settings > AI providers.");
    expect(missingKey("gemini").message).toBe("Add your Gemini API key in Hypergen > Settings > AI providers.");
  });

  it("comes back from the main process as the same error", () => {
    const error = fromWireError(`MISSING_KEY: ${missingKey("gemini").message}`);
    expect(error).toBeInstanceOf(DapiError);
    expect(error).toMatchObject({ code: "MISSING_KEY", message: missingKey("gemini").message });
    const other = fromWireError("network down");
    expect(other).not.toBeInstanceOf(DapiError);
    expect(other.message).toBe("network down");
  });
});

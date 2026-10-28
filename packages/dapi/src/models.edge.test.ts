/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { describe, expect, it } from "vitest";
import { HYPERGEN_MODELS, MODEL_IDS, REQUEST_FIELDS, toFalInput, type GenerateRequest } from "./models";
import { LOCAL_MODEL_IDS } from "./local";
import * as dapi from "./index";

const IMG = "https://x.test/a.png";
const IMG2 = "https://x.test/b.png";
const VID = "https://x.test/a.mp4";

/** Every request field set, so a model's mapping can be checked for what it drops. */
const FULL: Omit<GenerateRequest, "model"> = {
  prompt: "a fox",
  images: [IMG],
  aspectRatio: "16:9",
  resolution: "1080p",
  duration: 5,
  count: 2,
  voice: "Rachel",
  startFrame: IMG,
  endFrame: IMG2,
  image: IMG,
  video: VID,
};

describe("catalog shape", () => {
  it("has 10-12 models with slug ids", () => {
    expect(MODEL_IDS.length).toBeGreaterThanOrEqual(10);
    expect(MODEL_IDS.length).toBeLessThanOrEqual(12);
    for (const id of MODEL_IDS) expect(id).toMatch(/^[a-z0-9][a-z0-9.-]*$/);
  });

  it("never collides with local model ids, case-insensitively", () => {
    const local = new Set((LOCAL_MODEL_IDS as string[]).map((id) => id.toLowerCase()));
    expect(local.has("sam-2.1")).toBe(true);
    for (const id of MODEL_IDS) expect(local.has(id.toLowerCase())).toBe(false);
  });

  it("uses each fal endpoint in at most one model", () => {
    const all = Object.values(HYPERGEN_MODELS).flatMap((model) => model.endpoints);
    expect(new Set(all).size).toBe(all.length);
  });

  it("gives every model a positive whole etaSeconds, a name, and only known resolutions", () => {
    const known = ["1K", "2K", "4K", "480p", "720p", "1080p", "1440p", "2160p"];
    for (const model of Object.values(HYPERGEN_MODELS)) {
      expect(Number.isInteger(model.etaSeconds)).toBe(true);
      expect(model.etaSeconds).toBeGreaterThan(0);
      expect(model.name.trim()).not.toBe("");
      for (const resolution of model.resolutions ?? []) expect(known).toContain(resolution);
    }
  });

  it("covers the required kinds", () => {
    const kinds = new Set(Object.values(HYPERGEN_MODELS).map((model) => model.kind));
    for (const kind of ["image", "video", "speech", "background-removal", "upscale"]) expect(kinds.has(kind as never)).toBe(true);
  });

  it("lists no endpoint with a scheme, host, Windows separator or whitespace", () => {
    for (const model of Object.values(HYPERGEN_MODELS)) {
      for (const endpoint of model.endpoints) expect(endpoint).not.toMatch(/https?:|\\|\s|^\/|\/$/);
    }
  });

  it("names no other vendor's product in user-visible names", () => {
    for (const model of Object.values(HYPERGEN_MODELS)) expect(model.name).not.toMatch(/\b(LTX|Lightricks)\b/i);
    for (const id of MODEL_IDS) expect(id).not.toMatch(/ltx|lightricks/i);
  });

  it("REQUEST_FIELDS is exactly the documented request fields", () => {
    expect([...REQUEST_FIELDS].sort()).toEqual(
      ["prompt", "images", "aspectRatio", "resolution", "duration", "count", "voice", "startFrame", "endFrame", "image", "video"].sort(),
    );
  });

  it("is exported from the package index", () => {
    expect(dapi.HYPERGEN_MODELS).toBe(HYPERGEN_MODELS);
    expect(dapi.MODEL_IDS).toBe(MODEL_IDS);
    expect(dapi.toFalInput).toBe(toFalInput);
    expect(dapi.whisperToTranscript).toBeTypeOf("function");
  });
});

describe("toFalInput edge cases", () => {
  it("never sends an undefined value, for every model with only `model` given", () => {
    for (const model of MODEL_IDS) {
      const { endpoint, input } = toFalInput({ model });
      expect(HYPERGEN_MODELS[model].endpoints).toContain(endpoint);
      expect(Object.values(input)).not.toContain(undefined);
      expect(Object.keys(input)).not.toContain("model");
    }
  });

  it("never sends our camelCase field names to fal", () => {
    for (const model of MODEL_IDS) {
      const { input } = toFalInput({ model, ...FULL });
      for (const key of Object.keys(input)) {
        expect(key).toMatch(/^[a-z0-9_]+$/);
        expect(["aspectRatio", "startFrame", "endFrame"]).not.toContain(key);
      }
      expect(Object.values(input)).not.toContain(undefined);
    }
  });

  it("is pure: same output twice and the request untouched", () => {
    for (const model of MODEL_IDS) {
      const request: GenerateRequest = structuredClone({ model, ...FULL });
      const snapshot = structuredClone(request);
      expect(toFalInput(request)).toEqual(toFalInput(request));
      expect(request).toEqual(snapshot);
    }
  });

  it("treats an empty images array as no images", () => {
    expect(toFalInput({ model: "nano-banana-pro", prompt: "a fox", images: [] })).toEqual({
      endpoint: "fal-ai/nano-banana-pro",
      input: { prompt: "a fox" },
    });
    expect(toFalInput({ model: "flux-2-klein", prompt: "a fox", images: [] }).endpoint).toBe("fal-ai/flux-2/klein/9b");
  });

  it("sends every image to nano-banana-pro /edit, in order", () => {
    expect(toFalInput({ model: "nano-banana-pro", prompt: "p", images: [IMG, IMG2] }).input.image_urls).toEqual([IMG, IMG2]);
  });

  it("sends flux to /edit with images and maps aspect ratios to fal sizes", () => {
    expect(toFalInput({ model: "flux-2-klein", prompt: "p", images: [IMG], aspectRatio: "9:16" })).toEqual({
      endpoint: "fal-ai/flux-2/klein/9b/edit",
      input: { prompt: "p", image_urls: [IMG], image_size: "portrait_16_9" },
    });
    expect(toFalInput({ model: "flux-2-klein", prompt: "p", aspectRatio: "1:1" }).input.image_size).toBe("square_hd");
  });

  it("drops an aspect ratio flux has no size for", () => {
    expect(toFalInput({ model: "flux-2-klein", prompt: "p", aspectRatio: "21:9" }).input).toEqual({ prompt: "p" });
  });

  it("keeps kling on text-to-video for an empty startFrame or an endFrame alone", () => {
    expect(toFalInput({ model: "kling-v3-pro", prompt: "p", startFrame: "" }).endpoint).toBe("fal-ai/kling-video/v3/pro/text-to-video");
    const endOnly = toFalInput({ model: "kling-v3-pro", prompt: "p", endFrame: IMG2 });
    expect(endOnly.endpoint).toBe("fal-ai/kling-video/v3/pro/text-to-video");
    expect(endOnly.input).not.toHaveProperty("end_image_url");
  });

  it("sends kling's start and end frames to image-to-video, without an aspect ratio", () => {
    expect(toFalInput({ model: "kling-v3-pro", prompt: "p", startFrame: IMG, endFrame: IMG2, aspectRatio: "16:9", duration: 10 })).toEqual({
      endpoint: "fal-ai/kling-video/v3/pro/image-to-video",
      input: { prompt: "p", start_image_url: IMG, end_image_url: IMG2, duration: "10" },
    });
  });

  it("rounds video durations to whole-second strings, 0 included", () => {
    expect(toFalInput({ model: "kling-v3-pro", prompt: "p", duration: 5.4 }).input.duration).toBe("5");
    expect(toFalInput({ model: "kling-v3-pro", prompt: "p", duration: 5.5 }).input.duration).toBe("6");
    expect(toFalInput({ model: "seedance-2.0-fast", prompt: "p", duration: 0 }).input.duration).toBe("0");
  });

  it("sends seedance to image-to-video with a start frame, text-to-video without", () => {
    expect(toFalInput({ model: "seedance-2.0-fast", prompt: "p", startFrame: IMG, endFrame: IMG2, resolution: "720p" })).toEqual({
      endpoint: "bytedance/seedance-2.0/fast/image-to-video",
      input: { prompt: "p", resolution: "720p", image_url: IMG, end_image_url: IMG2 },
    });
    expect(toFalInput({ model: "seedance-2.0-fast", prompt: "p", aspectRatio: "9:16" })).toEqual({
      endpoint: "bytedance/seedance-2.0/fast/text-to-video",
      input: { prompt: "p", aspect_ratio: "9:16" },
    });
  });

  it("maps ElevenLabs fields: text, voice, ms and seconds", () => {
    expect(toFalInput({ model: "elevenlabs-v3", prompt: "Hi.", voice: "Rachel" })).toEqual({
      endpoint: "fal-ai/elevenlabs/tts/eleven-v3",
      input: { text: "Hi.", voice: "Rachel" },
    });
    expect(toFalInput({ model: "elevenlabs-music", prompt: "jazz", duration: 1.5 }).input).toEqual({ prompt: "jazz", music_length_ms: 1500 });
    expect(toFalInput({ model: "elevenlabs-music", prompt: "jazz", duration: 0.0004 }).input.music_length_ms).toBe(0);
    expect(toFalInput({ model: "elevenlabs-sfx-v2", prompt: "door", duration: 2 }).input).toEqual({ text: "door", duration_seconds: 2 });
  });

  it("sends only the image or video to the tool models, ignoring a prompt", () => {
    expect(toFalInput({ model: "bria-background-removal", prompt: "p", image: IMG }).input).toEqual({ image_url: IMG });
    expect(toFalInput({ model: "seedvr-image-upscale", image: IMG }).input).toEqual({ image_url: IMG });
    expect(toFalInput({ model: "seedvr-video-upscale", video: VID, image: IMG }).input).toEqual({ video_url: VID });
  });

  it("asks seedvr for a target resolution only when one is given", () => {
    expect(toFalInput({ model: "seedvr-image-upscale", image: IMG, resolution: "2160p" }).input).toEqual({
      image_url: IMG,
      upscale_mode: "target",
      target_resolution: "2160p",
    });
    expect(toFalInput({ model: "seedvr-video-upscale", video: VID }).input).not.toHaveProperty("upscale_mode");
  });

  it("passes URLs through unchanged, Windows-style file URLs and spaces included", () => {
    const url = "file:///C:/Users/Me/My%20Clips/a.png";
    expect(toFalInput({ model: "bria-background-removal", image: url }).input.image_url).toBe(url);
  });

  it("throws for a model not in the catalog", () => {
    expect(() => toFalInput({ model: "veo-3.1" as never })).toThrow();
    expect(() => toFalInput({ model: "sam-2.1" as never })).toThrow();
  });
});

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Hypergen's generative models, run on fal.ai with the user's own key: each
// model's fal endpoints, what it makes, a static run-time estimate, and how
// a request maps to the endpoint's input. File fields hold URLs by the time
// a request gets here (the renderer uploads local files first).
//
// Every endpoint id was listed as active by
// GET https://api.fal.ai/v1/models?q=<term> and its input fields checked
// against the endpoint's openapi-3.0 schema on 2026-10-27. fal listed no
// active Veo 3.1 endpoint that day (only deprecated veo2/veo3), so none is here.

import type { z } from "zod";
import type { TranscriptSegment } from "./tools/transcribe";

/** Every request field a Hypergen model may take. */
export const REQUEST_FIELDS = [
  "prompt",
  "images",
  "aspectRatio",
  "resolution",
  "duration",
  "count",
  "voice",
  "startFrame",
  "endFrame",
  "image",
  "video",
] as const;

export const MODEL_IDS = [
  "nano-banana-pro",
  "flux-2-klein",
  "kling-v3-pro",
  "seedance-2.0-fast",
  "elevenlabs-v3",
  "elevenlabs-music",
  "elevenlabs-sfx-v2",
  "bria-background-removal",
  "seedvr-image-upscale",
  "seedvr-video-upscale",
] as const;

export type ModelId = (typeof MODEL_IDS)[number];

export type Resolution = "1K" | "2K" | "4K" | "480p" | "720p" | "1080p" | "1440p" | "2160p";

/** What a model makes. */
export type ModelKind = "image" | "video" | "speech" | "music" | "sfx" | "background-removal" | "upscale";

/** What drives a model: a text prompt, or an image or a video it works on. */
export type PromptMode = "text" | "image" | "video";

export interface GenerateRequest {
  model: ModelId;
  prompt?: string;
  /** reference image URLs */
  images?: string[];
  aspectRatio?: string;
  resolution?: Resolution;
  /** seconds */
  duration?: number;
  count?: number;
  voice?: string;
  /** image URL of a video's first frame */
  startFrame?: string;
  /** image URL of a video's last frame */
  endFrame?: string;
  /** image URL a tool works on */
  image?: string;
  /** video URL a tool works on */
  video?: string;
}

/** A fal request: the endpoint to call and its input. */
export interface FalCall {
  endpoint: string;
  input: Record<string, unknown>;
}

export interface HypergenModel {
  name: string;
  kind: ModelKind;
  promptMode: PromptMode;
  /** every fal endpoint the model may call */
  endpoints: readonly string[];
  etaSeconds: number;
  resolutions?: readonly Resolution[];
  toFalInput(request: GenerateRequest): FalCall;
}

export interface JobAsset {
  url: string;
  filename: string;
  mimeType: string;
}

export interface Job {
  id: string;
  model: ModelId;
  request: GenerateRequest;
  status: "queued" | "running" | "succeeded" | "failed" | "canceled";
  etaSeconds: number;
  etaRemainingSeconds: number | null;
  phase: string | null;
  progress: number | null;
  assets: JobAsset[];
  error: { code: string; message: string } | null;
  createdAt: string;
}

export type Transcript = z.output<typeof TranscriptSegment>[];

/** `input` without its undefined fields, so fal applies its own defaults. */
function defined(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

const seconds = (duration: number | undefined) => (duration === undefined ? undefined : String(Math.round(duration)));

const FLUX_SIZES: Record<string, string> = {
  "1:1": "square_hd",
  "4:3": "landscape_4_3",
  "16:9": "landscape_16_9",
  "3:4": "portrait_4_3",
  "9:16": "portrait_16_9",
};

function upscale(request: GenerateRequest) {
  return request.resolution === undefined
    ? {}
    : { upscale_mode: "target", target_resolution: request.resolution };
}

export const HYPERGEN_MODELS: Record<ModelId, HypergenModel> = {
  "nano-banana-pro": {
    name: "Nano Banana Pro",
    kind: "image",
    promptMode: "text",
    endpoints: ["fal-ai/nano-banana-pro", "fal-ai/nano-banana-pro/edit"],
    etaSeconds: 30,
    resolutions: ["1K", "2K", "4K"],
    toFalInput: (r) => {
      const edit = !!r.images?.length;
      return {
        endpoint: edit ? "fal-ai/nano-banana-pro/edit" : "fal-ai/nano-banana-pro",
        input: defined({
          prompt: r.prompt,
          image_urls: edit ? r.images : undefined,
          aspect_ratio: r.aspectRatio,
          resolution: r.resolution,
          num_images: r.count,
        }),
      };
    },
  },
  "flux-2-klein": {
    name: "FLUX.2 [klein] 9B",
    kind: "image",
    promptMode: "text",
    endpoints: ["fal-ai/flux-2/klein/9b", "fal-ai/flux-2/klein/9b/edit"],
    etaSeconds: 8,
    toFalInput: (r) => {
      const edit = !!r.images?.length;
      return {
        endpoint: edit ? "fal-ai/flux-2/klein/9b/edit" : "fal-ai/flux-2/klein/9b",
        input: defined({
          prompt: r.prompt,
          image_urls: edit ? r.images : undefined,
          image_size: r.aspectRatio === undefined ? undefined : FLUX_SIZES[r.aspectRatio],
          num_images: r.count,
        }),
      };
    },
  },
  "kling-v3-pro": {
    name: "Kling 3.0 Pro",
    kind: "video",
    promptMode: "text",
    endpoints: ["fal-ai/kling-video/v3/pro/text-to-video", "fal-ai/kling-video/v3/pro/image-to-video"],
    etaSeconds: 180,
    toFalInput: (r) =>
      r.startFrame
        ? {
            endpoint: "fal-ai/kling-video/v3/pro/image-to-video",
            input: defined({ prompt: r.prompt, start_image_url: r.startFrame, end_image_url: r.endFrame, duration: seconds(r.duration) }),
          }
        : {
            endpoint: "fal-ai/kling-video/v3/pro/text-to-video",
            input: defined({ prompt: r.prompt, aspect_ratio: r.aspectRatio, duration: seconds(r.duration) }),
          },
  },
  "seedance-2.0-fast": {
    name: "Seedance 2.0 Fast",
    kind: "video",
    promptMode: "text",
    endpoints: ["bytedance/seedance-2.0/fast/text-to-video", "bytedance/seedance-2.0/fast/image-to-video"],
    etaSeconds: 90,
    resolutions: ["480p", "720p"],
    toFalInput: (r) => {
      const shared = { prompt: r.prompt, aspect_ratio: r.aspectRatio, resolution: r.resolution, duration: seconds(r.duration) };
      return r.startFrame
        ? {
            endpoint: "bytedance/seedance-2.0/fast/image-to-video",
            input: defined({ ...shared, image_url: r.startFrame, end_image_url: r.endFrame }),
          }
        : { endpoint: "bytedance/seedance-2.0/fast/text-to-video", input: defined(shared) };
    },
  },
  "elevenlabs-v3": {
    name: "ElevenLabs v3",
    kind: "speech",
    promptMode: "text",
    endpoints: ["fal-ai/elevenlabs/tts/eleven-v3"],
    etaSeconds: 15,
    toFalInput: (r) => ({ endpoint: "fal-ai/elevenlabs/tts/eleven-v3", input: defined({ text: r.prompt, voice: r.voice }) }),
  },
  "elevenlabs-music": {
    name: "ElevenLabs Music",
    kind: "music",
    promptMode: "text",
    endpoints: ["fal-ai/elevenlabs/music"],
    etaSeconds: 60,
    toFalInput: (r) => ({
      endpoint: "fal-ai/elevenlabs/music",
      input: defined({ prompt: r.prompt, music_length_ms: r.duration === undefined ? undefined : Math.round(r.duration * 1000) }),
    }),
  },
  "elevenlabs-sfx-v2": {
    name: "ElevenLabs Sound Effects v2",
    kind: "sfx",
    promptMode: "text",
    endpoints: ["fal-ai/elevenlabs/sound-effects/v2"],
    etaSeconds: 15,
    toFalInput: (r) => ({
      endpoint: "fal-ai/elevenlabs/sound-effects/v2",
      input: defined({ text: r.prompt, duration_seconds: r.duration }),
    }),
  },
  "bria-background-removal": {
    name: "Bria Background Removal",
    kind: "background-removal",
    promptMode: "image",
    endpoints: ["fal-ai/bria/background/remove"],
    etaSeconds: 10,
    toFalInput: (r) => ({ endpoint: "fal-ai/bria/background/remove", input: defined({ image_url: r.image }) }),
  },
  "seedvr-image-upscale": {
    name: "SeedVR2 Image Upscale",
    kind: "upscale",
    promptMode: "image",
    endpoints: ["fal-ai/seedvr/upscale/image"],
    etaSeconds: 30,
    resolutions: ["720p", "1080p", "1440p", "2160p"],
    toFalInput: (r) => ({ endpoint: "fal-ai/seedvr/upscale/image", input: defined({ image_url: r.image, ...upscale(r) }) }),
  },
  "seedvr-video-upscale": {
    name: "SeedVR2 Video Upscale",
    kind: "upscale",
    promptMode: "video",
    endpoints: ["fal-ai/seedvr/upscale/video"],
    etaSeconds: 240,
    resolutions: ["720p", "1080p", "1440p", "2160p"],
    toFalInput: (r) => ({ endpoint: "fal-ai/seedvr/upscale/video", input: defined({ video_url: r.video, ...upscale(r) }) }),
  },
};

/** The fal endpoint and input for `request`, by its model. */
export function toFalInput(request: GenerateRequest): FalCall {
  return HYPERGEN_MODELS[request.model].toFalInput(request);
}

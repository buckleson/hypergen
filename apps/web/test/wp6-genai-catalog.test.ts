// @vitest-environment node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * WP6 acceptance: the genai UI and AI commands run on the WP1 fal catalog
 * (`@hypergen/dapi` HYPERGEN_MODELS), with no credits anywhere.
 *
 * Behavioural checks on components/genai/config.ts, requests.ts and
 * use-transforms.ts (engine / runtime / selection mocked); source-level guards
 * on the commands, action bar and command context. No network, no GPU, no
 * desktop app, no timers.
 *
 * Lives outside `src/` so `tsc -p tsconfig.app.json` does not type-check it.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HYPERGEN_MODELS, MODEL_IDS, toFalInput } from "@hypergen/dapi";

import type { ModelId, ModelRequest } from "@hypergen/dapi";

const WEB = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string) => readFileSync(join(WEB, ...rel.split("/")), "utf8");
const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
const BRAND = /\b(LTX|Lightricks)\b/i;

const PROMPT_MODES = ["IMAGE", "VIDEO", "VOICE", "AUDIO"] as const;
const TOOLS: ModelId[] = ["bria-background-removal", "seedvr-image-upscale", "seedvr-video-upscale"];

/** Every file under `rel` (recursive), repo-relative to apps/web. */
function walk(rel: string): string[] {
  const root = join(WEB, ...rel.split("/"));
  if (!existsSync(root)) return [];
  const out: string[] = [];
  const visit = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) visit(full);
      else out.push(relative(WEB, full).split("\\").join("/"));
    }
  };
  visit(root);
  return out;
}

// ── config.ts ────────────────────────────────────────────────

describe("components/genai/config.ts on the WP1 catalog", () => {
  const load = () => import("../src/components/genai/config");

  it("MODEL_MODES is keyed by exactly the WP1 MODEL_IDS", async () => {
    const { MODEL_MODES } = await load();
    expect(Object.keys(MODEL_MODES).sort()).toEqual([...MODEL_IDS].sort());
    for (const mode of Object.values(MODEL_MODES)) expect(PROMPT_MODES).toContain(mode);
  });

  it("MODEL_OPTIONS ids are unique WP1 ModelIds whose mode agrees with MODEL_MODES", async () => {
    const { MODEL_OPTIONS, MODEL_MODES } = await load();
    const ids = MODEL_OPTIONS.map((option) => option.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const option of MODEL_OPTIONS) {
      expect(MODEL_IDS as readonly string[]).toContain(option.id);
      expect(option.mode, option.id).toBe(MODEL_MODES[option.id]);
    }
  });

  it("tools (bria, seedvr) are not prompt-box models: modelOption answers undefined", async () => {
    const { modelOption } = await load();
    for (const id of TOOLS) expect(modelOption(id), id).toBeUndefined();
  });

  it("every catalog model that is not a tool is offered by the prompt box", async () => {
    const { modelOption } = await load();
    for (const id of MODEL_IDS.filter((id) => !TOOLS.includes(id))) expect(modelOption(id), id).toBeDefined();
  });

  it("each mode's default model is a catalog option of that mode", async () => {
    const { defaultModelOption, modelOptions } = await load();
    for (const mode of PROMPT_MODES) {
      const option = defaultModelOption(mode);
      expect(option, mode).toBeDefined();
      expect(option.mode).toBe(mode);
      expect(modelOptions(mode).map((entry) => entry.id)).toContain(option.id);
    }
  });

  it("PROMPT_INPUT_MODE_OPTIONS lists only modes with at least one catalog model (all four today)", async () => {
    const { PROMPT_INPUT_MODE_OPTIONS, modelOptions } = await load();
    for (const option of PROMPT_INPUT_MODE_OPTIONS) expect(modelOptions(option.value).length, option.value).toBeGreaterThan(0);
    expect(PROMPT_INPUT_MODE_OPTIONS.map((option) => option.value)).toEqual([...PROMPT_MODES]);
  });

  it("the mode list is filtered by MODEL_OPTIONS, so a mode with no model is hidden", () => {
    const src = code(read("src/components/genai/config.ts"));
    expect(src).toMatch(/PROMPT_INPUT_MODE_OPTIONS[\s\S]*?\.filter\(\s*\(?\s*option\s*\)?\s*=>\s*MODEL_OPTIONS\.some\(/);
  });

  it("modelOptions of a mode returns only that mode, and an unknown mode returns []", async () => {
    const { modelOptions } = await load();
    for (const mode of PROMPT_MODES) for (const option of modelOptions(mode)) expect(option.mode).toBe(mode);
    expect(modelOptions("NOPE" as never)).toEqual([]);
  });

  it("resolutions offered are a subset of the catalog's declared resolutions", async () => {
    const { MODEL_OPTIONS } = await load();
    for (const option of MODEL_OPTIONS) {
      if (!option.resolutions) continue;
      const declared = HYPERGEN_MODELS[option.id].resolutions;
      expect(declared, `${option.id} offers resolutions the catalog does not declare`).toBeDefined();
      for (const resolution of option.resolutions) expect(declared, option.id).toContain(resolution);
    }
  });

  it("specific fal openapi settings: Nano Banana Pro 1K/2K/4K + 14 refs; FLUX.2 Klein 4 refs, no resolution", async () => {
    const { modelOption } = await load();
    const nano = modelOption("nano-banana-pro")!;
    expect([...nano.resolutions!].sort()).toEqual(["1K", "2K", "4K"]);
    expect(nano.references).toBe(14);
    const flux = modelOption("flux-2-klein")!;
    expect(flux.references).toBe(4);
    expect(flux.resolutions).toBeUndefined();
  });

  it("video: Seedance 480p/720p 4-15 s; Kling 16:9/9:16/1:1 3-15 s; both start and end frames", async () => {
    const { modelOption } = await load();
    const seedance = modelOption("seedance-2.0-fast")!;
    expect([...seedance.resolutions!].sort()).toEqual(["480p", "720p"]);
    expect(seedance.durations).toEqual(Array.from({ length: 12 }, (_, i) => 4 + i));
    expect(seedance.frames).toEqual(["start", "end"]);
    const kling = modelOption("kling-v3-pro")!;
    expect([...kling.aspectRatios!].sort()).toEqual(["1:1", "16:9", "9:16"].sort());
    expect(kling.durations).toEqual(Array.from({ length: 13 }, (_, i) => 3 + i));
    expect(kling.frames).toEqual(["start", "end"]);
    expect(kling.resolutions).toBeUndefined();
  });

  it("audio: Music takes 3-600 s with default and presets inside the range; SFX and v3 take no duration list", async () => {
    const { modelOption } = await load();
    const music = modelOption("elevenlabs-music")!;
    const range = music.durationRange!;
    expect(range).toMatchObject({ min: 3, max: 600 });
    expect(range.default).toBeGreaterThanOrEqual(range.min);
    expect(range.default).toBeLessThanOrEqual(range.max);
    for (const preset of range.presets) {
      expect(preset).toBeGreaterThanOrEqual(range.min);
      expect(preset).toBeLessThanOrEqual(range.max);
    }
    expect(modelOption("elevenlabs-sfx-v2")!.durations).toBeUndefined();
    expect(modelOption("elevenlabs-v3")!.durations).toBeUndefined();
  });

  it("aspect ratios offered all have pixel dimensions, and every FLUX ratio maps to a fal image_size", async () => {
    const { MODEL_OPTIONS, ASPECT_RATIO_DIMENSIONS } = await load();
    for (const option of MODEL_OPTIONS) {
      for (const ratio of option.aspectRatios ?? []) expect(ASPECT_RATIO_DIMENSIONS[ratio], `${option.id} ${ratio}`).toBeDefined();
    }
    const flux = MODEL_OPTIONS.find((option) => option.id === "flux-2-klein")!;
    for (const ratio of flux.aspectRatios!) {
      expect(toFalInput({ model: "flux-2-klein", prompt: "x", aspectRatio: ratio }).input.image_size, ratio).toBeDefined();
    }
  });

  it("voices: only VOICE models have them; ids unique, labels non-empty, previews https", async () => {
    const { MODEL_OPTIONS } = await load();
    for (const option of MODEL_OPTIONS) {
      if (option.mode !== "VOICE") expect(option.voices, option.id).toBeUndefined();
    }
    const voices = MODEL_OPTIONS.find((option) => option.id === "elevenlabs-v3")!.voices!;
    expect(voices.length).toBeGreaterThan(0);
    expect(new Set(voices.map((voice) => voice.value)).size).toBe(voices.length);
    for (const voice of voices) {
      expect(voice.label.trim()).not.toBe("");
      expect(voice.previewUrl).toMatch(/^https:\/\//);
    }
  });

  it("the Gemini voice list is gone", () => {
    expect(read("src/components/genai/config.ts")).not.toMatch(/GEMINI/i);
  });

  it("DEFAULT_RESOLUTION is offered by the default model of its mode, when that model offers resolutions", async () => {
    const { DEFAULT_RESOLUTION, defaultModelOption } = await load();
    for (const [mode, resolution] of Object.entries(DEFAULT_RESOLUTION)) {
      const option = defaultModelOption(mode as never);
      if (option.resolutions) expect(option.resolutions, mode).toContain(resolution);
    }
  });

  it("durationsAt: no resolutionDurations or no resolution falls back to the model's durations", async () => {
    const { durationsAt, modelOption } = await load();
    const seedance = modelOption("seedance-2.0-fast")!;
    expect(durationsAt(seedance, undefined)).toBe(seedance.durations);
    expect(durationsAt(seedance, "720p")).toBe(seedance.durations);
    const narrowed = { ...seedance, resolutionDurations: { "720p": [5] } };
    expect(durationsAt(narrowed, "720p")).toEqual([5]);
    expect(durationsAt(narrowed, "480p")).toBe(seedance.durations);
    expect(durationsAt(modelOption("elevenlabs-sfx-v2")!, undefined)).toBeUndefined();
  });
});

// ── requests.ts ──────────────────────────────────────────────

const engine = { uploadAsset: vi.fn(), generate: vi.fn(), transform: vi.fn() };

type FakeAsset = { id: string };
const library = (ids: string[]) => ({
  get: (id: string): FakeAsset | undefined => (ids.includes(id) ? { id } : undefined),
});

describe("components/genai/requests.ts", () => {
  beforeEach(() => {
    vi.resetModules();
    engine.uploadAsset.mockReset();
    engine.uploadAsset.mockImplementation(async (_library: unknown, asset: FakeAsset) => `data:upload/${asset.id}`);
    vi.doMock("@/engine/generate", () => engine);
    vi.doMock("@/engine/insert-asset", () => ({ AUDIO_SIZE: { width: 500, height: 150 } }));
  });
  afterEach(() => {
    vi.doUnmock("@/engine/generate");
    vi.doUnmock("@/engine/insert-asset");
  });

  const load = () => import("../src/components/genai/requests");

  describe("outputOf", () => {
    it("image: kind image, count defaults to 1, size from aspect ratio", async () => {
      const { outputOf } = await load();
      expect(outputOf({ model: "flux-2-klein" })).toMatchObject({ kind: "image", count: 1, size: { width: 1920, height: 1080 } });
      expect(outputOf({ model: "nano-banana-pro", count: 3, aspectRatio: "9:16" })).toMatchObject({ count: 3, size: { width: 1080, height: 1920 } });
    });

    it("an unknown or empty aspect ratio falls back to 16:9", async () => {
      const { outputOf } = await load();
      expect(outputOf({ model: "kling-v3-pro", aspectRatio: "21:9" })!.size).toEqual({ width: 1920, height: 1080 });
      expect(outputOf({ model: "kling-v3-pro", aspectRatio: "" })!.size).toEqual({ width: 1920, height: 1080 });
    });

    it("voice and audio models are audio-sized, and each output gets its own size object", async () => {
      const { outputOf } = await load();
      const a = outputOf({ model: "elevenlabs-v3" })!;
      const b = outputOf({ model: "elevenlabs-music", aspectRatio: "1:1" })!;
      expect(a.kind).toBe("audio");
      expect(b.kind).toBe("audio");
      expect(a.size).toEqual({ width: 500, height: 150 });
      expect(b.size).toEqual({ width: 500, height: 150 });
      expect(a.size).not.toBe(b.size);
    });

    it("tool models are placed by what they make (bria/seedvr-image -> image, seedvr-video -> video)", async () => {
      const { outputOf } = await load();
      expect(outputOf({ model: "bria-background-removal" })!.kind).toBe("image");
      expect(outputOf({ model: "seedvr-image-upscale" })!.kind).toBe("image");
      expect(outputOf({ model: "seedvr-video-upscale" })!.kind).toBe("video");
    });

    it("a model not in the catalog (an old job) has nothing to place", async () => {
      const { outputOf } = await load();
      expect(outputOf({ model: "ltx-2-pro" as ModelId })).toBeUndefined();
      expect(outputOf({ model: "" as ModelId })).toBeUndefined();
    });

    it("failure titles carry no brand names", async () => {
      const { outputOf } = await load();
      for (const model of MODEL_IDS) expect(outputOf({ model })!.title).not.toMatch(BRAND);
    });
  });

  describe("fitToModel / createDefaultConfig", () => {
    it("createDefaultConfig(mode) starts on the mode's default model with an empty prompt", async () => {
      const { createDefaultConfig } = await load();
      const { defaultModelOption } = await import("../src/components/genai/config");
      for (const mode of PROMPT_MODES) {
        const config = createDefaultConfig(mode);
        expect(config.mode).toBe(mode);
        expect(config.model).toBe(defaultModelOption(mode).id);
        expect(config.prompt).toBe("");
      }
    });

    it("an unknown or tool model falls back to the mode's default model", async () => {
      const { fitToModel } = await load();
      expect(fitToModel({ mode: "IMAGE", model: "ltx-2-pro" as ModelId, prompt: "p" }).model).toBe("flux-2-klein");
      expect(fitToModel({ mode: "IMAGE", model: "bria-background-removal", prompt: "p" }).model).toBe("flux-2-klein");
      expect(fitToModel({ mode: "VIDEO", model: "seedvr-video-upscale", prompt: "p" }).model).toBe("seedance-2.0-fast");
    });

    it("reference images are cut to the model's limit (14 / 4) and dropped for models with none", async () => {
      const { fitToModel } = await load();
      const ids = Array.from({ length: 20 }, (_, i) => `ref-${i}`);
      expect(fitToModel({ mode: "IMAGE", model: "nano-banana-pro", prompt: "", imageRefIds: ids }).imageRefIds).toHaveLength(14);
      expect(fitToModel({ mode: "IMAGE", model: "flux-2-klein", prompt: "", imageRefIds: ids }).imageRefIds).toEqual(ids.slice(0, 4));
      expect(fitToModel({ mode: "VIDEO", model: "kling-v3-pro", prompt: "", imageRefIds: ids }).imageRefIds).toBeUndefined();
    });

    it("start/end frames are kept for video models and dropped for image models", async () => {
      const { fitToModel } = await load();
      const frames = { startFrameImageId: "s", endFrameImageId: "e" };
      expect(fitToModel({ mode: "VIDEO", model: "kling-v3-pro", prompt: "", ...frames })).toMatchObject(frames);
      const image = fitToModel({ mode: "IMAGE", model: "nano-banana-pro", prompt: "", ...frames });
      expect(image.startFrameImageId).toBeUndefined();
      expect(image.endFrameImageId).toBeUndefined();
    });

    it("an aspect ratio the model does not take falls back to 16:9 (Kling has no 4:3)", async () => {
      const { fitToModel } = await load();
      expect(fitToModel({ mode: "VIDEO", model: "kling-v3-pro", prompt: "", aspectRatio: "4:3" }).aspectRatio).toBe("16:9");
      expect(fitToModel({ mode: "VIDEO", model: "seedance-2.0-fast", prompt: "", aspectRatio: "4:3" }).aspectRatio).toBe("4:3");
      expect(fitToModel({ mode: "VOICE", model: "elevenlabs-v3", prompt: "", aspectRatio: "1:1" }).aspectRatio).toBeUndefined();
    });

    it("resolution: Seedance defaults to 720p, rejects 4K; Kling and FLUX send none", async () => {
      const { fitToModel } = await load();
      expect(fitToModel({ mode: "VIDEO", model: "seedance-2.0-fast", prompt: "" }).resolution).toBe("720p");
      expect(fitToModel({ mode: "VIDEO", model: "seedance-2.0-fast", prompt: "", resolution: "4K" }).resolution).toBe("720p");
      expect(fitToModel({ mode: "VIDEO", model: "seedance-2.0-fast", prompt: "", resolution: "480p" }).resolution).toBe("480p");
      expect(fitToModel({ mode: "VIDEO", model: "kling-v3-pro", prompt: "", resolution: "1080p" }).resolution).toBeUndefined();
      expect(fitToModel({ mode: "IMAGE", model: "flux-2-klein", prompt: "", resolution: "2K" }).resolution).toBeUndefined();
      expect(fitToModel({ mode: "IMAGE", model: "nano-banana-pro", prompt: "" }).resolution).toBe("1K");
    });

    it("video durations: out-of-list values fall back to 6 s; boundaries 3/4 and 15 are kept", async () => {
      const { fitToModel } = await load();
      const fit = (model: ModelId, duration?: number) => fitToModel({ mode: "VIDEO", model, prompt: "", duration }).duration;
      expect(fit("kling-v3-pro", 3)).toBe(3);
      expect(fit("kling-v3-pro", 15)).toBe(15);
      expect(fit("kling-v3-pro", 16)).toBe(6);
      expect(fit("kling-v3-pro", 2)).toBe(6);
      expect(fit("seedance-2.0-fast", 3)).toBe(6);
      expect(fit("seedance-2.0-fast", 4)).toBe(4);
      expect(fit("seedance-2.0-fast")).toBe(6);
    });

    it("music duration is clamped to 3-600 whole seconds, default when unset", async () => {
      const { fitToModel } = await load();
      const fit = (duration?: number) => fitToModel({ mode: "AUDIO", model: "elevenlabs-music", prompt: "", duration }).duration;
      expect(fit(undefined)).toBe(30);
      expect(fit(0)).toBe(3);
      expect(fit(-10)).toBe(3);
      expect(fit(3)).toBe(3);
      expect(fit(600)).toBe(600);
      expect(fit(601)).toBe(600);
      expect(fit(7.4)).toBe(7);
      expect(fit(7.5)).toBe(8);
    });

    it("SFX sends no duration and no count", async () => {
      const { fitToModel } = await load();
      const config = fitToModel({ mode: "AUDIO", model: "elevenlabs-sfx-v2", prompt: "", duration: 12, count: 3 });
      expect(config.duration).toBeUndefined();
      expect(config.count).toBeUndefined();
    });

    it("voice: an unknown voice falls back to the first offered; non-voice models drop it", async () => {
      const { fitToModel } = await load();
      const { modelOption } = await import("../src/components/genai/config");
      const first = modelOption("elevenlabs-v3")!.voices![0]!.value;
      expect(fitToModel({ mode: "VOICE", model: "elevenlabs-v3", prompt: "" }).voice).toBe(first);
      expect(fitToModel({ mode: "VOICE", model: "elevenlabs-v3", prompt: "", voice: "Kore" }).voice).toBe(first);
      expect(fitToModel({ mode: "AUDIO", model: "elevenlabs-music", prompt: "", voice: first }).voice).toBeUndefined();
    });

    it("count: image models take 1-4, out of range falls back to 1; video takes none", async () => {
      const { fitToModel } = await load();
      expect(fitToModel({ mode: "IMAGE", model: "flux-2-klein", prompt: "", count: 4 }).count).toBe(4);
      expect(fitToModel({ mode: "IMAGE", model: "flux-2-klein", prompt: "", count: 9 }).count).toBe(1);
      expect(fitToModel({ mode: "IMAGE", model: "flux-2-klein", prompt: "", count: 0 }).count).toBe(1);
      expect(fitToModel({ mode: "VIDEO", model: "kling-v3-pro", prompt: "", count: 2 }).count).toBeUndefined();
    });
  });

  describe("toRequest", () => {
    it("every prompt-box setting of every model makes a request fal's mapping accepts on a catalog endpoint", async () => {
      const { toRequest, fitToModel } = await load();
      const { MODEL_OPTIONS } = await import("../src/components/genai/config");
      let requests = 0;
      for (const option of MODEL_OPTIONS) {
        const variants = [
          ...(option.aspectRatios ?? [undefined]).map((aspectRatio) => ({ aspectRatio })),
          ...(option.resolutions ?? [undefined]).map((resolution) => ({ resolution })),
          ...(option.durations ?? [undefined]).map((duration) => ({ duration })),
          ...(option.durationRange?.presets ?? [undefined]).map((duration) => ({ duration })),
          ...(option.counts ?? [undefined]).map((count) => ({ count })),
          ...(option.voices ?? [undefined]).map((voice) => ({ voice: voice?.value })),
        ];
        for (const variant of variants) {
          const config = fitToModel({ mode: option.mode, model: option.id, prompt: "a fox", ...variant });
          const request = await toRequest(library([]) as never, config);
          expect(request.model).toBe(option.id);
          const call = toFalInput(request);
          expect(HYPERGEN_MODELS[option.id].endpoints, option.id).toContain(call.endpoint);
          for (const value of Object.values(call.input)) expect(value).not.toBeUndefined();
          requests++;
        }
      }
      expect(requests).toBeGreaterThan(MODEL_OPTIONS.length);
    });

    it("leaves unset settings out entirely (no undefined keys) and sends no images when there are none", async () => {
      const { toRequest, createDefaultConfig } = await load();
      const request = await toRequest(library([]) as never, createDefaultConfig("AUDIO", "rain"));
      for (const [key, value] of Object.entries(request)) expect(value, key).not.toBeUndefined();
      expect("images" in request).toBe(false);
      expect("startFrame" in request).toBe(false);
      expect(engine.uploadAsset).not.toHaveBeenCalled();
    });

    it("uploads start/end frames and refs; ids no longer in the library are dropped", async () => {
      const { toRequest } = await load();
      const request = await toRequest(library(["s", "r1", "r3"]) as never, {
        mode: "VIDEO",
        model: "kling-v3-pro",
        prompt: "p",
        startFrameImageId: "s",
        endFrameImageId: "gone",
        imageRefIds: ["r1", "missing", "r3"],
      });
      expect(request.startFrame).toBe("data:upload/s");
      expect("endFrame" in request).toBe(false);
      expect(request.images).toEqual(["data:upload/r1", "data:upload/r3"]);
      expect(engine.uploadAsset).toHaveBeenCalledTimes(3);
    });

    it("all refs gone -> no images field at all", async () => {
      const { toRequest } = await load();
      const request = await toRequest(library([]) as never, { mode: "IMAGE", model: "nano-banana-pro", prompt: "p", imageRefIds: ["a", "b"] });
      expect("images" in request).toBe(false);
    });

    it("asset ids that look like Windows paths are looked up as-is", async () => {
      const { toRequest } = await load();
      const id = "C:\\Users\\me\\Pictures\\fox.png";
      const request = await toRequest(library([id]) as never, { mode: "IMAGE", model: "flux-2-klein", prompt: "p", imageRefIds: [id] });
      expect(request.images).toEqual([`data:upload/${id}`]);
    });

    it("an empty prompt is still sent (as an empty string)", async () => {
      const { toRequest, createDefaultConfig } = await load();
      const request = await toRequest(library([]) as never, createDefaultConfig("IMAGE"));
      expect(request.prompt).toBe("");
    });

    it("an upload failure rejects toRequest", async () => {
      const { toRequest } = await load();
      engine.uploadAsset.mockRejectedValueOnce(new Error("offline"));
      await expect(
        toRequest(library(["s"]) as never, { mode: "VIDEO", model: "kling-v3-pro", prompt: "p", startFrameImageId: "s" }),
      ).rejects.toThrow("offline");
    });
  });

  describe("toConfig", () => {
    it("round-trips every prompt-box model's default config through toRequest (inputs aside)", async () => {
      const { toRequest, toConfig, createDefaultConfig, fitToModel } = await load();
      const { MODEL_OPTIONS } = await import("../src/components/genai/config");
      for (const option of MODEL_OPTIONS) {
        const config = fitToModel({ ...createDefaultConfig(option.mode, "a fox"), model: option.id });
        const back = toConfig(await toRequest(library([]) as never, config));
        expect(back, option.id).toEqual(config);
      }
    });

    it("a tool request or a request without a prompt has no prompt-box config", async () => {
      const { toConfig } = await load();
      expect(toConfig({ model: "bria-background-removal", image: "data:x" })).toBeUndefined();
      expect(toConfig({ model: "seedvr-video-upscale", video: "data:x" })).toBeUndefined();
      expect(toConfig({ model: "flux-2-klein" })).toBeUndefined();
      expect(toConfig({ model: "ltx-2-pro" as ModelId, prompt: "p" })).toBeUndefined();
    });

    it("out-of-bounds values from a request are fitted to the model", async () => {
      const { toConfig } = await load();
      const config = toConfig({ model: "kling-v3-pro", prompt: "p", aspectRatio: "4:3", duration: 99, resolution: "4K" } as ModelRequest)!;
      expect(config).toMatchObject({ mode: "VIDEO", aspectRatio: "16:9", duration: 6 });
      expect(config.resolution).toBeUndefined();
    });

    it("inputs (uploads) are not carried back into library ids", async () => {
      const { toConfig } = await load();
      const config = toConfig({ model: "nano-banana-pro", prompt: "p", images: ["data:a"], startFrame: "data:s" })!;
      expect(config.imageRefIds).toBeUndefined();
      expect(config.startFrameImageId).toBeUndefined();
    });
  });
});

// ── use-transforms.ts ────────────────────────────────────────

const PaintType = { IMAGE: 1, VIDEO: 2 } as const;
const Generating = { trait: "Generating" };
const node = (generating = false) => ({ has: (trait: unknown) => generating && trait === Generating });
let selection: { node: ReturnType<typeof node>; paint: object; type: number }[] = [];

describe("components/genai/use-transforms.ts", () => {
  const world = { id: "world" };
  beforeEach(() => {
    vi.resetModules();
    engine.transform.mockReset();
    selection = [];
    vi.doMock("@/engine/generate", () => engine);
    vi.doMock("@hypergen/koota-solid", () => ({ useWorld: () => world }));
    vi.doMock("@hypergen/runtime", () => ({ PaintType, Generating }));
    vi.doMock("../src/components/genai/selection", () => ({ useMediaSelection: () => ({ media: () => selection }) }));
  });
  afterEach(() => {
    for (const path of ["@/engine/generate", "@hypergen/koota-solid", "@hypergen/runtime", "../src/components/genai/selection"]) vi.doUnmock(path);
  });

  const load = async () => (await import("../src/components/genai/use-transforms")).useTransforms();
  const image = () => ({ node: node(), paint: {}, type: PaintType.IMAGE });
  const video = () => ({ node: node(), paint: {}, type: PaintType.VIDEO });

  /** The request each transform call would send for an upload `input`. */
  const requests = (input = "data:in") =>
    engine.transform.mock.calls.map(([, , , request]) => (request as (input: string) => ModelRequest)(input));

  it("the catalog has both seedvr endpoints, so upscale takes images and videos", async () => {
    expect(MODEL_IDS).toContain("seedvr-image-upscale");
    expect(MODEL_IDS).toContain("seedvr-video-upscale");
    selection = [image(), video()];
    const { targets } = await load();
    expect(targets("upscale")).toHaveLength(2);
  });

  it("upscale sends seedvr-image-upscale {image} for images and seedvr-video-upscale {video} for videos", async () => {
    selection = [image(), video()];
    const { run } = await load();
    run("upscale");
    expect(engine.transform).toHaveBeenCalledTimes(2);
    expect(engine.transform.mock.calls[0]![0]).toBe(world);
    expect(engine.transform.mock.calls[0]![2]).toBe("Upscale failed");
    expect(requests()).toEqual([
      { model: "seedvr-image-upscale", image: "data:in" },
      { model: "seedvr-video-upscale", video: "data:in" },
    ]);
  });

  it("the upscale requests map to the seedvr fal endpoints", async () => {
    selection = [image(), video()];
    const { run } = await load();
    run("upscale");
    const [img, vid] = requests("https://x/y").map(toFalInput);
    expect(img).toEqual({ endpoint: "fal-ai/seedvr/upscale/image", input: { image_url: "https://x/y" } });
    expect(vid).toEqual({ endpoint: "fal-ai/seedvr/upscale/video", input: { video_url: "https://x/y" } });
  });

  it("remove background uses bria-background-removal on images only", async () => {
    selection = [image(), video()];
    const { targets, run } = await load();
    expect(targets("removeBackground")).toEqual([selection[0]]);
    run("removeBackground");
    expect(engine.transform).toHaveBeenCalledTimes(1);
    expect(engine.transform.mock.calls[0]![2]).toBe("Background removal failed");
    expect(requests()).toEqual([{ model: "bria-background-removal", image: "data:in" }]);
    expect(toFalInput(requests()[0]!).endpoint).toBe("fal-ai/bria/background/remove");
  });

  it("nodes already generating are skipped", async () => {
    selection = [{ ...image(), node: node(true) }, image()];
    const { targets, run } = await load();
    expect(targets("upscale")).toEqual([selection[1]]);
    run("upscale");
    expect(engine.transform).toHaveBeenCalledTimes(1);
  });

  it("an empty selection, or only videos for remove background, runs nothing", async () => {
    const empty = await load();
    expect(empty.targets("upscale")).toEqual([]);
    empty.run("upscale");
    empty.run("removeBackground");
    selection = [video()];
    (await load()).run("removeBackground");
    expect(engine.transform).not.toHaveBeenCalled();
  });

  it("source has no price / charge code", () => {
    expect(read("src/components/genai/use-transforms.ts")).not.toMatch(/price|chargeOf|credit|cost/i);
  });
});

// ── source guards ────────────────────────────────────────────

const WP6_FILES = [
  "src/components/genai/config.ts",
  "src/components/genai/requests.ts",
  "src/components/genai/types.ts",
  "src/components/genai/use-transforms.ts",
  "src/components/genai/use-generate.ts",
  "src/components/genai/use-generation-records.ts",
  "src/components/genai/prompt-input.tsx",
  "src/components/genai/prompt-input-actions.tsx",
  "src/components/commands/rerun.tsx",
  "src/components/commands/node-menu.tsx",
  "src/components/commands/transform-bar.tsx",
  "src/components/commands/upscale.tsx",
  "src/components/commands/remove-background.tsx",
  "src/components/canvas/action-bar.tsx",
  "src/context/commands.tsx",
];

describe("WP6 source guards", () => {
  it("all WP6 files exist and use-estimate.ts is deleted", () => {
    for (const rel of WP6_FILES) expect(existsSync(join(WEB, rel)), rel).toBe(true);
    expect(existsSync(join(WEB, "src/components/genai/use-estimate.ts"))).toBe(false);
    expect(existsSync(join(WEB, "src/components/genai/use-estimate.tsx"))).toBe(false);
  });

  it("acceptance grep (credit|estimate|api-contract, case-insensitive) is empty over genai, commands, canvas, context", () => {
    const files = ["src/components/genai", "src/components/commands", "src/components/canvas", "src/context"].flatMap(walk);
    expect(files.length).toBeGreaterThan(0);
    const hits: string[] = [];
    for (const rel of files) {
      read(rel).split(/\r?\n/).forEach((line, i) => {
        if (/credit|estimate|api-contract/i.test(line)) hits.push(`${rel}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(hits).toEqual([]);
  });

  it("no credit UI anywhere in src: CreditsTag, ActionBarCredits, formatCost, priceOf, totalCredits, chargeOf, 'AI credits used', 'ai-credits'", () => {
    const PATTERN = /CreditsTag|ActionBarCredits|formatCost|priceOf|totalCredits|chargeOf|AI credits used|ai-credits/i;
    const hits = walk("src").filter((rel) => /\.(tsx?|css|json|svg)$/.test(rel) && PATTERN.test(read(rel)));
    expect(hits).toEqual([]);
  });

  it("context/commands.tsx has no credits?() field on Command", () => {
    const src = code(read("src/context/commands.tsx"));
    expect(src).not.toMatch(/\bcredits\??\s*[(:]/);
  });

  it("generate (all four modes), edit-with-prompt, remove-background, upscale, auto-captions, rerun, reuse-settings stay registered", () => {
    const ids: Record<string, string> = {
      "src/components/commands/generate.tsx": "generate:${props.mode}",
      "src/components/commands/edit-with-prompt.tsx": "edit-with-prompt",
      "src/components/commands/remove-background.tsx": "remove-background",
      "src/components/commands/upscale.tsx": "upscale",
      "src/components/commands/auto-captions.tsx": "auto-captions",
      "src/components/commands/rerun.tsx": "rerun",
      "src/components/commands/reuse-settings.tsx": "reuse-settings",
    };
    for (const [rel, id] of Object.entries(ids)) {
      const src = code(read(rel));
      expect(src, rel).toMatch(/useCommand\(\{/);
      expect(src.includes(`id: "${id}"`) || src.includes(`id: \`${id}\``), `${rel} id ${id}`).toBe(true);
    }
    const index = code(read("src/components/commands/index.tsx"));
    for (const mode of PROMPT_MODES) expect(index).toContain(`<GenerateCommand mode="${mode}" />`);
    for (const tag of ["EditWithPromptCommand", "RemoveBackgroundCommand", "UpscaleCommand", "AutoCaptionsCommand", "RerunCommand", "ReuseSettingsCommand"]) {
      expect(index).toContain(`<${tag} />`);
    }
  });

  it("command availability depends on the selection, never on credits or price", () => {
    for (const rel of ["generate", "edit-with-prompt", "remove-background", "upscale", "auto-captions", "rerun", "reuse-settings"].map((name) => `src/components/commands/${name}.tsx`)) {
      expect(code(read(rel)), rel).not.toMatch(/credit|price|cost|balance|estimate/i);
    }
    expect(code(read("src/components/commands/upscale.tsx"))).toMatch(/ready:\s*\(\)\s*=>\s*targets\("upscale"\)\.length\s*>\s*0/);
    expect(code(read("src/components/commands/remove-background.tsx"))).toMatch(/ready:\s*\(\)\s*=>\s*targets\("removeBackground"\)\.length\s*>\s*0/);
  });

  it("rerun is available for a generated selection and its Confirm is disabled without a session job", () => {
    const src = code(read("src/components/commands/rerun.tsx"));
    expect(src).toMatch(/available:\s*\(\)\s*=>\s*media\(\)\.some\(/);
    expect(src).toMatch(/disabled=\{!firstJob\(\)\}/);
    expect(src).toMatch(/rerun\(job\.request\)/);
  });

  it("use-generation-records reads session jobs via lib/jobs getJob, with no persistence (ADR-015)", () => {
    const src = code(read("src/components/genai/use-generation-records.ts"));
    expect(src).toMatch(/import \{ getJob \} from "@\/lib\/jobs"/);
    expect(src).not.toMatch(/localStorage|indexedDB|from "idb"|createStoredSignal|@\/lib\/api/);
  });

  it("requests.ts and use-generate.ts build ModelRequest from @hypergen/dapi", () => {
    for (const rel of ["src/components/genai/requests.ts", "src/components/genai/use-generate.ts", "src/components/genai/use-transforms.ts"]) {
      expect(read(rel), rel).toMatch(/import type \{[^}]*\bModelRequest\b[^}]*\} from "@hypergen\/dapi"/);
    }
  });

  it("no LTX/Lightricks in user-visible strings, and no sentry telemetry, in WP6 files", () => {
    for (const rel of WP6_FILES) {
      const src = read(rel);
      const strings = code(src).match(/(["'`])(?:\\.|(?!\1).)*\1/g) ?? [];
      for (const s of strings) expect(s, rel).not.toMatch(BRAND);
      expect(src, rel).not.toMatch(/\bsentry\b/i);
      expect(src, rel).not.toMatch(/@\/lib\/api\b|@trpc|requireSignIn|showUpgradeDialog/);
    }
  });
});

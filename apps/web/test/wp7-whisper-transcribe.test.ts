// @vitest-environment node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * WP7 acceptance: local Whisper transcription (lib/whisper.ts + its worker,
 * the dapi transcribe handler, auto-captions) and Gemini listen.
 *
 * Behavioural checks with the Web Worker, OfflineAudioContext,
 * @huggingface/transformers, lib/providers and the engine mocked; source
 * guards on the rest. No network, no GPU, no model download, no sleeps.
 *
 * Lives outside `src/` so `tsc -p tsconfig.app.json` does not type-check it.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const WEB = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string) => readFileSync(join(WEB, ...rel.split("/")), "utf8");
const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
const BRAND = /\b(LTX|Lightricks)\b/i;
const MISSING_GEMINI = "Add your Gemini API key in Hypergen > Settings > AI providers.";
const MODEL = "onnx-community/whisper-base_timestamped";

/** Flushes pending promise callbacks (no timers involved). */
const flush = async (n = 10) => {
  for (let i = 0; i < n; i++) await Promise.resolve();
};

// ── lib/whisper.ts ───────────────────────────────────────────

type Posted = { id: number; samples: Float32Array };

class FakeWorker extends EventTarget {
  static instances: FakeWorker[] = [];
  posted: { message: Posted; transfer: unknown[] }[] = [];
  terminated = false;
  constructor(
    public url: URL | string,
    public options?: WorkerOptions,
  ) {
    super();
    FakeWorker.instances.push(this);
  }
  postMessage(message: Posted, transfer: unknown[] = []) {
    this.posted.push({ message, transfer });
  }
  terminate() {
    this.terminated = true;
  }
  emit(data: unknown) {
    this.dispatchEvent(Object.assign(new Event("message"), { data }));
  }
  fail(message: string) {
    this.dispatchEvent(Object.assign(new Event("error"), { message }));
  }
  get lastId() {
    return this.posted.at(-1)!.message.id;
  }
}

/** Channels to decode to; each call to decodeAudioData answers the next queued buffer. */
let decodeQueue: Float32Array[][] = [];
const contextArgs: unknown[][] = [];
const decodeSpy = vi.fn();

class FakeOfflineAudioContext {
  constructor(...args: unknown[]) {
    contextArgs.push(args);
  }
  async decodeAudioData(bytes: ArrayBuffer) {
    decodeSpy(bytes);
    const channels = decodeQueue.shift() ?? [new Float32Array(0)];
    return {
      length: channels[0]!.length,
      numberOfChannels: channels.length,
      getChannelData: (c: number) => channels[c]!,
    };
  }
}

describe("lib/whisper.ts transcribe", () => {
  const fetchSpy = vi.fn();
  beforeEach(() => {
    vi.resetModules();
    FakeWorker.instances = [];
    decodeQueue = [];
    contextArgs.length = 0;
    decodeSpy.mockReset();
    fetchSpy.mockReset();
    vi.stubGlobal("Worker", FakeWorker);
    vi.stubGlobal("OfflineAudioContext", FakeOfflineAudioContext);
    vi.stubGlobal("fetch", fetchSpy);
  });
  afterEach(() => vi.unstubAllGlobals());

  const load = () => import("../src/lib/whisper");
  const audio = () => new Blob([new Uint8Array([1, 2, 3])], { type: "audio/ogg" });

  /** Starts `transcribe`, waits until it has posted to the worker, and returns the pieces. */
  async function start(opts: Parameters<Awaited<ReturnType<typeof load>>["transcribe"]>[1] = {}) {
    const { transcribe } = await load();
    const promise = transcribe(audio(), opts);
    promise.catch(() => {});
    await flush();
    const worker = FakeWorker.instances.at(-1)!;
    return { transcribe, promise, worker };
  }

  it("decodes at 16 kHz mono, averaging channels, and transfers the samples to a module worker", async () => {
    decodeQueue.push([new Float32Array([1, 0.5, -1, 0]), new Float32Array([0, 0.5, 1, 1])]);
    const { promise, worker } = await start();
    expect(contextArgs[0]).toEqual([1, 1, 16_000]);
    expect(decodeSpy).toHaveBeenCalledOnce();
    const { message, transfer } = worker.posted[0]!;
    expect(Array.from(message.samples)).toEqual([0.5, 0.5, 0, 0.5]);
    expect(transfer).toEqual([message.samples.buffer]);
    expect(String(worker.url)).toMatch(/whisper\.worker\.ts$/);
    expect(worker.options).toEqual({ type: "module" });
    worker.emit({ id: message.id, chunks: [] });
    await expect(promise).resolves.toEqual([]);
  });

  it("returns whisperToTranscript(chunks, duration); a null last end becomes the audio duration", async () => {
    decodeQueue.push([new Float32Array(32_000)]); // 2 s
    const { promise, worker } = await start();
    const { whisperToTranscript } = await import("@hypergen/dapi");
    const chunks = [
      { text: " Hello", timestamp: [0.1, 0.4] as [number, number] },
      { text: " world.", timestamp: [0.5, null] as [number, null] },
    ];
    worker.emit({ id: worker.lastId, chunks });
    const transcript = await promise;
    expect(transcript).toEqual(whisperToTranscript(chunks, 2));
    expect(transcript[0]!.words.at(-1)!.end).toBe(2);
  });

  it("reports model download progress 0..1 through onProgress, ignoring other ids", async () => {
    decodeQueue.push([new Float32Array(16)]);
    const onProgress = vi.fn();
    const { promise, worker } = await start({ onProgress });
    const id = worker.lastId;
    worker.emit({ id: id + 99, progress: 0.9 });
    worker.emit({ id: id + 99, chunks: [{ text: "stray", timestamp: [0, 1] }] });
    worker.emit({ id, progress: 0 });
    worker.emit({ id, progress: 0.42 });
    worker.emit({ id, progress: 1 });
    worker.emit({ id, chunks: [] });
    await expect(promise).resolves.toEqual([]);
    expect(onProgress.mock.calls.map(([p]) => p)).toEqual([0, 0.42, 1]);
  });

  it("progress without an onProgress callback does not throw", async () => {
    decodeQueue.push([new Float32Array(16)]);
    const { promise, worker } = await start();
    worker.emit({ id: worker.lastId, progress: 0.5 });
    worker.emit({ id: worker.lastId, chunks: [] });
    await expect(promise).resolves.toEqual([]);
  });

  it("keeps one worker for the session: the model is loaded once", async () => {
    decodeQueue.push([new Float32Array(16)], [new Float32Array(16)]);
    const { transcribe, promise, worker } = await start();
    worker.emit({ id: worker.lastId, chunks: [] });
    await promise;
    const second = transcribe(audio());
    await flush();
    expect(FakeWorker.instances).toHaveLength(1);
    expect(worker.posted).toHaveLength(2);
    expect(worker.posted[1]!.message.id).not.toBe(worker.posted[0]!.message.id);
    worker.emit({ id: worker.lastId, chunks: [] });
    await expect(second).resolves.toEqual([]);
  });

  it("concurrent requests are answered by id, out of order", async () => {
    decodeQueue.push([new Float32Array(16_000)], [new Float32Array(16_000)]);
    const { transcribe } = await load();
    const a = transcribe(audio());
    const b = transcribe(audio());
    await flush();
    const worker = FakeWorker.instances[0]!;
    const [idA, idB] = worker.posted.map((p) => p.message.id);
    worker.emit({ id: idB, chunks: [{ text: "bee.", timestamp: [0, 0.5] }] });
    worker.emit({ id: idA, chunks: [{ text: "ay.", timestamp: [0, 0.5] }] });
    expect((await a)[0]!.text).toBe("ay.");
    expect((await b)[0]!.text).toBe("bee.");
  });

  it("silent / empty audio resolves to an empty transcript", async () => {
    decodeQueue.push([new Float32Array(0)]);
    const { promise, worker } = await start();
    expect(worker.posted[0]!.message.samples.length).toBe(0);
    worker.emit({ id: worker.lastId, chunks: [{ text: "   ", timestamp: [0, null] }] });
    await expect(promise).resolves.toEqual([]);
  });

  it("an error reply rejects with its message; the worker is kept", async () => {
    decodeQueue.push([new Float32Array(16)]);
    const { promise, worker } = await start();
    worker.emit({ id: worker.lastId, error: "no backend available" });
    await expect(promise).rejects.toThrow("no backend available");
    expect(worker.terminated).toBe(false);
  });

  it("a worker crash rejects, terminates it, and the next call starts a fresh worker", async () => {
    decodeQueue.push([new Float32Array(16)], [new Float32Array(16)]);
    const { transcribe, promise, worker } = await start();
    worker.fail("");
    await expect(promise).rejects.toThrow(/worker failed/i);
    expect(worker.terminated).toBe(true);
    const next = transcribe(audio());
    await flush();
    expect(FakeWorker.instances).toHaveLength(2);
    const fresh = FakeWorker.instances[1]!;
    fresh.emit({ id: fresh.lastId, chunks: [] });
    await expect(next).resolves.toEqual([]);
  });

  it("a worker crash message is passed through when present", async () => {
    decodeQueue.push([new Float32Array(16)]);
    const { promise, worker } = await start();
    worker.fail("out of memory");
    await expect(promise).rejects.toThrow("out of memory");
  });

  it("an already-aborted signal rejects before decoding or starting a worker", async () => {
    const { transcribe } = await load();
    const controller = new AbortController();
    controller.abort(new Error("cancelled"));
    await expect(transcribe(audio(), { signal: controller.signal })).rejects.toThrow("cancelled");
    expect(decodeSpy).not.toHaveBeenCalled();
    expect(FakeWorker.instances).toHaveLength(0);
  });

  it("aborting mid-run rejects with the reason; a late answer is dropped and the worker reused", async () => {
    decodeQueue.push([new Float32Array(16)], [new Float32Array(16)]);
    const controller = new AbortController();
    const onProgress = vi.fn();
    const { transcribe, promise, worker } = await start({ signal: controller.signal, onProgress });
    const id = worker.lastId;
    controller.abort(new DOMException("cancelled", "AbortError"));
    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
    worker.emit({ id, progress: 0.5 });
    worker.emit({ id, chunks: [{ text: "late", timestamp: [0, 1] }] });
    expect(onProgress).not.toHaveBeenCalled();
    expect(worker.terminated).toBe(false);
    const next = transcribe(audio());
    await flush();
    expect(FakeWorker.instances).toHaveLength(1);
    worker.emit({ id: worker.lastId, chunks: [] });
    await expect(next).resolves.toEqual([]);
  });

  it("a decode failure rejects and starts no worker", async () => {
    vi.stubGlobal(
      "OfflineAudioContext",
      class {
        decodeAudioData() {
          return Promise.reject(new Error("Unable to decode audio data"));
        }
      },
    );
    const { transcribe } = await load();
    await expect(transcribe(audio())).rejects.toThrow("Unable to decode audio data");
    expect(FakeWorker.instances).toHaveLength(0);
  });

  it("makes no network call of its own", async () => {
    decodeQueue.push([new Float32Array(16)]);
    const { promise, worker } = await start();
    worker.emit({ id: worker.lastId, chunks: [] });
    await promise;
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("source: worker via new URL('./whisper.worker.ts', import.meta.url) as a module; no key, fetch or api", () => {
    const src = code(read("src/lib/whisper.ts"));
    expect(src).toMatch(/new Worker\(\s*new URL\(\s*['"]\.\/whisper\.worker\.ts['"]\s*,\s*import\.meta\.url\s*\)\s*,\s*\{\s*type:\s*['"]module['"]\s*\}/);
    expect(src).toMatch(/whisperToTranscript/);
    expect(src).not.toMatch(/\bfetch\s*\(|apiKey|api_key|requireSignIn|@\/lib\/api|api-contract|@trpc/);
    expect(src).not.toMatch(BRAND);
  });
});

// ── lib/whisper.worker.ts ────────────────────────────────────

describe("lib/whisper.worker.ts", () => {
  const pipeline = vi.fn();
  const asr = vi.fn();
  const env = { backends: { onnx: { wasm: { wasmPaths: "https://cdn.example/ort/" } as { wasmPaths?: string } } } };
  let scope: { onmessage: ((event: { data: Posted }) => Promise<void>) | null; postMessage: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.resetModules();
    pipeline.mockReset();
    asr.mockReset();
    env.backends.onnx.wasm = { wasmPaths: "https://cdn.example/ort/" };
    scope = { onmessage: null, postMessage: vi.fn() };
    vi.stubGlobal("self", scope);
    vi.doMock("@huggingface/transformers", () => ({ pipeline, env }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.doUnmock("@huggingface/transformers");
  });

  const load = async () => {
    await import("../src/lib/whisper.worker");
    return (id: number, samples = new Float32Array(16)) => scope.onmessage!({ data: { id, samples } });
  };

  it("drops the CDN wasmPaths so the bundled ONNX runtime is used", async () => {
    await load();
    expect(env.backends.onnx.wasm.wasmPaths).toBeUndefined();
  });

  it("loads the ASR pipeline on webgpu and runs word timestamps in 30 s chunks", async () => {
    pipeline.mockResolvedValue(asr);
    asr.mockResolvedValue({ text: "hi", chunks: [{ text: " hi", timestamp: [0, 0.3] }] });
    const send = await load();
    const samples = new Float32Array([0.1, 0.2]);
    await send(7, samples);
    expect(pipeline).toHaveBeenCalledOnce();
    expect(pipeline.mock.calls[0]![0]).toBe("automatic-speech-recognition");
    expect(pipeline.mock.calls[0]![1]).toBe(MODEL);
    expect(pipeline.mock.calls[0]![2]).toMatchObject({ device: "webgpu" });
    expect(asr).toHaveBeenCalledWith(samples, { return_timestamps: "word", chunk_length_s: 30 });
    expect(scope.postMessage).toHaveBeenLastCalledWith({ id: 7, chunks: [{ text: " hi", timestamp: [0, 0.3] }] });
  });

  it("falls back to wasm when webgpu throws", async () => {
    pipeline.mockRejectedValueOnce(new Error("WebGPU is not supported")).mockResolvedValueOnce(asr);
    asr.mockResolvedValue({ chunks: [] });
    const send = await load();
    await send(1);
    expect(pipeline.mock.calls.map((c) => c[2].device)).toEqual(["webgpu", "wasm"]);
    expect(scope.postMessage).toHaveBeenLastCalledWith({ id: 1, chunks: [] });
  });

  it("loads the model once across requests", async () => {
    pipeline.mockResolvedValue(asr);
    asr.mockResolvedValue({ chunks: [] });
    const send = await load();
    await send(1);
    await send(2);
    await send(3);
    expect(pipeline).toHaveBeenCalledOnce();
    expect(asr).toHaveBeenCalledTimes(3);
  });

  it("posts download progress_total as 0..1 with the request id; other statuses are ignored", async () => {
    pipeline.mockImplementation(async (_task, _model, { progress_callback }) => {
      progress_callback({ status: "initiate", file: "x" });
      progress_callback({ status: "progress", progress: 99, file: "x" });
      progress_callback({ status: "progress_total", progress: 0 });
      progress_callback({ status: "progress_total", progress: 37.5 });
      progress_callback({ status: "progress_total", progress: 100 });
      progress_callback({ status: "done" });
      return asr;
    });
    asr.mockResolvedValue({ chunks: [] });
    const send = await load();
    await send(5);
    const progress = scope.postMessage.mock.calls.map(([m]) => m).filter((m) => "progress" in m);
    expect(progress).toEqual([
      { id: 5, progress: 0 },
      { id: 5, progress: 0.375 },
      { id: 5, progress: 1 },
    ]);
  });

  it("array output uses its first item; missing chunks become []", async () => {
    pipeline.mockResolvedValue(asr);
    asr.mockResolvedValueOnce([{ chunks: [{ text: "a", timestamp: [0, 1] }] }]).mockResolvedValueOnce({ text: "" });
    const send = await load();
    await send(1);
    expect(scope.postMessage).toHaveBeenLastCalledWith({ id: 1, chunks: [{ text: "a", timestamp: [0, 1] }] });
    await send(2);
    expect(scope.postMessage).toHaveBeenLastCalledWith({ id: 2, chunks: [] });
  });

  it("when both webgpu and wasm fail it posts the error, and the next request retries the load", async () => {
    pipeline
      .mockRejectedValueOnce(new Error("no webgpu"))
      .mockRejectedValueOnce(new Error("Failed to fetch model (offline)"))
      .mockResolvedValueOnce(asr);
    asr.mockResolvedValue({ chunks: [] });
    const send = await load();
    await send(1);
    expect(scope.postMessage).toHaveBeenLastCalledWith({ id: 1, error: "Failed to fetch model (offline)" });
    await send(2);
    expect(pipeline).toHaveBeenCalledTimes(3);
    expect(scope.postMessage).toHaveBeenLastCalledWith({ id: 2, chunks: [] });
  });

  it("a recognition failure (non-Error thrown) is posted as a string error", async () => {
    pipeline.mockResolvedValue(asr);
    asr.mockRejectedValue("boom");
    const send = await load();
    await send(9);
    expect(scope.postMessage).toHaveBeenLastCalledWith({ id: 9, error: "boom" });
  });

  it("source: model id, webgpu then wasm, word timestamps; nothing but the model download", () => {
    const src = code(read("src/lib/whisper.worker.ts"));
    expect(src).toContain(MODEL);
    expect(src).toMatch(/['"]webgpu['"]/);
    expect(src).toMatch(/['"]wasm['"]/);
    expect(src).not.toMatch(/\bfetch\s*\(|apiKey|api_key|@\/lib\/api|api-contract|\bsentry\b|posthog|telemetry/i);
    expect(src).not.toMatch(BRAND);
  });
});

// ── dapi/handlers/transcribe.ts ──────────────────────────────

const asset = { id: "a1", type: "AUDIO", duration: 10, path: "lib/a1.ogg" };

function requireAssetTypeImpl(a: { id: string; type: string }, types: readonly string[], expected: string) {
  if (!types.includes(a.type)) throw Object.assign(new Error(`Asset ${a.id} is not ${expected}.`), { code: "wrong-kind" });
}

describe("dapi/handlers/transcribe.ts", () => {
  const whisper = { transcribe: vi.fn() };
  const uploads = { sha256: vi.fn(), uploadFile: vi.fn() };
  const assets = { resolveAsset: vi.fn(), requireAssetType: vi.fn(requireAssetTypeImpl) };
  const audio = { audioFile: vi.fn() };
  const jobs = { runJob: vi.fn() };

  beforeEach(() => {
    vi.resetModules();
    for (const fn of [whisper.transcribe, uploads.sha256, uploads.uploadFile, assets.resolveAsset, audio.audioFile, jobs.runJob]) fn.mockReset();
    vi.doMock("../src/lib/whisper", () => whisper);
    vi.doMock("../src/lib/uploads", () => uploads);
    vi.doMock("../src/dapi/lib/assets", () => assets);
    vi.doMock("../src/dapi/lib/audio", () => audio);
    vi.doMock("../src/lib/jobs", () => jobs);
    assets.resolveAsset.mockResolvedValue(asset);
    audio.audioFile.mockImplementation(async () => new Blob(["pcm"], { type: "audio/ogg" }));
    uploads.sha256.mockResolvedValue("sha-1");
  });
  afterEach(() => {
    for (const m of ["../src/lib/whisper", "../src/lib/uploads", "../src/dapi/lib/assets", "../src/dapi/lib/audio", "../src/lib/jobs"]) vi.doUnmock(m);
  });

  const ctx = (signal = new AbortController().signal) => ({ signal, session: () => null }) as never;
  const load = () => import("../src/dapi/handlers/transcribe");
  const SEGMENTS = [{ text: "Hello there.", words: [{ text: "Hello", start: 0, end: 0.4 }, { text: "there.", start: 0.5, end: 0.9 }] }];

  it("transcribes locally and returns {segments} that parse with the transcribe result schema", async () => {
    whisper.transcribe.mockResolvedValue(SEGMENTS);
    const { transcribe } = await load();
    const { toolByName } = await import("@hypergen/dapi");
    const signal = new AbortController().signal;
    const out = await transcribe({ path: "a1" } as never, ctx(signal));
    expect(out).toEqual({ segments: SEGMENTS });
    expect(toolByName("transcribe").result!.parse(out)).toEqual(out);
    expect(whisper.transcribe).toHaveBeenCalledWith(expect.any(Blob), expect.objectContaining({ signal }));
    expect(jobs.runJob).not.toHaveBeenCalled();
    expect(uploads.uploadFile).not.toHaveBeenCalled();
  });

  it("caches by sha256 for the session: the same audio is transcribed once", async () => {
    whisper.transcribe.mockResolvedValue(SEGMENTS);
    const { transcribe } = await load();
    await transcribe({ path: "a1" } as never, ctx());
    await transcribe({ path: "a1" } as never, ctx());
    expect(whisper.transcribe).toHaveBeenCalledOnce();
    uploads.sha256.mockResolvedValue("sha-2");
    await transcribe({ path: "a1" } as never, ctx());
    expect(whisper.transcribe).toHaveBeenCalledTimes(2);
  });

  it("concurrent requests for the same audio share one transcription", async () => {
    let resolve!: (v: unknown) => void;
    whisper.transcribe.mockReturnValue(new Promise((r) => (resolve = r)));
    const { transcribe } = await load();
    const a = transcribe({ path: "a1" } as never, ctx());
    const b = transcribe({ path: "a1" } as never, ctx());
    await flush();
    resolve(SEGMENTS);
    expect(await a).toEqual(await b);
    expect(whisper.transcribe).toHaveBeenCalledOnce();
  });

  it("a failed (or cancelled) transcription is not cached: asking again retries", async () => {
    whisper.transcribe.mockRejectedValueOnce(new DOMException("cancelled", "AbortError")).mockResolvedValueOnce(SEGMENTS);
    const { transcribe } = await load();
    await expect(transcribe({ path: "a1" } as never, ctx())).rejects.toMatchObject({ name: "AbortError" });
    await flush();
    await expect(transcribe({ path: "a1" } as never, ctx())).resolves.toEqual({ segments: SEGMENTS });
    expect(whisper.transcribe).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["an empty transcript", []],
    ["segments without words", [{ text: "", words: [] }]],
  ])("%s throws 'No speech detected'", async (_label, segments) => {
    whisper.transcribe.mockResolvedValue(segments);
    const { transcribe } = await load();
    const error = await transcribe({ path: "a1" } as never, ctx()).catch((e: unknown) => e);
    expect((error as Error).message).toMatch(/^No speech detected/);
    expect((error as Error).message).not.toMatch(BRAND);
  });

  it("a non-media asset is rejected before any audio is read or transcribed", async () => {
    assets.resolveAsset.mockResolvedValue({ ...asset, type: "IMAGE" });
    const { transcribe } = await load();
    const error = await transcribe({ path: "a1" } as never, ctx()).catch((e: unknown) => e);
    expect((error as { code: string }).code).toBe("wrong-kind");
    expect(audio.audioFile).not.toHaveBeenCalled();
    expect(whisper.transcribe).not.toHaveBeenCalled();
  });

  it("a VIDEO asset is accepted", async () => {
    assets.resolveAsset.mockResolvedValue({ ...asset, type: "VIDEO" });
    whisper.transcribe.mockResolvedValue(SEGMENTS);
    const { transcribe } = await load();
    await expect(transcribe({ path: "C:\\Users\\me\\clip.mp4" } as never, ctx())).resolves.toEqual({ segments: SEGMENTS });
    expect(assets.resolveAsset).toHaveBeenCalledWith(expect.anything(), "C:\\Users\\me\\clip.mp4");
  });

  it("source: local whisper only; no sign-in, jobs, uploads or api-contract", () => {
    const src = code(read("src/dapi/handlers/transcribe.ts"));
    expect(src).toMatch(/@\/lib\/whisper/);
    expect(src).not.toMatch(/requireSignIn|runJob|uploadFile|api-contract|@\/lib\/api|@trpc|\bfetch\s*\(/);
    expect(src).not.toMatch(BRAND);
  });
});

// ── dapi/handlers/listen.ts ──────────────────────────────────

describe("dapi/handlers/listen.ts", () => {
  const providers = { geminiGenerate: vi.fn() };
  const assets = { resolveAsset: vi.fn(), requireAssetType: vi.fn(requireAssetTypeImpl) };
  const audio = { audioFile: vi.fn() };
  const jobs = { runJob: vi.fn() };
  const uploads = { uploadFile: vi.fn(), sha256: vi.fn() };
  const MB = 1024 * 1024;

  beforeEach(() => {
    vi.resetModules();
    for (const fn of [providers.geminiGenerate, assets.resolveAsset, audio.audioFile, jobs.runJob, uploads.uploadFile]) fn.mockReset();
    vi.doMock("../src/lib/providers", () => providers);
    vi.doMock("../src/dapi/lib/assets", () => assets);
    vi.doMock("../src/dapi/lib/audio", () => audio);
    vi.doMock("../src/lib/jobs", () => jobs);
    vi.doMock("../src/lib/uploads", () => uploads);
    assets.resolveAsset.mockResolvedValue(asset);
    audio.audioFile.mockImplementation(async () => new Blob([new Uint8Array([7, 8, 9])], { type: "audio/ogg" }));
    providers.geminiGenerate.mockResolvedValue({ text: "  A voice says hello.\n" });
  });
  afterEach(() => {
    for (const m of ["../src/lib/providers", "../src/dapi/lib/assets", "../src/dapi/lib/audio", "../src/lib/jobs", "../src/lib/uploads"]) vi.doUnmock(m);
  });

  const ctx = (signal = new AbortController().signal) => ({ signal, session: () => null }) as never;
  const load = () => import("../src/dapi/handlers/listen");

  it("no window: whole audio + default prompt to geminiGenerate; returns {result} trimmed, no start/end", async () => {
    const { listen } = await load();
    const out = await listen({ path: "a1" } as never, ctx());
    expect(out).toEqual({ result: "A voice says hello." });
    expect(out).not.toHaveProperty("start");
    expect(out).not.toHaveProperty("end");
    expect(audio.audioFile).toHaveBeenCalledWith(asset);
    const [prompt, media] = providers.geminiGenerate.mock.calls[0]!;
    expect(typeof prompt).toBe("string");
    expect(prompt.length).toBeGreaterThan(0);
    expect(prompt).not.toMatch(BRAND);
    expect(media.mimeType).toBe("audio/ogg");
    expect(media.data).toBeInstanceOf(Uint8Array);
    expect(Array.from(media.data)).toEqual([7, 8, 9]);
    expect(jobs.runJob).not.toHaveBeenCalled();
    expect(uploads.uploadFile).not.toHaveBeenCalled();
  });

  it("the given prompt is sent as is", async () => {
    const { listen } = await load();
    await listen({ path: "a1", prompt: "Name the song." } as never, ctx());
    expect(providers.geminiGenerate.mock.calls[0]![0]).toBe("Name the song.");
  });

  it("an untyped audio blob is sent as audio/mpeg", async () => {
    audio.audioFile.mockResolvedValue(new Blob([new Uint8Array([1])]));
    const { listen } = await load();
    await listen({ path: "a1" } as never, ctx());
    expect(providers.geminiGenerate.mock.calls[0]![1].mimeType).toBe("audio/mpeg");
  });

  it("a window sends only that span and echoes start/end; end is clamped to the duration", async () => {
    const { listen } = await load();
    expect(await listen({ path: "a1", start: 2, end: 4 } as never, ctx())).toEqual({ result: "A voice says hello.", start: 2, end: 4 });
    expect(audio.audioFile).toHaveBeenLastCalledWith(asset, 2, 4);
    expect(await listen({ path: "a1", start: 3, end: 99 } as never, ctx())).toMatchObject({ start: 3, end: 10 });
    expect(audio.audioFile).toHaveBeenLastCalledWith(asset, 3, 10);
  });

  it("only start: the window runs to the end; only end: it starts at 0", async () => {
    const { listen } = await load();
    expect(await listen({ path: "a1", start: 6 } as never, ctx())).toMatchObject({ start: 6, end: 10 });
    expect(await listen({ path: "a1", end: 5 } as never, ctx())).toMatchObject({ start: 0, end: 5 });
  });

  it.each([
    [5, 5],
    [12, 20],
    [10, undefined],
  ])("an empty window (start %s, end %s) is invalid-input without reading audio", async (start, end) => {
    const { listen } = await load();
    const error = await listen({ path: "a1", start, end } as never, ctx()).catch((e: unknown) => e);
    expect((error as { code: string }).code).toBe("invalid-input");
    expect(audio.audioFile).not.toHaveBeenCalled();
    expect(providers.geminiGenerate).not.toHaveBeenCalled();
  });

  it("exactly 20 MB is sent", async () => {
    audio.audioFile.mockResolvedValue(new Blob([new Uint8Array(20 * MB)], { type: "audio/ogg" }));
    const { listen } = await load();
    await expect(listen({ path: "a1" } as never, ctx())).resolves.toEqual({ result: "A voice says hello." });
  });

  it("over 20 MB is DapiError invalid-input telling the user to pass a shorter start/end window", async () => {
    audio.audioFile.mockResolvedValue(new Blob([new Uint8Array(20 * MB + 1)], { type: "audio/ogg" }));
    const { listen } = await load();
    const { isDapiError } = await import("@hypergen/dapi");
    const error = await listen({ path: "a1" } as never, ctx()).catch((e: unknown) => e);
    expect(isDapiError(error)).toBe(true);
    expect((error as { code: string }).code).toBe("invalid-input");
    expect((error as Error).message).toMatch(/20 MB/);
    expect((error as Error).message).toMatch(/shorter start\/end window/);
    expect((error as Error).message).not.toMatch(BRAND);
    expect(providers.geminiGenerate).not.toHaveBeenCalled();
  });

  it("a missing Gemini key surfaces DapiError MISSING_KEY with the settings hint", async () => {
    const { missingKey } = await import("@hypergen/dapi");
    providers.geminiGenerate.mockRejectedValue(missingKey("gemini"));
    const { listen } = await load();
    const error = await listen({ path: "a1" } as never, ctx()).catch((e: unknown) => e);
    expect((error as { code: string }).code).toBe("MISSING_KEY");
    expect((error as Error).message).toBe(MISSING_GEMINI);
  });

  it("a MISSING_KEY wire error from main maps back to the same DapiError", async () => {
    const { fromWireError } = await import("@hypergen/dapi");
    providers.geminiGenerate.mockRejectedValue(fromWireError(`MISSING_KEY: ${MISSING_GEMINI}`));
    const { listen } = await load();
    const error = await listen({ path: "a1" } as never, ctx()).catch((e: unknown) => e);
    expect((error as { code: string }).code).toBe("MISSING_KEY");
    expect((error as Error).message).toBe(MISSING_GEMINI);
  });

  it("an offline / provider error propagates unchanged", async () => {
    providers.geminiGenerate.mockRejectedValue(new Error("Gemini request failed: network unreachable"));
    const { listen } = await load();
    await expect(listen({ path: "a1" } as never, ctx())).rejects.toThrow("network unreachable");
  });

  it("an aborted request never reaches Gemini", async () => {
    const controller = new AbortController();
    controller.abort(new Error("cancelled"));
    const { listen } = await load();
    await expect(listen({ path: "a1" } as never, ctx(controller.signal))).rejects.toThrow("cancelled");
    expect(providers.geminiGenerate).not.toHaveBeenCalled();
  });

  it("an empty answer is an empty result string", async () => {
    providers.geminiGenerate.mockResolvedValue({ text: "   " });
    const { listen } = await load();
    expect(await listen({ path: "a1" } as never, ctx())).toEqual({ result: "" });
  });

  it("a non-media asset is rejected before reading audio", async () => {
    assets.resolveAsset.mockResolvedValue({ ...asset, type: "IMAGE" });
    const { listen } = await load();
    const error = await listen({ path: "a1" } as never, ctx()).catch((e: unknown) => e);
    expect((error as { code: string }).code).toBe("wrong-kind");
    expect(providers.geminiGenerate).not.toHaveBeenCalled();
  });

  it("result shape parses with the listen output schema", async () => {
    const { listen } = await load();
    const { toolByName } = await import("@hypergen/dapi");
    const schema = toolByName("listen").output;
    for (const args of [{ path: "a1" }, { path: "a1", start: 1, end: 2 }]) {
      const out = await listen(args as never, ctx());
      expect(schema.parse(out)).toEqual(out);
    }
  });

  it("source: geminiGenerate only; no sign-in, jobs, uploads or api", () => {
    const src = code(read("src/dapi/handlers/listen.ts"));
    expect(src).toMatch(/geminiGenerate/);
    expect(src).not.toMatch(/requireSignIn|runJob|uploadFile|api-contract|@\/lib\/api|@trpc|\bfetch\s*\(/);
    expect(src).not.toMatch(BRAND);
  });
});

// ── engine/generate/captions.tsx ─────────────────────────────

describe("engine/generate/captions.tsx generateCaptions", () => {
  const Shimmering = Symbol("Shimmering");
  const Caption = Symbol("Caption");
  const Library = Symbol("Library");
  const toast = Object.assign(vi.fn(), { loading: vi.fn(), error: vi.fn(), dismiss: vi.fn() });
  const whisper = { transcribe: vi.fn() };
  const sceneAudio = { encodeSceneAudio: vi.fn(), hasAudio: vi.fn() };
  const release = vi.fn();
  const shimmer = vi.fn(() => release);
  const editor = { deselect: vi.fn(), select: vi.fn(), editProperty: vi.fn(), insertElement: vi.fn() };
  const getEntityTree = vi.fn();
  let stored: { blob: Blob; name: string }[] = [];
  let existingAssets: { name: string }[] = [];
  const library = {
    list: () => existingAssets,
    store: vi.fn(async (blob: Blob, { name }: { name: string }) => {
      stored.push({ blob, name });
      return { path: `library/${name}` };
    }),
  };
  const world = { get: (t: symbol) => (t === Library ? library : undefined) };
  const scene = { has: vi.fn(() => false) };
  const SEGMENTS = [{ text: "Hi.", words: [{ text: "Hi.", start: 0, end: 0.3 }] }];

  beforeEach(() => {
    vi.resetModules();
    for (const fn of [toast, toast.loading, toast.error, toast.dismiss, whisper.transcribe, sceneAudio.encodeSceneAudio, sceneAudio.hasAudio, release, shimmer, getEntityTree, library.store, scene.has, ...Object.values(editor)])
      fn.mockClear();
    whisper.transcribe.mockReset();
    shimmer.mockImplementation(() => release);
    scene.has.mockImplementation(() => false);
    sceneAudio.hasAudio.mockReturnValue(true);
    sceneAudio.encodeSceneAudio.mockResolvedValue(new Blob(["mix"], { type: "audio/ogg" }));
    getEntityTree.mockReturnValue([scene]);
    editor.insertElement.mockReturnValue([{ id: "captions-entity" }]);
    toast.loading.mockImplementation((_m: string, { id }: { id?: unknown } = {}) => id ?? "toast-1");
    stored = [];
    existingAssets = [];
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.doMock("../src/lib/whisper", () => whisper);
    vi.doMock("../src/engine/scene-audio", () => sceneAudio);
    vi.doMock("../src/engine/generate/shimmer", () => ({ shimmer }));
    vi.doMock("../src/engine/editor", () => ({ getDocumentEditor: () => editor }));
    vi.doMock("somoto", () => ({ toast }));
    vi.doMock("@hypergen/runtime", () => ({ Caption, Library, Shimmering, getEntityTree }));
    vi.doMock("@hypergen/reconciler", () => ({ Captions: () => null }));
    vi.doMock("@hypergen/assets", () => ({ assetName: (a: { name: string }) => a.name }));
  });
  afterEach(() => {
    vi.restoreAllMocks();
    for (const m of [
      "../src/lib/whisper",
      "../src/engine/scene-audio",
      "../src/engine/generate/shimmer",
      "../src/engine/editor",
      "somoto",
      "@hypergen/runtime",
      "@hypergen/reconciler",
      "@hypergen/assets",
    ])
      vi.doUnmock(m);
  });

  const load = () => import("../src/engine/generate/captions");
  const run = async () => (await load()).generateCaptions(world as never, scene as never);

  it("transcribes the encoded scene audio locally, stores the transcript JSON array and inserts <captions>", async () => {
    whisper.transcribe.mockResolvedValue(SEGMENTS);
    await run();
    const mix = await sceneAudio.encodeSceneAudio.mock.results[0]!.value;
    expect(whisper.transcribe).toHaveBeenCalledWith(mix, expect.objectContaining({ onProgress: expect.any(Function) }));
    expect(stored).toHaveLength(1);
    expect(stored[0]!.name).toBe("Captions 1.json");
    expect(stored[0]!.blob.type).toBe("application/json");
    expect(JSON.parse(await stored[0]!.blob.text())).toEqual(SEGMENTS);
    expect(editor.insertElement).toHaveBeenCalledWith(scene, expect.any(Function));
    expect(editor.select).toHaveBeenCalledWith({ id: "captions-entity" });
    expect(shimmer).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledOnce();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("names the next free Captions N.json", async () => {
    existingAssets = [{ name: "Captions 1.json" }, { name: "Captions 7.json" }, { name: "Captions x.json" }, { name: "clip.mp4" }];
    whisper.transcribe.mockResolvedValue(SEGMENTS);
    await run();
    expect(stored[0]!.name).toBe("Captions 8.json");
  });

  it("an existing <captions> is repointed at the new transcript instead of adding one", async () => {
    const existing = { has: (t: symbol) => t === Caption };
    getEntityTree.mockReturnValue([scene, existing]);
    whisper.transcribe.mockResolvedValue(SEGMENTS);
    await run();
    expect(editor.editProperty).toHaveBeenCalledWith(existing, "src", "library/Captions 1.json");
    expect(editor.select).toHaveBeenCalledWith(existing);
    expect(editor.insertElement).not.toHaveBeenCalled();
  });

  it("shows model download percent in one loading toast, updated in place, dismissed at the end", async () => {
    whisper.transcribe.mockImplementation(async (_blob, { onProgress }) => {
      onProgress(0);
      onProgress(0.426);
      onProgress(1);
      return SEGMENTS;
    });
    await run();
    const messages = toast.loading.mock.calls.map(([m]) => m as string);
    expect(messages).toHaveLength(3);
    expect(messages[0]).toMatch(/\b0%/);
    expect(messages[1]).toMatch(/\b43%/);
    expect(messages[2]).toMatch(/\b100%/);
    for (const m of messages) expect(m).not.toMatch(BRAND);
    expect(toast.loading.mock.calls[1]![1]).toEqual({ id: "toast-1" });
    expect(toast.dismiss).toHaveBeenCalledWith("toast-1");
    expect(release).toHaveBeenCalledOnce();
  });

  it("no progress (model already cached): no loading toast and nothing to dismiss", async () => {
    whisper.transcribe.mockResolvedValue(SEGMENTS);
    await run();
    expect(toast.loading).not.toHaveBeenCalled();
    expect(toast.dismiss).not.toHaveBeenCalled();
  });

  it("no speech: error toast, nothing stored or mounted, shimmer released", async () => {
    whisper.transcribe.mockResolvedValue([{ text: "", words: [] }]);
    await run();
    expect(toast.error).toHaveBeenCalledOnce();
    expect(toast.error.mock.calls[0]![1].description).toMatch(/No speech detected/);
    expect(library.store).not.toHaveBeenCalled();
    expect(editor.insertElement).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledOnce();
  });

  it("a transcription failure (e.g. offline model download) is a toast, not a throw; the download toast is dismissed", async () => {
    whisper.transcribe.mockImplementation(async (_blob, { onProgress }) => {
      onProgress(0.1);
      throw new Error("Failed to fetch model: network unreachable");
    });
    await expect(run()).resolves.toBeUndefined();
    expect(toast.error.mock.calls[0]![1].description).toBe("Failed to fetch model: network unreachable");
    expect(toast.error.mock.calls[0]![0]).not.toMatch(BRAND);
    expect(toast.dismiss).toHaveBeenCalledWith("toast-1");
    expect(release).toHaveBeenCalledOnce();
    expect(library.store).not.toHaveBeenCalled();
  });

  it("an audio encode failure is a toast and never reaches whisper", async () => {
    sceneAudio.encodeSceneAudio.mockRejectedValue(new Error("encode failed"));
    await run();
    expect(whisper.transcribe).not.toHaveBeenCalled();
    expect(toast.error.mock.calls[0]![1].description).toBe("encode failed");
    expect(release).toHaveBeenCalledOnce();
  });

  it("a scene without audio gets a hint toast and nothing runs", async () => {
    sceneAudio.hasAudio.mockReturnValue(false);
    await run();
    expect(toast).toHaveBeenCalledOnce();
    expect(toast.mock.calls[0]![1].description).toMatch(/No audio found/);
    expect(shimmer).not.toHaveBeenCalled();
    expect(whisper.transcribe).not.toHaveBeenCalled();
  });

  it("a scene already shimmering (captioning in flight) is left alone", async () => {
    scene.has.mockImplementation((t: symbol) => t === Shimmering);
    await run();
    expect(sceneAudio.hasAudio).not.toHaveBeenCalled();
    expect(whisper.transcribe).not.toHaveBeenCalled();
  });

  it("source: local whisper, no sign-in / jobs / upload / api; keeps shimmer and <Captions>", () => {
    const src = code(read("src/engine/generate/captions.tsx"));
    expect(src).toMatch(/from\s+['"]@\/lib\/whisper['"]/);
    expect(src).toMatch(/encodeSceneAudio/);
    expect(src).toMatch(/shimmer\(/);
    expect(src).toMatch(/<Captions\b/);
    expect(src).not.toMatch(/requireSignIn|runJob|uploadFile|api-contract|@\/lib\/api|@trpc|\bfetch\s*\(/);
    expect(src).not.toMatch(BRAND);
  });
});

// ── package / build config ───────────────────────────────────

describe("WP7 package and config", () => {
  it("@huggingface/transformers is a pinned dependency and is installed", () => {
    const pkg = JSON.parse(read("package.json"));
    expect(pkg.dependencies["@huggingface/transformers"]).toMatch(/^\d+\.\d+\.\d+$/);
    const resolved = import.meta.resolve?.("@huggingface/transformers");
    expect(resolved).toBeTruthy();
  });

  it("vite keeps transformers.js and onnxruntime-web out of prebundling", () => {
    const src = read("vite.config.ts");
    expect(src).toMatch(/optimizeDeps[\s\S]*exclude[\s\S]*@huggingface\/transformers/);
  });
});

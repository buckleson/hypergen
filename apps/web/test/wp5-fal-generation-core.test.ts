// @vitest-environment node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * WP5 acceptance: generation runs on fal.ai through main-IPC (lib/providers),
 * tRPC / api-contract / upgrade dialog are gone.
 *
 * Behavioural checks on lib/uploads, lib/jobs and dapi/handlers/generate with
 * lib/providers (the main bridge) mocked and fake timers; source-level guards
 * on the rest. No network, no desktop app, no sleeps.
 *
 * Lives outside `src/` so `tsc -p tsconfig.app.json` does not type-check it.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const WEB = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string) => readFileSync(join(WEB, ...rel.split("/")), "utf8");
const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

const MISSING_FAL = "Add your fal.ai API key in Hypergen > Settings > AI providers.";
const BRAND = /\b(LTX|Lightricks)\b/i;

// ── lib/uploads.ts ───────────────────────────────────────────

describe("lib/uploads.ts uploadFile", () => {
  const fetchSpy = vi.fn();
  beforeEach(() => {
    vi.resetModules();
    fetchSpy.mockReset();
    vi.stubGlobal("fetch", fetchSpy);
  });
  afterEach(() => vi.unstubAllGlobals());

  const load = () => import("../src/lib/uploads");

  it("returns a base64 data: URI with the blob's type, and makes no network call", async () => {
    const { uploadFile } = await load();
    const uri = await uploadFile(new Blob(["hello"], { type: "image/png" }));
    expect(uri).toBe(`data:image/png;base64,${Buffer.from("hello").toString("base64")}`);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("an untyped blob falls back to application/octet-stream", async () => {
    const { uploadFile } = await load();
    expect(await uploadFile(new Blob([new Uint8Array([1, 2, 3])]))).toBe("data:application/octet-stream;base64,AQID");
  });

  it("an empty blob is a valid empty data: URI", async () => {
    const { uploadFile } = await load();
    expect(await uploadFile(new Blob([], { type: "audio/wav" }))).toBe("data:audio/wav;base64,");
  });

  it("round-trips binary bytes across chunk boundaries (> 32 KiB, all byte values)", async () => {
    const { uploadFile } = await load();
    const bytes = new Uint8Array(0x8000 * 2 + 17).map((_, i) => i % 256);
    const uri = await uploadFile(new Blob([bytes], { type: "video/mp4" }));
    const decoded = Buffer.from(uri.split(",")[1]!, "base64");
    expect(decoded.equals(Buffer.from(bytes))).toBe(true);
  });

  it("exactly 10 MB is accepted", async () => {
    const { uploadFile } = await load();
    const uri = await uploadFile(new Blob([new Uint8Array(10 * 1024 * 1024)], { type: "image/jpeg" }));
    expect(uri.startsWith("data:image/jpeg;base64,")).toBe(true);
  });

  it("one byte over 10 MB throws DapiError invalid-input naming the 10 MB limit, without a fetch", async () => {
    const { uploadFile } = await load();
    const { isDapiError } = await import("@hypergen/dapi");
    const error = await uploadFile(new Blob([new Uint8Array(10 * 1024 * 1024 + 1)])).catch((e: unknown) => e);
    expect(isDapiError(error)).toBe(true);
    expect((error as { code: string }).code).toBe("invalid-input");
    expect((error as Error).message).toMatch(/10 MB/);
    expect((error as Error).message).not.toMatch(BRAND);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("source has no fetch / upload endpoint left", () => {
    const src = code(read("src/lib/uploads.ts"));
    expect(src).not.toMatch(/\bfetch\s*\(/);
    expect(src).not.toMatch(/@\/lib\/api|@trpc|api-contract|presign|signedUrl/i);
  });
});

// ── lib/jobs.ts ──────────────────────────────────────────────

const providers = {
  keyStatus: vi.fn(),
  falSubmit: vi.fn(),
  falPoll: vi.fn(),
  falCancel: vi.fn(),
};

function mockProviders() {
  vi.doMock("../src/lib/providers", () => providers);
  for (const fn of Object.values(providers)) fn.mockReset();
  providers.keyStatus.mockResolvedValue({ fal: true, gemini: false });
  providers.falSubmit.mockResolvedValue({ requestId: "req-1" });
  providers.falCancel.mockResolvedValue(undefined);
}

const REQUEST = { model: "flux-2-klein", prompt: "a red fox" } as const;

describe("lib/jobs.ts runJob", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    mockProviders();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.doUnmock("../src/lib/providers");
  });

  const load = () => import("../src/lib/jobs");

  it("submits toFalInput(request) to fal, polls ~1 s, maps queued->running->succeeded with assets", async () => {
    providers.falPoll
      .mockResolvedValueOnce({ status: "IN_QUEUE" })
      .mockResolvedValueOnce({ status: "IN_PROGRESS" })
      .mockResolvedValueOnce({
        status: "COMPLETED",
        files: [{ url: "https://fal.media/x.png", fileName: "x.png", contentType: "image/png" }],
      });
    const { runJob, getJob } = await load();
    const { toFalInput } = await import("@hypergen/dapi");
    const seen: string[] = [];
    const done = runJob({ ...REQUEST }, (job) => seen.push(job.status));

    await vi.advanceTimersByTimeAsync(0);
    const { endpoint, input } = toFalInput({ ...REQUEST });
    expect(providers.falSubmit).toHaveBeenCalledWith(endpoint, input);
    expect(seen).toEqual(["queued"]);
    expect(providers.falPoll).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(999);
    expect(providers.falPoll).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(providers.falPoll).toHaveBeenCalledTimes(1);
    expect(providers.falPoll).toHaveBeenCalledWith("req-1");

    await vi.advanceTimersByTimeAsync(2000);
    const job = await done;
    expect(providers.falPoll).toHaveBeenCalledTimes(3);
    expect(seen).toEqual(["queued", "queued", "running", "succeeded"]);
    expect(job).toMatchObject({ id: "req-1", model: "flux-2-klein", status: "succeeded", error: null, etaSeconds: 8 });
    expect(job.assets).toEqual([{ url: "https://fal.media/x.png", filename: "x.png", mimeType: "image/png" }]);
    expect(getJob("req-1")).toEqual(job);
  });

  it("COMPLETED with an error resolves a failed job (no throw) whose jobFailure is the message", async () => {
    providers.falPoll.mockResolvedValueOnce({ status: "COMPLETED", error: "NSFW content detected" });
    const { runJob, jobFailure } = await load();
    const done = runJob({ ...REQUEST }, () => {});
    await vi.advanceTimersByTimeAsync(1000);
    const job = await done;
    expect(job.status).toBe("failed");
    expect(job.error).toEqual({ code: "FAILED", message: "NSFW content detected" });
    expect(jobFailure(job)).toBe("NSFW content detected");
  });

  it("COMPLETED with no files is a succeeded job with no assets", async () => {
    providers.falPoll.mockResolvedValueOnce({ status: "COMPLETED" });
    const { runJob } = await load();
    const done = runJob({ ...REQUEST }, () => {});
    await vi.advanceTimersByTimeAsync(1000);
    expect(await done).toMatchObject({ status: "succeeded", assets: [] });
  });

  it("a missing fal key rejects with DapiError MISSING_KEY before any submit", async () => {
    providers.keyStatus.mockResolvedValue({ fal: false, gemini: true });
    const { runJob } = await load();
    const { isDapiError } = await import("@hypergen/dapi");
    const onUpdate = vi.fn();
    const error = await runJob({ ...REQUEST }, onUpdate).catch((e: unknown) => e);
    expect(isDapiError(error)).toBe(true);
    expect((error as { code: string }).code).toBe("MISSING_KEY");
    expect((error as Error).message).toBe(MISSING_FAL);
    expect(providers.falSubmit).not.toHaveBeenCalled();
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("keyStatus itself failing (offline main / no desktop) rejects and submits nothing", async () => {
    providers.keyStatus.mockRejectedValue(new Error("not running in desktop"));
    const { runJob } = await load();
    await expect(runJob({ ...REQUEST }, () => {})).rejects.toThrow(/not running in desktop/);
    expect(providers.falSubmit).not.toHaveBeenCalled();
  });

  it("an unknown model rejects invalid-input before key check or submit", async () => {
    const { runJob } = await load();
    const error = await runJob({ model: "ltx-2-pro" } as never, () => {}).catch((e: unknown) => e);
    expect((error as { code: string }).code).toBe("invalid-input");
    expect(providers.keyStatus).not.toHaveBeenCalled();
    expect(providers.falSubmit).not.toHaveBeenCalled();
  });

  it("a submit failure rejects and leaves no job behind", async () => {
    providers.falSubmit.mockRejectedValue(new Error("fal.ai returned 422"));
    const { runJob, getJob } = await load();
    await expect(runJob({ ...REQUEST }, () => {})).rejects.toThrow("fal.ai returned 422");
    expect(getJob("req-1")).toBeUndefined();
  });

  it("aborting the signal calls falCancel, marks the job canceled and throws the abort reason", async () => {
    providers.falPoll.mockResolvedValue({ status: "IN_PROGRESS" });
    const { runJob, getJob, jobFailure } = await load();
    const controller = new AbortController();
    const done = runJob({ ...REQUEST }, () => {}, controller.signal);
    const settled = done.catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(1000);
    controller.abort(new Error("user stopped"));
    await vi.advanceTimersByTimeAsync(1000);
    const error = await settled;
    expect((error as Error).message).toBe("user stopped");
    expect(providers.falCancel).toHaveBeenCalledWith("req-1");
    const job = getJob("req-1")!;
    expect(job.status).toBe("canceled");
    expect(jobFailure(job)).toBe("The generation was canceled.");
  });

  it("an abort while falCancel itself fails still cancels locally", async () => {
    providers.falPoll.mockResolvedValue({ status: "IN_QUEUE" });
    providers.falCancel.mockRejectedValue(new Error("offline"));
    const { runJob, getJob } = await load();
    const controller = new AbortController();
    const settled = runJob({ ...REQUEST }, () => {}, controller.signal).catch((e: unknown) => e);
    controller.abort();
    await vi.advanceTimersByTimeAsync(1000);
    await settled;
    expect(getJob("req-1")!.status).toBe("canceled");
  });

  it("cancelJob from another caller stops the loop and runJob resolves canceled", async () => {
    providers.falPoll.mockResolvedValue({ status: "IN_PROGRESS" });
    const { runJob, cancelJob } = await load();
    const done = runJob({ ...REQUEST }, () => {});
    await vi.advanceTimersByTimeAsync(1000);
    const canceled = await cancelJob("req-1");
    expect(canceled?.status).toBe("canceled");
    await vi.advanceTimersByTimeAsync(1000);
    expect((await done).status).toBe("canceled");
    expect(providers.falCancel).toHaveBeenCalledTimes(1);
  });

  it("cancelJob on a finished job does not call falCancel and returns it unchanged", async () => {
    providers.falPoll.mockResolvedValueOnce({ status: "COMPLETED", files: [] });
    const { runJob, cancelJob } = await load();
    const done = runJob({ ...REQUEST }, () => {});
    await vi.advanceTimersByTimeAsync(1000);
    await done;
    expect((await cancelJob("req-1"))?.status).toBe("succeeded");
    expect(providers.falCancel).not.toHaveBeenCalled();
  });

  it("transient poll failures are retried; five in a row fail the job and reject", async () => {
    providers.falPoll
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ status: "IN_PROGRESS" })
      .mockRejectedValue(new Error("still offline"));
    const { runJob, getJob } = await load();
    const settled = runJob({ ...REQUEST }, () => {}).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(7000);
    const error = await settled;
    expect((error as Error).message).toBe("still offline");
    expect(providers.falPoll).toHaveBeenCalledTimes(7);
    expect(getJob("req-1")).toMatchObject({ status: "failed", error: { message: "still offline" } });
  });

  it("getJob / cancelJob on an id unknown this session answer undefined without IPC", async () => {
    const { getJob, cancelJob } = await load();
    expect(getJob("never-seen")).toBeUndefined();
    expect(getJob("")).toBeUndefined();
    expect(await cancelJob("never-seen")).toBeUndefined();
    expect(providers.falCancel).not.toHaveBeenCalled();
  });

  it("jobs are session-only: a fresh module (reload) no longer knows earlier jobs", async () => {
    providers.falPoll.mockResolvedValueOnce({ status: "COMPLETED", files: [] });
    const first = await load();
    const done = first.runJob({ ...REQUEST }, () => {});
    await vi.advanceTimersByTimeAsync(1000);
    await done;
    expect(first.getJob("req-1")).toBeDefined();
    vi.resetModules();
    mockProviders();
    const second = await load();
    expect(second.getJob("req-1")).toBeUndefined();
  });

  it("jobFailure defaults when a failed job has no message", async () => {
    const { jobFailure } = await load();
    expect(jobFailure({ status: "failed", error: null } as never)).toBe("The generation failed.");
    expect(jobFailure({ status: "failed", error: { code: "X", message: "" } } as never)).toBe("The generation failed.");
  });

  it("source: no api / trpc / persistence; uses lib/providers", () => {
    const src = code(read("src/lib/jobs.ts"));
    expect(src).not.toMatch(/@\/lib\/api|@trpc|api-contract|localStorage|indexedDB/);
    expect(src).toMatch(/from\s+["']\.\/providers["']|from\s+["']@\/lib\/providers["']/);
    expect(src).toMatch(/HYPERGEN_MODELS/);
  });
});

// ── dapi/handlers/generate.ts ────────────────────────────────

describe("dapi/handlers/generate.ts", () => {
  const jobsMod = { runJob: vi.fn(), getJob: vi.fn(), cancelJob: vi.fn() };
  const local = { localJob: vi.fn(), startLocalJob: vi.fn() };

  beforeEach(() => {
    vi.resetModules();
    for (const fn of [...Object.values(jobsMod), ...Object.values(local)]) fn.mockReset();
    vi.doMock("../src/lib/jobs", () => jobsMod);
    vi.doMock("../src/lib/uploads", () => ({ uploadFile: vi.fn(async () => "data:x;base64,") }));
    vi.doMock("../src/engine/scene-audio", () => ({ encodeSceneAudio: vi.fn(), hasAudio: vi.fn() }));
    vi.doMock("@hypergen/runtime", () => ({ getAssetFile: vi.fn(), getLibrary: vi.fn() }));
    vi.doMock("../src/dapi/lib/assets", () => ({ resolveAsset: vi.fn() }));
    vi.doMock("../src/dapi/lib/audio", () => ({ audioFile: vi.fn() }));
    vi.doMock("../src/dapi/lib/scene", () => ({ requireScene: vi.fn() }));
    vi.doMock("../src/dapi/local/jobs", () => local);
  });
  afterEach(() => {
    for (const m of [
      "../src/lib/jobs",
      "../src/lib/uploads",
      "../src/engine/scene-audio",
      "@hypergen/runtime",
      "../src/dapi/lib/assets",
      "../src/dapi/lib/audio",
      "../src/dapi/lib/scene",
      "../src/dapi/local/jobs",
    ])
      vi.doUnmock(m);
  });

  const ctx = { session: () => null, requireSession: () => { throw new Error("no session"); } } as never;
  const load = () => import("../src/dapi/handlers/generate");
  const queued = { id: "req-9", model: "flux-2-klein", status: "queued", assets: [], error: null };

  it("estimate returns {etaSeconds} from the catalog and starts nothing", async () => {
    const { generate } = await load();
    const { HYPERGEN_MODELS } = await import("@hypergen/dapi");
    const out = await generate({ model: "kling-v3-pro", prompt: "x", estimate: true } as never, ctx);
    expect(out).toEqual({ etaSeconds: HYPERGEN_MODELS["kling-v3-pro"].etaSeconds });
    expect(out).not.toHaveProperty("credits");
    expect(jobsMod.runJob).not.toHaveBeenCalled();
  }, 20000);

  it("generate starts a fal job via runJob and answers with its first state (disk, no session)", async () => {
    jobsMod.runJob.mockImplementation((_req, onUpdate) => {
      onUpdate(queued);
      return new Promise(() => {});
    });
    const { generate } = await load();
    const out = (await generate({ model: "flux-2-klein", prompt: "fox" } as never, ctx)) as { job: { id: string; status: string } };
    expect(jobsMod.runJob).toHaveBeenCalledWith({ model: "flux-2-klein", prompt: "fox" }, expect.any(Function));
    expect(out.job).toMatchObject({ id: "req-9", status: "queued" });
  });

  it("generate surfaces MISSING_KEY from runJob unchanged", async () => {
    const { missingKey } = await import("@hypergen/dapi");
    jobsMod.runJob.mockRejectedValue(missingKey("fal"));
    const { generate } = await load();
    const error = await generate({ model: "flux-2-klein", prompt: "x" } as never, ctx).catch((e: unknown) => e);
    expect((error as { code: string }).code).toBe("MISSING_KEY");
    expect((error as Error).message).toBe(MISSING_FAL);
  });

  it("job(id) reads fal jobs via getJob; job(id, cancel) via cancelJob", async () => {
    jobsMod.getJob.mockReturnValue({ ...queued, status: "running" });
    jobsMod.cancelJob.mockResolvedValue({ ...queued, status: "canceled" });
    const { job } = await load();
    expect(((await job({ id: "req-9" } as never, ctx)) as { job: { status: string } }).job.status).toBe("running");
    expect(((await job({ id: "req-9", cancel: true } as never, ctx)) as { job: { status: string } }).job.status).toBe("canceled");
    expect(jobsMod.cancelJob).toHaveBeenCalledWith("req-9");
  });

  it("job on an id unknown this session is DapiError not-found", async () => {
    jobsMod.getJob.mockReturnValue(undefined);
    jobsMod.cancelJob.mockResolvedValue(undefined);
    const { job } = await load();
    for (const cancel of [false, true]) {
      const error = await job({ id: "gone", cancel } as never, ctx).catch((e: unknown) => e);
      expect((error as { code: string }).code).toBe("not-found");
      expect((error as Error).message).not.toMatch(BRAND);
    }
  });

  it("local (sam-2.1) generate and local job ids go to local/jobs, never to fal", async () => {
    const { LOCAL_JOB_PREFIX } = await import("@hypergen/dapi");
    local.startLocalJob.mockResolvedValue({ job: { id: `${LOCAL_JOB_PREFIX}1` } });
    local.localJob.mockReturnValue({ job: { id: `${LOCAL_JOB_PREFIX}1`, status: "running" } });
    const { generate, job } = await load();
    await generate({ model: "sam-2.1", image: { path: "a.png" } } as never, ctx);
    expect(local.startLocalJob).toHaveBeenCalledOnce();
    await job({ id: `${LOCAL_JOB_PREFIX}1`, cancel: true } as never, ctx);
    expect(local.localJob).toHaveBeenCalledWith(`${LOCAL_JOB_PREFIX}1`, true);
    expect(jobsMod.runJob).not.toHaveBeenCalled();
    expect(jobsMod.getJob).not.toHaveBeenCalled();
  });

  it("source: no requireSignIn, api import, remote or credits", () => {
    const src = code(read("src/dapi/handlers/generate.ts"));
    expect(src).not.toMatch(/requireSignIn|@\/lib\/api|\.\.\/lib\/remote|maxCredits|\bcredits\b|api-contract|@trpc/);
  });
});

// ── Source-level guards ──────────────────────────────────────

describe("WP5 source guards", () => {
  it("deleted files are gone", () => {
    for (const rel of ["src/lib/api.ts", "src/components/upgrade-dialog.tsx", "src/dapi/lib/remote.ts"]) {
      expect(existsSync(join(WEB, ...rel.split("/"))), rel).toBe(false);
    }
  });

  it("local/jobs.ts has no api-contract import and no credits field", () => {
    const src = code(read("src/dapi/local/jobs.ts"));
    expect(src).not.toMatch(/api-contract|@trpc|\bcredits\b|maxCredits/);
  });

  it("run.tsx has no TRPCClientError / PAYMENT_REQUIRED / upgrade dialog branch", () => {
    const src = code(read("src/engine/generate/run.tsx"));
    expect(src).not.toMatch(/TRPCClientError|PAYMENT_REQUIRED|showUpgradeDialog|upgrade-dialog|@trpc|api-contract/);
  });

  it("run.tsx reports a failure with the error's own message (so MISSING_KEY shows the exact fal key text)", () => {
    const src = code(read("src/engine/generate/run.tsx"));
    const report = src.slice(src.indexOf("function report("));
    expect(report).toMatch(/toast\.error\(/);
    expect(report).toMatch(/error instanceof Error \? error\.message/);
  });

  it("asset-info reads the job from lib/jobs getJob and has no toast for an unknown job", () => {
    const src = code(read("src/components/sidebar-right/inspector/asset-info.tsx"));
    expect(src).toMatch(/import\s*\{[^}]*\bgetJob\b[^}]*\}\s*from\s*["']@\/lib\/jobs["']/);
    expect(src).not.toMatch(/toast|@\/lib\/api|@trpc|createResource\([^)]*api/);
    expect(src).toMatch(/getJob\(a\.job\)\s*:\s*undefined/);
  });

  it("reuse-settings reads getJob and degrades with a plain (non-error) toast", () => {
    const src = code(read("src/components/commands/reuse-settings.tsx"));
    expect(src).toMatch(/import\s*\{[^}]*\bgetJob\b[^}]*\}\s*from\s*["']@\/lib\/jobs["']/);
    expect(src).not.toMatch(/toast\.error|@\/lib\/api|@trpc/);
    expect(src).not.toMatch(BRAND);
  });

  it("package.json drops @trpc/* and @diffusionstudio/api-contract", () => {
    const pkg = JSON.parse(read("package.json")) as Record<string, Record<string, string> | undefined>;
    const deps = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies };
    for (const name of Object.keys(deps)) {
      expect(name).not.toMatch(/^@trpc\/|^@diffusionstudio\/api-contract$/);
    }
  });

  it("acceptance grep is empty over the WP5 files", () => {
    const FILES = [
      "src/lib/jobs.ts",
      "src/lib/uploads.ts",
      "src/dapi/handlers/generate.ts",
      "src/dapi/local/jobs.ts",
      "src/engine/generate/run.tsx",
      "src/components/sidebar-right/inspector/asset-info.tsx",
      "src/components/commands/reuse-settings.tsx",
      "package.json",
    ];
    const PATTERN = /@\/lib\/api|@trpc|api-contract|requireSignIn|showUpgradeDialog/;
    for (const rel of FILES) expect(read(rel), rel).not.toMatch(PATTERN);
  });

  it("no LTX/Lightricks in user-visible strings of WP5 files", () => {
    for (const rel of ["src/lib/jobs.ts", "src/lib/uploads.ts", "src/dapi/handlers/generate.ts", "src/engine/generate/run.tsx", "src/components/commands/reuse-settings.tsx"]) {
      const strings = code(read(rel)).match(/(["'`])(?:\\.|(?!\1).)*\1/g) ?? [];
      for (const s of strings) expect(s, rel).not.toMatch(BRAND);
    }
  });
});

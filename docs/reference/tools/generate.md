# generate

Start a job on a generative model — images, video, music, sound effects, speech, background removal and upscaling on fal.ai with the user's own fal.ai API key, and object segmentation and tracking ([`sam-2.1`](./segment.md)) on this machine — and return the job at once, with its estimated run time. Poll [`job`](./job.md) with its id until it has ended; the files it made are then saved and their paths returned. With [`estimate`](#estimating), nothing starts: the answer is only how long the job would run. fal.ai models need a fal.ai API key, added in Hypergen > Settings > AI providers; [local models](../models.md#local) run on the GPU and need no key.

| | |
| --- | --- |
| MCP tool | `generate` |
| CLI | `hypergen generate <model> [fields] [options]` |
| CLI aliases | `hypergen gen` |

## Input

The input is the model's request — `model` plus that model's fields — with two fields of the tool's own. Every model and the fields it takes are listed in [models.md](../models.md).

| Field | Type | CLI | Description |
| --- | --- | --- | --- |
| `model` | `string`, required | `<model>` | the model to run, one of the ids in [models.md](../models.md) |
| *the model's fields* | | `[fields]`, `-p, --prompt <text>` | `prompt`, `images`, `aspectRatio`, `duration`, `voice`, … as the model takes them. On the CLI one JSON object; `--prompt` sets `prompt` without JSON quoting |
| `output` | `string` | `-o, --output <path>` | file the result is saved as: a library path like `b-roll/fox.png` (needs an open project) or an absolute path; its extension is corrected to what the model made, several files are numbered (`fox-1.png`, `fox-2.png`), and a file already there is replaced (default: the library's root under the model's name for the file with a project open, its files under `assets/`; else a fresh directory under the system temp dir). On the CLI a path starting with `.` resolves against the working directory. |
| `estimate` | `boolean` | `--estimate` | don't start the job: answer with only its `etaSeconds` (see [Estimating](#estimating)) |

A fal.ai model's fields are not checked here: they are mapped to the model's fal endpoint as given, and fal.ai answers a request it cannot run with what to fix (e.g. an aspect ratio the model does not offer). Each model narrows its kind's bounds, so read its entry in [models.md](../models.md) rather than guessing. A [local model](../models.md#local)'s fields are checked by the app, the same way, before its job starts.

## Files

Where a field takes a file (`images`, `startFrame`, `endFrame`, `image`, `video`), put a `{ "path": … }` object: an absolute path or URL (with or without an open project), or a library path like `b-roll/clip.mp4` (needs an open project). The file is sent inline with the request, as a data URI; nothing is uploaded ahead of the job. A file sent to a model can be at most 10 MB (`invalid-input` otherwise). A local model reads the file in place. On the CLI a `path` that exists relative to the working directory is sent as its absolute path.

```json
{
  "model": "nano-banana-pro",
  "prompt": "The fox from the first image in the snowy forest of the second, golden hour",
  "images": [{ "path": "/Users/me/refs/fox.png" }, { "path": "b-roll/forest.jpg" }],
  "aspectRatio": "16:9",
  "resolution": "2K"
}
```

```bash
hypergen generate flux-2-klein --prompt "A red fox at dawn, misty meadow, telephoto"
hypergen generate nano-banana-pro --prompt "The fox in the forest" '{"images":[{"path":"./fox.png"},{"path":"./forest.jpg"}],"aspectRatio":"16:9"}'
hypergen generate seedance-2.0-fast --prompt "The fox turns and runs into the trees" '{"startFrame":{"path":"./fox.png"},"duration":6}' -o ./fox-run.mp4
hypergen generate elevenlabs-v3 --prompt "Welcome back to the channel." '{"voice":"JBFqnCBsd6RMkjVDRZzb"}'
hypergen generate bria-background-removal '{"image":{"path":"./fox.png"}}'
```

## Estimating

With `estimate`, nothing starts: the answer is `{ etaSeconds }`, the model's estimated run time, and nothing else. Use it to know when to look before a long job, or to compare models for the same request.

```bash
hypergen generate seedance-2.0-fast --prompt "The fox turns and runs into the trees" '{"duration":8}' --estimate
# prints { "etaSeconds": … }
```

No file is sent and no key is needed. `output` is ignored. A [local model](../models.md#local)'s `etaSeconds` is planned from the file as its job would be.

## Where the files go

`output` names the file the result is saved as, chosen when the job starts:

- **The extension is the model's.** What a model makes decides the type, so an extension that does not match is replaced and a missing one is added: `fox.jpg` becomes `fox.png` when the model made a PNG, `clips/run` becomes `clips/run.mp4`. Read the returned `path`, not the one you asked for.
- **Several files are numbered.** A job that makes more than one (an image `count` above 1) saves `fox-1.png`, `fox-2.png`, …; a single file is saved at the path itself.
- **A library path** (`b-roll/fox.png`, needs an open project) puts the file into the project's library, under `assets/`, named by `src` like any other asset, and notes the job it came from, as the app's own generations do. A file the project made already at that path is replaced, and everything naming it shows the new one; a file linked from elsewhere on disk is never written over, and the result gets a free name next to it instead.
- **An absolute path** saves the file there, replacing a file already there.
- **Left out**, the file goes into the open project's library at its root under the model's name for the file (`red-fox-at-dawn.png`, numbered if taken), or where a local model files its own (`sam-2.1`: `masks/<video>/Tracking <n>.mask`); with no project open, into a fresh directory of the job's own under the system temp dir, as [`transcribe`](./transcribe.md) and the other inspection tools do.

The files are saved by the first [`job`](./job.md) call that sees the job succeed (a local model's library files as soon as it does); later calls return the same paths. A file a fal.ai model made that went into the library records the job in `assets.yml` (its `job` field), so what made it can be looked up later.

## Output

With `estimate`, `{ etaSeconds }` and nothing else. Otherwise, the job as it is when the call returns — almost always `queued`; a local model's quick work, such as a `sam-2.1` preview, already ended — and the same shape [`job`](./job.md) returns. Each file in `assets` has its download `url` replaced by where it was saved. The fields to act on:

```ts
{
  id: string;                         // for `job`
  status: string;                     // queued, running → succeeded, failed or canceled; stop polling once it has ended
  etaSeconds: number;                 // estimated seconds the model runs for
  etaRemainingSeconds: number | null; // estimated seconds left while running
  error: { code: string; message: string } | null;  // why it failed or was canceled
  progress?: number | null;           // a local model's job: 0..1 through its current `phase`
  details?: object;                   // a local model's job: what it found, model by model (see models.md)
  assets: Array<{                     // the files it made, empty until it succeeds
    path: string;                     // absolute path of the saved file
    src?: string;                     // its library path, for `src`, when it went into the library
    // …and filename, mimeType
  }>;
}
```

## Errors

- `MISSING_KEY` — a fal.ai model, and no fal.ai API key is saved. The message: `Add your fal.ai API key in Hypergen > Settings > AI providers.`
- `invalid-input` — the app rejected the request (an unknown model, a file over 10 MB, or, for a local model, a field it cannot take); the message names the field and what it takes.
- `no-project` — `output` or a file is a library path and no project is open.
- `not-found` — a `{ path }` names no file.
- fal.ai rejected or failed the request: the job ends `failed`, with fal.ai's reason in `error`.

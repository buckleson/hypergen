# Models

Every model [`generate`](./tools/generate.md) runs, and the fields each takes. A request is `model` plus these fields. Generation runs on [fal.ai](https://fal.ai) with the user's own fal.ai API key, added in Hypergen > Settings > AI providers; without one, a fal.ai model fails with `MISSING_KEY` (see [generate](./tools/generate.md#errors)). Hypergen maps the fields to the model's fal endpoint, and fal.ai validates them, answering a field it cannot take with what to fix ([local models](#local) are checked by the app the same way). Leave a field out for the model's default. Files are `{ "path": … }` (see [generate](./tools/generate.md#files)).

[`transcribe`](./tools/transcribe.md) is not a model here: it runs locally with Whisper. [`listen`](./tools/listen.md) uses the user's own Gemini API key.

| Kind | Models | Makes |
| --- | --- | --- |
| [Image](#image) | `nano-banana-pro`, `flux-2-klein` | images from a prompt, or edits of reference images |
| [Video](#video) | `kling-v3-pro`, `seedance-2.0-fast` | a clip from a prompt, optionally from a start (and end) frame |
| [Audio](#audio) | `elevenlabs-music`, `elevenlabs-sfx-v2` | music, sound effects |
| [Voice](#voice) | `elevenlabs-v3` | speech |
| [Tools](#tools) | `bria-background-removal`, `seedvr-image-upscale`, `seedvr-video-upscale` | one file in, one file out |
| [Local](#local) | `sam-2.1` | runs on this machine: an object's mask, tracked through footage |

## Image

| Field | Type | Description |
| --- | --- | --- |
| `prompt` | `string`, required | what to make, or how to change the reference images |
| `images` | `{ path }[]` | reference images, or images to edit; up to the model's limit below. With any, the model's edit endpoint runs |
| `aspectRatio` | `string` | output width:height, from the model's row |
| `resolution` | `"1K" \| "2K" \| "4K"` | long edge of about 1024, 2048 or 4096 px; only models with resolutions in their row |
| `count` | `integer` | images to make, 1–4 (default 1); each is its own file |

| Model | Name | fal endpoints | References | Aspect ratios | Resolutions |
| --- | --- | --- | --- | --- | --- |
| `nano-banana-pro` | Nano Banana Pro | `fal-ai/nano-banana-pro`, `fal-ai/nano-banana-pro/edit` | 14 | 16:9, 9:16, 1:1, 4:3, 3:4 | 1K, 2K, 4K |
| `flux-2-klein` | FLUX.2 [klein] 9B | `fal-ai/flux-2/klein/9b`, `fal-ai/flux-2/klein/9b/edit` | 4 | 16:9, 9:16, 1:1, 4:3, 3:4 | — |

## Video

| Field | Type | Description |
| --- | --- | --- |
| `prompt` | `string`, required | the shot: subject, action, camera, sound |
| `startFrame` | `{ path }` | an image the clip starts on; with one, the model's image-to-video endpoint runs |
| `endFrame` | `{ path }` | an image the clip ends on; only with a `startFrame` |
| `duration` | `integer` | seconds, any whole second in the model's range |
| `aspectRatio` | `string` | output width:height, from the model's row |
| `resolution` | `"480p" \| "720p"` | only models with resolutions in their row |

| Model | Name | fal endpoints | Durations (s) | Aspect ratios | Resolutions |
| --- | --- | --- | --- | --- | --- |
| `kling-v3-pro` | Kling 3.0 Pro | `fal-ai/kling-video/v3/pro/text-to-video`, `fal-ai/kling-video/v3/pro/image-to-video` | 3–15 | 16:9, 9:16, 1:1 (text-to-video; from a start frame, its proportions) | — |
| `seedance-2.0-fast` | Seedance 2.0 Fast | `bytedance/seedance-2.0/fast/text-to-video`, `bytedance/seedance-2.0/fast/image-to-video` | 4–15 | 16:9, 9:16, 1:1, 4:3, 3:4 | 480p, 720p |

## Audio

| Field | Type | Description |
| --- | --- | --- |
| `prompt` | `string`, required | the music (genre, mood, instruments, structure, lyrics) or the sound |
| `duration` | `number` | seconds, within the model's range |

| Model | Name | fal endpoint | Duration (s) |
| --- | --- | --- | --- |
| `elevenlabs-music` | ElevenLabs Music | `fal-ai/elevenlabs/music` | 3–600 (default 30) |
| `elevenlabs-sfx-v2` | ElevenLabs Sound Effects v2 | `fal-ai/elevenlabs/sound-effects/v2` | up to 22; left out, the model picks the length |

## Voice

| Field | Type | Description |
| --- | --- | --- |
| `prompt` | `string`, required | the text to speak; audio tags in brackets steer the delivery (`[whispers]`, `[laughs]`) |
| `voice` | `string` | one of the model's voices (linked below) |

| Model | Name | fal endpoint | Voices |
| --- | --- | --- | --- |
| `elevenlabs-v3` | ElevenLabs v3 | `fal-ai/elevenlabs/tts/eleven-v3` | [an ElevenLabs voice id](./voices/elevenlabs-v3.md) |

## Tools

Each takes one file and returns one.

| Model | Name | fal endpoint | Fields | Returns |
| --- | --- | --- | --- | --- |
| `bria-background-removal` | Bria Background Removal | `fal-ai/bria/background/remove` | `image`: `{ path }`, required | the image with a transparent background |
| `seedvr-image-upscale` | SeedVR2 Image Upscale | `fal-ai/seedvr/upscale/image` | `image`: `{ path }`, required; `resolution`: 720p, 1080p, 1440p or 2160p | the image upscaled |
| `seedvr-video-upscale` | SeedVR2 Video Upscale | `fal-ai/seedvr/upscale/video` | `video`: `{ path }`, required; `resolution`: 720p, 1080p, 1440p or 2160p | the video upscaled |

## Local

These run in the app, on this machine's GPU, and need no API key. A job is shaped like a fal.ai one and polled the same way with [`job`](./tools/job.md), with two fields of its own — `progress` (0..1 through its current `phase`) and `details` (what the model found) — and lasts only as long as the app: a job id is gone once the app restarts. The first use of a model downloads it.

| Model | Name | Makes | Fields |
| --- | --- | --- | --- |
| `sam-2.1` | SAM 2.1 — segments an object in a video and tracks it through the footage; `size` tiny (default), small, base-plus or large | a mask file (`.mask`) for a [`<mask src>`](./jsx/masks.md#mask-files) | [segment.md](./tools/segment.md) |

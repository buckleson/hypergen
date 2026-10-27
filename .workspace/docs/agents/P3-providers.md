# P3 brief: replacing the vendor backend (researched 2026-10-27)

## What the upstream had (to remove)
- `@diffusionstudio/api-contract@0.5.0` (npm, MIT). Holds the model lists, request zod schemas, Job/Transcript types, plans, billing and analytics events.
  - **Don't copy it**; write our own small Hypergen catalog in `packages/dapi/src/models.ts`.
  - Model ids are facts, so reuse the names where they map to fal.
- Upstream model ids:
  - Image: flux-2-klein, flux-2-pro, flux-3-image, gpt-image-2.5-sunburst, grok-imagine-image-2.0, krea-2-large, nano-banana-2, nano-banana-2.1, nano-banana-pro, seedream-5.0-pro.
  - Video: flux-3-video, grok-imagine-video-1.5, kling-3-pro, kling-o3-pro, minimax-h3, minimax-h3-max, seedance-2.5, veo-3.1, veo-3.1-fast, wan-3.0.
  - Audio: elevenlabs-music, elevenlabs-sfx.
  - Voice: elevenlabs-v3, elevenlabs-v4, gemini-3.8-flash-tts.
  - Tools: bria-rmbg-2.0 (remove background), seedvr-2 (upscale image), bytedance-upscaler (upscale video).
  - Transcribe: universal-3.5-pro. Analyze/listen: qwen3.8-omni-flash.
- Code paths:
  - `apps/web/src/dapi/handlers/{generate,transcribe,listen}.ts`
  - `apps/web/src/dapi/lib/remote.ts` (requireSignIn)
  - `apps/web/src/lib/{api,jobs,analytics,checkout}.ts`
  - `apps/web/src/engine/generate/run.tsx`
  - `apps/web/src/components/genai/*` (prompt input, estimate, records, transforms)
  - command palette AI commands (auto-captions, remove-silence, remove-background, upscale, generate, edit-with-prompt)
  - `context/auth.tsx`, `pages/login.tsx`, `AuthGate` in `app.tsx`
  - dashboard account/billing/plans/credits/invoices views, `upgrade-dialog.tsx`, `purchase-success.tsx`
  - Sentry in `index.tsx`
  - `apps/desktop/src/analytics.ts`

## fal.ai (generate) — the user's own key
- **Model catalog API (public, no key):**
  - `GET https://api.fal.ai/v1/models?q=<term>&limit=50` returns `models[].endpoint_id`, `metadata.display_name`, `metadata.category`, `metadata.status`.
  - Use it to **verify every endpoint id** before you write it. Example: `fal-ai/kling-video/v3/pro/text-to-video`, `fal-ai/kling-video/v3/pro/image-to-video`, `fal-ai/nano-banana-pro`, `fal-ai/nano-banana-pro/edit`, `fal-ai/veo3.1`, `fal-ai/veo3.1/fast`, `fal-ai/veo3.1/image-to-video`.
  - Add `&expand=openapi-3.0` (check that it works) for input schemas.
- **Queue API:**
  - Submit: `POST https://queue.fal.run/{endpoint_id}`, headers `Authorization: Key <FAL_KEY>` and `Content-Type: application/json`, body = model input. The response has `request_id`, `status_url`, `response_url`, `cancel_url`.
  - Status: `GET status_url` returns `IN_QUEUE` (with `queue_position`), `IN_PROGRESS` or `COMPLETED` (with `error` if it failed).
  - Result: `GET response_url`. The output is model-specific; media comes as `{url, content_type, file_name}`, usually under `images[]`, `video` or `audio`.
  - Cancel: `PUT cancel_url`.
  - Status and result URLs must be built from owner/app only, so use the returned `status_url` and `response_url` as given.
- **File inputs:** a public URL or a `data:` URI (base64) is accepted for most models. Keep it simple: send local files as data URIs. If a file is larger than about 10 MB, fail with a clear message (YAGNI: no upload API now).
- **Scope (YAGNI):** about 10 well-known models covering image (nano-banana-pro, flux), image edit (nano-banana-pro/edit), video (kling v3 pro t2v/i2v, veo3.1 fast, seedance), voice (an elevenlabs TTS on fal), music/sfx (if present on fal), remove background (bria), upscale (seedvr). Verify each id with the catalog API.
- **Estimate/credits:** fal has no estimate endpoint. `estimate` returns `etaSeconds` from a static per-model table; the credits concept goes away. Remove `maxCredits` and `credits` from the tool schemas and the docs.

## Gemini (listen/analyze) — the user's own key
- `POST https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent`, header `x-goog-api-key: <KEY>`.
- Body: `{contents:[{parts:[{inline_data:{mime_type, data:<base64>}}, {text: question}]}]}`.
- Inline requests must stay under about 20 MB. Above that, fail clearly (or use the Files API only if needed).
- Use the model alias `gemini-flash-latest`, so we don't hard-code a version.

## Local Whisper (transcribe) — no key
- `@huggingface/transformers` (transformers.js) in the renderer: `pipeline('automatic-speech-recognition', 'onnx-community/whisper-base_timestamped', { device: 'webgpu' })`, called with `{ return_timestamps: 'word', chunk_length_s: 30 }`.
  - Word-level timestamps need a `_timestamped` export.
  - Fall back to `device: 'wasm'` if WebGPU fails.
- Input: 16 kHz mono Float32Array. Reuse the app's existing audio decode (the waveform tool decodes audio) and resample.
- The model downloads from Hugging Face on first use and the browser caches it. Report progress through the job `progress`.
- Output must match the existing transcript shape that captions and `transcribe` consumers expect: find it in `transcribe.ts` and the captions code.

## Keys
- Settings → "AI providers" panel: fields for Gemini key and fal.ai key, a link to where to get each, and a "Test" button.
- Stored in the Electron main process with `safeStorage.encryptString`, in `<userData>/keys.json`. The renderer never reads raw keys back; it only gets `{gemini: boolean, fal: boolean}`.
- Provider HTTP calls run in main via IPC (`providers:fal:*`, `providers:gemini:*`), which avoids CORS and keeps keys out of the renderer.
- Missing key → error code `MISSING_KEY` with the message "Add your <provider> API key in Hypergen → Settings → AI providers." Agents see this through MCP.

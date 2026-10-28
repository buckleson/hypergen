/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Gemini with the user's key: one prompt about one piece of inline media.

import type { KeyTestResult } from "./keys";

const API_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const MODEL = "gemini-flash-latest";
/** Gemini's limit for inline request data. */
export const MAX_MEDIA_BYTES = 20 * 1024 * 1024;

export type GeminiRequest = { prompt: string; media: { mimeType: string; data: Uint8Array } };

export async function generateWithGemini(
  key: () => Promise<string>,
  { prompt, media }: GeminiRequest,
  fetchFn: typeof fetch = fetch,
): Promise<{ text: string }> {
  if (media.data.byteLength > MAX_MEDIA_BYTES) {
    throw new Error(`The media is ${(media.data.byteLength / 1024 / 1024).toFixed(1)} MB; Gemini accepts at most 20 MB inline.`);
  }
  const apiKey = await key();
  const response = await fetchFn(`${API_URL}/${MODEL}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{
        parts: [
          { inline_data: { mime_type: media.mimeType, data: Buffer.from(media.data).toString("base64") } },
          { text: prompt },
        ],
      }],
    }),
  });
  if (!response.ok) throw new Error(`Gemini request failed (${response.status}): ${await errorText(response)}`);
  const body = (await response.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: unknown }> } }> };
  const parts = body.candidates?.[0]?.content?.parts ?? [];
  return { text: parts.map((part) => (typeof part.text === "string" ? part.text : "")).join("") };
}

/** Whether Gemini accepts `key`: an authenticated model listing, which costs nothing. */
export async function testGeminiKey(key: string, fetchFn: typeof fetch = fetch): Promise<KeyTestResult> {
  try {
    const response = await fetchFn(API_URL, { headers: { "x-goog-api-key": key } });
    if (response.ok) return { ok: true };
    return { ok: false, error: `Gemini rejected the key (${response.status}): ${await errorText(response)}` };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

async function errorText(response: Response): Promise<string> {
  const text = await response.text().catch(() => "");
  try {
    const message = (JSON.parse(text) as { error?: { message?: unknown } }).error?.message;
    if (typeof message === "string") return message;
  } catch { }
  return text || response.statusText;
}

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { readFileSync } from "node:fs";
import { join } from "node:path";

export const INSTRUCTIONS_FILE = "INSTRUCTIONS.md";

const FALLBACK_INSTRUCTIONS =
  "Hypergen, a video editor, is running on this machine and you are connected to it. The tools are the whole API; their descriptions are authoritative.\n\n" +
  "Hypergen is local-first and needs no account. `generate` runs on fal.ai with the user's own fal.ai API key; `listen` uses the user's own Gemini API key; `transcribe` runs locally with Whisper and needs no key. When a tool fails with MISSING_KEY, tell the user to add the key in Hypergen > Settings > AI providers, and do not retry.";

/**
 * The text every client gets on connect: INSTRUCTIONS.md from the docs, then
 * where the docs sit on disk. The page names the skills and everything else
 * it wants read — adding one is editing that file, not this one; the paths in
 * it are relative to the docs, and the sentence below is what anchors them.
 */
export function instructions(docsDir: string | null): string {
  const text = docsDir ? readText(join(docsDir, INSTRUCTIONS_FILE)) : null;
  const parts = [text?.trim() || FALLBACK_INSTRUCTIONS];
  if (docsDir) {
    parts.push(
      `The docs, including every page named above, are the files at \`${docsDir}\`: the skills, the tool and JSX reference, guides, runnable examples, and the brand kit (style references, components and compositions to copy). They belong to the app; read them, never edit them.`,
    );
  }
  return parts.join("\n\n");
}

function readText(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

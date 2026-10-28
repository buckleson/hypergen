/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { toast } from "somoto";
import { getJob } from "@/lib/jobs";
import { useCommand } from "@/context/commands";
import { usePromptInput } from "@/context/prompt-input";
import { useMediaSelection } from "@/components/genai/selection";
import { toConfig } from "@/components/genai/requests";

/**
 * Opens the prompt box with the settings the first selected generated image
 * was made with. Jobs are known for this session only, so an image made
 * before it has no settings to reuse.
 */
export function ReuseSettingsCommand() {
  const { openPromptInput } = usePromptInput();
  const { imageMedia } = useMediaSelection();

  const jobId = () => imageMedia().find((entry) => entry.asset?.job !== undefined)?.asset?.job;

  const reuse = () => {
    const id = jobId();
    const job = id ? getJob(id) : undefined;
    const config = job && toConfig(job.request);
    if (!config) {
      toast("No generation settings found", { description: "Settings are kept for prompt generations made since the app started." });
      return;
    }
    openPromptInput(config);
  };

  useCommand({
    id: "reuse-settings",
    title: "Reuse generation settings",
    group: "Generate",
    icon: "reuse-settings",
    keywords: ["prompt", "config"],
    available: () => jobId() !== undefined,
    run: reuse,
  });

  return null;
}

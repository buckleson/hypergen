/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GenerationEstimate, generate, job } from "./generate";
import { MODEL_IDS } from "../models";
import { LOCAL_MODEL_IDS } from "../local";
import { requestFields } from "../local/fields";
import { toolJsonSchemas } from "../json-schema";

const source = (relative: string) => readFileSync(new URL(relative, import.meta.url), "utf8");

describe("generate model enum", () => {
  it("accepts exactly the Hypergen and local models", () => {
    for (const model of [...MODEL_IDS, ...LOCAL_MODEL_IDS]) expect(generate.input.safeParse({ model }).success).toBe(true);
    const { properties } = toolJsonSchemas(generate).inputSchema as { properties: { model: { enum: string[] } } };
    expect([...properties.model.enum].sort()).toEqual([...MODEL_IDS, ...LOCAL_MODEL_IDS].sort());
  });

  it.each(["", "veo-3.1", "ltx-2", "Nano-Banana-Pro", " nano-banana-pro"])("rejects %j", (model) => {
    expect(generate.input.safeParse({ model, prompt: "p" }).success).toBe(false);
  });

  it("rejects a missing or null model", () => {
    expect(generate.input.safeParse({ prompt: "p" }).success).toBe(false);
    expect(generate.input.safeParse({ model: null }).success).toBe(false);
  });
});

describe("generate has no credits", () => {
  it("declares no maxCredits or credits field", () => {
    const { properties } = toolJsonSchemas(generate).inputSchema as { properties: Record<string, unknown> };
    expect(Object.keys(properties).filter((key) => /credit/i.test(key))).toEqual([]);
    expect(Object.keys(requestFields).sort()).toEqual(["estimate", "output"]);
    const output = toolJsonSchemas(generate).outputSchema as { properties?: Record<string, unknown> };
    expect(Object.keys(output.properties ?? {}).filter((key) => /credit/i.test(key))).toEqual([]);
  });

  it("answers an estimate with etaSeconds alone, dropping anything else", () => {
    expect(GenerationEstimate.parse({ etaSeconds: 12, credits: 4, maxCredits: 9 })).toEqual({ etaSeconds: 12 });
    expect(GenerationEstimate.safeParse({}).success).toBe(false);
    expect(GenerationEstimate.safeParse({ etaSeconds: "12" }).success).toBe(false);
    expect(GenerationEstimate.parse({ etaSeconds: 0 })).toEqual({ etaSeconds: 0 });
  });

  it("rejects a non-boolean estimate flag", () => {
    expect(generate.input.safeParse({ model: "flux-2-klein", estimate: "yes" }).success).toBe(false);
  });
});

describe("generate description", () => {
  const all = [generate.description, job.description, generate.title, job.title].join("\n");

  it("names Hypergen, the user's fal.ai key and MISSING_KEY", () => {
    expect(generate.description).toContain("Hypergen");
    expect(generate.description).toMatch(/fal\.ai API key/);
    expect(generate.description).toContain("MISSING_KEY");
  });

  it("says nothing about credits, accounts, signing in, or another vendor", () => {
    expect(all).not.toMatch(/credit|account|sign[- ]?in|log[- ]?in|subscription|diffusion ?studio|\bLTX\b|lightricks/i);
  });

  it("describes no field with credits", () => {
    expect(JSON.stringify(toolJsonSchemas(generate))).not.toMatch(/credit/i);
    expect(JSON.stringify(toolJsonSchemas(job))).not.toMatch(/credit/i);
  });
});

describe("generate paths", () => {
  it("accepts Windows absolute and UNC output paths and file paths", () => {
    for (const output of ["C:\\Users\\Me\\out\\fox.png", "\\\\server\\share\\fox.png", "D:/clips/fox.mp4"]) {
      expect(generate.input.safeParse({ model: "nano-banana-pro", prompt: "p", output }).success).toBe(true);
    }
    expect(generate.input.safeParse({ model: "bria-background-removal", image: { path: "C:\\in\\a.png" } }).success).toBe(true);
  });
});

describe("WP1 source hygiene", () => {
  const files = ["../models.ts", "../transcript.ts", "../errors.ts", "../index.ts", "./generate.ts", "../local/fields.ts", "../../package.json"];

  it.each(files)("%s has no api-contract, credits, sign-in-required or LTX branding", (file) => {
    expect(source(file)).not.toMatch(/api-contract|credits|sign-in-required|\bLTX\b|lightricks/i);
  });

  it("the CLI drops --max-credits but keeps --estimate", () => {
    const cli = source("../../../../apps/cli/src/index.ts");
    expect(cli).not.toMatch(/max-credits|maxCredits|credits|api-contract/i);
    expect(cli).toContain('"--estimate"');
  });

  it("package.json no longer depends on @diffusionstudio/api-contract", () => {
    const pkg = JSON.parse(source("../../package.json")) as Record<string, Record<string, string> | undefined>;
    for (const key of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
      expect(Object.keys(pkg[key] ?? {})).not.toContain("@diffusionstudio/api-contract");
    }
  });
});

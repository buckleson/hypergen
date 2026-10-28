/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Branding guard for the tool catalog, the dapi/jsx package metadata and the
// tool reference docs: every user- or agent-visible string says Hypergen, and
// the only surviving "dapi" spelling is the package name `@hypergen/dapi`.

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { catalog, toolByName } from "./catalog";
import { toolJsonSchemas } from "./json-schema";
import { MCP_PORT, MCP_URL } from "./mcp";

const here = dirname(fileURLToPath(import.meta.url));
const dapiDir = join(here, "..");
const jsxDir = join(dapiDir, "..", "jsx");
const toolDocsDir = join(dapiDir, "..", "..", "docs", "reference", "tools");

const read = (...parts: string[]) => readFileSync(join(...parts), "utf8");
const json = (...parts: string[]) => JSON.parse(read(...parts)) as Record<string, any>;

const LEGACY = /diffusion|\bdapi\b/i;
const VENDOR = /\bltx\b|lightricks/i;
const OLD_BRAND = /diffusion studio|diffusionstudio\.com|\bdapi\b/i;

// Strip what the criteria keep: the package name.
const scrub = (text: string) => text.replace(/@hypergen\/dapi/g, "");

/** Lines of `text` that still match `re` once the allowed spellings are removed. */
const leaks = (text: string, re: RegExp) =>
  text
    .split(/\r?\n/)
    .map((line, i) => [i + 1, line] as const)
    .filter(([, line]) => re.test(scrub(line)))
    .map(([n, line]) => `${n}: ${line.trim()}`);

/** Every `description` string anywhere in a JSON Schema tree. */
function schemaDescriptions(node: unknown, out: string[] = []): string[] {
  if (Array.isArray(node)) node.forEach((child) => schemaDescriptions(child, out));
  else if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      if ((key === "description" || key === "title") && typeof value === "string") out.push(value);
      else schemaDescriptions(value, out);
    }
  }
  return out;
}

describe("T14 catalog tool descriptions", () => {
  it("report names Hypergen and files on buckleson/hypergen with diagnostics", () => {
    const report = toolByName("report");
    expect(report.description.startsWith(
      "Report a bug in Hypergen. Files a GitHub issue on buckleson/hypergen with diagnostics attached (hypergen version, platform, recent app logs)",
    )).toBe(true);
  });

  it("report's commands arg speaks of the hypergen commands", () => {
    const { inputSchema } = toolJsonSchemas(toolByName("report"));
    const commands = (inputSchema.properties as Record<string, { description?: string }>).commands;
    expect(commands?.description).toMatch(/the hypergen commands/);
    expect(commands?.description).not.toMatch(LEGACY);
  });

  it("export points at the package.json `hypergen.export.<id>` entry", () => {
    const exportTool = toolByName("export");
    expect(exportTool.description).toContain("`hypergen.export.<id>`");
    expect(exportTool.description).toContain("package.json");
    expect(read(here, "tools", "export.ts")).toMatch(/\/\/.*`hypergen\.export\.<id>`/);
  });

  it("generate runs in Hypergen on fal.ai with the user's own key; neither generate nor job mentions Diffusion", () => {
    for (const name of ["generate", "job"] as const) {
      expect(toolByName(name).description, name).not.toMatch(/diffusion/i);
    }
    const description = toolByName("generate").description;
    expect(description).toContain("Hypergen");
    expect(description).toContain("fal.ai with the user's own fal.ai API key");
  });

  it("generate.ts no longer imports the api-contract", () => {
    expect(read(here, "tools", "generate.ts")).not.toMatch(/api-contract/);
  });

  it.each(["export.ts", "report.ts", "generate.ts"])("%s greps clean", (file) => {
    expect(leaks(read(here, "tools", file), LEGACY)).toEqual([]);
  });

  it("no tool's title, description or field help carries a legacy or vendor brand", () => {
    for (const tool of catalog) {
      const { inputSchema, outputSchema } = toolJsonSchemas(tool);
      const strings = [tool.title, tool.description, ...schemaDescriptions(inputSchema), ...schemaDescriptions(outputSchema)];
      for (const text of strings) {
        expect(text, `${tool.name}: ${text}`).not.toMatch(OLD_BRAND);
        expect(text, `${tool.name}: ${text}`).not.toMatch(VENDOR);
      }
    }
  });
});

describe("T15 dapi package metadata", () => {
  const pkg = json(dapiDir, "package.json");

  it("keeps its package name and has no api-contract dependency", () => {
    expect(pkg.name).toBe("@hypergen/dapi");
    expect(pkg.dependencies).not.toHaveProperty("@diffusionstudio/api-contract");
  });

  it("describes itself as Hypergen's catalog, not Diffusion Studio's", () => {
    expect(typeof pkg.description).toBe("string");
    expect(pkg.description).toMatch(/Hypergen/);
    expect(pkg.description).not.toMatch(/Diffusion Studio/i);
    expect(pkg.description).not.toMatch(/The dapi tool catalog/i);
    expect(pkg.description).not.toMatch(VENDOR);
  });

  it("drops the 'dapi' keyword", () => {
    const keywords: string[] = pkg.keywords ?? [];
    expect(keywords.map((k) => k.toLowerCase())).not.toContain("dapi");
    expect(keywords.some((k) => LEGACY.test(k))).toBe(false);
  });

  it("README calls it the tool catalog behind the hypergen MCP server and CLI", () => {
    const readme = read(dapiDir, "README.md");
    expect(readme).toMatch(/the tool catalog behind the hypergen MCP server and CLI/i);
    expect(leaks(readme, LEGACY)).toEqual([]);
  });

  it("mcp.ts no longer spells 'dapi' in its port comment, and the port is unchanged", () => {
    const source = read(here, "mcp.ts");
    expect(source).not.toMatch(LEGACY);
    expect(MCP_PORT).toBe(3274);
    expect(MCP_URL).toBe("http://127.0.0.1:3274/mcp");
  });

  it("package.json greps clean apart from the package name", () => {
    expect(leaks(read(dapiDir, "package.json"), LEGACY)).toEqual([]);
  });
});

describe("T16 jsx package metadata and typings comment", () => {
  const pkg = json(jsxDir, "package.json");

  it("description says Hypergen compositions", () => {
    expect(pkg.description).toContain("Hypergen compositions");
  });

  it("keyword diffusion-studio became hypergen", () => {
    const keywords: string[] = pkg.keywords ?? [];
    expect(keywords).toContain("hypergen");
    expect(keywords).not.toContain("diffusion-studio");
  });

  it("README links the reference on buckleson/hypergen", () => {
    expect(read(jsxDir, "README.md")).toContain(
      "https://github.com/buckleson/hypergen/blob/main/docs/reference/jsx/README.md",
    );
  });

  it("types.ts names the `hypergen fonts` command", () => {
    expect(read(jsxDir, "src", "types.ts")).toContain("(`hypergen fonts`)");
  });

  it.each([["package.json"], ["README.md"], ["src", "types.ts"]])("%s has no diffusion/dapi at all", (...parts) => {
    const text = read(jsxDir, ...parts);
    expect(text).not.toMatch(LEGACY);
    expect(text).not.toMatch(VENDOR);
  });
});

describe("T31 tool reference docs", () => {
  const pages = readdirSync(toolDocsDir).filter((f) => f.endsWith(".md"));

  it("has a page per catalog tool, plus the README", () => {
    expect(pages).toContain("README.md");
    for (const tool of catalog) expect(pages, tool.name).toContain(`${tool.name}.md`);
  });

  it.each(readdirSync(toolDocsDir).filter((f) => f.endsWith(".md")))("%s has no diffusion/dapi or vendor names", (page) => {
    const text = read(toolDocsDir, page);
    expect(text).not.toMatch(LEGACY);
    expect(text).not.toMatch(VENDOR);
    expect(text).not.toMatch(/dapi-\w+-\*/);
  });

  it("README names the hypergen CLI and has no dapi alias note", () => {
    const readme = read(toolDocsDir, "README.md");
    expect(readme).toMatch(/`hypergen <command>/);
    expect(readme).toMatch(/Hypergen/);
    expect(readme).not.toMatch(/alias/i);
  });

  it("CLI examples use `hypergen <cmd>` and never another binary name", () => {
    for (const page of pages) {
      const text = read(toolDocsDir, page);
      // Any shell-style command line in a code span or block that starts a tool name.
      for (const tool of catalog) {
        expect(text, page).not.toMatch(new RegExp(`\\b(?:dapi|diffusion|ds)\\s+${tool.name}\\b`));
      }
    }
  });

  it("report.md matches the catalog description and links buckleson/hypergen issues", () => {
    const text = read(toolDocsDir, "report.md");
    expect(text).toContain(toolByName("report").description);
    expect(text).toContain("https://github.com/buckleson/hypergen/issues");
  });

  it("screenshot.md names files hypergen_<date>_<time>.png", () => {
    const text = read(toolDocsDir, "screenshot.md");
    expect(text).toContain("hypergen_<date>_<time>.png");
  });
});

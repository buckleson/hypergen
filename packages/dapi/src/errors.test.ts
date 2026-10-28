/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { describe, expect, it } from "vitest";
import { DapiError, fromWireError, isDapiError, missingKey } from "./errors";
import * as dapi from "./index";

const FAL = "Add your fal.ai API key in Hypergen > Settings > AI providers.";
const GEMINI = "Add your Gemini API key in Hypergen > Settings > AI providers.";

describe("missingKey", () => {
  it("is a DapiError and an Error, with the exact message per provider", () => {
    for (const [provider, message] of [["fal", FAL], ["gemini", GEMINI]] as const) {
      const error = missingKey(provider);
      expect(error).toBeInstanceOf(Error);
      expect(isDapiError(error)).toBe(true);
      expect(error.name).toBe("DapiError");
      expect(error.code).toBe("MISSING_KEY");
      expect(error.message).toBe(message);
    }
  });

  it("returns a fresh error each call", () => {
    expect(missingKey("fal")).not.toBe(missingKey("fal"));
  });

  it("names no other product or account flow", () => {
    for (const provider of ["fal", "gemini"] as const) {
      expect(missingKey(provider).message).not.toMatch(/\b(LTX|Lightricks|credits?|sign[- ]in|account)\b/i);
    }
  });

  it("no longer has a sign-in-required code", () => {
    // @ts-expect-error "sign-in-required" was removed from DapiErrorCode
    const legacy = new DapiError("sign-in-required", "x");
    expect(legacy.code).toBe("sign-in-required");
  });
});

describe("fromWireError", () => {
  it("round-trips both providers' MISSING_KEY errors", () => {
    for (const provider of ["fal", "gemini"] as const) {
      const sent = missingKey(provider);
      const back = fromWireError(`MISSING_KEY: ${sent.message}`);
      expect(isDapiError(back)).toBe(true);
      expect(back).toMatchObject({ code: "MISSING_KEY", message: sent.message, name: "DapiError" });
    }
  });

  it("strips only the first prefix", () => {
    const back = fromWireError("MISSING_KEY: MISSING_KEY: x");
    expect(back).toMatchObject({ code: "MISSING_KEY", message: "MISSING_KEY: x" });
  });

  it("keeps an empty message after the prefix", () => {
    expect(fromWireError("MISSING_KEY: ")).toMatchObject({ code: "MISSING_KEY", message: "" });
  });

  it.each([
    ["", "empty string"],
    ["MISSING_KEY", "code alone"],
    ["MISSING_KEY:no space", "no space after the colon"],
    [" MISSING_KEY: x", "leading space"],
    ["missing_key: x", "lower case"],
    ["Error: MISSING_KEY: x", "prefix not at the start"],
    ["sign-in-required: x", "the removed code"],
    ["ECONNREFUSED 127.0.0.1:443", "an offline error"],
  ])("leaves %j as a plain Error (%s)", (message) => {
    const error = fromWireError(message);
    expect(error).toBeInstanceOf(Error);
    expect(isDapiError(error)).toBe(false);
    expect(error.message).toBe(message);
  });
});

describe("index", () => {
  it("exports the MISSING_KEY helpers", () => {
    expect(dapi.missingKey).toBe(missingKey);
    expect(dapi.fromWireError).toBe(fromWireError);
    expect(dapi.DapiError).toBe(DapiError);
  });
});

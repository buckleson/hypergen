/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Why a tool call failed, for callers that branch on it: the MCP server maps
 * every code to an `isError` result, the CLI maps it to an exit code, and an
 * agent reads the message. The message is the part written for people.
 */
export type DapiErrorCode =
  /** The tool needs an open project and none is. */
  | "no-project"
  /** No node, asset, or file matches the given id or path. */
  | "not-found"
  /** The id matches several nodes; the caller must disambiguate. */
  | "ambiguous"
  /** The target exists but is the wrong kind, e.g. a clip where a scene is required. */
  | "wrong-kind"
  /** The input failed validation beyond what the schema expresses. */
  | "invalid-input"
  /** A single-slot resource (the export renderer) is in use. */
  | "busy"
  /** The model's provider needs an API key and none is saved. */
  | "MISSING_KEY"
  /** The platform or an external binary (gh, osascript) cannot do it. */
  | "unsupported"
  /** The caller or the app canceled the operation. */
  | "canceled";

export class DapiError extends Error {
  readonly code: DapiErrorCode;

  constructor(code: DapiErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "DapiError";
    this.code = code;
  }
}

export function isDapiError(value: unknown): value is DapiError {
  return value instanceof DapiError;
}

const PROVIDER_NAMES = { gemini: "Gemini", fal: "fal.ai" } as const;

/** The error a call fails with when `provider`'s API key is not saved. */
export function missingKey(provider: keyof typeof PROVIDER_NAMES): DapiError {
  return new DapiError("MISSING_KEY", `Add your ${PROVIDER_NAMES[provider]} API key in Hypergen > Settings > AI providers.`);
}

const MISSING_KEY_PREFIX = "MISSING_KEY: ";

/**
 * An error the main process sent as a string, as an error again: one that
 * starts `MISSING_KEY: ` is the `DapiError` it was, any other a plain `Error`.
 */
export function fromWireError(message: string): Error {
  return message.startsWith(MISSING_KEY_PREFIX)
    ? new DapiError("MISSING_KEY", message.slice(MISSING_KEY_PREFIX.length))
    : new Error(message);
}

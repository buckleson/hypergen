/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { z } from "zod";
import { AssetPath } from "../schemas";

/** A file a request names: `{ path }`. */
export const FileRef = z.strictObject({ path: AssetPath });

/**
 * The fields `generate` adds to every request, the tool's rather than the
 * model's. `generate`'s own schema checks them; a local model's request
 * schema lets them through so it can be strict about the rest.
 */
export const requestFields = {
  output: z.string().optional(),
  estimate: z.boolean().optional(),
};

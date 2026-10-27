/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// The mask file's MIME type: what it is, and that a written mask file carries
// it whether it holds frames or none.

import { describe, expect, it } from 'vitest';

import { encodeMaskFile, emptyField, isMaskFileHead, MASK_MIME_TYPE, readMaskHeader } from './mask';

const HEADER = { gridWidth: 2, gridHeight: 2, width: 64, height: 64, frameRate: 30 };

describe('MASK_MIME_TYPE', () => {
  it("is 'application/x-hypergen-mask'", () => {
    expect(MASK_MIME_TYPE).toBe('application/x-hypergen-mask');
  });

  it('is a vendor-private application type with no old or third-party name', () => {
    expect(MASK_MIME_TYPE).toMatch(/^application\/x-[a-z-]+$/);
    expect(MASK_MIME_TYPE).not.toMatch(/diffusion|dspro|\bltx\b|lightricks/i);
  });
});

describe('encodeMaskFile', () => {
  it('writes a blob typed MASK_MIME_TYPE', async () => {
    const blob = encodeMaskFile(HEADER, [{ field: emptyField(4), score: 1, iou: 0.9 }, null]);
    expect(blob.type).toBe('application/x-hypergen-mask');
    expect((await readMaskHeader(blob)).frameCount).toBe(2);
  });

  it('types an empty file (no frames) the same', async () => {
    const blob = encodeMaskFile(HEADER, []);
    expect(blob.type).toBe(MASK_MIME_TYPE);
    expect(isMaskFileHead(new Uint8Array(await blob.arrayBuffer()))).toBe(true);
    expect((await readMaskHeader(blob)).frameCount).toBe(0);
  });
});

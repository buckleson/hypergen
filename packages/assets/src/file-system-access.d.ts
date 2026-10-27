/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// The save dialog of the File System Access API, which TypeScript's DOM lib
// does not declare yet (Chromium only).

interface SaveFilePickerOptions {
  suggestedName?: string;
  types?: { description?: string; accept: Record<`${string}/${string}`, `.${string}`[]> }[];
}

interface Window {
  showSaveFilePicker(options?: SaveFilePickerOptions): Promise<FileSystemFileHandle>;
}

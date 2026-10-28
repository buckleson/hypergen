/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { shell } from "electron";
import type { WebContents } from "electron";

function isWebUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

// Hands http(s) URLs to the default browser; every other scheme is dropped.
export async function openExternalUrl(url: string): Promise<void> {
  if (isWebUrl(url)) await shell.openExternal(url);
}

// New windows and navigation away from the app open in the browser instead.
export function routeExternalLinks(contents: WebContents, isAppUrl: (url: string) => boolean) {
  contents.setWindowOpenHandler(({ url }) => {
    void openExternalUrl(url);
    return { action: "deny" };
  });
  contents.on("will-navigate", (event, url) => {
    if (isAppUrl(url)) return;
    event.preventDefault();
    void openExternalUrl(url);
  });
}

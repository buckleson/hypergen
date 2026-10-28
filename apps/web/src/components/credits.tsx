/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { For, Show } from "solid-js";

import buckleson from "@/assets/images/credits/buckleson.png";
import hyperox from "@/assets/images/credits/hyperox.png";
import pavi from "@/assets/images/credits/pavi.png";

/** Who stands behind Hypergen, shown in Help > About. */
export const CREDITS = [
  { role: "Secured by", name: "HyperOx", logo: hyperox },
  { role: "Powered by", name: "Buckleson", logo: buckleson, href: "https://buckleson.com" },
  { role: "Managed by", name: "Pavi", logo: pavi, href: "https://pavi.tech" },
] as const;

export function HypergenCredits() {
  return (
    <ul class="flex flex-col gap-3">
      <For each={CREDITS}>
        {(credit) => (
          <li class="flex items-center gap-3 text-xs text-muted-foreground">
            <img src={credit.logo} alt="" class="size-5 shrink-0 rounded-full" />
            <span>
              {credit.role}{" "}
              <Show when={"href" in credit && credit.href} fallback={<span class="text-foreground">{credit.name}</span>}>
                {(href) => (
                  <a href={href()} target="_blank" rel="noreferrer" class="text-foreground underline-offset-2 hover:underline">
                    {credit.name}
                  </a>
                )}
              </Show>
            </span>
          </li>
        )}
      </For>
    </ul>
  );
}

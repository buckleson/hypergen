/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  DropdownMenuItem,
  DropdownMenuGroup,
} from "@/components/ui/dropdown-menu";

export function HelpMenu() {
  return (
    <>
      <DropdownMenuGroup>
        <DropdownMenuItem as="a" href="https://github.com/buckleson/hypergen/issues" target="_blank">
          Report an issue
        </DropdownMenuItem>
        <DropdownMenuItem as="a" href="https://pavi.tech" target="_blank">
          Website
        </DropdownMenuItem>
      </DropdownMenuGroup>
    </>
  );
}

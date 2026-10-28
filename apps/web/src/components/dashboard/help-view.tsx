/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { HypergenCredits } from "@/components/credits";
import { Icon } from "@/components/ui/icon";

import { version } from "../../../package.json";

import {
  DashboardDividedStack,
  DashboardScrollView,
  DashboardSurfaceSection,
} from "./shared";

type DashboardHelpExternalRowProps = {
  label: string;
  href: string;
};

function DashboardHelpExternalRow(props: DashboardHelpExternalRowProps) {
  return (
    <a
      href={props.href}
      target="_blank"
      rel="noopener noreferrer"
      class="flex h-4 w-full items-center gap-4 rounded-md text-xs text-foreground outline-none focus-ring"
    >
      <span class="min-w-0 flex-1 truncate text-left">
        {props.label}
      </span>
      <Icon name="external-link" class="text-foreground" />
    </a>
  );
}

export function DashboardHelpView() {
  return (
    <DashboardScrollView>
      <DashboardSurfaceSection title="Support">
        <DashboardDividedStack>
          <DashboardHelpExternalRow
            label="Report an issue"
            href="https://github.com/buckleson/hypergen/issues"
          />
          <DashboardHelpExternalRow label="Website" href="https://github.com/buckleson/hypergen" />
        </DashboardDividedStack>
      </DashboardSurfaceSection>

      <DashboardSurfaceSection title="About">
        <div class="flex flex-col gap-4">
          <p class="text-xs text-foreground">Hypergen {version}</p>
          <HypergenCredits />
        </div>
      </DashboardSurfaceSection>
    </DashboardScrollView>
  );
}


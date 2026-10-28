/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { createMemo, Show } from "solid-js";
import { toast } from "somoto";

import { useGenerationRecords } from "./use-generation-records";
import { useGenerate } from "./use-generate";
import { useMediaSelection } from "./selection";
import { useTransforms } from "./use-transforms";

import type { TransformType } from "./types";

export function PromptInputActions() {
  const { isGenerated, firstJob } = useGenerationRecords();
  const { imageMedia, videoMedia } = useMediaSelection();
  const { run } = useTransforms();
  const { rerun } = useGenerate();

  const hasImageSelection = createMemo(() => imageMedia().length > 0);
  const hasVideoSelection = createMemo(() => videoMedia().length > 0);

  const handleRerun = () => {
    const job = firstJob();
    if (!job) {
      toast("No generation found", {
        description: "This asset wasn't generated with a prompt.",
      });
      return;
    }
    
    rerun(job.request);
  };

  return (
    <Show when={hasImageSelection() || hasVideoSelection()}>
      <div class="flex w-full items-center justify-end gap-1 absolute top-2 right-2">
        <Show when={isGenerated()}>
          <Tooltip>
            <TooltipTrigger
              as={Button}
              variant="ghost"
              size="icon"
              class="text-muted-foreground"
              onClick={handleRerun}
            >
              <Icon name="rerun" />
            </TooltipTrigger>
            <TooltipContent>Rerun</TooltipContent>
          </Tooltip>
          <Separator orientation="vertical" class="min-h-5" />
        </Show>
        <DropdownMenu placement="right-start">
          <Tooltip>
            <TooltipTrigger<typeof DropdownMenuTrigger>
              as={(triggerProps: object) => (
                <DropdownMenuTrigger<typeof Button>
                  {...triggerProps}
                  as={(buttonProps) => (
                    <Button
                      {...buttonProps}
                      variant="ghost"
                      size="icon"
                      class="text-muted-foreground"
                    >
                      <Icon name="chevron-down" />
                    </Button>
                  )}
                />
              )}
            />
            <TooltipContent>More options</TooltipContent>
          </Tooltip>
          <DropdownMenuPortal>
            <DropdownMenuContent>
              <DropdownMenuGroup>
                <Show when={hasImageSelection() || hasVideoSelection()}>
                  <TransformItem name="upscale" icon="arrow-scale" label="Upscale" run={run} />
                </Show>
                <Show when={hasImageSelection()}>
                  <TransformItem name="removeBackground" icon="ai.remove-background" label="Remove background" run={run} />
                </Show>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenuPortal>
        </DropdownMenu>
      </div>
    </Show>
  );
}

type TransformItemProps = {
  name: TransformType;
  icon: string;
  label: string;
  run(name: TransformType): void;
};

/** A transform as a menu row. */
function TransformItem(props: TransformItemProps) {
  return (
    <DropdownMenuItem onSelect={() => props.run(props.name)}>
      <Icon name={props.icon} class="mr-2 text-foreground" />
      <span class="flex-1">{props.label}</span>
    </DropdownMenuItem>
  );
}

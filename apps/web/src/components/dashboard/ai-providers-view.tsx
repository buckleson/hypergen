/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { For, Show, createResource, createSignal } from "solid-js";
import { toast } from "somoto";
import { MAIN_CHANNELS } from "@desktop/main-channels";
import type { Provider } from "@desktop/main-channels";

import { Button } from "@/components/ui/button";
import { TextField, TextFieldInput } from "@/components/ui/text-field";
import { mainBridge } from "@/lib/ipc";
import { keyStatus, removeKey, setKey, testKey } from "@/lib/providers";

import {
  DashboardDividedStack,
  DashboardInfoActionRow,
  DashboardScrollView,
  DashboardSurfaceSection,
} from "./shared";

const PROVIDERS: readonly { id: Provider; name: string; keyUrl: string }[] = [
  { id: "gemini", name: "Gemini", keyUrl: "https://aistudio.google.com/apikey" },
  { id: "fal", name: "fal.ai", keyUrl: "https://fal.ai/dashboard/keys" },
];

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

function ProviderRow(props: { provider: (typeof PROVIDERS)[number]; saved: boolean; onChange(): void }) {
  const [draft, setDraft] = createSignal("");
  const [busy, setBusy] = createSignal(false);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const save = () =>
    run(async () => {
      await setKey(props.provider.id, draft().trim());
      setDraft("");
      props.onChange();
      toast.success(`${props.provider.name} key saved`);
    });

  const remove = () =>
    run(async () => {
      await removeKey(props.provider.id);
      props.onChange();
      toast.success(`${props.provider.name} key removed`);
    });

  const test = () =>
    run(async () => {
      const result = await testKey(props.provider.id);
      if (result.ok) toast.success(`${props.provider.name} key works`);
      else toast.error(result.error ?? `${props.provider.name} key failed`);
    });

  const openKeyPage = () => {
    mainBridge.call(MAIN_CHANNELS.APP_OPEN_EXTERNAL, { url: props.provider.keyUrl }).catch(() => {});
  };

  return (
    <DashboardInfoActionRow
      title={props.provider.name}
      description={
        <div class="flex flex-col gap-2">
          <p class="text-xs text-muted-foreground">
            {props.saved ? "Saved" : "Not set"}
            {" · "}
            <button type="button" class="underline hover:text-foreground" onClick={openKeyPage}>
              Get a key
            </button>
          </p>
          <TextField value={draft()} onChange={setDraft}>
            <TextFieldInput
              type="password"
              uiSize="compact"
              autocomplete="off"
              placeholder={`${props.provider.name} API key`}
              onKeyDown={(event) => event.stopPropagation()}
              onKeyUp={(event) => event.stopPropagation()}
            />
          </TextField>
        </div>
      }
      action={
        <div class="flex items-center gap-2">
          <Button variant="secondary" disabled={busy() || !draft().trim()} onClick={save}>
            Save
          </Button>
          <Button variant="secondary" disabled={busy() || !props.saved} onClick={remove}>
            Remove
          </Button>
          <Button variant="secondary" disabled={busy() || !props.saved} onClick={test}>
            Test
          </Button>
        </div>
      }
    />
  );
}

export function DashboardAiProvidersView() {
  const [status, { refetch }] = createResource(() => (window.desktop ? keyStatus() : undefined));

  return (
    <DashboardScrollView>
      <DashboardSurfaceSection
        title="AI providers"
        description="Your API keys are encrypted and stored on this computer only."
      >
        <Show
          when={window.desktop}
          fallback={<p class="text-xs text-muted-foreground">API keys need the desktop app.</p>}
        >
          <DashboardDividedStack>
            <For each={PROVIDERS}>
              {(provider) => (
                <ProviderRow provider={provider} saved={!!status()?.[provider.id]} onChange={refetch} />
              )}
            </For>
          </DashboardDividedStack>
        </Show>
      </DashboardSurfaceSection>
    </DashboardScrollView>
  );
}

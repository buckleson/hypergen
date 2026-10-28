/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { Router, HashRouter, Route } from '@solidjs/router';
import { ColorModeProvider } from '@kobalte/core';
import { createEffect, createMemo, onMount } from 'solid-js';
import { Toaster } from "@/components/ui/sonner";

import { CommandsProvider } from '@/context/commands';
import { CommandPalette, ReloadWindowCommand } from '@/components/commands';
import { PersistRoute } from '@/lib/persist-route';
import { useColorMode } from "@kobalte/core";
import { mainBridge } from "@/lib/ipc";
import { MAIN_CHANNELS } from "@desktop/main-channels";
import { EditorApi } from '@/dapi';
import { renderOverlay } from '@/context/render';
import { ScreenTooSmall } from '@/components/screen-too-small';
import { UnsupportedBrowser } from '@/components/unsupported-browser';
import { ProjectPage } from '@/pages/project';
import { NotFoundPage } from '@/pages/not-found';
import { DashboardPage } from '@/pages/dashboard';

function BootSplash() {
  onMount(() => document.getElementById('boot-splash')?.remove());

  return null;
}

function TitleBarColorMode() {
  const { colorMode } = useColorMode();

  createEffect(() => {
    if (window.desktop?.platform === "win32") {
      mainBridge.call(MAIN_CHANNELS.WINDOW_SET_COLOR_MODE, { mode: colorMode() });
    };
  });

  return null;
}

// A render goes on when the user closes the window, which only hides it;
// main is told, so the hidden window is not torn down under it once idle.
function ReportRendering() {
  const rendering = createMemo(() => renderOverlay() !== null);

  createEffect(() => {
    if (window.desktop) {
      mainBridge.call(MAIN_CHANNELS.WINDOW_SET_BUSY, { busy: rendering() });
    }
  });

  return null;
}

function EnvironmentOverlays() {
  return (
    <>
      <ScreenTooSmall />
      <UnsupportedBrowser />
    </>
  );
}

function App() {
  const RouterComponent = window.desktop ? HashRouter : Router;
  return (
    <RouterComponent
      root={(props) => (
        <ColorModeProvider initialColorMode="dark">
          <CommandsProvider>
            {props.children}
            <CommandPalette />
            <ReloadWindowCommand />
            <BootSplash />
            <EditorApi />
          </CommandsProvider>
          <Toaster />
          <EnvironmentOverlays />
          <PersistRoute />
          <TitleBarColorMode />
          <ReportRendering />
        </ColorModeProvider>
      )}
    >
      <Route path="/" component={DashboardPage} />
      <Route path="/projects/*ref" component={ProjectPage} />
      <Route path="*404" component={NotFoundPage} />
    </RouterComponent>
  );
}

export default App;

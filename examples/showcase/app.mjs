import { fileURLToPath } from 'node:url';

import { createTerminalHost } from '@ismail-elkorchi/terminal-ui/host';
import { createVisualSnapshot } from '@ismail-elkorchi/terminal-ui/testing';
import {
  createTuiRuntime,
  defineTui,
  diffFrames,
  intervalSource,
  renderFramePlain,
  renderWidgetFrame,
  runTui
} from '@ismail-elkorchi/terminal-ui/tui';
import { areaGrid, defineBreakpoints, overlay, responsive } from '@ismail-elkorchi/terminal-ui/widgets';

import { commandFocusPath, initialShowcaseState, routeLabel, showcaseViewport } from './state.mjs';
import { showcaseTheme } from './theme.mjs';
import { updateShowcase } from './update.mjs';
import { bottomChrome, topChrome } from './views/chrome.mjs';
import { mainRegion } from './views/panels.mjs';
import { transientLayers } from './views/overlays.mjs';

export { initialShowcaseState, showcaseViewport } from './state.mjs';
export { showcaseTheme } from './theme.mjs';

const showcaseBreakpoints = defineBreakpoints({
  narrow: { maxColumns: 99 },
  medium: { minColumns: 100, maxColumns: 149 },
  wide: { minColumns: 150 }
});

export function createShowcaseApp() {
  return defineTui({
    id: 'terminal-ui-showcase',
    transcript: { enabled: true },
    nonTty: { mode: 'last_frame' },
    init: () => initialShowcaseState(),
    update: updateShowcase,
    view: (state, context) => showcaseView(state, context.viewport),
    subscriptions: () => [intervalSource('showcase-ticker', 700, { kind: 'tick' })],
    accessibility: {
      describe: (state) => ({
        source: 'tui',
        focusPath: ['showcase-shell'],
        root: {
          id: 'terminal-ui-showcase',
          role: 'application',
          label: `Northstar Control, ${routeLabel(state.selectedRoute)} route`,
          children: [
            { id: 'showcase-nav', role: 'tree', label: 'Operations navigation' },
            { id: 'workspace-route-menu', role: 'tablist', label: 'Operations workspace' },
            { id: 'inspector-tabs', role: 'tablist', label: 'Contextual inspector' },
            { id: 'showcase-command', role: 'textbox', label: 'Command bar', value: state.commandValue }
          ]
        }
      })
    }
  });
}

export function renderShowcaseFrame(state = initialShowcaseState(), viewport = showcaseViewport) {
  return renderWidgetFrame(showcaseView(state, viewport), viewport, { theme: showcaseTheme(state) });
}

export async function runShowcaseScript(messages, options = {}) {
  const host = options.host ?? createTerminalHost({ runtime: 'memory', viewport: options.viewport ?? showcaseViewport });
  const app = createShowcaseApp();
  const runtime = createTuiRuntime({
    app,
    host,
    theme: showcaseTheme,
    initialFocusPath: commandFocusPath
  });
  const frames = [];
  frames.push(await runtime.start());
  for (const step of messages) {
    if (typeof step.input === 'string') {
      const results = await runtime.handleInputChunk({ data: step.input });
      for (const result of results) frames.push(result.frame);
      continue;
    }
    await runtime.dispatch(step);
    const frame = runtime.frame();
    if (frame !== undefined) frames.push(frame);
  }
  return {
    host,
    runtime,
    frames,
    state: runtime.getState()
  };
}

export function createShowcaseSnapshot(state = initialShowcaseState(), previousState) {
  const frame = renderShowcaseFrame(state);
  const previousFrame = previousState === undefined ? undefined : renderShowcaseFrame(previousState);
  return createVisualSnapshot({
    frame,
    ...(previousFrame === undefined ? {} : { previousFrame, diff: diffFrames(previousFrame, frame) })
  });
}

export function showcaseView(state, viewport = showcaseViewport) {
  return responsive(viewport, showcaseBreakpoints, {
    wide: () => showcaseVariant(state, viewport, 'wide'),
    medium: () => showcaseVariant(state, viewport, 'medium'),
    narrow: () => showcaseVariant(state, viewport, 'narrow')
  });
}

function showcaseVariant(state, viewport, variant) {
  const parts = createViewParts(state, viewport, variant);
  const base = areaGrid({
    id: 'showcase-shell',
    areas: `
      top
      main
      bottom
    `,
    children: parts,
    rows: [{ kind: 'fixed', cells: 4 }, { kind: 'fill' }, { kind: 'fixed', cells: 5 }],
    columns: [{ kind: 'fill' }],
    accessibility: { role: 'application', label: 'Northstar Control' },
    keyMap: {
      escape: { kind: 'escape' },
      '?': { kind: 'modal', open: true },
      '/': { kind: 'commandText', text: '/' }
    }
  });
  return overlay([base, ...transientLayers(state)], { id: 'showcase-overlay' });
}

function createViewParts(state, viewport, variant) {
  return {
    top: topChrome(state),
    main: mainRegion(state, viewport, variant),
    bottom: bottomChrome(state)
  };
}

async function main() {
  if (process.stdout.isTTY !== true) {
    console.log(renderFramePlain(renderShowcaseFrame(initialShowcaseState(), showcaseViewport)));
    return;
  }
  const app = createShowcaseApp();
  const host = createTerminalHost();
  const exit = await runTui(app, host, { theme: showcaseTheme, initialFocusPath: commandFocusPath });
  if (exit.status === 'error') {
    process.exitCode = 1;
    console.error(exit.diagnostics.map((item) => item.message).join('\n'));
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}

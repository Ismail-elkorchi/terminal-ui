import fs from 'node:fs/promises';
import process from 'node:process';

import {
  column,
  defineTui,
  image,
  link,
  rasterImage,
  row,
  runTui,
  text,
  textInput,
} from '../../dist/index.js';
import { textInputReducer, textInputState } from '../../dist/behavior/index.js';
import { createNodeTerminalHost } from '../../dist/host/index.js';
import { noColorTheme } from '../../dist/theme/index.js';

const reportPath = process.argv[2];
const graphicsMode = process.argv[3];
const checkpointPath = process.argv.find((argument) => argument.startsWith('--checkpoint='))?.slice('--checkpoint='.length);
const knownAlternateScreen = process.argv.includes('--known-alternate-screen');
if (reportPath === undefined || reportPath.trim() === '') {
  throw new Error('The graphics emulator probe requires a report path.');
}
if (graphicsMode !== 'auto' && graphicsMode !== 'kitty' && graphicsMode !== 'sixel') {
  throw new Error('The graphics emulator probe mode must be auto, kitty, or sixel.');
}

const testImage = rasterImage({
  width: 2,
  height: 1,
  format: 'rgb8',
  data: new Uint8Array([255, 0, 0, 0, 255, 0]),
});

const probeApp = defineTui({
  id: 'graphics-emulator-conformance',
  init: (context) => {
    const state = {
      input: { text: '', cursor: 0 },
      keyPresses: 0,
      keyReleases: 0,
      pointerActivations: { left: 0, middle: 0, right: 0 },
      terminalSize: context.terminalSize,
      graphics: graphicsReport(context.capabilities),
      imageVisible: true,
    };
    return {
      state,
      focus: { kind: 'element', elementId: 'emulator-input' },
      ...checkpointEffects(state),
    };
  },
  update: (state, message) => {
    switch (message.kind) {
      case 'input':
        return checkpointResult({ ...state, input: textInputReducer(state.input, message.transition) });
      case 'key':
        return checkpointResult({
            ...state,
            keyPresses: state.keyPresses + Number(message.eventType === 'press'),
            keyReleases: state.keyReleases + Number(message.eventType === 'release'),
        });
      case 'pointer':
        return checkpointResult({
            ...state,
            pointerActivations: {
              ...state.pointerActivations,
              [message.button]: state.pointerActivations[message.button] + 1,
            },
        });
      case 'resize':
        return checkpointResult({ ...state, terminalSize: message.terminalSize });
      case 'hideImage':
        return checkpointResult({ ...state, imageVisible: false });
      case 'exit':
        return { state, exit: { reason: 'emulator-conformance-complete' } };
    }
  },
  resizeMessage: (_state, context) => ({ kind: 'resize', terminalSize: context.terminalSize }),
  view: (state) => column([
    text({ id: 'emulator-ready', content: 'TERMINAL_UI_EMULATOR_READY' }),
    textInput({
      id: 'emulator-input',
      state: textInputState(state.input),
      onTransition: (transition) => ({ kind: 'input', transition }),
      meta: { accessibleName: 'Emulator text input' },
    }),
    link({
      id: 'emulator-link',
      label: 'Pointer target',
      href: 'terminal-ui://emulator-conformance',
      onActivate: (event) => event.trigger.kind === 'pointer'
        ? { kind: 'pointer', button: event.trigger.button }
        : { kind: 'key', eventType: 'press' },
    }),
    text({
      id: 'emulator-key-state',
      content: `KEY press=${String(state.keyPresses)} release=${String(state.keyReleases)}`,
    }),
    text({
      id: 'emulator-pointer-state',
      content: `MOUSE left=${String(state.pointerActivations.left)} right=${String(state.pointerActivations.right)} middle=${String(state.pointerActivations.middle)}`,
    }),
    text({
      id: 'emulator-size',
      content: `SIZE ${String(state.terminalSize.columns)}x${String(state.terminalSize.rows)}`,
    }),
    text({
      id: 'emulator-graphics-state',
      content: `GRAPHICS kitty=${state.graphics.kittySupport} transport=${state.graphics.kittyTransport ?? 'none'} sixel=${state.graphics.sixelSupport}`,
    }),
    text({ id: 'emulator-help', content: 'F2 events  F4 remove image  F10 exit' }),
    imageRow(state.imageVisible),
  ], {
    id: 'emulator-root',
    sizes: [
      { kind: 'fixed', cells: 1 },
      { kind: 'fixed', cells: 1 },
      { kind: 'fixed', cells: 1 },
      { kind: 'fixed', cells: 1 },
      { kind: 'fixed', cells: 1 },
      { kind: 'fixed', cells: 1 },
      { kind: 'fixed', cells: 1 },
      { kind: 'fill' },
      { kind: 'fixed', cells: 6 },
    ],
    meta: { accessibility: { role: 'application', label: 'Graphics emulator conformance probe' } },
  }),
  inputBindings: [
    {
      id: 'f2-press',
      phase: 'beforeFocus',
      triggers: [{ kind: 'key', key: 'f2', eventType: 'press' }],
      message: { kind: 'key', eventType: 'press' },
    },
    {
      id: 'f2-release',
      phase: 'beforeFocus',
      triggers: [{ kind: 'key', key: 'f2', eventType: 'release' }],
      message: { kind: 'key', eventType: 'release' },
    },
    {
      id: 'hide-image',
      phase: 'beforeFocus',
      triggers: [{ kind: 'key', key: 'f4' }],
      message: { kind: 'hideImage' },
    },
    {
      id: 'hide-image-text',
      phase: 'beforeFocus',
      triggers: [{ kind: 'text', text: '!' }],
      message: { kind: 'hideImage' },
    },
    {
      id: 'exit',
      phase: 'beforeFocus',
      triggers: [{ kind: 'key', key: 'f10' }],
      message: { kind: 'exit' },
    },
    {
      id: 'exit-text',
      phase: 'beforeFocus',
      triggers: [{ kind: 'text', text: '~' }],
      message: { kind: 'exit' },
    },
  ],
});

let exit;
const host = knownAlternateScreen
  ? createNodeTerminalHost({ capabilities: { overrides: { alternateScreen: true } } })
  : undefined;
try {
  exit = await runTui(probeApp, {
    graphics: graphicsMode,
    theme: noColorTheme,
    ...(host === undefined ? {} : { host }),
  });
} catch (cause) {
  await fs.writeFile(reportPath, `${JSON.stringify({
    status: 'failed',
    error: {
      name: cause instanceof Error ? cause.name : 'Error',
      message: cause instanceof Error ? cause.message : String(cause),
      stack: cause instanceof Error ? cause.stack : undefined,
      diagnostics: cause !== null && typeof cause === 'object' && 'exit' in cause
        ? cause.exit?.diagnostics?.map(({ diagnostic }) => ({
            code: diagnostic.code,
            message: diagnostic.message,
            cause: diagnostic.cause instanceof Error
              ? { name: diagnostic.cause.name, message: diagnostic.cause.message }
              : diagnostic.cause,
          }))
        : undefined,
    },
  }, undefined, 2)}\n`, { mode: 0o600 });
  throw cause;
} finally {
  await host?.dispose();
}
const report = {
  status: exit.status,
  reason: exit.reason,
  state: exit.state,
  diagnostics: exit.diagnostics.map(({ diagnostic }) => ({
    code: diagnostic.code,
    severity: diagnostic.severity,
    message: diagnostic.message,
  })),
};
await fs.writeFile(reportPath, `${JSON.stringify(report, undefined, 2)}\n`, { mode: 0o600 });
process.stdout.write('TERMINAL_UI_RESTORED\n');
if (process.argv.includes('--hold')) setInterval(() => undefined, 60_000);

function imageRow(visible) {
  return row([
    visible
      ? image({
          id: 'emulator-image',
          image: testImage,
          label: 'Red and green emulator graphics probe',
          fallback: 'graphics fallback',
          fit: 'fill',
          measurement: {
            minWidth: 12,
            minHeight: 6,
            preferredWidth: 12,
            preferredHeight: 6,
            maxWidth: 12,
            maxHeight: 6,
          },
        })
      : text({ id: 'emulator-image-hidden', content: 'IMAGE hidden' }),
    text({ id: 'emulator-image-status', content: visible ? 'IMAGE visible' : 'IMAGE removed' }),
  ], {
    id: 'emulator-image-row',
    sizes: [{ kind: 'fixed', cells: 12 }, { kind: 'fill' }],
  });
}

function graphicsReport(capabilities) {
  return {
    kittySupport: capabilities.graphics.kitty.support,
    kittyAvailability: capabilities.graphics.kitty.availability,
    kittyTransport: capabilities.graphics.kitty.transport,
    sixelSupport: capabilities.graphics.sixel.support,
    sixelAvailability: capabilities.graphics.sixel.availability,
    cellPixels: capabilities.graphics.cellPixels,
  };
}

function checkpointResult(state) {
  return { state, ...checkpointEffects(state) };
}

function checkpointEffects(state) {
  if (checkpointPath === undefined || checkpointPath.trim() === '') return {};
  return {
    effects: [{
      id: 'emulator-checkpoint',
      concurrency: 'enqueue',
      async run(context) {
        context.signal.throwIfAborted();
        await fs.writeFile(checkpointPath, `${JSON.stringify(state)}\n`, { mode: 0o600 });
        return { kind: 'none' };
      },
    }],
  };
}

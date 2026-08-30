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
import { noColorTheme } from '../../dist/theme/index.js';

const reportPath = process.argv[2];
if (reportPath === undefined || reportPath.trim() === '') {
  throw new Error('The Kitty emulator probe requires a report path.');
}

const testImage = rasterImage({
  width: 2,
  height: 1,
  format: 'rgb8',
  data: new Uint8Array([255, 0, 0, 0, 255, 0]),
});

const probeApp = defineTui({
  id: 'kitty-emulator-conformance',
  init: (context) => ({
    state: {
      input: { text: '', cursor: 0 },
      keyPresses: 0,
      keyReleases: 0,
      pointerActivations: { left: 0, middle: 0, right: 0 },
      terminalSize: context.terminalSize,
      graphics: graphicsReport(context.capabilities),
      imageVisible: true,
    },
    focus: { kind: 'element', elementId: 'emulator-input' },
  }),
  update: (state, message) => {
    switch (message.kind) {
      case 'input':
        return { state: { ...state, input: textInputReducer(state.input, message.transition) } };
      case 'key':
        return {
          state: {
            ...state,
            keyPresses: state.keyPresses + Number(message.eventType === 'press'),
            keyReleases: state.keyReleases + Number(message.eventType === 'release'),
          },
        };
      case 'pointer':
        return {
          state: {
            ...state,
            pointerActivations: {
              ...state.pointerActivations,
              [message.button]: state.pointerActivations[message.button] + 1,
            },
          },
        };
      case 'resize':
        return { state: { ...state, terminalSize: message.terminalSize } };
      case 'hideImage':
        return { state: { ...state, imageVisible: false } };
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
      content: `GRAPHICS kitty=${state.graphics.kittySupport} transport=${state.graphics.kittyTransport ?? 'none'}`,
    }),
    imageRow(state.imageVisible),
    text({ id: 'emulator-help', content: 'F2 events  F4 remove image  F10 exit' }),
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
      { kind: 'fixed', cells: 6 },
      { kind: 'fill' },
    ],
    meta: { accessibility: { role: 'application', label: 'Kitty emulator conformance probe' } },
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
      id: 'exit',
      phase: 'beforeFocus',
      triggers: [{ kind: 'key', key: 'f10' }],
      message: { kind: 'exit' },
    },
  ],
});

const exit = await runTui(probeApp, { graphics: 'kitty', theme: noColorTheme });
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
setInterval(() => undefined, 60_000);

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
    cellPixels: capabilities.graphics.cellPixels,
  };
}

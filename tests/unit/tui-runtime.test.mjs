import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createTuiRuntime,
  defineTui,
  runTui
} from '../../dist/tui/index.js';
import {
  createScrollState,
  applyScrollEvent,
  scrollReducer,
  pointerPresentationReducer,
  treePresentation,
  treeReducer
} from '../../dist/behavior/index.js';
import {
  diagnostic } from '../../dist/diagnostics.js';
import { createMemoryTerminalHost } from '../../dist/host/index.js';
import { validateAccessibleSnapshot } from '../../dist/accessibility/index.js';
import {
  assertTerminalRestored,
  createTerminalHarness,
  runInteractionScript
} from '../../dist/testing/index.js';
import { createTranscriptRecorder,
  validateTranscript } from '../../dist/transcript/index.js';
import {
  diffFrames,
  renderDiffAnsi,
  renderFrameDebug,
  renderFramePlain,
  renderElementFrame
} from '../../dist/renderer/index.js';
import {
  button,
  contextMenu,
  dialog,
  dropdownMenu,
  textInput,
  list,
  notificationStack,
  progressBar,
  richText,
  spinner,
  statusBar,
  table,
  tabs,
  text,
  textArea,
  tree
} from '../../dist/components/index.js';
import { custom } from '../../dist/renderer/index.js';
import {
  overlay,
  row,
  column,
  surface,
  viewport
} from '../../dist/layout/index.js';
import { waitUntil } from '../helpers/async.mjs';

test('runTui emits deterministic transcripts when enabled', async () => {
  const app = defineTui({
    id: 'transcript-tui',
    transcript: { enabled: true },
    init: () => ({ submitted: false }),
    update: (_state, message) => ({ state: { submitted: message.submitted }, exit: {} }),
    view: (state) => textInput({
      id: 'transcript-field',
      value: state.submitted ? 'submitted' : 'waiting',
      onSubmit: { submitted: true }
    })
  });
  const host = createMemoryTerminalHost({ viewport: { columns: 20, rows: 3 } });
  host.input('\r');
  const exit = await runTui(app, host);

  assert.equal(exit.status, 'completed');
  assert.equal(exit.transcript?.source, 'tui');
  assert.equal(exit.transcript?.id, 'transcript-tui-transcript');
  assert.equal(validateTranscript(exit.transcript).ok, true);
  assert.equal(exit.transcript?.steps.filter((step) => step.kind === 'input').length, 1);
  assert.ok(exit.transcript?.steps.some((step) => step.kind === 'frame'));
  assert.ok(exit.transcript?.steps.some((step) => step.kind === 'diff'));
  assert.ok(exit.transcript?.steps.some((step) => step.kind === 'restore'));
  assert.ok(exit.transcript?.steps.some((step) => step.kind === 'snapshot'));
});

test('TUI tabs expose clickable tab hit targets', async () => {
  const app = defineTui({
    id: 'tabs-click-tui',
    init: () => ({ selected: 'left' }),
    update: (_state, message) => ({ state: { selected: message.selected } }),
    view: (state) => tabs({
      id: 'click-tabs',
      selected: state.selected,
      tabs: [
        { id: 'left', label: 'Left', panel: text('left panel') },
        { id: 'right', label: 'Right', panel: text('right panel') }
      ],
      onAction: (action) => action.kind === 'select' ? { selected: action.id } : { selected: state.selected }
    })
  });
  const host = createMemoryTerminalHost({ viewport: { columns: 32, rows: 4 } });
  const runtime = createTuiRuntime({ app, host });
  const frame = await runtime.start();
  const target = frame.hitTargets?.find((item) => item.id === 'click-tabs:tab:right');
  assert.notEqual(target, undefined);

  await runtime.handleInputChunk({ data: `\u001B[<0;${String(target.bounds.column)};${String(target.bounds.row)}M` });
  await runtime.handleInputChunk({ data: `\u001B[<0;${String(target.bounds.column)};${String(target.bounds.row)}m` });

  assert.equal(runtime.getState()?.selected, 'right');
});

test('TUI runtime routes mouse input through the committed render cache', async () => {
  let viewCalls = 0;
  const app = defineTui({
    id: 'cached-routing-tui',
    init: () => ({ count: 0 }),
    update: (state) => ({ state: { count: state.count + 1 } }),
    view: (state) => {
      viewCalls += 1;
      return button({ id: 'cached-button', label: `Count ${state.count}`, onPress: { kind: 'click' } });
    }
  });
  const host = createMemoryTerminalHost({ viewport: { columns: 24, rows: 3 } });
  const runtime = createTuiRuntime({ app, host });
  const frame = await runtime.start();
  const target = frame.hitTargets?.find((item) => item.id.startsWith('cached-button'));

  assert.equal(viewCalls, 1);
  assert.notEqual(target, undefined);
  await runtime.handleInputChunk({ data: `\u001B[<0;${String(target.bounds.column)};${String(target.bounds.row)}M` });
  assert.equal(runtime.getState()?.count, 0);
  assert.equal(viewCalls, 1);
  await runtime.handleInputChunk({ data: `\u001B[<0;${String(target.bounds.column)};${String(target.bounds.row)}m` });

  assert.equal(runtime.getState()?.count, 1);
  assert.equal(viewCalls, 2);
});

test('TUI runtime uses committed hit targets without recomputing renderer hit targets', async () => {
  let hitTargetCalls = 0;
  const renderer = {
    render({ bounds, buffer }) {
      buffer.write(bounds.row, bounds.column, [{ text: 'cached hit' }]);
    },
    accessibility({ id }) {
      return { id, role: 'button', label: 'cached hit' };
    },
    hitTargets({ bounds }) {
      hitTargetCalls += 1;
      return [{ id: 'cached-region-hit:press', bounds, message: () => ({ clicked: true }), cursor: 'pointer' }];
    }
  };
  const app = defineTui({
    id: 'committed-hit-target-routing-tui',
    init: () => ({ clicked: false }),
    update: (_state, message) => ({ state: { clicked: message.clicked } }),
    view: () => custom({
      id: 'cached-region-hit',
      renderer
    })
  });
  const host = createMemoryTerminalHost({ viewport: { columns: 24, rows: 3 } });
  const runtime = createTuiRuntime({ app, host });
  const frame = await runtime.start();
  const target = frame.hitTargets?.find((item) => item.id === 'cached-region-hit:press');

  assert.equal(hitTargetCalls, 1);
  assert.notEqual(target, undefined);
  assert.equal('message' in target, false);
  await runtime.handleInputChunk({ data: `\u001B[<0;${String(target.bounds.column)};${String(target.bounds.row)}M` });
  await runtime.handleInputChunk({ data: `\u001B[<0;${String(target.bounds.column)};${String(target.bounds.row)}m` });

  assert.deepEqual(runtime.getState(), { clicked: true });
  assert.equal(hitTargetCalls, 2);
});

test('TUI runtime keeps command focus when contained overlays close under passive notifications', async () => {
  const app = defineTui({
    id: 'overlay-focus-return-tui',
    init: () => ({ command: '', paletteOpen: false, notifications: [] }),
    update: (state, message) => {
      if (message.kind === 'text') {
        return { state: { ...state, command: `${state.command}${message.text}` } };
      }
      if (message.kind === 'open') {
        return { state: { ...state, paletteOpen: true } };
      }
      if (message.kind === 'accept') {
        return {
          state: {
            ...state,
            paletteOpen: false,
            notifications: [{ id: 'accepted', title: 'Accepted', tone: 'success' }]
          }
        };
      }
      return { state };
    },
    view: (state) => overlay([
      column([
        textInput({
          id: 'command',
          value: state.command,
          keys: { enter: () => ({ kind: 'open' }) },
          onEdit: (operation) => ({
            kind: 'text',
            text: operation.kind === 'insert' ? operation.text : ''
          })
        })
      ], { id: 'base' }),
      ...(state.paletteOpen
        ? [
            surface(button({
              id: 'accept',
              label: 'Accept',
              onPress: { kind: 'accept' }
            }), {
    id: 'palette-surface',
    meta: {
        layer: {
            zIndex: 20
        },
        focus: { scope: 'contain' }
    }
})
          ]
        : []),
      notificationStack({
    id: 'notices',
    items: state.notifications,
    meta: {
        layer: {
            zIndex: 30
        }
    }
})
    ], { id: 'root' })
  });
  const host = createMemoryTerminalHost({ viewport: { columns: 48, rows: 8 } });
  const runtime = createTuiRuntime({
    app,
    host,
    initialFocusPath: ['root', 'base', 'command']
  });

  await runtime.start();
  await runtime.handleInput({ kind: 'text', text: 'a' });
  await runtime.handleInput({ kind: 'key', key: 'enter' });
  assert.deepEqual(runtime.frame().focusPath, ['root', 'palette-surface', 'accept']);

  await runtime.handleInput({ kind: 'key', key: 'enter' });
  assert.equal(runtime.getState()?.notifications.length, 1);
  assert.notDeepEqual(runtime.frame().focusPath, ['root', 'notices']);

  await runtime.handleInput({ kind: 'text', text: 'b' });

  assert.equal(runtime.getState()?.command, 'ab');
});

test('TUI runtime unwinds nested contained overlay focus to the original field', async () => {
  const app = defineTui({
    id: 'nested-overlay-focus-return-tui',
    init: () => ({ command: '', modal: 'none' }),
    update: (state, message) => {
      if (message.kind === 'text') {
        return { state: { ...state, command: `${state.command}${message.text}` } };
      }
      if (message.kind === 'openA') return { state: { ...state, modal: 'a' } };
      if (message.kind === 'openB') return { state: { ...state, modal: 'b' } };
      if (message.kind === 'closeB') return { state: { ...state, modal: 'a' } };
      if (message.kind === 'closeA') return { state: { ...state, modal: 'none' } };
      return { state };
    },
    view: (state) => overlay([
      column([
        textInput({
          id: 'command',
          value: state.command,
          keys: { enter: () => ({ kind: 'openA' }) },
          onEdit: (operation) => ({
            kind: 'text',
            text: operation.kind === 'insert' ? operation.text : ''
          })
        })
      ], { id: 'base' }),
      ...(state.modal === 'a' || state.modal === 'b'
        ? [
            surface(column([
              button({ id: 'open-b', label: 'Open B', onPress: { kind: 'openB' } }),
              button({ id: 'close-a', label: 'Close A', onPress: { kind: 'closeA' } })
            ], { id: 'modal-a-actions' }), {
    id: 'modal-a',
    meta: {
        layer: {
            zIndex: 10
        },
        focus: { scope: 'contain' }
    }
})
          ]
        : []),
      ...(state.modal === 'b'
        ? [
            surface(button({
              id: 'close-b',
              label: 'Close B',
              onPress: { kind: 'closeB' }
            }), {
    id: 'modal-b',
    meta: {
        layer: {
            zIndex: 20
        },
        focus: { scope: 'contain' }
    }
})
          ]
        : [])
    ], { id: 'root' })
  });
  const host = createMemoryTerminalHost({ viewport: { columns: 48, rows: 10 } });
  const runtime = createTuiRuntime({
    app,
    host,
    initialFocusPath: ['root', 'base', 'command']
  });

  await runtime.start();
  await runtime.handleInput({ kind: 'key', key: 'enter' });
  assert.deepEqual(runtime.frame().focusPath, ['root', 'modal-a', 'modal-a-actions', 'open-b']);

  await runtime.handleInput({ kind: 'key', key: 'enter' });
  assert.deepEqual(runtime.frame().focusPath, ['root', 'modal-b', 'close-b']);

  await runtime.handleInput({ kind: 'key', key: 'enter' });
  assert.deepEqual(runtime.frame().focusPath, ['root', 'modal-a', 'modal-a-actions', 'open-b']);

  await runtime.handleInput({ kind: 'key', key: 'tab' });
  assert.deepEqual(runtime.frame().focusPath, ['root', 'modal-a', 'modal-a-actions', 'close-a']);

  await runtime.handleInput({ kind: 'key', key: 'enter' });
  assert.deepEqual(runtime.frame().focusPath, ['root', 'base', 'command']);

  await runtime.handleInput({ kind: 'text', text: 'z' });
  assert.equal(runtime.getState()?.command, 'z');
});

test('renderFrameDebug emits cursor-addressed control-sequence output', () => {
  const frame = renderElementFrame(textInput({ id: 'addressed-field', value: 'Go' }), { columns: 8, rows: 2 });
  const output = renderFrameDebug(frame);

  assert.match(output, /^\u001B\[1;1H›/u);
  assert.match(output, /\u001B\[1;4HG/u);
  assert.match(output, /\u001B\[1;5Ho/u);
  assert.match(output, new RegExp(`\\u001B\\[${String(frame.cursor?.row)};${String(frame.cursor?.column)}H$`, 'u'));
  assert.equal(renderFramePlain(frame), '›[ Go ]');
});

test('TUI frame rendering positions wide graphemes by terminal cells', () => {
  const frame = renderElementFrame(text('A🙂B', { id: 'wide-text' }), { columns: 8, rows: 2 });
  const output = renderFramePlain(frame);
  const addressed = renderFrameDebug(frame);

  assert.equal(output, 'A🙂B');
  assert.deepEqual(frame.cells.slice(0, 4).map((cell) => [cell.column, cell.text, cell.width, cell.continuation === true]), [
    [1, 'A', 1, false],
    [2, '🙂', 2, false],
    [3, '', 0, true],
    [4, 'B', 1, false]
  ]);
  assert.match(addressed, /\u001B\[1;2H🙂/u);
  assert.match(addressed, /\u001B\[1;4HB/u);
});

test('TUI frame cursor follows the selected visible list item', () => {
  const items = Array.from({ length: 10 }, (_value, index) => `Item ${index}`);
  const frame = renderElementFrame(list({
    id: 'cursor-list',
    items,
    getItemId: (item) => item,
    selectedId: 'Item 6'
  }), { columns: 16, rows: 5 });
  const output = renderFramePlain(frame);
  const addressed = renderFrameDebug(frame);

  assert.deepEqual(frame.focusPath, ['cursor-list']);
  assert.deepEqual(frame.cursor, { row: 3, column: 1 });
  assert.match(output, /› Item 6/);
  assert.match(addressed, /\u001B\[3;1H$/u);
});

test('TUI status, progress, and spinner widgets render accessible status state', () => {
  const frame = renderElementFrame(column([
    statusBar({ id: 'status', leading: [{ id: 'ready', kind: 'status', text: 'Ready', status: 'success' }] }),
    progressBar({ id: 'progress', label: 'Sync', value: 150, max: 100 }),
    progressBar({ id: 'pending', label: 'Waiting', indeterminate: true }),
    spinner({ id: 'spinner', label: 'Working' })
  ]), { columns: 32, rows: 8 });
  const output = renderFramePlain(frame);
  const [statusNode, progressNode, pendingNode, spinnerNode] = frame.accessibility.root.children;

  assert.match(output, /Ready/);
  assert.match(output, /Sync \[██████████\] 100\/100/);
  assert.match(output, /Waiting \[████░░░░░░\]/);
  assert.match(output, /⠋ Working/);
  assert.deepEqual([statusNode?.role, statusNode?.value], ['status', 'Ready']);
  assert.deepEqual([progressNode?.role, progressNode?.label, progressNode?.progress], [
    'progressbar',
    'Sync',
    { value: 100, max: 100 }
  ]);
  assert.deepEqual([pendingNode?.role, pendingNode?.label, pendingNode?.progress], [
    'progressbar',
    'Waiting',
    { indeterminate: true }
  ]);
  assert.deepEqual([spinnerNode?.role, spinnerNode?.value], ['status', 'Working (running)']);
  assert.deepEqual([statusNode?.live, progressNode?.live, pendingNode?.live, spinnerNode?.live], ['polite', 'polite', 'polite', 'polite']);
  assert.equal(validateAccessibleSnapshot(frame.accessibility).ok, true);
});

test('renderDiffAnsi serializes clear, write, cursor, and visibility operations', () => {
  const previous = renderElementFrame(text('Longer text', { id: 'before' }), { columns: 16, rows: 2 });
  const next = renderElementFrame(textInput({ id: 'after', value: 'Go' }), { columns: 16, rows: 2 });
  const diff = diffFrames(previous, next);
  const output = renderDiffAnsi({
    ...diff,
    operations: [...diff.operations, { kind: 'showCursor', visible: false }]
  });

  assert.ok(diff.operations.some((operation) => operation.kind === 'clearRect'));
  assert.ok(diff.operations.some((operation) => operation.kind === 'write'));
  assert.ok(diff.operations.some((operation) => operation.kind === 'moveCursor'));
  assert.match(output, /\u001B\[1;1H {11}/u);
  assert.match(output, /\u001B\[1;1H›\[ Go \]/u);
  assert.match(output, /\u001B\[\?25l$/u);
});

test('runTui rejects non-TTY hosts deterministically before opening fullscreen protocols', async () => {
  const app = defineTui({
    id: 'non-tty-tui',
    init: () => ({ ready: true }),
    update: (state) => ({ state }),
    view: () => text('ready')
  });
  const host = createMemoryTerminalHost({ isTty: false });

  const exit = await runTui(app, host);

  assert.equal(exit.status, 'error');
  assert.equal(exit.diagnostics[0]?.code, 'HOST_CAPABILITY_UNAVAILABLE');
  assert.equal(exit.snapshot.source, 'tui');
  assert.equal(exit.snapshot.root.id, 'non-tty-tui');
  assert.equal(host.output(), '');
  assert.equal(host.restores().length, 0);
  assert.equal(host.stdin.isRawModeEnabled(), false);
});

test('runTui reports a typed diagnostic when no host is provided', async () => {
  const app = defineTui({
    id: 'missing-host-tui',
    init: () => ({ ready: true }),
    update: (state) => ({ state }),
    view: () => text('ready')
  });

  const exit = await runTui(app);

  assert.equal(exit.status, 'error');
  assert.equal(exit.diagnostics[0]?.code, 'HOST_CAPABILITY_UNAVAILABLE');
  assert.equal(exit.diagnostics[0]?.target, 'missing-host-tui');
  assert.equal(exit.snapshot.source, 'tui');
  assert.equal(exit.snapshot.root.id, 'missing-host-tui');
});

test('TUI runtime exposes diagnostics to app views', async () => {
  const appDiagnostic = diagnostic('HOST_PROTOCOL_UNSUPPORTED', 'Mouse reporting unavailable.', {
    severity: 'warning',
    data: {
      operation: 'mouseReporting',
      target: 'drag'
    }
  });
  const app = defineTui({
    id: 'diagnostic-view',
    init: () => ({ ready: true }),
    update: (state) => ({ state }),
    view: (_state, context) => {
      const item = context.diagnostics[0];
      return text(`${item?.code ?? 'none'}:${item?.data?.operation ?? 'none'}:${item?.data?.target ?? 'none'}`);
    }
  });
  const host = createMemoryTerminalHost({ viewport: { columns: 48, rows: 3 } });
  const runtime = createTuiRuntime({ app, host, diagnostics: [appDiagnostic] });

  const frame = await runtime.start();

  assert.match(renderFramePlain(frame), /HOST_PROTOCOL_UNSUPPORTED:mouseReporting:drag/u);
});

test('TUI runtime exposes diagnostics to subscription sources', async () => {
  const appDiagnostic = diagnostic('HOST_PROTOCOL_SKIPPED', 'Terminal protocol operation skipped.', {
    severity: 'info',
    data: {
      operation: 'mouseReporting',
      target: 'none'
    }
  });
  let observed;
  const app = defineTui({
    id: 'diagnostic-subscription',
    init: () => ({ label: 'pending' }),
    update: (_state, message) => ({ state: { label: message.label } }),
    subscriptions: () => [{
      id: 'diagnostic-source',
      delivery: 'sequential',
      async *messages(context) {
        observed = `${context.diagnostics[0]?.code ?? 'none'}:${context.diagnostics[0]?.data?.operation ?? 'none'}`;
        yield { label: observed };
      }
    }],
    view: (state) => text(state.label, { id: 'diagnostic-label' })
  });
  const harness = createTerminalHarness({ viewport: { columns: 48, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host, diagnostics: [appDiagnostic] });

  await runtime.start();
  await waitUntil(() => observed !== undefined);
  await waitUntil(() => renderFramePlain(runtime.frame()).includes('HOST_PROTOCOL_SKIPPED:mouseReporting'));

  assert.equal(observed, 'HOST_PROTOCOL_SKIPPED:mouseReporting');
  assert.match(renderFramePlain(runtime.frame()), /HOST_PROTOCOL_SKIPPED:mouseReporting/u);
});

test('runTui exposes setup diagnostics to app views', async () => {
  const app = defineTui({
    id: 'setup-diagnostic-view',
    init: () => ({ ready: true }),
    update: (state) => ({ state }),
    view: (_state, context) => {
      const item = context.diagnostics[0];
      return text(`${item?.code ?? 'none'}:${item?.data?.operation ?? 'none'}:${item?.data?.target ?? 'none'}`);
    }
  });
  const harness = createTerminalHarness({ viewport: { columns: 52, rows: 3 } });
  const running = runTui(app, harness.host, {
    sessionPolicy: {
      alternateScreen: 'disabled',
      rawInput: 'disabled',
      bracketedPaste: 'disabled',
      focusReporting: 'disabled',
      cursorVisibility: { state: 'hide', requirement: 'disabled' },
      mouseReporting: { mode: 'none', requirement: 'disabled' }
    }
  });

  await waitUntil(() => harness.frames().length === 1);
  assert.match(renderFramePlain(harness.frames()[0]), /HOST_PROTOCOL_SKIPPED:alternateScreen:true/u);

  harness.host.stdin.close();
  const exit = await running;

  assert.equal(exit.status, 'completed');
  assert.equal(exit.diagnostics.some((item) => item.code === 'HOST_PROTOCOL_SKIPPED'), true);
});

test('runTui restores terminal protocols on successful exit', async () => {
  const app = defineTui({
    id: 'restored-success',
    init: () => ({ ready: true }),
    update: (state) => ({ state }),
    view: () => textInput({ id: 'field', value: 'ready' })
  });
  const harness = createTerminalHarness({ viewport: { columns: 16, rows: 3 } });
  harness.host.stdin.close();
  const exit = await runTui(app, harness.host);
  const result = { transcript: harness.transcript.snapshot(), output: harness.output(), snapshot: harness.snapshot() };

  assert.equal(exit.status, 'completed');
  assert.equal(harness.host.stdin.isRawModeEnabled(), false);
  assert.deepEqual(harness.restores()[0], {
    rawInput: false,
    alternateScreen: false,
    bracketedPaste: false,
    mouseReporting: 'none',
    focusReporting: false,
    cursorVisible: true
  });
  assert.match(harness.output(), /\u001B\[\?1049h/);
  assert.match(harness.output(), /\u001B\[\?1049l/);
  assert.match(harness.output(), /\u001B\[\?2004h/);
  assert.match(harness.output(), /\u001B\[\?2004l/);
  assert.match(harness.output(), /\u001B\[\?1006h\u001B\[\?1002h/);
  assert.match(harness.output(), /\u001B\[\?1003l\u001B\[\?1002l\u001B\[\?1000l\u001B\[\?1006l/);
  assert.match(harness.output(), /\u001B\[\?1004h/);
  assert.match(harness.output(), /\u001B\[\?1004l/);
  assert.match(harness.output(), /\u001B\[\?25l/);
  assert.match(harness.output(), /\u001B\[\?25h/);
  assertTerminalRestored(result);
  await runInteractionScript(harness, {
    id: 'restore-assertion',
    steps: [{ kind: 'assertRestore' }]
  });
});

test('runTui processes host input chunks until the app exits', async () => {
  const app = defineTui({
    id: 'run-loop-update',
    init: () => ({ submitted: false }),
    update: (_state, message) => ({ state: { submitted: message.submitted }, exit: {} }),
    view: (state) => textInput({
      id: 'submit-field',
      value: state.submitted ? 'submitted' : 'waiting',
      onSubmit: { submitted: true }
    })
  });
  const harness = createTerminalHarness({ viewport: { columns: 20, rows: 3 } });
  harness.host.input('\r');
  const exit = await runTui(app, harness.host);

  assert.equal(exit.status, 'completed');
  assert.deepEqual(exit.state, { submitted: true });
  assert.equal(harness.frames().length, 2);
  assert.equal(harness.frames()[0].schemaVersion, 'terminal-ui.tui-frame.v1');
  assert.equal(harness.diffs()[0].schemaVersion, 'terminal-ui.render-diff.v1');
  assert.equal(harness.diffs()[0].fullRewrite, true);
  assert.equal(harness.diffs()[1].fullRewrite, false);
  assert.match(renderFramePlain(harness.frames()[1]), /submitted/);
  assert.equal(harness.restores().length, 1);
  assert.equal(harness.host.stdin.isRawModeEnabled(), false);
});

test('runTui preserves sanitized completed exit reasons', async () => {
  const app = defineTui({
    id: 'exit-reason',
    init: () => ({ submitted: false }),
    update: (_state, message) => ({
      state: { submitted: message.submitted },
      exit: { reason: 'Submitted \u001B[31mnow\u001B[0m' }
    }),
    view: (state) => textInput({
      id: 'reason-field',
      value: state.submitted ? 'submitted' : 'waiting',
      onSubmit: { submitted: true }
    })
  });
  const harness = createTerminalHarness({ viewport: { columns: 20, rows: 3 } });
  harness.host.input('\r');
  const exit = await runTui(app, harness.host);

  assert.equal(exit.status, 'completed');
  assert.equal(exit.reason, 'Submitted now');
  assert.deepEqual(exit.state, { submitted: true });
  assert.equal(harness.restores().length, 1);
});

test('runTui lets apps own escape and ctrlC key bindings', async () => {
  const app = defineTui({
    id: 'run-loop-key-exit',
    init: () => ({ active: 'ready' }),
    update: (_state, message) => ({ state: { active: message.active }, exit: {} }),
    view: (state) => textInput({
      id: 'exit-field',
      value: state.active,
      keys: {
        escape: () => ({ active: 'escape' }),
        ctrlC: () => ({ active: 'ctrlC' })
      }
    })
  });
  const escapeHarness = createTerminalHarness({ viewport: { columns: 20, rows: 3 } });
  escapeHarness.host.input('\u001B');
  const escape = await runTui(app, escapeHarness.host);

  const ctrlCHarness = createTerminalHarness({ viewport: { columns: 20, rows: 3 } });
  ctrlCHarness.host.input('\u0003');
  const ctrlC = await runTui(app, ctrlCHarness.host);

  assert.equal(escape.status, 'completed');
  assert.equal(ctrlC.status, 'completed');
  assert.deepEqual(escape.state, { active: 'escape' });
  assert.deepEqual(ctrlC.state, { active: 'ctrlC' });
  assert.equal(escapeHarness.restores().length, 1);
  assert.equal(ctrlCHarness.restores().length, 1);
  assert.equal(escapeHarness.host.stdin.isRawModeEnabled(), false);
  assert.equal(ctrlCHarness.host.stdin.isRawModeEnabled(), false);
});

test('runTui re-renders when the host emits resize signals', async () => {
  const app = defineTui({
    id: 'run-loop-resize',
    init: () => ({ done: false }),
    update: (_state, message) => ({ state: { done: message.done }, exit: {} }),
    view: (_state, context) => textInput({
      id: 'resize-field',
      value: `columns:${context.viewport.columns}`,
      onSubmit: { done: true }
    })
  });
  const harness = createTerminalHarness({ viewport: { columns: 20, rows: 3 } });
  const running = runTui(app, harness.host);

  await waitUntil(() => harness.frames().length === 1);
  harness.host.viewportControl?.setViewport({ columns: 12, rows: 3 });
  harness.host.signals.emit('resize');
  await waitUntil(() => harness.frames().length === 2);
  harness.host.input('\r');
  const exit = await running;

  assert.equal(exit.status, 'completed');
  assert.equal(harness.frames()[1].width, 12);
  assert.equal(harness.diffs()[1].fullRewrite, true);
  assert.match(renderFramePlain(harness.frames()[1]), /column…/);
  assert.equal(harness.frames()[1].accessibility.root.value, 'columns:12');
  assert.equal(harness.restores().length, 1);
});

test('runTui exits and restores when the host emits interruption signals', async () => {
  const app = defineTui({
    id: 'run-loop-signal',
    init: () => ({ ready: true }),
    update: (state) => ({ state }),
    view: () => textInput({ id: 'signal-field', value: 'ready' })
  });
  const harness = createTerminalHarness({ viewport: { columns: 20, rows: 3 } });
  const running = runTui(app, harness.host);

  await waitUntil(() => harness.frames().length === 1);
  harness.host.signals.emit('SIGTERM');
  const exit = await running;

  assert.equal(exit.status, 'interrupted');
  assert.equal(harness.restores().length, 1);
  assert.equal(harness.host.stdin.isRawModeEnabled(), false);
});

test('runTui restores terminal protocols after initialization failure', async () => {
  const app = defineTui({
    id: 'restored-error',
    init: () => {
      throw new Error('boom');
    },
    update: (state) => ({ state }),
    view: () => textInput({ id: 'field', value: 'unused' })
  });
  const harness = createTerminalHarness({ viewport: { columns: 16, rows: 3 } });
  const exit = await runTui(app, harness.host);

  assert.equal(exit.status, 'error');
  assert.equal(exit.diagnostics[0]?.code, 'TUI_RUN_FAILED');
  assert.equal(harness.host.stdin.isRawModeEnabled(), false);
  assert.equal(harness.restores().length, 1);
  assert.match(harness.output(), /\u001B\[\?1049h/);
  assert.match(harness.output(), /\u001B\[\?1049l/);
});

test('TUI runtime dispatch updates state and records incremental render diffs', async () => {
  const app = defineTui({
    id: 'counter',
    init: () => ({ count: 0 }),
    update: (state, message) => ({ state: { count: state.count + message.delta } }),
    view: (state) => surface(text(`Count ${state.count}`, { id: 'count' }), { id: 'counter-surface' })
  });
  const harness = createTerminalHarness({ viewport: { columns: 18, rows: 4 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  await runtime.dispatch({ delta: 2 });

  assert.deepEqual(runtime.getState(), { count: 2 });
  assert.equal(harness.frames().length, 2);
  assert.equal(harness.diffs().length, 2);
  assert.equal(harness.diffs()[0].fullRewrite, true);
  assert.equal(harness.diffs()[1].fullRewrite, false);
  assert.match(renderFramePlain(runtime.frame()), /Count 2/);
});

test('TUI runtime start returns the committed initial frame', async () => {
  const app = defineTui({
    id: 'start-frame',
    init: () => ({ label: 'ready' }),
    update: (state) => ({ state }),
    view: (state) => text(state.label, { id: 'start-label' })
  });
  const harness = createTerminalHarness({ viewport: { columns: 18, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  const frame = await runtime.start();

  assert.equal(frame.schemaVersion, 'terminal-ui.tui-frame.v1');
  assert.equal(frame.accessibility.root.id, 'start-label');
  assert.equal(runtime.exit(), undefined);
  assert.deepEqual(runtime.frame(), frame);
});

test('TUI runtime consumes async subscription sources without duplicate restarts', async () => {
  let starts = 0;
  const app = defineTui({
    id: 'subscription-init',
    init: () => ({ count: 0 }),
    update: (state, message) => ({ state: { count: state.count + message.delta } }),
    subscriptions: () => [{
      id: 'timer-source',
      source: 'timer',
      delivery: 'sequential',
      async *messages() {
        starts += 1;
        yield { delta: 1 };
      }
    }],
    view: (state) => text(`Count ${state.count}`, { id: 'subscription-count' })
  });
  const harness = createTerminalHarness({ viewport: { columns: 18, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  await waitUntil(() => runtime.getState()?.count === 1);
  await runtime.dispatch({ delta: 1 });

  assert.deepEqual(runtime.getState(), { count: 2 });
  assert.equal(starts, 1);
  assert.match(renderFramePlain(runtime.frame()), /Count 2/);
});

test('TUI runtime records subscription source failures and stops the failed source', async () => {
  let starts = 0;
  const app = defineTui({
    id: 'subscription-failure',
    init: () => ({ count: 0, status: 'active' }),
    update: (state, message) => message.kind === 'failed'
      ? { state: { ...state, status: 'failed' } }
      : { state: { ...state, count: state.count + message.delta } },
    subscriptions: () => [{
      id: 'failed-source',
      source: 'external',
      delivery: 'sequential',
      async *messages() {
        starts += 1;
        throw new Error('source failed');
      },
      onLifecycle: (event) => event.kind === 'failed' ? { kind: 'failed' } : undefined
    }],
    view: (state) => text(`Count ${state.count}`, { id: 'subscription-count' })
  });
  const harness = createTerminalHarness({ viewport: { columns: 18, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  await waitUntil(() => runtime.diagnostics().some((item) => item.code === 'TUI_SOURCE_FAILED'));
  await waitUntil(() => runtime.getState()?.status === 'failed');
  await runtime.dispatch({ kind: 'increment', delta: 1 });

  assert.equal(starts, 1);
  assert.match(
    runtime.diagnostics().find((item) => item.code === 'TUI_SOURCE_FAILED')?.message ?? '',
    /failed-source/u
  );
});

test('latest subscription delivery keeps one replaceable pending message', async () => {
  const app = defineTui({
    id: 'latest-subscription',
    init: () => ({ values: [] }),
    update: (state, message) => ({ state: { values: [...state.values, message.value] } }),
    subscriptions: () => [{
      id: 'samples',
      delivery: 'latest',
      async *messages() {
        for (let value = 1; value <= 100; value += 1) yield { value };
      }
    }],
    view: (state) => text(state.values.join(','), { id: 'latest-values' })
  });
  const harness = createTerminalHarness({ viewport: { columns: 24, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  await waitUntil(() => runtime.getState()?.values.at(-1) === 100);

  const values = runtime.getState()?.values ?? [];
  assert.equal(values[0], 1);
  assert.equal(values.at(-1), 100);
  assert.ok(values.length < 100);
});

test('TUI runtime cancels subscription sources when they leave the definition', async () => {
  let sourceSignal;
  let disposeCount = 0;
  const app = defineTui({
    id: 'subscription-cancel',
    init: () => ({ enabled: true }),
    update: (_state, message) => ({ state: { enabled: message.enabled } }),
    subscriptions: (state) => state.enabled
      ? [{
          id: 'long-source',
          delivery: 'sequential',
          async *messages(context) {
            sourceSignal = context.signal;
            await new Promise(() => undefined);
          },
          dispose() {
            disposeCount += 1;
          }
        }]
      : [],
    view: (state) => text(state.enabled ? 'enabled' : 'disabled', { id: 'subscription-state' })
  });
  const harness = createTerminalHarness({ viewport: { columns: 18, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  await waitUntil(() => sourceSignal !== undefined);
  assert.equal(sourceSignal.aborted, false);

  await runtime.dispatch({ enabled: false });

  assert.equal(sourceSignal.aborted, true);
  assert.equal(disposeCount, 1);
  assert.match(renderFramePlain(runtime.frame()), /disabled/);
});

test('TUI effects do not block later input or external dispatches', async () => {
  let releaseEffect;
  const gate = new Promise((resolve) => {
    releaseEffect = resolve;
  });
  const app = defineTui({
    id: 'async-effect',
    init: () => ({ count: 0, phase: 'idle' }),
    update: (state, message) => {
      if (message.kind === 'start') {
        return {
          state: { ...state, phase: 'loading' },
          effects: [{
            id: 'load',
            concurrency: 'replace',
            async run() {
              await gate;
              return { kind: 'message', message: { kind: 'finish' } };
            }
          }]
        };
      }
      if (message.kind === 'finish') return { state: { ...state, phase: 'done' } };
      return { state: { ...state, count: state.count + 1 } };
    },
    view: (state) => text(`${state.phase}:${String(state.count)}`, { id: 'effect-state' })
  });
  const harness = createTerminalHarness({ viewport: { columns: 18, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  await runtime.dispatch({ kind: 'start' });
  await runtime.dispatch({ kind: 'increment' });

  assert.deepEqual(runtime.getState(), { count: 1, phase: 'loading' });
  assert.match(renderFramePlain(runtime.frame()), /loading:1/u);

  releaseEffect();
  await waitUntil(() => runtime.getState()?.phase === 'done');
  assert.deepEqual(runtime.getState(), { count: 1, phase: 'done' });
});

test('TUI effects may dispatch terminal exit without deadlocking disposal', async () => {
  const app = defineTui({
    id: 'effect-exit',
    init: () => ({ phase: 'idle' }),
    update: (state, message) => {
      if (message.kind === 'start') {
        return {
          state: { phase: 'running' },
          effects: [{
            id: 'complete-run',
            concurrency: 'parallel',
            async run() {
              return { kind: 'message', message: { kind: 'finish' } };
            }
          }]
        };
      }
      if (message.kind === 'finish') {
        return { state: { phase: 'done' }, exit: { reason: 'effect completed' } };
      }
      return { state };
    },
    view: (state) => text(state.phase, { id: 'effect-exit-state' })
  });
  const harness = createTerminalHarness({ viewport: { columns: 18, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  await runtime.dispatch({ kind: 'start' });
  await waitUntil(() => runtime.exit() !== undefined);
  await Promise.race([
    runtime.dispose(),
    new Promise((_, reject) => setTimeout(() => reject(new Error('effect disposal timed out')), 250))
  ]);

  assert.equal(runtime.exit()?.status, 'completed');
  assert.equal(runtime.exit()?.reason, 'effect completed');
});

test('TUI subscriptions may dispatch terminal exit without deadlocking disposal', async () => {
  let sourceCompleted;
  const sourceCompletion = new Promise((resolve) => {
    sourceCompleted = resolve;
  });
  const app = defineTui({
    id: 'subscription-exit',
    init: () => ({ phase: 'waiting' }),
    update: (_state, message) => message.kind === 'finish'
      ? { state: { phase: 'done' }, exit: { reason: 'subscription completed' } }
      : { state: { phase: 'waiting' } },
    subscriptions: () => [{
      id: 'exit-source',
      delivery: 'sequential',
      async *messages() {
        try {
          yield { kind: 'finish' };
        } finally {
          sourceCompleted();
        }
      },
      async dispose() {
        await sourceCompletion;
      }
    }],
    view: (state) => text(state.phase, { id: 'subscription-exit-state' })
  });
  const harness = createTerminalHarness({ viewport: { columns: 18, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  await waitUntil(() => runtime.exit() !== undefined);
  await Promise.race([
    runtime.dispose(),
    new Promise((_, reject) => setTimeout(() => reject(new Error('subscription disposal timed out')), 250))
  ]);

  assert.equal(runtime.exit()?.status, 'completed');
  assert.equal(runtime.exit()?.reason, 'subscription completed');
});

test('TUI runtime records external dispatch messages in transcripts', async () => {
  const transcript = createTranscriptRecorder({ id: 'external-message-transcript', source: 'tui' });
  const app = defineTui({
    id: 'external-message',
    init: () => ({ count: 0 }),
    update: (state, message) => ({ state: { count: state.count + message.delta } }),
    view: (state) => text(`Count ${state.count}`, { id: 'external-count' })
  });
  const harness = createTerminalHarness({ viewport: { columns: 18, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host, transcript });

  await runtime.start();
  await runtime.dispatch({ delta: 4 });
  const snapshot = transcript.snapshot();

  assert.equal(validateTranscript(snapshot).ok, true);
  assert.ok(snapshot.steps.some((step) => step.kind === 'message'
    && step.source === 'external'
    && step.message.delta === 4));
});

test('TUI runtime coalesces unobserved frame changes', async () => {
  const app = defineTui({
    id: 'coalesced-frame-changes',
    init: () => ({ count: 0 }),
    update: (state, message) => ({ state: { count: state.count + message.delta } }),
    view: (state) => text(`Count ${String(state.count)}`, { id: 'count' })
  });
  const harness = createTerminalHarness({ viewport: { columns: 20, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  await runtime.dispatch({ delta: 1 });
  await runtime.dispatch({ delta: 1 });

  const latest = await runtime.nextChange();
  assert.equal(latest.kind, 'frame');
  assert.match(renderFramePlain(latest.frame), /Count 2/u);

  let resolved = false;
  const pending = runtime.nextChange().then((change) => {
    resolved = true;
    return change;
  });
  await Promise.resolve();
  assert.equal(resolved, false);

  await runtime.dispatch({ delta: 1 });
  const next = await pending;
  assert.equal(next.kind, 'frame');
  assert.match(renderFramePlain(next.frame), /Count 3/u);
});

test('TUI runtime does not publish frames for identity no-op updates', async () => {
  const app = defineTui({
    id: 'identity-noop-frame-changes',
    init: () => ({ count: 0 }),
    update: (state, message) => message.kind === 'noop'
      ? { state }
      : { state: { count: state.count + 1 } },
    view: (state) => text(`Count ${String(state.count)}`, { id: 'count' })
  });
  const harness = createTerminalHarness({ viewport: { columns: 20, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  await runtime.nextChange();

  let resolved = false;
  const pending = runtime.nextChange().then((change) => {
    resolved = true;
    return change;
  });
  await runtime.dispatch({ kind: 'noop' });
  await Promise.resolve();
  assert.equal(resolved, false);

  await runtime.dispatch({ kind: 'increment' });
  const change = await pending;
  assert.equal(change.kind, 'frame');
  assert.match(renderFramePlain(change.frame), /Count 1/u);
});

test('TUI runtime reports effect failures and can map them to application messages', async () => {
  const app = defineTui({
    id: 'effect-failure',
    init: () => ({ status: 'idle' }),
    update: (state, message) => message.kind === 'start'
      ? {
          state: { status: 'loading' },
          effects: [{
            id: 'broken-load',
            concurrency: 'replace',
            async run() {
              throw new Error('load failed');
            },
            onError: () => ({ kind: 'message', message: { kind: 'failed' } })
          }]
        }
      : { state: { ...state, status: 'failed' } },
    view: (state) => text(state.status, { id: 'effect-status' })
  });
  const harness = createTerminalHarness({ viewport: { columns: 18, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  await runtime.dispatch({ kind: 'start' });
  await waitUntil(() => runtime.getState()?.status === 'failed');

  assert.equal(runtime.diagnostics().some((item) => item.code === 'TUI_EFFECT_FAILED'), true);
  assert.match(renderFramePlain(runtime.frame()), /failed/u);
});

test('TUI runtime resize re-renders against the memory host viewport', async () => {
  const app = defineTui({
    id: 'resizable',
    init: () => ({ label: 'Wide label' }),
    update: (state) => ({ state }),
    view: (state) => surface(text(state.label, { id: 'label' }), { id: 'surface' })
  });
  const harness = createTerminalHarness({ viewport: { columns: 20, rows: 4 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  await runtime.resize({ columns: 12, rows: 4 });

  assert.equal(runtime.frame().width, 12);
  assert.equal(harness.frames().length, 2);
  assert.equal(harness.diffs()[1].fullRewrite, true);
  assert.match(renderFramePlain(runtime.frame()), /Wide label/);
});

test('anonymous container focus identity survives terminal resize', async () => {
  const app = defineTui({
    id: 'structural-focus-resize',
    init: () => ({ value: '' }),
    update: (state) => ({ state }),
    view: (state) => column([
      textInput({ id: 'first', value: state.value }),
      textInput({ id: 'second', value: state.value })
    ])
  });
  const harness = createTerminalHarness({ viewport: { columns: 40, rows: 6 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  await runtime.handleInput({
    kind: 'key',
    key: 'tab',
    ctrl: false,
    alt: false,
    shift: false,
    meta: false
  });
  const focusBeforeResize = runtime.frame().focusPath;
  await runtime.resize({ columns: 18, rows: 4 });

  assert.deepEqual(focusBeforeResize, ['column:0', 'second']);
  assert.deepEqual(runtime.frame().focusPath, focusBeforeResize);
});

test('TUI runtime routes key events through focused widget keymaps', async () => {
  const app = defineTui({
    id: 'keymap-routing',
    init: () => ({ active: 'none' }),
    update: (_state, message) => ({ state: { active: message.active } }),
    view: (state) => column([
      textInput({ id: 'first', value: state.active, keys: { enter: () => ({ active: 'first' }) } }),
      textInput({ id: 'second', value: state.active, keys: { enter: () => ({ active: 'second' }) } })
    ])
  });
  const harness = createTerminalHarness({ viewport: { columns: 20, rows: 4 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  const first = await runtime.handleInput({ kind: 'key', key: 'enter', ctrl: false, alt: false, shift: false, meta: false });
  const tab = await runtime.handleInput({ kind: 'key', key: 'tab', ctrl: false, alt: false, shift: false, meta: false });
  const second = await runtime.handleInput({ kind: 'key', key: 'enter', ctrl: false, alt: false, shift: false, meta: false });

  assert.equal(first.handled, true);
  assert.equal(tab.handled, true);
  assert.equal(second.handled, true);
  assert.deepEqual(runtime.getState(), { active: 'second' });
  assert.deepEqual(runtime.frame().focusPath, ['column:0', 'second']);
  assert.equal(harness.frames().length, 4);
  assert.equal(harness.diffs()[0].fullRewrite, true);
  assert.match(renderFramePlain(runtime.frame()), /second/);
});

test('TUI runtime lets focused widgets handle tab before focus traversal', async () => {
  const app = defineTui({
    id: 'tab-keymap-routing',
    init: () => ({ active: 'none' }),
    update: (_state, message) => ({ state: { active: message.active } }),
    view: (state) => column([
      textInput({ id: 'first', value: state.active, keys: { tab: () => ({ active: 'accepted' }) } }),
      textInput({ id: 'second', value: state.active, keys: { enter: () => ({ active: 'second' }) } })
    ])
  });
  const harness = createTerminalHarness({ viewport: { columns: 24, rows: 4 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  const focusBefore = runtime.frame().focusPath;
  const handled = await runtime.handleInput({ kind: 'key', key: 'tab', ctrl: false, alt: false, shift: false, meta: false });

  assert.equal(handled.handled, true);
  assert.deepEqual(runtime.getState(), { active: 'accepted' });
  assert.deepEqual(runtime.frame().focusPath, focusBefore);
  assert.match(renderFramePlain(runtime.frame()), /accepted/);
});

test('TUI runtime routes default app key bindings after focused widgets', async () => {
  const app = defineTui({
    id: 'app-key-binding-after-focus',
    init: () => ({ active: 'open' }),
    keyBindings: [
      { id: 'close', triggers: [{ kind: 'key', key: 'escape' }], message: { active: 'closed' } }
    ],
    update: (_state, message) => ({ state: { active: message.active } }),
    view: (state) => textInput({ id: 'field', value: state.active })
  });
  const harness = createTerminalHarness({ viewport: { columns: 24, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  const handled = await runtime.handleInput({
    kind: 'key',
    key: 'escape',
    sequence: '\u001B',
    ctrl: false,
    alt: false,
    shift: false,
    meta: false
  });

  assert.equal(handled.handled, true);
  assert.deepEqual(runtime.getState(), { active: 'closed' });
  assert.match(renderFramePlain(runtime.frame()), /closed/);
});

test('TUI runtime lets focused widgets override after-focus app bindings', async () => {
  const app = defineTui({
    id: 'app-key-binding-focused-wins',
    init: () => ({ active: 'open' }),
    keyBindings: [
      { id: 'global-close', triggers: [{ kind: 'key', key: 'escape' }], message: { active: 'global' } }
    ],
    update: (_state, message) => ({ state: { active: message.active } }),
    view: (state) => textInput({
      id: 'field',
      value: state.active,
      keys: { escape: () => ({ active: 'local' }) }
    })
  });
  const harness = createTerminalHarness({ viewport: { columns: 24, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  await runtime.handleInput({
    kind: 'key',
    key: 'escape',
    sequence: '\u001B',
    ctrl: false,
    alt: false,
    shift: false,
    meta: false
  });

  assert.deepEqual(runtime.getState(), { active: 'local' });
  assert.match(renderFramePlain(runtime.frame()), /local/);
});

test('TUI runtime lets before-focus app bindings intentionally preempt widgets', async () => {
  const app = defineTui({
    id: 'app-key-binding-before-focus',
    init: () => ({ active: 'open' }),
    keyBindings: [
      { id: 'priority-enter', triggers: [{ kind: 'key', key: 'enter' }], phase: 'beforeFocus', message: { active: 'global' } }
    ],
    update: (_state, message) => ({ state: { active: message.active } }),
    view: (state) => textInput({
      id: 'field',
      value: state.active,
      keys: { enter: () => ({ active: 'local' }) }
    })
  });
  const harness = createTerminalHarness({ viewport: { columns: 24, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  await runtime.handleInput({ kind: 'key', key: 'enter', ctrl: false, alt: false, shift: false, meta: false });

  assert.deepEqual(runtime.getState(), { active: 'global' });
  assert.match(renderFramePlain(runtime.frame()), /global/);
});

test('TUI runtime does not steal printable text for default app bindings', async () => {
  const app = defineTui({
    id: 'app-key-binding-printable-after-focus',
    init: () => ({ value: '' }),
    keyBindings: [
      { id: 'quit', triggers: [{ kind: 'text', text: 'q' }], message: { value: 'quit' } }
    ],
    update: (state, message) => ({ state: { value: `${state.value}${message.value}` } }),
    view: (state) => textInput({
      id: 'field',
          value: state.value,
          onEdit: (operation) => ({ value: operation.kind === 'insert' ? operation.text : '' })
    })
  });
  const harness = createTerminalHarness({ viewport: { columns: 24, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  await runtime.handleInput({ kind: 'text', text: 'q' });

  assert.deepEqual(runtime.getState(), { value: 'q' });
  assert.match(renderFramePlain(runtime.frame()), /q/);
});

test('TUI runtime evaluates app key binding predicates and dynamic messages', async () => {
  const app = defineTui({
    id: 'app-key-binding-dynamic',
    init: () => ({ active: 'blocked', enabled: false }),
    keyBindings: [
      {
        id: 'dynamic-help',
        triggers: [{ kind: 'key', key: 'ctrlQ' }],
        enabled: ({ state }) => state.enabled,
        toMessage: ({ focusPath }) => ({ active: focusPath?.join('/') ?? 'none', enabled: true })
      }
    ],
    update: (_state, message) => ({ state: message }),
    view: (state) => textInput({
      id: 'field',
      value: state.active,
      keys: { enter: () => ({ active: 'ready', enabled: true }) }
    })
  });
  const harness = createTerminalHarness({ viewport: { columns: 32, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  const disabled = await runtime.handleInput({ kind: 'key', key: 'ctrlQ', ctrl: true, alt: false, shift: false, meta: false });
  await runtime.handleInput({ kind: 'key', key: 'enter', ctrl: false, alt: false, shift: false, meta: false });
  const enabled = await runtime.handleInput({ kind: 'key', key: 'ctrlQ', ctrl: true, alt: false, shift: false, meta: false });

  assert.equal(disabled.handled, false);
  assert.equal(enabled.handled, true);
  assert.deepEqual(runtime.getState(), { active: 'field', enabled: true });
});

test('TUI runtime keeps scanning app key bindings when earlier matches decline', async () => {
  const app = defineTui({
    id: 'app-key-binding-declined-fallback',
    init: () => ({ active: 'open' }),
    keyBindings: [
      { id: 'contextual-help', triggers: [{ kind: 'key', key: 'ctrlQ' }], toMessage: () => undefined },
      { id: 'fallback-help', triggers: [{ kind: 'key', key: 'ctrlQ' }], message: { active: 'fallback' } }
    ],
    update: (_state, message) => ({ state: { active: message.active } }),
    view: (state) => textInput({ id: 'field', value: state.active })
  });
  const harness = createTerminalHarness({ viewport: { columns: 32, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  const handled = await runtime.handleInput({ kind: 'key', key: 'ctrlQ', ctrl: true, alt: false, shift: false, meta: false });

  assert.equal(handled.handled, true);
  assert.deepEqual(runtime.getState(), { active: 'fallback' });
});

test('TUI runtime routes escape through focused widget keymaps', async () => {
  const app = defineTui({
    id: 'escape-keymap-routing',
    init: () => ({ active: 'open' }),
    update: (_state, message) => ({ state: { active: message.active } }),
    view: (state) => textInput({
      id: 'dialog-field',
      value: state.active,
      keys: { escape: () => ({ active: 'closed' }) }
    })
  });
  const harness = createTerminalHarness({ viewport: { columns: 24, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  const handled = await runtime.handleInput({
    kind: 'key',
    key: 'escape',
    sequence: '\u001B',
    ctrl: false,
    alt: false,
    shift: false,
    meta: false
  });

  assert.equal(handled.handled, true);
  assert.equal(handled.exit, undefined);
  assert.equal(runtime.exit(), undefined);
  assert.deepEqual(runtime.getState(), { active: 'closed' });
  assert.match(renderFramePlain(runtime.frame()), /closed/);
});

test('TUI runtime routes focused text and paste through one edit-operation channel', async () => {
  const app = defineTui({
    id: 'input-map-routing',
    init: () => ({ value: '' }),
    update: (state, message) => ({
      state: {
        value: message.operation.kind === 'insert'
          ? `${state.value}${message.operation.text}`
          : state.value
      }
    }),
    view: (state) => textInput({
      id: 'field',
      value: state.value,
      onEdit: (operation) => ({ operation })
    })
  });
  const harness = createTerminalHarness({ viewport: { columns: 30, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  const typed = await runtime.handleInput({ kind: 'text', text: 'a' });
  const pasted = await runtime.handleInput({ kind: 'paste', text: 'bc' });

  assert.equal(typed.handled, true);
  assert.equal(pasted.handled, true);
  assert.deepEqual(runtime.getState(), { value: 'abc' });
  assert.match(renderFramePlain(runtime.frame()), /abc/);
});

test('TUI runtime routes single-space input chunks as text for editable focused widgets', async () => {
  const app = defineTui({
    id: 'space-input-routing',
    init: () => ({ value: '' }),
    update: (state, message) => ({ state: { value: `${state.value}${message.text}` } }),
    view: (state) => textInput({
      id: 'field',
      value: state.value,
      onEdit: (operation) => ({ text: operation.kind === 'insert' ? operation.text : '' })
    })
  });
  const harness = createTerminalHarness({ viewport: { columns: 30, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  await runtime.handleInputChunk({ data: '/folder' });
  const space = await runtime.handleInputChunk({ data: ' ' });
  await runtime.handleInputChunk({ data: 'src' });

  assert.equal(space.some((result) => result.handled), true);
  assert.deepEqual(runtime.getState(), { value: '/folder src' });
  assert.match(renderFramePlain(runtime.frame()), /\/folder src/u);
});

test('TUI runtime lets focused space key bindings override text insertion', async () => {
  const app = defineTui({
    id: 'space-key-routing',
    init: () => ({ value: '' }),
    update: (_state, message) => ({ state: { value: message.text } }),
    view: (state) => textInput({
      id: 'field',
      value: state.value,
      keys: { space: () => ({ text: 'space-key' }) },
      onEdit: (operation) => ({ text: operation.kind === 'insert' ? operation.text : '' })
    })
  });
  const harness = createTerminalHarness({ viewport: { columns: 30, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  const space = await runtime.handleInputChunk({ data: ' ' });

  assert.equal(space.some((result) => result.handled), true);
  assert.deepEqual(runtime.getState(), { value: 'space-key' });
});

test('TUI runtime decodes input chunks through the configured input pipeline', async () => {
  const app = defineTui({
    id: 'input-pipeline-routing',
    init: () => ({ value: '' }),
    update: (state, message) => ({ state: { value: `${state.value}${message.text}` } }),
    view: (state) => textInput({
      id: 'pipeline-field',
      value: state.value,
      onEdit: (operation) => ({ text: operation.kind === 'insert' ? operation.text : '' })
    })
  });
  const harness = createTerminalHarness({ viewport: { columns: 30, rows: 3 } });
  const runtime = createTuiRuntime({
    app,
    host: harness.host,
    input: { bracketedPaste: false }
  });

  await runtime.start();
  const results = await runtime.handleInputChunk({ data: '\u001B[200~pasted\ntext\u001B[201~' });

  assert.equal(results.some((result) => result.handled), true);
  assert.deepEqual(runtime.getState(), { value: 'pastedtext' });
  assert.match(renderFramePlain(runtime.frame()), /pastedtext/);
});

test('runTui accepts an initial focus path', async () => {
  const app = defineTui({
    id: 'run-focus-restore',
    init: () => ({ active: 'idle' }),
    update: (_state, message) => ({ state: { active: message.active }, exit: {} }),
    view: (state) => column([
      textInput({ id: 'first', value: state.active, keys: { enter: () => ({ active: 'first' }) } }),
      textInput({ id: 'second', value: state.active, keys: { enter: () => ({ active: 'second' }) } })
    ])
  });
  const host = createMemoryTerminalHost({ viewport: { columns: 20, rows: 4 } });
  host.input('\r');

  const exit = await runTui(app, host, { initialFocusPath: ['column:0', 'second'] });

  assert.equal(exit.status, 'completed');
  assert.deepEqual(exit.state, { active: 'second' });
});

test('runTui accepts a state-derived theme', async () => {
  const app = defineTui({
    id: 'run-state-theme',
    init: () => ({ active: false }),
    keyBindings: [{ id: 'activate-theme', triggers: [{ kind: 'key', key: 'enter' }], message: { active: true } }],
    update: () => ({ state: { active: true }, exit: {} }),
    view: () => richText({
      id: 'theme-label',
      segments: [{ kind: 'text', text: 'theme', style: { fg: { kind: 'theme', token: 'accent.primary' } } }]
    })
  });
  const host = createMemoryTerminalHost({ viewport: { columns: 12, rows: 2 } });
  host.input('\r');

  const exit = await runTui(app, host, {
    theme: (state) => ({
      tokens: {
        colors: {
          'accent.primary': state.active
            ? { kind: 'ansi', value: 2 }
            : { kind: 'ansi', value: 1 }
        }
      }
    })
  });

  assert.equal(exit.status, 'completed');
  assert.match(host.output(), /\u001B\[38;5;1m/u);
  assert.match(host.output(), /\u001B\[38;5;2m/u);
});

test('TUI runtime restores a serialized focus path when it still exists', async () => {
  const app = defineTui({
    id: 'focus-restore',
    init: () => ({ active: 'idle' }),
    update: (_state, message) => ({ state: { active: message.active } }),
    view: (state) => column([
      textInput({ id: 'first', value: state.active, keys: { enter: () => ({ active: 'first' }) } }),
      textInput({ id: 'second', value: state.active, keys: { enter: () => ({ active: 'second' }) } })
    ])
  });
  const firstHarness = createTerminalHarness({ viewport: { columns: 20, rows: 4 } });
  const firstRuntime = createTuiRuntime({ app, host: firstHarness.host });
  await firstRuntime.start();
  await firstRuntime.handleInput({ kind: 'key', key: 'tab', ctrl: false, alt: false, shift: false, meta: false });
  const restoredPath = firstRuntime.frame().focusPath;

  const restoredHarness = createTerminalHarness({ viewport: { columns: 20, rows: 4 } });
  const restoredRuntime = createTuiRuntime({
    app,
    host: restoredHarness.host,
    initialFocusPath: restoredPath
  });
  await restoredRuntime.start();
  const committed = await restoredRuntime.handleInput({
    kind: 'key',
    key: 'enter',
    ctrl: false,
    alt: false,
    shift: false,
    meta: false
  });

  assert.deepEqual(restoredPath, ['column:0', 'second']);
  assert.deepEqual(restoredRuntime.frame().focusPath, restoredPath);
  assert.equal(committed.handled, true);
  assert.deepEqual(restoredRuntime.getState(), { active: 'second' });
});

test('TUI runtime falls back when restored focus path is stale', async () => {
  const app = defineTui({
    id: 'stale-focus-restore',
    init: () => ({ active: 'idle' }),
    update: (_state, message) => ({ state: { active: message.active } }),
    view: (state) => column([
      textInput({ id: 'first', value: state.active, keys: { enter: () => ({ active: 'first' }) } }),
      textInput({ id: 'second', value: state.active, keys: { enter: () => ({ active: 'second' }) } })
    ])
  });
  const harness = createTerminalHarness({ viewport: { columns: 20, rows: 4 } });
  const runtime = createTuiRuntime({
    app,
    host: harness.host,
    initialFocusPath: ['column:0', 'missing']
  });

  await runtime.start();
  const committed = await runtime.handleInput({
    kind: 'key',
    key: 'enter',
    ctrl: false,
    alt: false,
    shift: false,
    meta: false
  });

  assert.deepEqual(runtime.frame().focusPath, ['column:0', 'first']);
  assert.equal(committed.handled, true);
  assert.deepEqual(runtime.getState(), { active: 'first' });
});

test('TUI runtime traverses focus backward with shifted tab', async () => {
  const app = defineTui({
    id: 'reverse-focus',
    init: () => ({ active: 'idle' }),
    update: (_state, message) => ({ state: { active: message.active } }),
    view: (state) => column([
      textInput({ id: 'first', value: state.active, keys: { enter: () => ({ active: 'first' }) } }),
      textInput({ id: 'second', value: state.active, keys: { enter: () => ({ active: 'second' }) } })
    ])
  });
  const harness = createTerminalHarness({ viewport: { columns: 20, rows: 4 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  const forward = await runtime.handleInput({ kind: 'key', key: 'tab', ctrl: false, alt: false, shift: false, meta: false });
  const backward = await runtime.handleInput({ kind: 'key', key: 'tab', ctrl: false, alt: false, shift: true, meta: false });
  const committed = await runtime.handleInput({ kind: 'key', key: 'enter', ctrl: false, alt: false, shift: false, meta: false });

  assert.equal(forward.handled, true);
  assert.equal(backward.handled, true);
  assert.equal(committed.handled, true);
  assert.deepEqual(runtime.getState(), { active: 'first' });
  assert.deepEqual(runtime.frame().focusPath, ['column:0', 'first']);
});

test('TUI runtime respects explicit focus order and disabled focus targets', async () => {
  const app = defineTui({
    id: 'ordered-focus',
    init: () => ({ active: 'idle' }),
    update: (_state, message) => ({ state: { active: message.active } }),
    view: (state) => column([
      textInput({
    id: 'disabled',
    value: state.active,
    keys: { enter: () => ({ active: 'disabled' }) },
    meta: {
        focus: { disabled: true, order: 0 }
    }
}),
      textInput({
    id: 'later',
    value: state.active,
    keys: { enter: () => ({ active: 'later' }) },
    meta: {
        focus: { order: 2 }
    }
}),
      textInput({
    id: 'first',
    value: state.active,
    keys: { enter: () => ({ active: 'first' }) },
    meta: {
        focus: { order: 1 }
    }
})
    ])
  });
  const harness = createTerminalHarness({ viewport: { columns: 24, rows: 6 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  const first = await runtime.handleInput({ kind: 'key', key: 'enter', ctrl: false, alt: false, shift: false, meta: false });
  const tab = await runtime.handleInput({ kind: 'key', key: 'tab', ctrl: false, alt: false, shift: false, meta: false });
  const second = await runtime.handleInput({ kind: 'key', key: 'enter', ctrl: false, alt: false, shift: false, meta: false });

  assert.equal(first.handled, true);
  assert.equal(tab.handled, true);
  assert.equal(second.handled, true);
  assert.deepEqual(runtime.frame().focusPath, ['column:0', 'later']);
  assert.deepEqual(runtime.getState(), { active: 'later' });
});

test('TUI runtime traps focus inside modal and scoped popover widgets', async () => {
  const modalApp = defineTui({
    id: 'modal-focus-scope',
    init: () => ({ active: 'idle' }),
    update: (_state, message) => ({ state: { active: message.active } }),
    view: (state) => column([
      textInput({ id: 'background', value: state.active, keys: { enter: () => ({ active: 'background' }) } }),
      dialog(textInput({ id: 'dialog-field', value: state.active, keys: { enter: () => ({ active: 'dialog' }) } }), {
        id: 'dialog',
        width: 20,
        height: 4
      })
    ])
  });
  const modalHarness = createTerminalHarness({ viewport: { columns: 30, rows: 8 } });
  const modalRuntime = createTuiRuntime({ app: modalApp, host: modalHarness.host });

  await modalRuntime.start();
  const modalTab = await modalRuntime.handleInput({ kind: 'key', key: 'tab', ctrl: false, alt: false, shift: false, meta: false });
  const modalEnter = await modalRuntime.handleInput({ kind: 'key', key: 'enter', ctrl: false, alt: false, shift: false, meta: false });

  assert.equal(modalTab.handled, true);
  assert.equal(modalEnter.handled, true);
  assert.deepEqual(modalRuntime.frame().focusPath, ['column:0', 'dialog', 'dialog-field']);
  assert.deepEqual(modalRuntime.frame().accessibility.root.children?.[1]?.scope, {
    kind: 'modal',
    trapsFocus: true,
    obscuresBackground: true
  });
  assert.deepEqual(modalRuntime.getState(), { active: 'dialog' });

  const popoverApp = defineTui({
    id: 'popover-focus-scope',
    init: () => ({ active: 'idle' }),
    update: (_state, message) => ({ state: { active: message.active } }),
    view: (state) => column([
      textInput({ id: 'page-field', value: state.active, keys: { enter: () => ({ active: 'page' }) } }),
      surface(textInput({ id: 'popover-field', value: state.active, keys: { enter: () => ({ active: 'popover' }) } }), {
    id: 'popover',
    meta: {
        layer: {
            zIndex: 10
        },
        focus: { scope: 'contain' }
    }
})
    ])
  });
  const popoverHarness = createTerminalHarness({ viewport: { columns: 30, rows: 8 } });
  const popoverRuntime = createTuiRuntime({ app: popoverApp, host: popoverHarness.host });

  await popoverRuntime.start();
  const popoverEnter = await popoverRuntime.handleInput({ kind: 'key', key: 'enter', ctrl: false, alt: false, shift: false, meta: false });

  assert.equal(popoverEnter.handled, true);
  assert.deepEqual(popoverRuntime.frame().focusPath, ['column:0', 'popover', 'popover-field']);
  assert.deepEqual(popoverRuntime.frame().accessibility.root.children?.[1]?.scope, {
    kind: 'popover',
    trapsFocus: true
  });
  assert.deepEqual(popoverRuntime.getState(), { active: 'popover' });
});

test('TUI runtime focuses top-layer context menus and open dropdownMenus', async () => {
  const contextMenuApp = defineTui({
    id: 'context-menu-focus',
    init: () => ({ active: 'idle' }),
    update: (_state, message) => ({ state: { active: message.active } }),
    view: (state) => overlay([
      textInput({ id: 'page-field', value: state.active, keys: { enter: () => ({ active: 'page' }) } }),
      contextMenu({
    id: 'actions-menu',
    title: 'Actions',
    selected: 'copy',
    items: [
        { id: 'copy', label: 'Copy' },
        { id: 'paste', label: 'Paste' }
    ],
    onAction: (action) => ({ active: action.kind === 'activate' && action.id === 'copy' ? 'context-menu' : action.kind }),
    meta: {
        layer: {
            zIndex: 10
        }
    }
})
    ], {
      id: 'context-menu-root'
    })
  });
  const contextMenuRuntime = createTuiRuntime({
    app: contextMenuApp,
    host: createTerminalHarness({ viewport: { columns: 24, rows: 5 } }).host
  });

  await contextMenuRuntime.start();
  const contextResult = await contextMenuRuntime.handleInput({ kind: 'key', key: 'enter', ctrl: false, alt: false, shift: false, meta: false });

  assert.equal(contextResult.handled, true);
  assert.deepEqual(contextMenuRuntime.frame().focusPath, ['context-menu-root', 'actions-menu']);
  assert.deepEqual(contextMenuRuntime.getState(), { active: 'context-menu' });

  const dropdownMenuApp = defineTui({
    id: 'dropdownMenu-focus',
    init: () => ({ active: 'idle' }),
    update: (_state, message) => ({ state: { active: message.active } }),
    view: (state) => overlay([
      textInput({ id: 'page-field', value: state.active, keys: { enter: () => ({ active: 'page' }) } }),
      dropdownMenu({
    id: 'theme-dropdownMenu',
    label: 'Theme',
    presentation: { kind: 'open', selected: 'dark', highlighted: 'dark' },
    items: [
        { id: 'light', label: 'Light' },
        { id: 'dark', label: 'Dark' }
    ],
    onAction: (action) => ({ active: action.kind === 'activate' && action.id === 'dark' ? 'dropdownMenu' : action.kind }),
    meta: {
        layer: {
            zIndex: 10
        }
    }
})
    ], {
      id: 'dropdownMenu-root'
    })
  });
  const dropdownMenuRuntime = createTuiRuntime({
    app: dropdownMenuApp,
    host: createTerminalHarness({ viewport: { columns: 24, rows: 5 } }).host
  });

  await dropdownMenuRuntime.start();
  const dropdownMenuResult = await dropdownMenuRuntime.handleInput({ kind: 'key', key: 'enter', ctrl: false, alt: false, shift: false, meta: false });

  assert.equal(dropdownMenuResult.handled, true);
  assert.deepEqual(dropdownMenuRuntime.frame().focusPath, ['dropdownMenu-root', 'theme-dropdownMenu']);
  assert.deepEqual(dropdownMenuRuntime.getState(), { active: 'dropdownMenu' });
});

test('TUI runtime traverses multiple custom focus targets within one widget', async () => {
  const renderer = {
    render({ buffer, bounds }) {
      buffer.write(bounds.row, bounds.column, [{ text: 'AB' }]);
    },
    accessibility({ id, focused }) {
      return {
        id,
        role: 'application',
        label: 'Custom focus regions',
        ...(focused ? { focused } : {})
      };
    },
    focusTargets({ bounds }) {
      return [
        {
          id: 'left',
          bounds: { row: bounds.row, column: bounds.column, width: 1, height: 1 },
          order: 2
        },
        {
          id: 'right',
          bounds: { row: bounds.row, column: bounds.column + 1, width: 1, height: 1 },
          order: 1
        }
      ];
    }
  };
  const app = defineTui({
    id: 'custom-focus-targets',
    init: () => ({}),
    update: (state) => ({ state }),
    view: () => custom({ id: 'custom-board', renderer })
  });
  const harness = createTerminalHarness({ viewport: { columns: 10, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  assert.deepEqual(runtime.frame().focusPath, ['custom-board', 'right']);

  await runtime.handleInput({ kind: 'key', key: 'tab', ctrl: false, alt: false, shift: false, meta: false });
  assert.deepEqual(runtime.frame().focusPath, ['custom-board', 'left']);
});

test('TUI frame accessibility uses widget metadata and marks only the active focus target', async () => {
  const app = defineTui({
    id: 'a11y-frame',
    init: () => ({ active: 'idle' }),
    update: (_state, message) => ({ state: { active: message.active } }),
    view: (state) => column([
      textInput({
    id: 'first-field',
    value: state.active,
    onSubmit: { active: 'first' },
    meta: {
        accessibility: {
            id: 'first-field',
            role: 'textbox',
            label: 'First field',
            description: 'Primary input'
        }
    }
}),
      list({
        getItemId: (item) => String(item),
        id: 'choices',
        items: ['Alpha', 'Beta'],
        selectedId: 'Beta',
        onAction: (action) => ({ active: ['alpha', 'beta'][action.index] ?? 'none' })
      }),
      table({ id: 'grid', rows: [['A1', 'B1']], getRowId: (_row, index) => String(index) })
    ])
  });
  const harness = createTerminalHarness({ viewport: { columns: 24, rows: 8 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  await runtime.handleInput({ kind: 'key', key: 'tab', ctrl: false, alt: false, shift: false, meta: false });
  const snapshot = runtime.frame().accessibility;
  const first = snapshot.root.children[0];
  const choices = snapshot.root.children[1];
  const tableNode = snapshot.root.children[2];

  assert.equal(snapshot.source, 'tui');
  assert.deepEqual(snapshot.focusPath, ['column:0', 'choices']);
  assert.equal(first?.label, 'First field');
  assert.equal(first?.description, 'Primary input');
  assert.equal(first?.focused, undefined);
  assert.equal(choices?.role, 'listbox');
  assert.equal(choices?.focused, true);
  assert.deepEqual(choices?.children?.map((node) => [node.role, node.label, node.selected]), [
    ['option', 'Alpha', false],
    ['option', 'Beta', true]
  ]);
  assert.equal(tableNode?.role, 'table');
  assert.equal(tableNode?.children?.[0]?.children?.[1]?.value, 'B1');
});

test('TUI runtime uses app-level accessibility descriptions for frames and exits', async () => {
  const app = defineTui({
    id: 'custom-a11y',
    init: () => ({ label: 'ready' }),
    update: (state) => ({ state, exit: {} }),
    view: (state) => textInput({ id: 'custom-field', value: state.label, onSubmit: { done: true } }),
    accessibility: {
      describe: (state) => ({
        schemaVersion: 'terminal-ui.accessible-snapshot.v1',
        source: 'tui',
        title: 'Custom \u001B[31maccessibility\u001B[0m',
        root: {
          id: 'custom-root',
          role: 'application',
          label: `Accessible \u001B[31m${state.label}\u001B[0m`,
          children: [{ id: 'custom-status', role: 'status', label: state.label }]
        },
        focusPath: ['custom-root', 'custom-status'],
        diagnostics: []
      })
    }
  });
  const harness = createTerminalHarness({ viewport: { columns: 20, rows: 3 } });
  const running = runTui(app, harness.host);

  await waitUntil(() => harness.frames().length === 1);
  assert.match(renderFramePlain(harness.frames()[0]), /ready/);
  assert.equal(harness.frames()[0].accessibility.title, 'Custom accessibility');
  assert.equal(harness.frames()[0].accessibility.root.id, 'custom-root');
  assert.equal(harness.frames()[0].accessibility.root.label, 'Accessible ready');
  assert.deepEqual(harness.frames()[0].accessibility.focusPath, ['custom-root', 'custom-status']);
  assert.equal(validateAccessibleSnapshot(harness.frames()[0].accessibility).ok, true);

  harness.host.input('\r');
  const exit = await running;

  assert.equal(exit.status, 'completed');
  assert.equal(exit.snapshot.root.id, 'custom-root');
  assert.equal(exit.snapshot.root.label, 'Accessible ready');
});

test('TUI runtime falls back when app-level accessibility is structurally invalid', async () => {
  const app = defineTui({
    id: 'invalid-custom-a11y',
    init: () => ({ label: 'ready' }),
    update: (state) => ({ state }),
    view: (state) => textInput({ id: 'safe-field', value: state.label }),
    accessibility: {
      describe: () => ({
        schemaVersion: 'terminal-ui.accessible-snapshot.v1',
        source: 'tui',
        root: { id: 'custom-root', role: 'application', label: 'Custom root' },
        focusPath: ['missing-root'],
        diagnostics: []
      })
    }
  });
  const harness = createTerminalHarness({ viewport: { columns: 20, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  const snapshot = runtime.frame().accessibility;

  assert.equal(snapshot.root.id, 'safe-field');
  assert.equal(snapshot.diagnostics[0]?.code, 'ACCESSIBLE_SNAPSHOT_INVALID');
  assert.equal(validateAccessibleSnapshot(snapshot).ok, true);
});

test('TUI rendering windows large list and table widgets to visible height', () => {
  const manyItems = Array.from({ length: 1000 }, (_value, index) => `Item ${index}`);
  const frame = renderElementFrame(column([
    list({ id: 'many-items', items: manyItems, getItemId: (item) => item, selectedId: 'Item 990' }),
    table({ id: 'many-rows', rows: manyItems.map((item) => [item, 'value']), getRowId: (_row, index) => String(index) })
  ]), { columns: 24, rows: 8 });
  const output = renderFramePlain(frame);
  const listNode = frame.accessibility.root.children[0];
  const tableNode = frame.accessibility.root.children[1];

  assert.match(output, /Item 990/);
  assert.doesNotMatch(output, /Item 0\n Item 1\n Item 2\n Item 3\n Item 4\n Item 5\n Item 6\n Item 7\n Item 8/);
  assert.ok(frame.cells.length <= frame.width * frame.height);
  assert.equal(listNode?.children?.length, 4);
  assert.equal(tableNode?.children?.length, 4);
  assert.equal(listNode?.description, 'Showing 989-992 of 1000 items.');
  assert.equal(tableNode?.description, 'Showing 1-4 of 1000 rows.');
});

test('viewport widgets render a clipped scrolled window into child content', () => {
  const frame = renderElementFrame(viewport(
    text('row-0\nrow-1\nrow-2\nrow-3', { id: 'viewport-text' }),
    {
      id: 'viewport',
      scrollRow: 1,
      scrollColumn: 2,
      contentRows: 4,
      contentColumns: 8
    }
  ), { columns: 5, rows: 2 });
  const output = renderFramePlain(frame);
  const rightMarker = frame.cells.find((cell) => cell.source?.ownerKind === 'viewport' && cell.source.label === 'clip-right');

  assert.equal(output, 'w-1 →\nw-2');
  assert.equal(rightMarker?.text, '→');
  assert.equal(
    frame.accessibility.root.description,
    'Showing rows 2-3 of 4, columns 3-7 of 8.'
  );
});

test('viewport widgets keep offscreen content from leaking into neighboring layout', () => {
  const frame = renderElementFrame(row([
    viewport(
      text('left-0\nleft-1\nleft-2', { id: 'left-content' }),
      { id: 'left-window', scrollRow: 2, contentRows: 3 }
    ),
    text('right', { id: 'right-content' })
  ]), { columns: 12, rows: 1 });
  const output = renderFramePlain(frame);

  assert.match(output, /^left-2right$/u);
  assert.doesNotMatch(output, /left-0|left-1/u);
});

test('viewport widgets expose empty virtual content without rendering child content', () => {
  const frame = renderElementFrame(viewport(
    text('hidden child', { id: 'empty-content' }),
    { id: 'empty-window', contentRows: 0, contentColumns: 8 }
  ), { columns: 5, rows: 3 });
  const output = renderFramePlain(frame);
  const emptyMarker = frame.cells.find((cell) => cell.source?.ownerKind === 'viewport' && cell.source.label === 'empty');

  assert.doesNotMatch(output, /hidden child/u);
  assert.equal(emptyMarker?.text, '∅');
  assert.equal(frame.accessibility.root.description, 'Empty viewport content.');
});

test('viewport clipped-edge indicators do not overwrite visible content cells', () => {
  const frame = renderElementFrame(viewport(
    text('\n\n\n', { id: 'blank-content' }),
    {
      id: 'blank-window',
      scrollRow: 1,
      scrollColumn: 1,
      contentRows: 5,
      contentColumns: 5
    }
  ), { columns: 3, rows: 3 });
  const labels = new Set(frame.cells
    .map((cell) => cell.source?.label)
    .filter((label) => label !== undefined));

  assert.ok(labels.has('clip-top'));
  assert.ok(labels.has('clip-bottom'));
  assert.ok(labels.has('clip-left'));
  assert.ok(labels.has('clip-right'));
});

test('TUI runtime does not reserve escape or ctrlC key events', async () => {
  const app = defineTui({
    id: 'unreserved-keys',
    init: () => ({ ready: true }),
    update: (state) => ({ state }),
    view: () => textInput({ id: 'exit-field', value: 'ready' })
  });
  const harness = createTerminalHarness({ viewport: { columns: 20, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  const escape = await runtime.handleInput({
    kind: 'key',
    key: 'escape',
    sequence: '\u001B',
    ctrl: false,
    alt: false,
    shift: false,
    meta: false
  });
  const ctrlC = await runtime.handleInput({
    kind: 'key',
    key: 'ctrlC',
    sequence: '\u0003',
    ctrl: true,
    alt: false,
    shift: false,
    meta: false
  });

  assert.equal(escape.handled, false);
  assert.equal(ctrlC.handled, false);
  assert.equal(escape.exit, undefined);
  assert.equal(ctrlC.exit, undefined);
  assert.equal(harness.frames().length, 1);
});

test('TUI runtime decodes input chunks before routing them', async () => {
  const app = defineTui({
    id: 'chunk-input',
    init: () => ({ committed: false }),
    update: (_state, message) => ({ state: { committed: message.committed } }),
    view: (state) => textInput({
      id: 'commit-field',
      value: state.committed ? 'committed' : 'pending',
      onSubmit: { committed: true }
    })
  });
  const harness = createTerminalHarness({ viewport: { columns: 20, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  const results = await runtime.handleInputChunk({ data: '\r' });

  assert.equal(results.length, 1);
  assert.equal(results[0].handled, true);
  assert.deepEqual(runtime.getState(), { committed: true });
  assert.match(renderFramePlain(runtime.frame()), /committed/);
});

test('TUI runtime buffers split input chunks before routing them', async () => {
  const app = defineTui({
    id: 'split-chunk-input',
    init: () => ({ committed: false }),
    update: (_state, message) => ({ state: { committed: message.committed } }),
    view: (state) => textInput({
      id: 'split-commit-field',
      value: state.committed ? 'committed' : 'pending',
      onSubmit: { committed: true }
    })
  });
  const harness = createTerminalHarness({ viewport: { columns: 20, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  const first = await runtime.handleInputChunk({ data: '\u001B[200~clip' });
  const second = await runtime.handleInputChunk({ data: '\u001B[201~\r' });

  assert.equal(first.length, 0);
  assert.equal(second.length, 2);
  assert.equal(second[0]?.handled, false);
  assert.equal(second[1]?.handled, true);
  assert.deepEqual(runtime.getState(), { committed: true });
  assert.match(renderFramePlain(runtime.frame()), /committed/);
});

test('TUI runtime ignores non-command paste, focus, and mouse events without corrupting state', async () => {
  const app = defineTui({
    id: 'protocol-input',
    init: () => ({ committed: false }),
    update: (_state, message) => ({ state: { committed: message.committed } }),
    view: (state) => textInput({
      id: 'protocol-field',
      value: state.committed ? 'committed' : 'pending',
      onSubmit: { committed: true }
    })
  });
  const harness = createTerminalHarness({ viewport: { columns: 20, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  const ignored = await runtime.handleInputChunk({
    data: '\u001B[200~clip\u001B[201~\u001B[I\u001B[<0;4;5M'
  });
  const committed = await runtime.handleInputChunk({ data: '\r' });

  assert.equal(ignored.length, 3);
  assert.equal(ignored.every((result) => result.handled === false), true);
  assert.equal(committed[0]?.handled, true);
  assert.deepEqual(runtime.getState(), { committed: true });
});

test('TUI runtime routes mouse events to widgets under the pointer', async () => {
  const app = defineTui({
    id: 'mouse-routing',
    init: () => ({ clicked: false }),
    update: (_state, message) => ({ state: { clicked: message.clicked } }),
    view: (state) => textInput({
      id: 'mouse-field',
      value: state.clicked ? 'clicked' : 'idle',
      onSubmit: { clicked: true }
    })
  });
  const harness = createTerminalHarness({ viewport: { columns: 20, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  assert.deepEqual(runtime.frame().hitTargets?.[0], {
    id: 'mouse-field:input',
    bounds: { row: 1, column: 1, width: 20, height: 3 },
    cursor: 'pointer',
    zIndex: 0
  });
  const press = await runtime.handleInputChunk({ data: '\u001B[<0;1;1M' });
  const release = await runtime.handleInputChunk({ data: '\u001B[<0;1;1m' });

  assert.equal(press[0]?.handled, false);
  assert.equal(release[0]?.handled, true);
  assert.deepEqual(runtime.getState(), { clicked: true });
  assert.match(renderFramePlain(runtime.frame()), /clicked/);
});

test('TUI pointer click activates once on left release and ignores right click or wheel', async () => {
  const app = defineTui({
    id: 'pointer-router-events',
    init: () => ({ clicks: 0 }),
    update: (state, message) => ({ state: { clicks: state.clicks + message.clicks } }),
    view: (state) => textInput({
      id: 'pointer-field',
      value: `clicks ${state.clicks}`,
      onSubmit: { clicks: 1 }
    })
  });
  const harness = createTerminalHarness({ viewport: { columns: 20, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  const leftPress = await runtime.handleInputChunk({ data: '\u001B[<0;1;1M' });
  const release = await runtime.handleInputChunk({ data: '\u001B[<0;1;1m' });
  const rightPress = await runtime.handleInputChunk({ data: '\u001B[<2;1;1M' });
  const wheel = await runtime.handleInputChunk({ data: '\u001B[<64;1;1M' });

  assert.equal(leftPress[0]?.handled, false);
  assert.equal(release[0]?.handled, true);
  assert.equal(rightPress[0]?.handled, false);
  assert.equal(wheel[0]?.handled, false);
  assert.deepEqual(runtime.getState(), { clicks: 1 });
});

test('built-in controls expose controlled pointer presentation without duplicate activation', async () => {
  const app = defineTui({
    id: 'controlled-pointer-presentation',
    init: () => ({ pointer: {}, activations: 0 }),
    update: (state, message) => message.kind === 'pointer'
      ? { state: { ...state, pointer: pointerPresentationReducer(state.pointer, message.action) } }
      : { state: { ...state, activations: state.activations + 1 } },
    view: (state) => button({
      id: 'controlled-button',
      label: 'Run',
      onPress: { kind: 'activate' },
      pointer: {
        state: state.pointer,
        onAction: (action) => ({ kind: 'pointer', action })
      }
    })
  });
  const harness = createTerminalHarness({ viewport: { columns: 18, rows: 2 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  await runtime.handleInputChunk({ data: '\u001B[<35;2;1M' });
  assert.deepEqual(runtime.getState().pointer, { hoveredTargetId: 'controlled-button:control' });

  await runtime.handleInputChunk({ data: '\u001B[<0;2;1M' });
  assert.deepEqual(runtime.getState().pointer, {
    hoveredTargetId: 'controlled-button:control',
    pressedTargetId: 'controlled-button:control'
  });

  await runtime.handleInputChunk({ data: '\u001B[<0;2;1m' });
  assert.deepEqual(runtime.getState(), {
    pointer: { hoveredTargetId: 'controlled-button:control' },
    activations: 1
  });

  await runtime.handleInputChunk({ data: '\u001B[<35;20;2M' });
  assert.deepEqual(runtime.getState().pointer, {});
});

test('disabled controls expose neither activation nor synthetic pointer lifecycle targets', async () => {
  const app = defineTui({
    id: 'disabled-pointer-presentation',
    init: () => ({ events: [] }),
    update: (state, message) => ({ state: { events: [...state.events, message] } }),
    view: (state) => button({
      id: 'disabled-button',
      label: 'Disabled',
      disabled: true,
      onPress: { kind: 'activate' },
      pointer: {
        state: {},
        onAction: (action) => ({ kind: 'pointer', action, count: state.events.length })
      }
    })
  });
  const harness = createTerminalHarness({ viewport: { columns: 18, rows: 2 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  assert.deepEqual(runtime.frame().hitTargets ?? [], []);
  await runtime.handleInputChunk({ data: '\u001B[<0;2;1M' });
  await runtime.handleInputChunk({ data: '\u001B[<0;2;1m' });
  assert.deepEqual(runtime.getState(), { events: [] });
});

test('TUI pointer targets receive pointerDown and pointerUp lifecycle messages', async () => {
  const renderer = {
    render({ bounds, buffer }) {
      buffer.write(bounds.row, bounds.column, [{ text: 'pointer lifecycle' }]);
    },
    accessibility({ id }) {
      return { id, role: 'button', label: 'pointer lifecycle' };
    },
    hitTargets({ bounds }) {
      return [{
        id: 'lifecycle-hit',
        bounds,
        accepts: ['pointerDown', 'pointerUp'],
        message: (event) => ({
          kind: event.kind,
          button: event.button,
          targetId: event.targetId,
          capturedTargetId: event.capturedTargetId,
          localColumn: event.localColumn
        }),
        cursor: 'pointer'
      }];
    }
  };
  const app = defineTui({
    id: 'pointer-lifecycle-tui',
    init: () => ({ events: [] }),
    update: (state, message) => ({ state: { events: [...state.events, message] } }),
    view: () => custom({ id: 'pointer-lifecycle', renderer })
  });
  const harness = createTerminalHarness({ viewport: { columns: 24, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  const press = await runtime.handleInputChunk({ data: '\u001B[<0;2;1M' });
  const release = await runtime.handleInputChunk({ data: '\u001B[<0;2;1m' });

  assert.equal(press[0]?.handled, true);
  assert.equal(release[0]?.handled, true);
  assert.deepEqual(runtime.getState(), {
    events: [
      {
        kind: 'pointerDown',
        button: 'left',
        targetId: 'lifecycle-hit',
        capturedTargetId: 'lifecycle-hit',
        localColumn: 2
      },
      {
        kind: 'pointerUp',
        button: 'left',
        targetId: 'lifecycle-hit',
        capturedTargetId: 'lifecycle-hit',
        localColumn: 2
      }
    ]
  });
});

test('TUI pointer hover emits enter leave and hover when crossing targets', async () => {
  const renderer = {
    render({ bounds, buffer }) {
      buffer.write(bounds.row, bounds.column, [{ text: 'left  right' }]);
    },
    accessibility({ id }) {
      return { id, role: 'group', label: 'hover lifecycle' };
    },
    hitTargets({ bounds }) {
      const accepts = ['enter', 'leave', 'hover'];
      return [
        {
          id: 'left-hit',
          bounds: { ...bounds, width: 5 },
          accepts,
          message: (event) => ({
            kind: event.kind,
            targetId: event.targetId,
            localColumn: event.localColumn
          }),
          cursor: 'pointer'
        },
        {
          id: 'right-hit',
          bounds: { ...bounds, column: bounds.column + 6, width: 5 },
          accepts,
          message: (event) => ({
            kind: event.kind,
            targetId: event.targetId,
            localColumn: event.localColumn
          }),
          cursor: 'pointer'
        }
      ];
    }
  };
  const app = defineTui({
    id: 'hover-lifecycle-tui',
    init: () => ({ events: [] }),
    update: (state, message) => ({ state: { events: [...state.events, message] } }),
    view: () => custom({ id: 'hover-lifecycle', renderer })
  });
  const harness = createTerminalHarness({ viewport: { columns: 24, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  const moveLeft = await runtime.handleInputChunk({ data: '\u001B[<35;2;1M' });
  const moveRight = await runtime.handleInputChunk({ data: '\u001B[<35;8;1M' });
  const moveOutside = await runtime.handleInputChunk({ data: '\u001B[<35;20;1M' });

  assert.equal(moveLeft[0]?.handled, true);
  assert.equal(moveRight[0]?.handled, true);
  assert.equal(moveOutside[0]?.handled, true);
  assert.deepEqual(runtime.getState(), {
    events: [
      { kind: 'enter', targetId: 'left-hit', localColumn: 2 },
      { kind: 'hover', targetId: 'left-hit', localColumn: 2 },
      { kind: 'leave', targetId: 'left-hit', localColumn: 8 },
      { kind: 'enter', targetId: 'right-hit', localColumn: 2 },
      { kind: 'hover', targetId: 'right-hit', localColumn: 2 },
      { kind: 'leave', targetId: 'right-hit', localColumn: 14 }
    ]
  });
});

test('TUI pointer targets receive event-aware messages and horizontal wheel deltas', async () => {
  const renderer = {
    render({ bounds, buffer }) {
      buffer.write(bounds.row, bounds.column, [{ text: 'pointer target' }]);
    },
    accessibility({ id }) {
      return { id, role: 'button', label: 'pointer target' };
    },
    hitTargets({ bounds }) {
      return [{
        id: 'event-aware-hit',
        bounds,
        accepts: ['contextMenu', 'scroll'],
        message: (event) => ({
          kind: event.kind,
          button: event.button,
          deltaRows: event.deltaRows,
          deltaColumns: event.deltaColumns,
          localRow: event.localRow,
          localColumn: event.localColumn
        }),
        cursor: 'pointer'
      }];
    }
  };
  const app = defineTui({
    id: 'event-aware-pointer-tui',
    init: () => ({ events: [] }),
    update: (state, message) => ({ state: { events: [...state.events, message] } }),
    view: () => custom({ id: 'event-aware-pointer', renderer })
  });
  const harness = createTerminalHarness({ viewport: { columns: 20, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  const rightPress = await runtime.handleInputChunk({ data: '\u001B[<2;2;1M' });
  const wheelRight = await runtime.handleInputChunk({ data: '\u001B[<67;3;1M' });

  assert.equal(rightPress[0]?.handled, true);
  assert.equal(wheelRight[0]?.handled, true);
  assert.deepEqual(runtime.getState(), {
    events: [
      { kind: 'contextMenu', button: 'right', deltaRows: 0, deltaColumns: 0, localRow: 1, localColumn: 2 },
      { kind: 'scroll', button: 'wheelRight', deltaRows: 0, deltaColumns: 1, localRow: 1, localColumn: 3 }
    ]
  });
});

test('TUI wheel routing skips non-scroll child targets and reaches scroll owner', async () => {
  const renderer = {
    render({ bounds, buffer }) {
      buffer.write(bounds.row, bounds.column, [{ text: 'child inside scroll owner' }]);
    },
    accessibility({ id }) {
      return { id, role: 'group', label: 'scroll owner' };
    },
    hitTargets({ bounds }) {
      return [
        {
          id: 'scroll-owner',
          bounds,
          accepts: ['scroll'],
          message: (event) => ({
            kind: 'scroll',
            targetId: event.targetId,
            localColumn: event.localColumn
          }),
          cursor: 'grab'
        },
        {
          id: 'child-button',
          bounds: { ...bounds, width: 8 },
          accepts: ['click'],
          message: () => ({ kind: 'child-click' }),
          cursor: 'pointer',
          zIndex: 1
        }
      ];
    }
  };
  const app = defineTui({
    id: 'wheel-scroll-owner-tui',
    init: () => ({ events: [] }),
    update: (state, message) => ({ state: { events: [...state.events, message] } }),
    view: () => custom({ id: 'wheel-scroll-owner', renderer })
  });
  const harness = createTerminalHarness({ viewport: { columns: 28, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  const wheel = await runtime.handleInputChunk({ data: '\u001B[<65;3;1M' });
  const release = await runtime.handleInputChunk({ data: '\u001B[<0;3;1m' });

  assert.equal(wheel[0]?.handled, true);
  assert.equal(release[0]?.handled, false);
  assert.deepEqual(runtime.getState(), {
    events: [
      { kind: 'scroll', targetId: 'scroll-owner', localColumn: 3 }
    ]
  });
});

test('TUI press routing keeps scroll-only content targets from swallowing text pointer targets', async () => {
  const app = defineTui({
    id: 'scroll-content-text-pointer-tui',
    init: () => ({
      scroll: createScrollState({ contentRows: 2, viewportRows: 1 }),
      events: []
    }),
    update: (state, message) => {
      if (message.kind === 'scroll') {
        return {
          state: {
            ...state,
            scroll: applyScrollEvent(state.scroll, message.event),
            events: [...state.events, message]
          }
        };
      }
      return { state: { ...state, events: [...state.events, message] } };
    },
    view: (state) => textArea({
      id: 'scrolling-text-pointer',
      value: 'alpha\nbeta',
      scroll: state.scroll,
      scrollbar: { visible: 'always' },
      onScroll: (event) => ({ kind: 'scroll', event }),
      onTextPointer: (event) => ({ kind: 'text', event })
    })
  });
  const harness = createTerminalHarness({ viewport: { columns: 16, rows: 4 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  const contentTarget = targetById(runtime, 'scrolling-text-pointer:scroll:content');
  const press = await runtime.handleInput({
    kind: 'mouse',
    sequence: '',
    encoding: 'sgr',
    action: 'press',
    button: 'left',
    row: contentTarget.bounds.row,
    column: contentTarget.bounds.column + 4,
    rawCode: 0,
    modifiers: { shift: false, alt: false, ctrl: false }
  });

  assert.equal(press.handled, true);
  assert.equal(runtime.getState().events.length, 1);
  assert.equal(runtime.getState().events[0].kind, 'text');
  assert.equal(runtime.getState().events[0].event.action, 'placeCursor');
});

test('TUI wheel routing keeps scroll content hits in their overlay region layer', async () => {
  const backgroundValue = Array.from({ length: 20 }, (_, index) => `background ${String(index + 1)}`).join('\n');
  const foregroundContent = column(
    Array.from({ length: 20 }, (_, index) => text(`foreground ${String(index + 1)}`, { id: `foreground-${String(index)}` })),
    { id: 'foreground-column' }
  );
  const app = defineTui({
    id: 'scroll-layer-routing-tui',
    init: () => ({
      background: createScrollState({ contentRows: 20, viewportRows: 1 }),
      foreground: createScrollState({ contentRows: 20, viewportRows: 1 }),
      events: []
    }),
    update: (state, message) => ({
      state: {
        ...state,
        [message.owner]: applyScrollEvent(state[message.owner], message.event),
        events: [...state.events, `${message.owner}:${message.event.target}`]
      }
    }),
    view: (state) => overlay([
      textArea({
        id: 'background-scroll',
        value: backgroundValue,
        scroll: state.background,
        scrollbar: { visible: 'always' },
        onScroll: (event) => ({ owner: 'background', event })
      }),
      viewport(foregroundContent, {
        id: 'foreground-scroll',
        contentRows: 20,
        scroll: state.foreground,
        onScroll: (event) => ({ owner: 'foreground', event })
      })
    ], { id: 'scroll-layer-root' })
  });
  const harness = createTerminalHarness({ viewport: { columns: 24, rows: 5 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  const backgroundTrack = targetById(runtime, 'background-scroll:scrollbar:vertical:track');
  const result = await runtime.handleInput({
    kind: 'mouse',
    sequence: '',
    encoding: 'sgr',
    action: 'wheel',
    button: 'wheelDown',
    row: backgroundTrack.bounds.row,
    column: backgroundTrack.bounds.column,
    rawCode: 65,
    modifiers: { shift: false, alt: false, ctrl: false }
  });

  assert.equal(result.handled, true);
  assert.deepEqual(runtime.getState().events, ['foreground:content']);
  assert.equal(runtime.getState().foreground.offsetRow, 3);
  assert.equal(runtime.getState().background.offsetRow, 0);
});

test('TUI pointer scrolling and scrollbar track input route to controlled text areas', async () => {
  const value = Array.from({ length: 40 }, (_, index) => `line ${String(index + 1).padStart(2, '0')}`).join('\n');
  const app = defineTui({
    id: 'text-area-scroll-pointer-tui',
    init: () => ({
      scroll: createScrollState({ contentRows: 40, viewportRows: 1 }),
      events: []
    }),
    update: (state, message) => ({
      state: {
        scroll: applyScrollEvent(state.scroll, message.event),
        events: [...state.events, `${message.event.source}:${message.event.target}`]
      }
    }),
    view: (state) => textArea({
      id: 'scroll-editor',
      value,
      scroll: state.scroll,
      scrollbar: { visible: 'always' },
      onScroll: (event) => ({ event })
    })
  });
  const harness = createTerminalHarness({ viewport: { columns: 20, rows: 6 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  const contentTarget = targetById(runtime, 'scroll-editor:scroll:content');
  const wheel = await runtime.handleInput({
    kind: 'mouse',
    sequence: '',
    encoding: 'sgr',
    action: 'wheel',
    button: 'wheelDown',
    row: contentTarget.bounds.row,
    column: contentTarget.bounds.column,
    rawCode: 64,
    modifiers: { shift: false, alt: false, ctrl: false }
  });
  const wheelUpTarget = targetById(runtime, 'scroll-editor:scroll:content');
  const wheelUp = await runtime.handleInput({
    kind: 'mouse',
    sequence: '',
    encoding: 'sgr',
    action: 'wheel',
    button: 'wheelUp',
    row: wheelUpTarget.bounds.row,
    column: wheelUpTarget.bounds.column,
    rawCode: 64,
    modifiers: { shift: false, alt: false, ctrl: false }
  });
  const trackTarget = targetById(runtime, 'scroll-editor:scrollbar:vertical:track');
  const trackPress = await runtime.handleInput({
    kind: 'mouse',
    sequence: '',
    encoding: 'sgr',
    action: 'press',
    button: 'left',
    row: trackTarget.bounds.row + trackTarget.bounds.height - 1,
    column: trackTarget.bounds.column,
    rawCode: 0,
    modifiers: { shift: false, alt: false, ctrl: false }
  });
  const trackDrag = await runtime.handleInput({
    kind: 'mouse',
    sequence: '',
    encoding: 'sgr',
    action: 'drag',
    button: 'left',
    row: trackTarget.bounds.row + trackTarget.bounds.height - 1,
    column: trackTarget.bounds.column,
    rawCode: 32,
    modifiers: { shift: false, alt: false, ctrl: false }
  });

  assert.equal(wheel.handled, true);
  assert.equal(wheelUp.handled, true);
  assert.equal(wheelUp.state.scroll.offsetRow, 0);
  assert.equal(trackPress.handled, true);
  assert.equal(trackDrag.handled, true);
  assert.deepEqual(runtime.getState().events, [
    'wheel:content',
    'wheel:content',
    'pointerDown:verticalScrollbarTrack',
    'dragStart:verticalScrollbarTrack'
  ]);
  assert.equal(runtime.getState().scroll.offsetRow, 35);
  assert.match(renderFramePlain(runtime.frame()), /line 40/u);
});

test('TUI scrollbar thumb drag preserves the press anchor', async () => {
  const value = Array.from({ length: 40 }, (_, index) => `line ${String(index + 1).padStart(2, '0')}`).join('\n');
  const app = defineTui({
    id: 'text-area-thumb-scroll-pointer-tui',
    init: () => ({
      scroll: createScrollState({ offsetRow: 12, contentRows: 40, viewportRows: 1 }),
      events: []
    }),
    update: (state, message) => ({
      state: {
        scroll: applyScrollEvent(state.scroll, message.event),
        events: [...state.events, `${message.event.source}:${message.event.target}:${message.event.action.kind}`]
      }
    }),
    view: (state) => textArea({
      id: 'thumb-editor',
      value,
      scroll: state.scroll,
      scrollbar: { visible: 'always' },
      onScroll: (event) => ({ event })
    })
  });
  const harness = createTerminalHarness({ viewport: { columns: 20, rows: 10 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  const thumbTarget = targetById(runtime, 'thumb-editor:scrollbar:vertical:thumb');
  const pressRow = thumbTarget.bounds.row + 1;
  const press = await runtime.handleInput({
    kind: 'mouse',
    sequence: '',
    encoding: 'sgr',
    action: 'press',
    button: 'left',
    row: pressRow,
    column: thumbTarget.bounds.column,
    rawCode: 0,
    modifiers: { shift: false, alt: false, ctrl: false }
  });
  const drag = await runtime.handleInput({
    kind: 'mouse',
    sequence: '',
    encoding: 'sgr',
    action: 'drag',
    button: 'left',
    row: pressRow + 4,
    column: thumbTarget.bounds.column,
    rawCode: 32,
    modifiers: { shift: false, alt: false, ctrl: false }
  });

  assert.equal(press.handled, true);
  assert.equal(drag.handled, true);
  assert.deepEqual(runtime.getState().events, [
    'pointerDown:verticalScrollbarThumb:setOffset',
    'dragStart:verticalScrollbarThumb:setOffset'
  ]);
  assert.equal(runtime.getState().scroll.offsetRow, 27);
});

test('TUI scrollbar thumb routing stays above its track inside elevated regions', async () => {
  const value = Array.from({ length: 40 }, (_, index) => `line ${String(index + 1).padStart(2, '0')}`).join('\n');
  const app = defineTui({
    id: 'elevated-thumb-scroll-pointer-tui',
    init: () => ({
      scroll: createScrollState({ offsetRow: 12, contentRows: 40, viewportRows: 1 }),
      events: []
    }),
    update: (state, message) => ({
      state: {
        scroll: applyScrollEvent(state.scroll, message.event),
        events: [...state.events, `${message.event.source}:${message.event.target}`]
      }
    }),
    view: (state) => textArea({
    id: 'elevated-thumb-editor',
    value,
    scroll: state.scroll,
    scrollbar: { visible: 'always' },
    onScroll: (event) => ({ event }),
    meta: {
        layer: {
            zIndex: 10
        }
    }
})
  });
  const harness = createTerminalHarness({ viewport: { columns: 20, rows: 10 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  const thumbTarget = targetById(runtime, 'elevated-thumb-editor:scrollbar:vertical:thumb');
  const press = await runtime.handleInput({
    kind: 'mouse',
    sequence: '',
    encoding: 'sgr',
    action: 'press',
    button: 'left',
    row: thumbTarget.bounds.row,
    column: thumbTarget.bounds.column,
    rawCode: 0,
    modifiers: { shift: false, alt: false, ctrl: false }
  });

  assert.equal(press.handled, true);
  assert.deepEqual(runtime.getState().events, ['pointerDown:verticalScrollbarThumb']);
});

test('TUI runtime batches decoded wheel bursts into one accelerated frame update', async () => {
  const value = Array.from({ length: 80 }, (_, index) => `line ${String(index + 1).padStart(2, '0')}`).join('\n');
  const app = defineTui({
    id: 'text-area-scroll-burst-tui',
    init: () => ({
      scroll: createScrollState({ contentRows: 80, viewportRows: 1 })
    }),
    update: (state, message) => ({
      state: {
        scroll: applyScrollEvent(state.scroll, message.event)
      }
    }),
    view: (state) => textArea({
      id: 'scroll-editor',
      value,
      scroll: state.scroll,
      scrollbar: { visible: 'always' },
      onScroll: (event) => ({ event })
    })
  });
  const harness = createTerminalHarness({ viewport: { columns: 20, rows: 6 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  const contentTarget = targetById(runtime, 'scroll-editor:scroll:content');
  const wheelDown = `\u001B[<65;${String(contentTarget.bounds.column)};${String(contentTarget.bounds.row)}M`;
  const results = await runtime.handleInputChunk({ data: wheelDown.repeat(3) });

  assert.equal(results.length, 3);
  assert.equal(results.every((result) => result.handled), true);
  assert.equal(runtime.getState().scroll.offsetRow, 9);
  assert.equal(harness.frames().length, 2);
  assert.match(renderFramePlain(runtime.frame()), /line 10/u);
});

test('TUI routed wheel events honor widget scroll policy line steps', async () => {
  const value = Array.from({ length: 40 }, (_, index) =>
    `line ${String(index + 1).padStart(2, '0')} ${'x'.repeat(60)}`
  ).join('\n');
  const app = defineTui({
    id: 'text-area-scroll-policy-lines-tui',
    init: () => ({
      scroll: createScrollState({ contentRows: 40, contentColumns: 80, viewportRows: 1, viewportColumns: 1 }),
      event: undefined
    }),
    update: (state, message) => ({
      state: {
        scroll: applyScrollEvent(state.scroll, message.event),
        event: message.event
      }
    }),
    view: (state) => textArea({
      id: 'scroll-editor',
      value,
      scroll: state.scroll,
      scrollbar: { visible: 'always' },
      scrollPolicy: { wheel: { rows: 8, columns: 5 } },
      onScroll: (event) => ({ event })
    })
  });
  const harness = createTerminalHarness({ viewport: { columns: 22, rows: 6 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  const contentTarget = targetById(runtime, 'scroll-editor:scroll:content');
  const down = await runtime.handleInput({
    kind: 'mouse',
    sequence: '',
    encoding: 'sgr',
    action: 'wheel',
    button: 'wheelDown',
    row: contentTarget.bounds.row,
    column: contentTarget.bounds.column,
    rawCode: 65,
    modifiers: { shift: false, alt: false, ctrl: false }
  });
  const right = await runtime.handleInput({
    kind: 'mouse',
    sequence: '',
    encoding: 'sgr',
    action: 'wheel',
    button: 'wheelRight',
    row: contentTarget.bounds.row,
    column: contentTarget.bounds.column,
    rawCode: 67,
    modifiers: { shift: false, alt: false, ctrl: false }
  });

  assert.equal(down.handled, true);
  assert.equal(right.handled, true);
  assert.deepEqual(runtime.getState().event.action, { kind: 'scrollLines', columns: 5 });
  assert.equal(runtime.getState().scroll.offsetRow, 8);
  assert.equal(runtime.getState().scroll.offsetColumn, 5);
  assert.match(renderFramePlain(runtime.frame()), /09 x/u);
});

test('TUI routed horizontal text area scroll uses the editable viewport after gutters', async () => {
  const value = '01234567890123456789';
  const app = defineTui({
    id: 'text-area-horizontal-gutter-scroll-tui',
    init: () => ({
      scroll: createScrollState({}),
      event: undefined
    }),
    update: (state, message) => ({
      state: {
        scroll: applyScrollEvent(state.scroll, message.event),
        event: message.event
      }
    }),
    view: (state) => textArea({
      id: 'horizontal-gutter-editor',
      value,
      lineNumbers: true,
      scroll: state.scroll,
      scrollbar: { visible: 'always', axis: 'both' },
      scrollPolicy: { wheel: { rows: 1, columns: 1 } },
      onScroll: (event) => ({ event })
    })
  });
  const harness = createTerminalHarness({ viewport: { columns: 14, rows: 4 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  const contentTarget = targetById(runtime, 'horizontal-gutter-editor:scroll:content');
  const editableViewportColumns = contentTarget.bounds.width - 5;
  for (let index = 0; index < 20; index += 1) {
    await runtime.handleInput({
      kind: 'mouse',
      sequence: '',
      encoding: 'sgr',
      action: 'wheel',
      button: 'wheelRight',
      row: contentTarget.bounds.row,
      column: contentTarget.bounds.column + 1,
      rawCode: 67,
      modifiers: { shift: false, alt: false, ctrl: false }
    });
  }

  assert.equal(runtime.getState().event.scroll.viewportColumns, editableViewportColumns);
  assert.equal(runtime.getState().scroll.offsetColumn, value.length - editableViewportColumns);
});

test('TUI routed wheel events support page-based widget scroll policy', async () => {
  const value = Array.from({ length: 40 }, (_, index) => `line ${String(index + 1).padStart(2, '0')}`).join('\n');
  const app = defineTui({
    id: 'text-area-scroll-policy-pages-tui',
    init: () => ({
      scroll: createScrollState({ contentRows: 40, viewportRows: 1 })
    }),
    update: (state, message) => ({
      state: {
        scroll: applyScrollEvent(state.scroll, message.event)
      }
    }),
    view: (state) => textArea({
      id: 'scroll-editor',
      value,
      scroll: state.scroll,
      scrollbar: { visible: 'always' },
      scrollPolicy: { wheel: { unit: 'page', rows: 1 } },
      onScroll: (event) => ({ event })
    })
  });
  const harness = createTerminalHarness({ viewport: { columns: 20, rows: 6 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  const contentTarget = targetById(runtime, 'scroll-editor:scroll:content');
  const down = await runtime.handleInput({
    kind: 'mouse',
    sequence: '',
    encoding: 'sgr',
    action: 'wheel',
    button: 'wheelDown',
    row: contentTarget.bounds.row,
    column: contentTarget.bounds.column,
    rawCode: 65,
    modifiers: { shift: false, alt: false, ctrl: false }
  });

  assert.equal(down.handled, true);
  assert.equal(runtime.getState().scroll.offsetRow, 5);
  assert.match(renderFramePlain(runtime.frame()), /line 06/u);
});

test('TUI routed tree scroll events carry normalized rendered viewport metrics', async () => {
  const nodes = Array.from({ length: 6 }, (_value, index) => ({
    id: `node-${String(index)}`,
    label: `Node ${String(index + 1)}`,
    kind: 'leaf'
  }));
  const app = defineTui({
    id: 'tree-scroll-pointer-tui',
    init: () => ({
      tree: { nodes, scroll: createScrollState({}) },
      event: undefined
    }),
    update: (state, message) => ({
      state: {
        tree: treeReducer(state.tree, message.action),
        event: message.action.kind === 'scroll' ? message.action.event : state.event
      }
    }),
    view: (state) => tree({
      id: 'tree-scroll',
      ...treePresentation(state.tree),
      scrollbar: { visible: 'always' },
      onAction: (action) => ({ action })
    })
  });
  const harness = createTerminalHarness({ viewport: { columns: 18, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  const contentTarget = targetById(runtime, 'tree-scroll:scroll:content');
  const result = await runtime.handleInput({
    kind: 'mouse',
    sequence: '',
    encoding: 'sgr',
    action: 'wheel',
    button: 'wheelDown',
    row: contentTarget.bounds.row,
    column: contentTarget.bounds.column,
    rawCode: 64,
    modifiers: { shift: false, alt: false, ctrl: false }
  });

  assert.equal(result.handled, true);
  assert.equal(runtime.getState().event.scroll.contentRows, nodes.length);
  assert.equal(runtime.getState().event.scroll.viewportRows, 3);
  assert.equal(runtime.getState().tree.scroll.offsetRow, 3);
  assert.match(renderFramePlain(runtime.frame()), /Node 4/u);
});

test('TUI routed context menu scroll events use fixed title chrome and shared scroll policy', async () => {
  const items = Array.from({ length: 8 }, (_value, index) => ({
    id: `item-${String(index + 1)}`,
    label: `Item ${String(index + 1)}`
  }));
  const app = defineTui({
    id: 'context-menu-scroll-pointer-tui',
    init: () => ({
      scroll: createScrollState({ contentRows: items.length, viewportRows: 1 }),
      event: undefined
    }),
    update: (state, message) => ({
      state: {
        scroll: message.action.kind === 'scroll' ? applyScrollEvent(state.scroll, message.action.event) : state.scroll,
        event: message.action.kind === 'scroll' ? message.action.event : state.event
      }
    }),
    view: (state) => contextMenu({
      id: 'context-scroll',
      title: 'Actions',
      items,
      scroll: state.scroll,
      scrollbar: { visible: 'always' },
      scrollPolicy: { wheel: { rows: 2 } },
      onAction: (action) => ({ action })
    })
  });
  const harness = createTerminalHarness({ viewport: { columns: 20, rows: 4 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  const contentTarget = targetById(runtime, 'context-scroll:scroll:content');
  const result = await runtime.handleInput({
    kind: 'mouse',
    sequence: '',
    encoding: 'sgr',
    action: 'wheel',
    button: 'wheelDown',
    row: contentTarget.bounds.row,
    column: contentTarget.bounds.column,
    rawCode: 65,
    modifiers: { shift: false, alt: false, ctrl: false }
  });

  assert.equal(result.handled, true);
  assert.equal(runtime.getState().event.scroll.viewportRows, 3);
  assert.equal(runtime.getState().scroll.offsetRow, 2);
  const frame = renderFramePlain(runtime.frame());
  assert.match(frame, /Actions/u);
  assert.match(frame, /Item 3/u);
});

test('TUI pointer drag routes to the captured origin target', async () => {
  const renderer = {
    render({ bounds, buffer }) {
      buffer.write(bounds.row, bounds.column, [{ text: 'drag target' }]);
    },
    accessibility({ id }) {
      return { id, role: 'button', label: 'drag target' };
    },
    hitTargets({ bounds }) {
      return [{
        id: 'drag-hit',
        bounds: { ...bounds, width: 4 },
        accepts: ['dragStart', 'dragEnd'],
        message: (event) => ({
          kind: event.kind,
          targetId: event.targetId,
          capturedTargetId: event.capturedTargetId,
          localColumn: event.localColumn
        }),
        cursor: 'pointer'
      }];
    }
  };
  const app = defineTui({
    id: 'drag-pointer-tui',
    init: () => ({ events: [] }),
    update: (state, message) => ({ state: { events: [...state.events, message] } }),
    view: () => custom({ id: 'drag-pointer', renderer })
  });
  const harness = createTerminalHarness({ viewport: { columns: 20, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  const press = await runtime.handleInputChunk({ data: '\u001B[<0;1;1M' });
  const drag = await runtime.handleInputChunk({ data: '\u001B[<32;10;1M' });
  const release = await runtime.handleInputChunk({ data: '\u001B[<0;10;1m' });

  assert.equal(press[0]?.handled, false);
  assert.equal(drag[0]?.handled, true);
  assert.equal(release[0]?.handled, true);
  assert.deepEqual(runtime.getState(), {
    events: [
      { kind: 'dragStart', targetId: 'drag-hit', capturedTargetId: 'drag-hit', localColumn: 10 },
      { kind: 'dragEnd', targetId: 'drag-hit', capturedTargetId: 'drag-hit', localColumn: 10 }
    ]
  });
});

test('TUI runtime routes tree row hit targets to node messages', async () => {
  const app = defineTui({
    id: 'tree-mouse-routing',
    init: () => ({ selected: 'none' }),
    update: (_state, message) => ({ state: { selected: message.id } }),
    view: (state) => tree({
      id: 'tree',
      selected: state.selected,
      nodes: [
        { id: 'root', label: 'Root', kind: 'branch', expanded: true, children: [{ id: 'child', label: 'Child', kind: 'leaf' }] }
      ],
      onAction: (action) => action.kind === 'select' ? { id: action.id } : undefined
    })
  });
  const harness = createTerminalHarness({ viewport: { columns: 20, rows: 4 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  const press = await runtime.handleInputChunk({ data: '\u001B[<0;1;2M' });
  const release = await runtime.handleInputChunk({ data: '\u001B[<0;1;2m' });

  assert.equal(press[0]?.handled, false);
  assert.equal(release[0]?.handled, true);
  assert.deepEqual(runtime.getState(), { selected: 'child' });
  assert.match(renderFramePlain(runtime.frame()), /Child/);
});

test('TUI runtime routes tree disclosure and body hit targets separately', async () => {
  const app = defineTui({
    id: 'tree-disclosure-routing',
    init: () => ({ events: [] }),
    update: (state, message) => ({ state: { events: [...state.events, message] } }),
    view: () => tree({
      id: 'tree',
      selected: 'root',
      nodes: [
        { id: 'root', label: 'Root', kind: 'branch', expanded: true, children: [{ id: 'child', label: 'Child', kind: 'leaf' }] }
      ],
      onAction: (action) => ({ kind: 'tree', action })
    })
  });
  const harness = createTerminalHarness({ viewport: { columns: 20, rows: 4 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  await runtime.handleInputChunk({ data: '\u001B[<0;3;1M' });
  const disclosureRelease = await runtime.handleInputChunk({ data: '\u001B[<0;3;1m' });
  await runtime.handleInputChunk({ data: '\u001B[<0;5;1M' });
  const bodyRelease = await runtime.handleInputChunk({ data: '\u001B[<0;5;1m' });

  assert.equal(disclosureRelease[0]?.handled, true);
  assert.equal(bodyRelease[0]?.handled, true);
  assert.deepEqual(runtime.getState(), {
    events: [
      { kind: 'tree', action: { kind: 'toggle', id: 'root' } },
      { kind: 'tree', action: { kind: 'select', id: 'root' } }
    ]
  });
});

test('TUI runtime routes overlapping mouse events to the topmost layer', async () => {
  const app = defineTui({
    id: 'layered-mouse-routing',
    init: () => ({ clicked: 'none' }),
    update: (_state, message) => ({ state: { clicked: message.clicked } }),
    view: () => overlay([
      textInput({
    id: 'lower-mouse-field',
    value: 'lower',
    onSubmit: { clicked: 'lower' },
    meta: {
        layer: {
            zIndex: 0
        }
    }
}),
      textInput({
    id: 'upper-mouse-field',
    value: 'upper',
    onSubmit: { clicked: 'upper' },
    meta: {
        layer: {
            zIndex: 20
        }
    }
})
    ], {
      id: 'mouse-layer-root'
    })
  });
  const harness = createTerminalHarness({ viewport: { columns: 20, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  assert.deepEqual(runtime.frame().hitTargets?.map((target) => [target.id, target.zIndex]), [
    ['lower-mouse-field:input', 0],
    ['upper-mouse-field:input', 20]
  ]);
  const press = await runtime.handleInputChunk({ data: '\u001B[<0;1;1M' });
  const release = await runtime.handleInputChunk({ data: '\u001B[<0;1;1m' });

  assert.equal(press[0]?.handled, false);
  assert.equal(release[0]?.handled, true);
  assert.deepEqual(runtime.getState(), { clicked: 'upper' });
});

test('TUI runtime routes same-layer overlay mouse events to the last visible child', async () => {
  const app = defineTui({
    id: 'overlay-same-layer-mouse-routing',
    init: () => ({ clicked: 'none' }),
    update: (_state, message) => ({ state: { clicked: message.clicked } }),
    view: () => overlay([
      textInput({
        id: 'lower-overlay-field',
        value: 'lower',
        onSubmit: { clicked: 'lower' }
      }),
      textInput({
        id: 'upper-overlay-field',
        value: 'upper',
        onSubmit: { clicked: 'upper' }
      })
    ], { id: 'same-layer-overlay' })
  });
  const harness = createTerminalHarness({ viewport: { columns: 20, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  assert.deepEqual(runtime.frame().hitTargets?.map((target) => target.id), [
    'lower-overlay-field:input',
    'upper-overlay-field:input'
  ]);
  const press = await runtime.handleInputChunk({ data: '\u001B[<0;1;1M' });
  const release = await runtime.handleInputChunk({ data: '\u001B[<0;1;1m' });

  assert.equal(press[0]?.handled, false);
  assert.equal(release[0]?.handled, true);
  assert.deepEqual(runtime.getState(), { clicked: 'upper' });
});

test('TUI runtime rejects operations after disposal and keeps disposal idempotent', async () => {
  const app = defineTui({
    id: 'disposed-runtime',
    init: () => ({ count: 0 }),
    update: (state, message) => ({ state: { count: state.count + message.delta } }),
    view: (state) => text(String(state.count), { id: 'disposed-count' })
  });
  const host = createMemoryTerminalHost();
  const runtime = createTuiRuntime({ app, host });
  await runtime.start();

  const firstDisposal = runtime.dispose();
  assert.equal(runtime.dispose(), firstDisposal);
  await firstDisposal;

  await assert.rejects(runtime.start(), /runtime is disposed/u);
  await assert.rejects(runtime.dispatch({ delta: 1 }), /runtime is disposed/u);
  await assert.rejects(runtime.resize({ columns: 30, rows: 6 }), /runtime is disposed/u);
  await assert.rejects(runtime.handleInput({ kind: 'key', key: 'enter' }), /runtime is disposed/u);
  await assert.rejects(runtime.handleInputChunk({ data: 'x' }), /runtime is disposed/u);
  await assert.rejects(runtime.flushInput(), /runtime is disposed/u);
  assert.throws(() => runtime.resetInput(), /runtime is disposed/u);
  assert.throws(() => runtime.nextChange(), /runtime is disposed/u);
});

test('TUI runtime disposal awaits aborted subscription pumps and source cleanup', async () => {
  let releasePump;
  const pumpCleanup = new Promise((resolve) => { releasePump = resolve; });
  let pumpAborted = false;
  let sourceDisposed = false;
  const app = defineTui({
    id: 'subscription-disposal-barrier',
    init: () => ({ ready: true }),
    update: (state) => ({ state }),
    subscriptions: () => [{
      id: 'blocking-source',
      delivery: 'sequential',
      async *messages(context) {
        await new Promise((resolve) => context.signal.addEventListener('abort', resolve, { once: true }));
        pumpAborted = true;
        await pumpCleanup;
      },
      dispose() {
        sourceDisposed = true;
      }
    }],
    view: () => text('ready')
  });
  const runtime = createTuiRuntime({ app, host: createMemoryTerminalHost() });
  await runtime.start();

  let disposed = false;
  const disposal = runtime.dispose().then(() => { disposed = true; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(pumpAborted, true);
  assert.equal(sourceDisposed, true);
  assert.equal(disposed, false);

  releasePump();
  await disposal;
  assert.equal(disposed, true);
});

test('runTui restores terminal state after runtime and exit-handler cleanup failures', async () => {
  const app = defineTui({
    id: 'cleanup-failure-restore',
    init: () => ({ done: false }),
    update: () => ({ state: { done: true }, exit: { reason: 'done' } }),
    subscriptions: () => [{
      id: 'cleanup-failure-source',
      delivery: 'sequential',
      async *messages() {},
      dispose() {
        throw new Error('source cleanup failed');
      }
    }],
    onExit() {
      throw new Error('exit cleanup failed');
    },
    view: () => textInput({ id: 'cleanup-submit', value: '', onSubmit: { kind: 'submit' } })
  });
  const harness = createTerminalHarness({ viewport: { columns: 20, rows: 4 } });
  harness.input('\r');

  const exit = await runTui(app, harness.host);

  assert.equal(exit.status, 'error');
  assert.deepEqual(exit.state, { done: true });
  assert.equal(exit.diagnostics.filter((item) => item.code === 'TUI_CLEANUP_FAILED').length, 2);
  assert.equal(harness.restores().length, 1);
  assert.equal(harness.host.stdin.isRawModeEnabled(), false);
});

function targetById(runtime, id) {
  const target = runtime.frame()?.hitTargets?.find((item) => item.id === id);
  if (target === undefined) throw new Error(`Missing hit target ${id}`);
  return target;
}

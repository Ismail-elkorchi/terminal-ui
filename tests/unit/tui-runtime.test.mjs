import assert from 'node:assert/strict';
import test from 'node:test';

import { createMemoryTerminalHost } from '../../dist/host/index.js';
import { validateAccessibleSnapshot } from '../../dist/accessibility/index.js';
import {
  assertTerminalRestored,
  createTerminalHarness,
  runInteractionScript
} from '../../dist/testing/index.js';
import { createTranscriptRecorder, validateTranscript } from '../../dist/transcript/index.js';
import {
  createTuiRuntime,
  defineTui,
  diffFrames,
  renderDiff,
  renderFrame,
  renderWidgetFrame,
  runTui
} from '../../dist/tui/index.js';
import { box, custom, inputField, list, modal, progressBar, row, spinner, stack, statusBar, table, text, tree, viewport } from '../../dist/widgets/index.js';
import { waitUntil } from '../helpers/async.mjs';

test('runTui emits deterministic transcripts when enabled', async () => {
  const app = defineTui({
    id: 'transcript-tui',
    transcript: { enabled: true },
    init: () => ({ submitted: false }),
    update: (_state, message) => ({ state: { submitted: message.submitted }, exit: {} }),
    view: (state) => inputField({
      id: 'transcript-field',
      value: state.submitted ? 'submitted' : 'waiting',
      message: { submitted: true }
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

test('renderFrame can emit cursor-addressed control-sequence output', () => {
  const frame = renderWidgetFrame(inputField({ id: 'addressed-field', value: 'Go' }), { columns: 8, rows: 2 });
  const output = renderFrame(frame, { includeControlSequences: true });

  assert.match(output, /^\u001B\[1;1HG/u);
  assert.match(output, /\u001B\[1;2Ho/u);
  assert.match(output, /\u001B\[1;1H$/u);
  assert.equal(renderFrame(frame), 'Go');
});

test('TUI frame rendering positions wide graphemes by terminal cells', () => {
  const frame = renderWidgetFrame(text('A🙂B', { id: 'wide-text' }), { columns: 8, rows: 2 });
  const output = renderFrame(frame);
  const addressed = renderFrame(frame, { includeControlSequences: true });

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
  const frame = renderWidgetFrame(list({ id: 'cursor-list', items, selected: 6 }), { columns: 16, rows: 5 });
  const output = renderFrame(frame);
  const addressed = renderFrame(frame, { includeControlSequences: true });

  assert.deepEqual(frame.focusPath, ['cursor-list']);
  assert.deepEqual(frame.cursor, { row: 3, column: 1 });
  assert.match(output, /› Item 6/);
  assert.match(addressed, /\u001B\[3;1H$/u);
});

test('TUI status, progress, and spinner widgets render accessible status state', () => {
  const frame = renderWidgetFrame(stack([
    statusBar({ id: 'status', text: 'Ready' }),
    progressBar({ id: 'progress', label: 'Sync', value: 150, max: 100 }),
    progressBar({ id: 'pending', label: 'Waiting', indeterminate: true }),
    spinner({ id: 'spinner', label: 'Working' })
  ]), { columns: 32, rows: 8 });
  const output = renderFrame(frame);
  const [statusNode, progressNode, pendingNode, spinnerNode] = frame.accessibility.root.children;

  assert.match(output, /Ready/);
  assert.match(output, /Sync \[██████████\] 100\/100/);
  assert.match(output, /Waiting \[░░░░░░░░░░\]/);
  assert.match(output, /Working \.\.\./);
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
  assert.deepEqual([spinnerNode?.role, spinnerNode?.value], ['status', 'Working']);
  assert.equal(validateAccessibleSnapshot(frame.accessibility).ok, true);
});

test('renderDiff serializes clear, write, cursor, and visibility operations', () => {
  const previous = renderWidgetFrame(text('Longer text', { id: 'before' }), { columns: 16, rows: 2 });
  const next = renderWidgetFrame(inputField({ id: 'after', value: 'Go' }), { columns: 16, rows: 2 });
  const diff = diffFrames(previous, next);
  const output = renderDiff({
    ...diff,
    operations: [...diff.operations, { kind: 'showCursor', visible: false }]
  });

  assert.ok(diff.operations.some((operation) => operation.kind === 'clearLine'));
  assert.ok(diff.operations.some((operation) => operation.kind === 'write'));
  assert.ok(diff.operations.some((operation) => operation.kind === 'moveCursor'));
  assert.match(output, /\u001B\[1;1H\u001B\[0K/u);
  assert.match(output, /\u001B\[1;1HGo/u);
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

test('runTui restores terminal protocols on successful exit', async () => {
  const app = defineTui({
    id: 'restored-success',
    init: () => ({ ready: true }),
    update: (state) => ({ state }),
    view: () => inputField({ id: 'field', value: 'ready' })
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
  assert.match(harness.output(), /\u001B\[\?1000h\u001B\[\?1006h/);
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
    view: (state) => inputField({
      id: 'submit-field',
      value: state.submitted ? 'submitted' : 'waiting',
      message: { submitted: true }
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
  assert.match(renderFrame(harness.frames()[1]), /submitted/);
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
    view: (state) => inputField({
      id: 'reason-field',
      value: state.submitted ? 'submitted' : 'waiting',
      message: { submitted: true }
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
    view: (state) => inputField({
      id: 'exit-field',
      value: state.active,
      keyMap: {
        escape: { active: 'escape' },
        ctrlC: { active: 'ctrlC' }
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
    view: (_state, context) => inputField({
      id: 'resize-field',
      value: `columns:${context.viewport.columns}`,
      message: { done: true }
    })
  });
  const harness = createTerminalHarness({ viewport: { columns: 20, rows: 3 } });
  const running = runTui(app, harness.host);

  await waitUntil(() => harness.frames().length === 1);
  harness.host.setViewport({ columns: 12, rows: 3 });
  harness.host.signals.emit('resize');
  await waitUntil(() => harness.frames().length === 2);
  harness.host.input('\r');
  const exit = await running;

  assert.equal(exit.status, 'completed');
  assert.equal(harness.frames()[1].width, 12);
  assert.equal(harness.diffs()[1].fullRewrite, true);
  assert.match(renderFrame(harness.frames()[1]), /columns:12/);
  assert.equal(harness.restores().length, 1);
});

test('runTui exits and restores when the host emits interruption signals', async () => {
  const app = defineTui({
    id: 'run-loop-signal',
    init: () => ({ ready: true }),
    update: (state) => ({ state }),
    view: () => inputField({ id: 'signal-field', value: 'ready' })
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
    view: () => inputField({ id: 'field', value: 'unused' })
  });
  const harness = createTerminalHarness({ viewport: { columns: 16, rows: 3 } });
  const exit = await runTui(app, harness.host);

  assert.equal(exit.status, 'error');
  assert.equal(exit.diagnostics[0]?.code, 'TUI_RENDER_FAILED');
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
    view: (state) => box(text(`Count ${state.count}`, { id: 'count' }), { id: 'counter-box' })
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
  assert.match(renderFrame(runtime.frame()), /Count 2/);
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

test('TUI runtime start preserves init-dispatched exits with the rendered snapshot', async () => {
  const app = defineTui({
    id: 'init-exit',
    init: (context) => {
      context.dispatch({ done: true });
      return { done: false };
    },
    update: (_state, message) => ({
      state: { done: message.done },
      exit: { reason: 'initialized' }
    }),
    view: (state) => text(state.done ? 'done' : 'booting', { id: state.done ? 'done-label' : 'boot-label' })
  });
  const harness = createTerminalHarness({ viewport: { columns: 18, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  const frame = await runtime.start();
  const exit = runtime.exit();

  assert.equal(frame.accessibility.root.id, 'done-label');
  assert.equal(exit?.status, 'completed');
  assert.equal(exit?.reason, 'initialized');
  assert.equal(exit?.snapshot.root.id, 'done-label');
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
  assert.match(renderFrame(runtime.frame()), /Count 2/);
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
  assert.match(renderFrame(runtime.frame()), /disabled/);
});

test('TUI runtime serializes concurrent external dispatches', async () => {
  let activeUpdates = 0;
  let maxActiveUpdates = 0;
  const order = [];
  const app = defineTui({
    id: 'serialized-dispatch',
    init: () => ({ count: 0 }),
    update: async (state, message) => {
      activeUpdates += 1;
      maxActiveUpdates = Math.max(maxActiveUpdates, activeUpdates);
      order.push(`start:${message.delta}`);
      await Promise.resolve();
      activeUpdates -= 1;
      order.push(`end:${message.delta}`);
      return { state: { count: state.count + message.delta } };
    },
    view: (state) => text(`Count ${state.count}`, { id: 'serialized-count' })
  });
  const harness = createTerminalHarness({ viewport: { columns: 18, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  await Promise.all([
    runtime.dispatch({ delta: 1 }),
    runtime.dispatch({ delta: 2 }),
    runtime.dispatch({ delta: 3 })
  ]);

  assert.equal(maxActiveUpdates, 1);
  assert.deepEqual(runtime.getState(), { count: 6 });
  assert.deepEqual(order, ['start:1', 'end:1', 'start:2', 'end:2', 'start:3', 'end:3']);
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

test('TUI runtime queues context dispatch during initialization before first render', async () => {
  const app = defineTui({
    id: 'init-context-dispatch',
    init: (context) => {
      context.dispatch({ ready: true });
      return { ready: false };
    },
    update: (_state, message) => ({ state: { ready: message.ready } }),
    view: (state) => text(state.ready ? 'ready' : 'booting', { id: 'init-status' })
  });
  const harness = createTerminalHarness({ viewport: { columns: 20, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();

  assert.deepEqual(runtime.getState(), { ready: true });
  assert.equal(harness.frames().length, 1);
  assert.match(renderFrame(runtime.frame()), /ready/);
});

test('TUI runtime queues context dispatch during updates before commit', async () => {
  const app = defineTui({
    id: 'update-context-dispatch',
    init: () => ({ step: 0 }),
    update: (state, message, context) => {
      if (message.kind === 'start') {
        context.dispatch({ kind: 'finish' });
        return { state: { step: state.step + 1 } };
      }
      return { state: { step: state.step + 1 } };
    },
    view: (state) => text(`Step ${state.step}`, { id: 'step-status' })
  });
  const harness = createTerminalHarness({ viewport: { columns: 20, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  await runtime.dispatch({ kind: 'start' });

  assert.deepEqual(runtime.getState(), { step: 2 });
  assert.equal(harness.frames().length, 2);
  assert.match(renderFrame(runtime.frame()), /Step 2/);
});

test('TUI runtime settles update commands before committing the next frame', async () => {
  const app = defineTui({
    id: 'command-settle',
    init: () => ({ count: 0 }),
    update: (state, message) => ({
      state: { count: state.count + message.delta },
      commands: message.chain === true ? [{ kind: 'dispatch', message: { delta: 10 } }] : []
    }),
    view: (state) => text(`Count ${state.count}`, { id: 'command-count' })
  });
  const harness = createTerminalHarness({ viewport: { columns: 18, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  await runtime.dispatch({ delta: 1, chain: true });

  assert.deepEqual(runtime.getState(), { count: 11 });
  assert.equal(harness.frames().length, 2);
  assert.match(renderFrame(runtime.frame()), /Count 11/);
});

test('TUI runtime resize re-renders against the memory host viewport', async () => {
  const app = defineTui({
    id: 'resizable',
    init: () => ({ label: 'Wide label' }),
    update: (state) => ({ state }),
    view: (state) => box(text(state.label, { id: 'label' }), { id: 'box' })
  });
  const harness = createTerminalHarness({ viewport: { columns: 20, rows: 4 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  await runtime.resize({ columns: 12, rows: 4 });

  assert.equal(runtime.frame().width, 12);
  assert.equal(harness.frames().length, 2);
  assert.equal(harness.diffs()[1].fullRewrite, true);
  assert.match(renderFrame(runtime.frame()), /Wide label/);
});

test('TUI runtime routes key events through focused widget keymaps', async () => {
  const app = defineTui({
    id: 'keymap-routing',
    init: () => ({ active: 'none' }),
    update: (_state, message) => ({ state: { active: message.active } }),
    view: (state) => stack([
      inputField({ id: 'first', value: state.active, keyMap: { enter: { active: 'first' } } }),
      inputField({ id: 'second', value: state.active, keyMap: { enter: { active: 'second' } } })
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
  assert.deepEqual(runtime.frame().focusPath, ['stack:1:1', 'second']);
  assert.equal(harness.frames().length, 4);
  assert.equal(harness.diffs()[0].fullRewrite, true);
  assert.match(renderFrame(runtime.frame()), /second/);
});

test('TUI runtime lets focused widgets handle tab before focus traversal', async () => {
  const app = defineTui({
    id: 'tab-keymap-routing',
    init: () => ({ active: 'none' }),
    update: (_state, message) => ({ state: { active: message.active } }),
    view: (state) => stack([
      inputField({ id: 'first', value: state.active, keyMap: { tab: { active: 'accepted' } } }),
      inputField({ id: 'second', value: state.active, keyMap: { enter: { active: 'second' } } })
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
  assert.match(renderFrame(runtime.frame()), /accepted/);
});

test('TUI runtime routes escape through focused widget keymaps', async () => {
  const app = defineTui({
    id: 'escape-keymap-routing',
    init: () => ({ active: 'open' }),
    update: (_state, message) => ({ state: { active: message.active } }),
    view: (state) => inputField({
      id: 'dialog-field',
      value: state.active,
      keyMap: { escape: { active: 'closed' } }
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
  assert.match(renderFrame(runtime.frame()), /closed/);
});

test('TUI runtime routes focused text and paste input through widget input maps', async () => {
  const app = defineTui({
    id: 'input-map-routing',
    init: () => ({ value: '' }),
    update: (state, message) => ({ state: { value: `${state.value}${message.text}` } }),
    view: (state) => inputField({
      id: 'field',
      value: state.value,
      inputMap: {
        text: (textValue) => ({ text: textValue }),
        paste: (textValue) => ({ text: `[${textValue}]` })
      }
    })
  });
  const harness = createTerminalHarness({ viewport: { columns: 30, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  const typed = await runtime.handleInput({ kind: 'text', text: 'a' });
  const pasted = await runtime.handleInput({ kind: 'paste', text: 'bc' });

  assert.equal(typed.handled, true);
  assert.equal(pasted.handled, true);
  assert.deepEqual(runtime.getState(), { value: 'a[bc]' });
  assert.match(renderFrame(runtime.frame()), /a\[bc\]/);
});

test('runTui accepts an initial focus path', async () => {
  const app = defineTui({
    id: 'run-focus-restore',
    init: () => ({ active: 'idle' }),
    update: (_state, message) => ({ state: { active: message.active }, exit: {} }),
    view: (state) => stack([
      inputField({ id: 'first', value: state.active, keyMap: { enter: { active: 'first' } } }),
      inputField({ id: 'second', value: state.active, keyMap: { enter: { active: 'second' } } })
    ])
  });
  const host = createMemoryTerminalHost({ viewport: { columns: 20, rows: 4 } });
  host.input('\r');

  const exit = await runTui(app, host, { initialFocusPath: ['stack:1:1', 'second'] });

  assert.equal(exit.status, 'completed');
  assert.deepEqual(exit.state, { active: 'second' });
});

test('TUI runtime restores a serialized focus path when it still exists', async () => {
  const app = defineTui({
    id: 'focus-restore',
    init: () => ({ active: 'idle' }),
    update: (_state, message) => ({ state: { active: message.active } }),
    view: (state) => stack([
      inputField({ id: 'first', value: state.active, keyMap: { enter: { active: 'first' } } }),
      inputField({ id: 'second', value: state.active, keyMap: { enter: { active: 'second' } } })
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

  assert.deepEqual(restoredPath, ['stack:1:1', 'second']);
  assert.deepEqual(restoredRuntime.frame().focusPath, restoredPath);
  assert.equal(committed.handled, true);
  assert.deepEqual(restoredRuntime.getState(), { active: 'second' });
});

test('TUI runtime falls back when restored focus path is stale', async () => {
  const app = defineTui({
    id: 'stale-focus-restore',
    init: () => ({ active: 'idle' }),
    update: (_state, message) => ({ state: { active: message.active } }),
    view: (state) => stack([
      inputField({ id: 'first', value: state.active, keyMap: { enter: { active: 'first' } } }),
      inputField({ id: 'second', value: state.active, keyMap: { enter: { active: 'second' } } })
    ])
  });
  const harness = createTerminalHarness({ viewport: { columns: 20, rows: 4 } });
  const runtime = createTuiRuntime({
    app,
    host: harness.host,
    initialFocusPath: ['stack:1:1', 'missing']
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

  assert.deepEqual(runtime.frame().focusPath, ['stack:1:1', 'first']);
  assert.equal(committed.handled, true);
  assert.deepEqual(runtime.getState(), { active: 'first' });
});

test('TUI runtime treats keyed container widgets as focusable controls', async () => {
  const app = defineTui({
    id: 'container-keymap-routing',
    init: () => ({ active: 'idle' }),
    update: (_state, message) => ({ state: { active: message.active } }),
    view: (state) => stack([
      box(text(`Action ${state.active}`, { id: 'action-label' }), {
        id: 'action',
        keyMap: { enter: { active: 'action' } },
        accessibility: { id: 'action', role: 'button', label: 'Run action' }
      }),
      inputField({ id: 'field', value: state.active, keyMap: { enter: { active: 'field' } } })
    ])
  });
  const harness = createTerminalHarness({ viewport: { columns: 24, rows: 6 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  const committed = await runtime.handleInput({ kind: 'key', key: 'enter', ctrl: false, alt: false, shift: false, meta: false });
  const snapshot = runtime.frame().accessibility;
  const action = snapshot.root.children[0];

  assert.equal(committed.handled, true);
  assert.deepEqual(runtime.getState(), { active: 'action' });
  assert.deepEqual(runtime.frame().focusPath, ['stack:1:1', 'action']);
  assert.equal(action?.role, 'button');
  assert.equal(action?.focused, true);
  assert.match(renderFrame(runtime.frame()), /Action action/);
});

test('TUI runtime traverses focus backward with shifted tab', async () => {
  const app = defineTui({
    id: 'reverse-focus',
    init: () => ({ active: 'idle' }),
    update: (_state, message) => ({ state: { active: message.active } }),
    view: (state) => stack([
      inputField({ id: 'first', value: state.active, keyMap: { enter: { active: 'first' } } }),
      inputField({ id: 'second', value: state.active, keyMap: { enter: { active: 'second' } } })
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
  assert.deepEqual(runtime.frame().focusPath, ['stack:1:1', 'first']);
});

test('TUI runtime respects explicit focus order and disabled focus targets', async () => {
  const app = defineTui({
    id: 'ordered-focus',
    init: () => ({ active: 'idle' }),
    update: (_state, message) => ({ state: { active: message.active } }),
    view: (state) => stack([
      inputField({
        id: 'disabled',
        value: state.active,
        keyMap: { enter: { active: 'disabled' } },
        focus: { disabled: true, order: 0 }
      }),
      inputField({
        id: 'later',
        value: state.active,
        keyMap: { enter: { active: 'later' } },
        focus: { order: 2 }
      }),
      inputField({
        id: 'first',
        value: state.active,
        keyMap: { enter: { active: 'first' } },
        focus: { order: 1 }
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
  assert.deepEqual(runtime.frame().focusPath, ['stack:1:1', 'later']);
  assert.deepEqual(runtime.getState(), { active: 'later' });
});

test('TUI runtime traps focus inside modal and scoped popover widgets', async () => {
  const modalApp = defineTui({
    id: 'modal-focus-scope',
    init: () => ({ active: 'idle' }),
    update: (_state, message) => ({ state: { active: message.active } }),
    view: (state) => stack([
      inputField({ id: 'background', value: state.active, keyMap: { enter: { active: 'background' } } }),
      modal(inputField({ id: 'dialog-field', value: state.active, keyMap: { enter: { active: 'dialog' } } }), {
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
  assert.deepEqual(modalRuntime.frame().focusPath, ['stack:1:1', 'dialog', 'dialog-field']);
  assert.deepEqual(modalRuntime.getState(), { active: 'dialog' });

  const popoverApp = defineTui({
    id: 'popover-focus-scope',
    init: () => ({ active: 'idle' }),
    update: (_state, message) => ({ state: { active: message.active } }),
    view: (state) => stack([
      inputField({ id: 'page-field', value: state.active, keyMap: { enter: { active: 'page' } } }),
      box(inputField({ id: 'popover-field', value: state.active, keyMap: { enter: { active: 'popover' } } }), {
        id: 'popover',
        zIndex: 10,
        focus: { scope: 'contain' }
      })
    ])
  });
  const popoverHarness = createTerminalHarness({ viewport: { columns: 30, rows: 8 } });
  const popoverRuntime = createTuiRuntime({ app: popoverApp, host: popoverHarness.host });

  await popoverRuntime.start();
  const popoverEnter = await popoverRuntime.handleInput({ kind: 'key', key: 'enter', ctrl: false, alt: false, shift: false, meta: false });

  assert.equal(popoverEnter.handled, true);
  assert.deepEqual(popoverRuntime.frame().focusPath, ['stack:1:1', 'popover', 'popover-field']);
  assert.deepEqual(popoverRuntime.getState(), { active: 'popover' });
});

test('TUI runtime traverses multiple custom focus targets within one widget', async () => {
  const renderer = {
    render({ buffer, node }) {
      buffer.write(node.bounds.row, node.bounds.column, [{ text: 'AB' }]);
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
    view: (state) => stack([
      inputField({
        id: 'first-field',
        value: state.active,
        message: { active: 'first' },
        accessibility: {
          id: 'first-field',
          role: 'textbox',
          label: 'First field',
          description: 'Primary input'
        }
      }),
      list({
        id: 'choices',
        items: ['Alpha', 'Beta'],
        selected: 1,
        toMessage: (value) => ({ active: value.toLowerCase() })
      }),
      table({ id: 'grid', rows: [['A1', 'B1']] })
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
  assert.deepEqual(snapshot.focusPath, ['stack:1:1', 'choices']);
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
    view: (state) => inputField({ id: 'custom-field', value: state.label, message: { done: true } }),
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
  assert.match(renderFrame(harness.frames()[0]), /ready/);
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
    view: (state) => inputField({ id: 'safe-field', value: state.label }),
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
  const frame = renderWidgetFrame(stack([
    list({ id: 'many-items', items: manyItems, selected: 990 }),
    table({ id: 'many-rows', rows: manyItems.map((item) => [item, 'value']) })
  ]), { columns: 24, rows: 8 });
  const output = renderFrame(frame);
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
  const frame = renderWidgetFrame(viewport(
    text('row-0\nrow-1\nrow-2\nrow-3', { id: 'viewport-text' }),
    {
      id: 'viewport',
      scrollRow: 1,
      scrollColumn: 2,
      contentRows: 4,
      contentColumns: 8
    }
  ), { columns: 5, rows: 2 });
  const output = renderFrame(frame);

  assert.equal(output, 'w-1\nw-2');
  assert.equal(frame.cells.length, 6);
  assert.equal(
    frame.accessibility.root.description,
    'Showing rows 2-3 of 4, columns 3-7 of 8.'
  );
});

test('viewport widgets keep offscreen content from leaking into neighboring layout', () => {
  const frame = renderWidgetFrame(row([
    viewport(
      text('left-0\nleft-1\nleft-2', { id: 'left-content' }),
      { id: 'left-window', scrollRow: 2, contentRows: 3 }
    ),
    text('right', { id: 'right-content' })
  ]), { columns: 12, rows: 1 });
  const output = renderFrame(frame);

  assert.match(output, /^left-2right$/u);
  assert.doesNotMatch(output, /left-0|left-1/u);
});

test('TUI runtime does not reserve escape or ctrlC key events', async () => {
  const app = defineTui({
    id: 'unreserved-keys',
    init: () => ({ ready: true }),
    update: (state) => ({ state }),
    view: () => inputField({ id: 'exit-field', value: 'ready' })
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
    view: (state) => inputField({
      id: 'commit-field',
      value: state.committed ? 'committed' : 'pending',
      message: { committed: true }
    })
  });
  const harness = createTerminalHarness({ viewport: { columns: 20, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  const results = await runtime.handleInputChunk({ data: '\r' });

  assert.equal(results.length, 1);
  assert.equal(results[0].handled, true);
  assert.deepEqual(runtime.getState(), { committed: true });
  assert.match(renderFrame(runtime.frame()), /committed/);
});

test('TUI runtime buffers split input chunks before routing them', async () => {
  const app = defineTui({
    id: 'split-chunk-input',
    init: () => ({ committed: false }),
    update: (_state, message) => ({ state: { committed: message.committed } }),
    view: (state) => inputField({
      id: 'split-commit-field',
      value: state.committed ? 'committed' : 'pending',
      message: { committed: true }
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
  assert.match(renderFrame(runtime.frame()), /committed/);
});

test('TUI runtime ignores non-command paste, focus, and mouse events without corrupting state', async () => {
  const app = defineTui({
    id: 'protocol-input',
    init: () => ({ committed: false }),
    update: (_state, message) => ({ state: { committed: message.committed } }),
    view: (state) => inputField({
      id: 'protocol-field',
      value: state.committed ? 'committed' : 'pending',
      message: { committed: true }
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
    view: (state) => inputField({
      id: 'mouse-field',
      value: state.clicked ? 'clicked' : 'idle',
      mouseMap: { press: { clicked: true } }
    })
  });
  const harness = createTerminalHarness({ viewport: { columns: 20, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  assert.deepEqual(runtime.frame().hitTargets?.[0], {
    id: 'mouse-field:mouse:press',
    bounds: { row: 1, column: 1, width: 20, height: 3 },
    cursor: 'pointer',
    zIndex: 0
  });
  const result = await runtime.handleInputChunk({ data: '\u001B[<0;1;1M' });

  assert.equal(result[0]?.handled, true);
  assert.deepEqual(runtime.getState(), { clicked: true });
  assert.match(renderFrame(runtime.frame()), /clicked/);
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
        { id: 'root', label: 'Root', expanded: true, children: [{ id: 'child', label: 'Child' }] }
      ],
      toMessage: (node) => ({ id: node.id })
    })
  });
  const harness = createTerminalHarness({ viewport: { columns: 20, rows: 4 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  const result = await runtime.handleInputChunk({ data: '\u001B[<0;1;2M' });

  assert.equal(result[0]?.handled, true);
  assert.deepEqual(runtime.getState(), { selected: 'child' });
  assert.match(renderFrame(runtime.frame()), /Child/);
});

test('TUI runtime routes overlapping mouse events to the topmost layer', async () => {
  const app = defineTui({
    id: 'layered-mouse-routing',
    init: () => ({ clicked: 'none' }),
    update: (_state, message) => ({ state: { clicked: message.clicked } }),
    view: () => box([
      inputField({
        id: 'lower-mouse-field',
        value: 'lower',
        zIndex: 0,
        mouseMap: { press: { clicked: 'lower' } }
      }),
      inputField({
        id: 'upper-mouse-field',
        value: 'upper',
        zIndex: 20,
        mouseMap: { press: { clicked: 'upper' } }
      })
    ], {
      id: 'mouse-layer-root',
      border: { kind: 'none' }
    })
  });
  const harness = createTerminalHarness({ viewport: { columns: 20, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  assert.deepEqual(runtime.frame().hitTargets?.map((target) => [target.id, target.zIndex]), [
    ['lower-mouse-field:mouse:press', 0],
    ['upper-mouse-field:mouse:press', 20]
  ]);
  const result = await runtime.handleInputChunk({ data: '\u001B[<0;1;1M' });

  assert.equal(result[0]?.handled, true);
  assert.deepEqual(runtime.getState(), { clicked: 'upper' });
});

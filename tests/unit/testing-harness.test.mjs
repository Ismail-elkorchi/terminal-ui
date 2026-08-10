import assert from 'node:assert/strict';
import test from 'node:test';

import { runTui } from '../../dist/tui/index.js';
import {
  input,
  runPrompt } from '../../dist/prompts/index.js';
import { createPtyTerminalHarness,
  createTerminalHarness,
  replayTranscript,
  runInteractionScript } from '../../dist/testing/index.js';
import { validateTranscript } from '../../dist/transcript/index.js';
import { defineTui } from '../../dist/tui/index.js';
import { diffFrames, renderElementFrame, renderFramePlain } from '../../dist/renderer/index.js';
import {
  button,
  richText,
  tree,
  textInput
} from '../../dist/components/index.js';
import { column } from '../../dist/layout/index.js';
import { waitUntil } from '../helpers/async.ts';
import { ignoreMessage } from '../../dist/component/index.js';

test('testing harness records input and output deterministically', async () => {
  const harness = createTerminalHarness();
  await harness.run(async (host) => {
    await host.write({ text: 'done' });
  });
  const result = await runInteractionScript(harness, {
    id: 'basic',
    steps: [
      { kind: 'input', event: 'x' },
      { kind: 'wait', ms: 5 },
      { kind: 'assertOutput', includes: 'done' },
      { kind: 'assertSnapshot', assertion: { role: 'group', label: 'Terminal harness' } },
      { kind: 'assertNoSecretLeak', secret: 'secret-token' }
    ]
  });

  assert.equal(result.output, 'done');
  assert.equal(result.transcript.steps.length, 1);
  assert.equal(harness.clock.monotonicNow(), 5);
  assert.equal(harness.snapshot().source, 'test_harness');
  assert.equal(harness.snapshot().root.role, 'group');
});

test('testing harness records paste script steps as paste events', async () => {
  const harness = createTerminalHarness();
  const result = await runInteractionScript(harness, {
    id: 'paste',
    steps: [{ kind: 'paste', text: 'clip' }]
  });

  assert.deepEqual(result.transcript.steps[0], {
    kind: 'input',
    event: { kind: 'paste', text: 'clip', bracketed: true }
  });
});

test('interaction script assertion failures return typed diagnostics instead of throwing', async () => {
  const harness = createTerminalHarness();
  await harness.run(async (host) => {
    await host.write({ text: 'ready' });
  });

  const result = await runInteractionScript(harness, {
    id: 'script-failure',
    steps: [{ kind: 'assertOutput', includes: 'missing' }]
  });

  assert.equal(result.diagnostics[0]?.diagnostic.code, 'INTERACTION_SCRIPT_FAILED');
  assert.equal(result.diagnostics[0]?.diagnostic.target, 'steps[0]');
  assert.equal(result.diagnostics[0]?.diagnostic.data?.scriptId, 'script-failure');
  assert.equal(result.diagnostics[0]?.diagnostic.data?.stepKind, 'assertOutput');
  assert.equal(result.transcript.diagnostics[0], result.diagnostics[0]);
  assert.equal(result.output, 'ready');
});

test('terminal harness delivers normalized input events to prompt runtimes', async () => {
  const harness = createTerminalHarness();

  await harness.input({ kind: 'text', text: 'Ada', paste: false });
  await harness.input({
    kind: 'key',
    key: 'enter',
    modifiers: { ctrl: false, alt: false, shift: false, meta: false },
    eventType: 'press',
    location: 'standard'
  });

  const result = await runPrompt(input({ label: 'Name' }), harness.host);

  assert.equal(result.status, 'submitted');
  assert.equal(result.value, 'Ada');
  assert.deepEqual(
    harness.transcript.snapshot().steps
      .filter((step) => step.kind === 'input')
      .map((step) => step.event.kind),
    ['text', 'key']
  );
});

test('terminal harness delivers normalized key events to TUI runtimes', async () => {
  const app = defineTui({
    id: 'harness-key-events',
    init: () => ({ submitted: false }),
    update: (_state, message) => ({ state: { submitted: message.submitted }, exit: {} }),
    view: (state) => textInput({
      id: 'submit',
      presentation: { value: state.submitted ? 'submitted' : 'waiting', cursor: 0 },
      onAction: (action) => action.kind === 'submit' ? { submitted: true } : ignoreMessage()
    })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 20, rows: 3 } });

  await runInteractionScript(harness, {
    id: 'queue-enter',
    steps: [
      { kind: 'input', event: { kind: 'key', key: 'enter', modifiers: { ctrl: false, alt: false, shift: false, meta: false }, eventType: 'press', location: 'standard' } }
    ]
  });
  const result = await runTui(app, harness.host);

  assert.equal(result.status, 'completed');
  assert.deepEqual(result.state, { submitted: true });
  assert.equal(harness.frames().length, 2);
  assert.equal(harness.diffs()[1]?.fullRewrite, false);
  assert.equal(harness.snapshot().source, 'tui');
});

test('terminal harness replay delivers transcript input events back to the memory host', async () => {
  const harness = createTerminalHarness();

  await replayTranscript(harness, {
    formatVersion: 3,
    id: 'replay-input',
    source: 'replay',
    startedAt: new Date(0).toISOString(),
    diagnostics: [],
    redactions: [],
    steps: [
      { kind: 'input', event: { kind: 'text', text: 'Grace', paste: false } },
      { kind: 'input', event: { kind: 'key', key: 'enter', modifiers: { ctrl: false, alt: false, shift: false, meta: false }, eventType: 'press', location: 'standard' } }
    ]
  });
  const result = await runPrompt(input({ label: 'Name' }), harness.host);

  assert.equal(result.status, 'submitted');
  assert.equal(result.value, 'Grace');
});

test('terminal harness input events update resize, signal, and end-of-input host state', async () => {
  const harness = createTerminalHarness({ terminalSize: { columns: 20, rows: 4 } });
  const signals = [];
  const unsubscribe = harness.host.signals.subscribe((signal) => signals.push(signal));

  await harness.input({ kind: 'resize', terminalSize: { columns: 44, rows: 12 } });
  await harness.input({ kind: 'signal', signal: 'SIGINT' });
  await harness.input({ kind: 'end' });
  unsubscribe();

  assert.deepEqual(harness.host.getTerminalSize(), { columns: 44, rows: 12 });
  assert.deepEqual(signals, ['resize', 'SIGINT']);

  const chunks = [];
  for await (const chunk of harness.host.stdin.read()) chunks.push(chunk);
  assert.deepEqual(chunks, []);
});

test('testing harnesses reject invalid events before delivery or transcript recording', async () => {
  const memory = createTerminalHarness();
  assert.throws(
    () => memory.input({ kind: 'signal', signal: 'SIGUSR1' }),
    /supported terminal signal/u
  );
  assert.equal(memory.transcript.snapshot().steps.length, 0);
  assert.equal(validateTranscript(memory.transcript.snapshot()).ok, true);

  const ptyResult = createPtyTerminalHarness();
  if (!ptyResult.ok) return;
  try {
    assert.throws(
      () => ptyResult.harness.input({ kind: 'signal', signal: 'SIGUSR1' }),
      /supported terminal signal/u
    );
    assert.equal(ptyResult.harness.transcript.snapshot().steps.length, 0);
    assert.equal(validateTranscript(ptyResult.harness.transcript.snapshot()).ok, true);
  } finally {
    await ptyResult.harness.dispose();
  }
});

test('terminal harness encodes normalized text key pointer paste and focus events', async () => {
  const harness = createTerminalHarness();
  const key = (keyName, modifiers, sequence) => ({
    kind: 'key',
    key: keyName,
    modifiers: { ctrl: false, alt: false, shift: false, meta: false, ...modifiers },
    eventType: 'press',
    location: 'standard',
    ...(sequence === undefined ? {} : { sequence })
  });

  await harness.input({ kind: 'text', text: 'x', paste: false });
  await harness.input({ kind: 'paste', text: 'clip', bracketed: true });
  await harness.input(key('c', { ctrl: true }));
  await harness.input(key('q', { alt: true, shift: true }));
  await harness.input(key('arrowUp', { shift: true }));
  await harness.input(key('f20', {}));
  assert.throws(
    () => harness.input(key('f21', {})),
    /cannot encode key "f21"/u
  );
  await harness.input(key('unknown', {}, '\u001B[99~'));
  await harness.input({
    kind: 'mouse',
    sequence: '\u001B[<0;2;3M',
    encoding: 'sgr',
    action: 'press',
    button: 'left',
    row: 3,
    column: 2,
    rawCode: 0,
    modifiers: { shift: false, alt: false, ctrl: false }
  });
  await harness.input({ kind: 'unknown', sequence: '\u001B[?999z' });
  await harness.input({ kind: 'focus', focused: true });
  await harness.input({ kind: 'focus', focused: false });
  await harness.input({ kind: 'end' });

  const chunks = [];
  for await (const chunk of harness.host.stdin.read()) chunks.push(chunk);
  assert.equal(
    chunks.map((chunk) => chunk.data).join(''),
    'x\u001B[200~clip\u001B[201~\u0003\u001BQ\u001B[1;2A\u001B[34~\u001B[99~\u001B[<0;2;3M\u001B[?999z\u001B[I\u001B[O'
  );
});

test('terminal harness resize events drive active TUI resize handling', async () => {
  const app = defineTui({
    id: 'harness-resize',
    init: () => ({ done: false }),
    update: (_state, message) => ({ state: { done: message.done }, exit: {} }),
    view: (_state, context) => textInput({
      id: 'resize-field',
      presentation: { value: `columns:${context.terminalSize.columns}`, cursor: 0 },
      onAction: (action) => action.kind === 'submit' ? { done: true } : ignoreMessage()
    })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 20, rows: 3 } });
  const running = runTui(app, harness.host);

  await waitUntil(() => harness.frames().length === 1);
  await harness.resize({ columns: 12, rows: 3 });
  await waitUntil(() => harness.frames().length === 2);
  harness.host.input('\r');
  const exit = await running;

  assert.equal(exit.status, 'completed');
  assert.equal(harness.frames()[1]?.width, 12);
  assert.match(renderFramePlain(harness.frames()[1]), /columns:12/u);
  assert.equal(harness.frames()[1]?.accessibility.root.value, 'columns:12');
  assert.deepEqual(
    harness.transcript.snapshot().steps
      .filter((step) => step.kind === 'input')
      .map((step) => step.event),
    [{ kind: 'resize', terminalSize: { columns: 12, rows: 3 } }]
  );
});

test('interaction scripts assert styled text focus selection and hit targets against recorded frames', async () => {
  const harness = createTerminalHarness({ terminalSize: { columns: 24, rows: 9 } });
  const frame = renderElementFrame(column([
    richText({
      id: 'styled-line',
      segments: [{ kind: 'text', text: 'Styled', style: { fg: { kind: 'theme', token: 'accent.primary' } } }]
    }),
    tree({
      id: 'tree',
      selected: 'child',
      nodes: [
        {
          id: 'root',
          label: 'Root',
          kind: 'branch',
          expanded: true,
          children: [{ id: 'child', label: 'Child', kind: 'leaf' }]
        }
      ],
      onAction: (action) => ({ kind: 'tree', action })
    }),
    button({
      id: 'confirm',
      label: 'Confirm',
      onAction: () => ({ kind: 'confirm' })
    })
  ]), { columns: 24, rows: 9 });
  harness.recordCommit({
    id: 'semantic-assertions:commit:1',
    stateVersion: 0,
    terminalSize: { columns: frame.width, rows: frame.height },
    ...(frame.focusPath === undefined ? {} : { focusPath: frame.focusPath }),
    frame,
    diff: diffFrames(undefined, frame)
  });
  const target = frame.hitTargets?.find((item) => item.id === 'confirm:control');
  assert.ok(target);

  const scriptResult = await runInteractionScript(harness, {
    id: 'semantic-assertions',
    steps: [
      { kind: 'assertVisibleText', assertion: { text: 'Styled', styleToken: 'accent.primary' } },
      { kind: 'assertFocus', assertion: { id: 'tree' } },
      { kind: 'assertSelected', assertion: { id: 'tree:child', label: 'Child' } },
      { kind: 'assertHitTarget', assertion: { id: target.id, row: target.bounds.row, column: target.bounds.column } }
    ]
  });

  assert.equal(scriptResult.diagnostics.length, 0);
});

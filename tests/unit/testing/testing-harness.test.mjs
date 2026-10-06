import assert from 'node:assert/strict';
import test from 'node:test';

import { runTui } from '../../../dist/tui/index.js';
import {
  input,
  runPrompt } from '../../../dist/prompts/index.js';
import { createPtyTerminalHarness,
  createTerminalHarness,
  isPtyHarnessUnavailable,
  InteractionScriptError,
  keyInput,
  pasteInput,
  pointerInput,
  replayTranscript,
  runInteractionScript,
  wheelInput } from '../../../dist/testing/index.js';
import { validateTranscript } from '../../../dist/transcript/index.js';
import { defineTui } from '../../../dist/tui/index.js';
import { diffFrames, renderElementFrame, renderFramePlain } from '../../../dist/renderer/index.js';
import {
  button,
  richText,
  tree,
  textInput
} from '../../../dist/components/index.js';
import { column } from '../../../dist/layout/index.js';
import { waitUntil } from '../../support/async.ts';
import { ignoreMessage } from '../../../dist/component/index.js';
import { createTreeSource, createTreeView, textInputReducer } from '../../../dist/behavior/index.js';
import { encodeHarnessInputEvent } from '../../../dist/testing/input-events.js';

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

test('public input-event helpers construct immutable paste and wheel events', () => {
  const paste = pasteInput('clip', false);
  const wheel = wheelInput({
    row: 3,
    column: 4,
    deltaRows: -2,
    modifiers: { ctrl: true },
  });

  assert.deepEqual(paste, { kind: 'paste', text: 'clip', bracketed: false });
  assert.equal(Object.isFrozen(paste), true);
  assert.equal(wheel.kind, 'mouse');
  assert.equal(wheel.action, 'wheel');
  assert.equal(wheel.button, 'wheelUp');
  assert.equal(wheel.deltaRows, -2);
  assert.equal(wheel.modifiers.ctrl, true);
  assert.equal(Object.isFrozen(wheel), true);
  assert.equal(Object.isFrozen(wheel.modifiers), true);
});

test('PTY unavailability predicate proves the unavailable result variant', () => {
  const result = createPtyTerminalHarness({ available: false });

  assert.equal(isPtyHarnessUnavailable(result), true);
  assert.equal(result.status, 'unavailable');
  assert.equal(isPtyHarnessUnavailable({ status: 'available' }), false);
});

test('PTY harness owns app readiness, semantic input settlement, and cleanup', async () => {
  const result = createPtyTerminalHarness({ terminalSize: { columns: 20, rows: 3 } });
  assert.equal(result.status, 'available');
  const harness = result.harness;
  const app = defineTui({
    id: 'pty-owned-app',
    init: () => ({ state: 0 }),
    update: (state) => ({ state: state + 1 }),
    view: (state) => button({ id: 'advance', label: String(state), onPress: () => 'advance' }),
  });
  try {
    await harness.runApp(app, async (runtime) => {
      assert.equal(runtime.state(), 0);
      assert.equal(harness.frames().length, 1);
      await harness.input(keyInput('enter'));
      assert.equal(runtime.state(), 1);
      assert.equal(harness.frames().length, 2);
      assert.equal(harness.snapshot().source, 'tui');
    });
  } finally {
    await harness.dispose();
  }
});

test('interaction script assertion failures reject with the step and captured result', async () => {
  const harness = createTerminalHarness();
  await harness.run(async (host) => {
    await host.write({ text: 'ready' });
  });

  await assert.rejects(
    runInteractionScript(harness, {
      id: 'script-failure',
      steps: [{ kind: 'assertOutput', includes: 'missing' }]
    }),
    (cause) => {
      assert.ok(cause instanceof InteractionScriptError);
      assert.equal(cause.stepIndex, 0);
      assert.equal(cause.stepKind, 'assertOutput');
      assert.equal(cause.result.diagnostics[0]?.diagnostic.code, 'INTERACTION_SCRIPT_FAILED');
      assert.equal(cause.result.diagnostics[0]?.diagnostic.target, 'steps[0]');
      assert.equal(cause.result.output, 'ready');
      return true;
    }
  );
});

test('input helpers encode printable keys, pointers, and wheel magnitude before recording', async () => {
  const harness = createTerminalHarness();
  await harness.input(keyInput('a'));
  await harness.input(pointerInput({ action: 'press', row: 2, column: 3, button: 'right' }));
  await harness.input(wheelInput({ row: 2, column: 3, deltaRows: -2 }));
  const input = harness.transcript.snapshot().steps.filter((step) => step.kind === 'input');
  assert.equal(input.length, 3);
  assert.equal(input[0]?.event.kind, 'key');
  assert.equal(input[1]?.event.kind, 'mouse');
  assert.equal(input[2]?.event.kind, 'mouse');
  assert.equal(encodeHarnessInputEvent(keyInput('a')), 'a');
  assert.equal(encodeHarnessInputEvent(pointerInput({ action: 'press', row: 2, column: 3, button: 'right' })), '\u001B[<2;3;2M');
  assert.equal(encodeHarnessInputEvent(wheelInput({ row: 2, column: 3, deltaRows: -2 })), '\u001B[<64;3;2M\u001B[<64;3;2M');
});

test('runApp owns readiness and settles semantic helper inputs before returning', async () => {
  const app = defineTui({
    id: 'owned-harness-app',
    init: () => ({ state: { text: '', cursor: 0 } }),
    update: (state, transition) => ({ state: textInputReducer(state, transition) }),
    view: (state) => textInput({
      id: 'field', meta: { accessibleName: 'Field' }, state,
      onTransition: (transition) => transition,
    }),
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 20, rows: 3 } });
  await harness.runApp(app, async (runtime) => {
    await harness.input(keyInput('a'));
    assert.equal(runtime.state().text, 'a');
    await harness.input(keyInput('b', { eventType: 'repeat' }));
    assert.equal(runtime.state().text, 'ab');
    await harness.input(keyInput('b', { eventType: 'release' }));
    assert.equal(runtime.state().text, 'ab');
    await harness.input(pointerInput({ action: 'press', row: 1, column: 5 }));
    assert.match(renderFramePlain(runtime.frame()), /ab/u);
  });
});

test('script clock advances wait for the next owned app commit', async () => {
  const app = defineTui({
    id: 'clock-commit-harness',
    init: () => ({ state: { phase: 'idle' } }),
    update: (state, message) => message.kind === 'start'
      ? {
          state: { phase: 'loading' },
          effects: [{
            id: 'finish', concurrency: 'keep-first',
            async run({ clock, signal }) {
              await clock.sleep(5, signal);
              return { kind: 'message', message: { kind: 'done' } };
            },
          }],
        }
      : { state: { ...state, phase: 'done' } },
    view: (state) => button({ id: 'clock-button', label: state.phase,
      onPress: () => ({ kind: 'start' }) }),
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 16, rows: 2 } });
  await harness.runApp(app, async (runtime) => {
    await harness.input(keyInput('enter'));
    assert.equal(runtime.state().phase, 'loading');
    await runInteractionScript(harness, {
      id: 'clock-commit',
      steps: [{ kind: 'waitForCommit', ms: 5 }, { kind: 'assertVisibleText', assertion: { text: 'done' } }],
    });
    assert.equal(runtime.state().phase, 'done');
  });
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
    init: () => ({ state: ({ submitted: false }) }),
    update: (_state, message) => ({ state: { submitted: message.submitted }, exit: {} }),
    view: (state) => textInput({ meta: { accessibleName: "Text input" },
      id: 'submit',
      state: { text: state.submitted ? 'submitted' : 'waiting', cursor: 0 },
      onTransition: () => ignoreMessage(),
      onSubmit: () => ({ submitted: true })
    })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 20, rows: 3 } });

  await runInteractionScript(harness, {
    id: 'queue-enter',
    steps: [
      { kind: 'input', event: { kind: 'key', key: 'enter', modifiers: { ctrl: false, alt: false, shift: false, meta: false }, eventType: 'press', location: 'standard' } }
    ]
  });
  const result = await runTui(app, { host: harness.host });

  assert.equal(result.status, 'completed');
  assert.deepEqual(result.state, { submitted: true });
  assert.equal(harness.frames().length, 2);
  assert.equal(harness.diffs()[1]?.fullRewrite, false);
  assert.equal(harness.snapshot().source, 'tui');
});

test('terminal harness replay delivers transcript input events back to the memory host', async () => {
  const harness = createTerminalHarness();

  await replayTranscript(harness, {
    formatVersion: 1,
    omittedSteps: 0,
    omittedDiagnostics: 0,
    omittedRedactions: 0,
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
  assert.equal(validateTranscript(memory.transcript.snapshot()).status, 'success');

  const ptyResult = createPtyTerminalHarness();
  if (ptyResult.status === 'unavailable') return;
  try {
    await ptyResult.harness.input({ kind: 'resize', terminalSize: { columns: 44, rows: 12 } });
    assert.deepEqual(ptyResult.harness.host.getTerminalSize(), { columns: 44, rows: 12 });
    assert.throws(
      () => ptyResult.harness.input({ kind: 'signal', signal: 'SIGUSR1' }),
      /supported terminal signal/u
    );
    assert.equal(ptyResult.harness.transcript.snapshot().steps.length, 1);
    assert.equal(validateTranscript(ptyResult.harness.transcript.snapshot()).status, 'success');
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
    init: () => ({ state: ({ done: false }) }),
    update: (_state, message) => ({ state: { done: message.done }, exit: {} }),
    view: (_state, context) => textInput({ meta: { accessibleName: "Text input" },
      id: 'resize-field',
      state: { text: `columns:${context.terminalSize.columns}`, cursor: 0 },
      onTransition: () => ignoreMessage(),
      onSubmit: () => ({ done: true })
    })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 20, rows: 3 } });
  const running = runTui(app, { host: harness.host });

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
  const treeState = {
    expandedIds: ['root'],
    activeId: 'child',
    selection: { mode: 'single', selectedId: 'child' }
  };
  const treeSource = createTreeSource([{
    id: 'root',
    label: 'Root',
    kind: 'branch',
    children: [{ id: 'child', label: 'Child', kind: 'leaf' }]
  }]);
  const frame = renderElementFrame(column([
    richText({
      id: 'styled-line',
      segments: [{ kind: 'text', text: 'Styled', style: { fg: { kind: 'theme', token: 'accent.primary' } } }]
    }),
    tree({ meta: { accessibleName: "Tree" },
      id: 'tree',
      state: treeState,
      source: treeSource,
      view: createTreeView(treeSource, treeState),
      onTransition: (action) => ({ kind: 'tree', action })
    }),
    button({
      id: 'confirm',
      label: 'Confirm',
      onPress: () => ({ kind: 'confirm' })
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

test('PTY harness reports standard modes independently of assumed native-grid admission', async () => {
  const result = createPtyTerminalHarness();
  assert.equal(result.status, 'available');
  const harness = result.harness;
  try {
    const capabilities = await harness.host.getCapabilities({ activeProbes: ['terminalModes'] });
    assert.equal(capabilities.cellPresentation.support, 'supported');
    assert.equal(capabilities.cellPresentation.facts.find(fact => fact.name === 'cellPresentation.evidence').value, 'assumed');
    assert.equal(capabilities.cellPresentation.facts.find(fact => fact.name === 'standard:8').value, 'unrecognized');
    assert.deepEqual(capabilities.cellPresentation.facts.find(fact => fact.name === 'terminalModes.collection').value, {
      complete: true, missingModes: [], conflictingModes: [],
    });
  } finally {
    await harness.dispose();
  }
});

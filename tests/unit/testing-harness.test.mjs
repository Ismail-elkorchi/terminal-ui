import assert from 'node:assert/strict';
import test from 'node:test';

import { input, runPrompt } from '../../dist/prompts/index.js';
import { createTerminalHarness, replayTranscript, runInteractionScript } from '../../dist/testing/index.js';
import { defineTui, renderWidgetFrame, runTui } from '../../dist/tui/index.js';
import { button, richText, stack, tree, inputField } from '../../dist/widgets/index.js';
import { waitUntil } from '../helpers/async.mjs';

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
      { kind: 'assertSnapshot', assertion: { role: 'application', label: 'Terminal harness' } },
      { kind: 'assertNoSecretLeak', secret: 'secret-token' }
    ]
  });

  assert.equal(result.output, 'done');
  assert.equal(result.transcript.steps.length, 1);
  assert.equal(harness.clock.now(), 5);
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

  assert.equal(result.diagnostics[0]?.code, 'INTERACTION_SCRIPT_FAILED');
  assert.equal(result.diagnostics[0]?.target, 'steps[0]');
  assert.equal(result.diagnostics[0]?.data?.scriptId, 'script-failure');
  assert.equal(result.diagnostics[0]?.data?.stepKind, 'assertOutput');
  assert.equal(result.transcript.diagnostics[0], result.diagnostics[0]);
  assert.equal(result.output, 'ready');
});

test('terminal harness delivers normalized input events to prompt runtimes', async () => {
  const harness = createTerminalHarness();

  await harness.input({ kind: 'text', text: 'Ada', paste: false });
  await harness.input({ kind: 'key', key: 'enter', ctrl: false, alt: false, shift: false, meta: false });

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
    view: (state) => inputField({
      id: 'submit',
      value: state.submitted ? 'submitted' : 'waiting',
      message: { submitted: true }
    })
  });
  const harness = createTerminalHarness({ viewport: { columns: 20, rows: 3 } });

  await runInteractionScript(harness, {
    id: 'queue-enter',
    steps: [
      { kind: 'input', event: { kind: 'key', key: 'enter', ctrl: false, alt: false, shift: false, meta: false } }
    ]
  });
  const result = await runTui(app, harness.host);

  assert.equal(result.status, 'completed');
  assert.deepEqual(result.state, { submitted: true });
  assert.equal(harness.frames().length, 2);
  assert.equal(harness.diffs()[1]?.fullRewrite, false);
});

test('terminal harness replay delivers transcript input events back to the memory host', async () => {
  const harness = createTerminalHarness();

  await replayTranscript(harness, {
    schemaVersion: 'terminal-ui.interaction-transcript.v1',
    id: 'replay-input',
    source: 'replay',
    startedAt: new Date(0).toISOString(),
    diagnostics: [],
    redactions: [],
    steps: [
      { kind: 'input', event: { kind: 'text', text: 'Grace', paste: false } },
      { kind: 'input', event: { kind: 'key', key: 'enter', ctrl: false, alt: false, shift: false, meta: false } }
    ]
  });
  const result = await runPrompt(input({ label: 'Name' }), harness.host);

  assert.equal(result.status, 'submitted');
  assert.equal(result.value, 'Grace');
});

test('terminal harness input events update resize, signal, and end-of-input host state', async () => {
  const harness = createTerminalHarness({ viewport: { columns: 20, rows: 4 } });
  const signals = [];
  const unsubscribe = harness.host.signals.subscribe((signal) => signals.push(signal));

  await harness.input({ kind: 'resize', viewport: { columns: 44, rows: 12 } });
  await harness.input({ kind: 'signal', signal: 'SIGINT' });
  await harness.input({ kind: 'end' });
  unsubscribe();

  assert.deepEqual(harness.host.getViewport(), { columns: 44, rows: 12 });
  assert.deepEqual(signals, ['resize', 'SIGINT']);

  const chunks = [];
  for await (const chunk of harness.host.stdin.read()) chunks.push(chunk);
  assert.deepEqual(chunks, []);
});

test('terminal harness resize events drive active TUI resize handling', async () => {
  const app = defineTui({
    id: 'harness-resize',
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
  await harness.resize({ columns: 12, rows: 3 });
  await waitUntil(() => harness.frames().length === 2);
  harness.host.input('\r');
  const exit = await running;

  assert.equal(exit.status, 'completed');
  assert.equal(harness.frames()[1]?.width, 12);
  assert.match(harness.output(), /columns:12/u);
  assert.deepEqual(
    harness.transcript.snapshot().steps
      .filter((step) => step.kind === 'input')
      .map((step) => step.event),
    [{ kind: 'resize', viewport: { columns: 12, rows: 3 } }]
  );
});

test('interaction scripts assert styled text focus selection and hit targets against recorded frames', async () => {
  const harness = createTerminalHarness({ viewport: { columns: 24, rows: 9 } });
  const frame = renderWidgetFrame(stack([
    richText({
      id: 'styled-line',
      segments: [{ text: 'Styled', style: { fg: { kind: 'theme', token: 'accent.primary' } } }]
    }),
    tree({
      id: 'tree',
      selected: 'child',
      keyMap: { enter: { kind: 'confirm' } },
      nodes: [
        {
          id: 'root',
          label: 'Root',
          expanded: true,
          children: [{ id: 'child', label: 'Child' }]
        }
      ],
      toMessage: (node) => ({ kind: 'select', id: node.id })
    }),
    button({
      id: 'confirm',
      label: 'Confirm',
      message: { kind: 'confirm' }
    })
  ]), { columns: 24, rows: 9 });
  harness.recordFrame(frame);
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

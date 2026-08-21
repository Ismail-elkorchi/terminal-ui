import assert from 'node:assert/strict';
import test from 'node:test';
import { createTuiRuntime, defineTui } from '../../dist/tui/index.js';
import { createTerminalHarness } from '../../dist/testing/index.js';
import { renderFramePlain } from '../../dist/renderer/index.js';
import { button, textInput as createTextInput } from '../../dist/components/index.js';
import { ignoreMessage } from '../../dist/component/index.js';
import { createTranscriptRecorder } from '../../dist/transcript/index.js';

function textInput(options) {
  return createTextInput(
    options.onAction !== undefined
      ? options
      : { onAction: () => ignoreMessage(), ...options }
  );
}

test('TUI runtime does not reserve escape or ctrlC key events', async () => {
  const app = defineTui({
    id: 'unreserved-keys',
    init: () => ({ state: ({ ready: true }) }),
    update: (state) => ({ state }),
    view: () => textInput({ meta: { accessibleName: "Text input" }, id: 'exit-field', presentation: { value: 'ready', cursor: 0 } })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 20, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  const escape = await runtime.handleInput({
    kind: 'key',
    key: 'escape',
    sequence: '\u001B',
    modifiers: { ctrl: false, alt: false, shift: false, meta: false },
    eventType: 'press',
    location: 'standard'
  });
  const ctrlC = await runtime.handleInput({
    kind: 'key',
    key: 'c',
    sequence: '\u0003',
    modifiers: { ctrl: true, alt: false, shift: false, meta: false },
    eventType: 'press',
    location: 'standard'
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
    init: () => ({ state: ({ committed: false }) }),
    update: (_state, message) => ({ state: { committed: message.committed } }),
    view: (state) => textInput({ meta: { accessibleName: "Text input" },
      id: 'commit-field',
      presentation: { value: state.committed ? 'committed' : 'pending', cursor: 0 },
      onAction: (action) => action.kind === 'submit' ? { committed: true } : ignoreMessage()
    })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 20, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  const results = await runtime.handleInputChunk({ data: '\r' });

  assert.equal(results.results.length, 1);
  assert.equal(results.results[0].handled, true);
  assert.deepEqual(runtime.state(), { committed: true });
  assert.match(renderFramePlain(runtime.frame()), /committed/);
});

test('TUI runtime buffers split input chunks before routing them', async () => {
  const app = defineTui({
    id: 'split-chunk-input',
    init: () => ({ state: ({ committed: false }) }),
    update: (_state, message) => ({ state: { committed: message.committed } }),
    view: (state) => textInput({ meta: { accessibleName: "Text input" },
      id: 'split-commit-field',
      presentation: { value: state.committed ? 'committed' : 'pending', cursor: 0 },
      onAction: (action) => action.kind === 'submit' ? { committed: true } : ignoreMessage()
    })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 20, rows: 3 } });
  const runtime = createTuiRuntime({
    app,
    host: harness.host,
    input: { bracketedPaste: true }
  });

  await runtime.start();
  const first = await runtime.handleInputChunk({ data: '\u001B[200~clip' });
  const second = await runtime.handleInputChunk({ data: '\u001B[201~\r' });

  assert.equal(first.results.length, 0);
  assert.equal(second.results.length, 2);
  assert.equal(second.results[0]?.handled, false);
  assert.equal(second.results[1]?.handled, true);
  assert.deepEqual(runtime.state(), { committed: true });
  assert.match(renderFramePlain(runtime.frame()), /committed/);
});

test('decoded input resolves earlier raw input before it is admitted', async () => {
  const app = defineTui({
    id: 'mixed-input-order',
    init: () => ({ state: [] }),
    update: (state, message) => ({ state: [...state, message] }),
    inputBindings: [{
      id: 'text',
      triggers: [{ kind: 'text', text: 'x' }],
      message: 'text'
    }],
    view: () => button({
      id: 'mixed-input-button',
      label: 'Run',
      onAction: () => ignoreMessage()
    })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 20, rows: 3 } });
  const transcript = createTranscriptRecorder({ source: 'test' });
  const runtime = createTuiRuntime({ app, host: harness.host, transcript });

  await runtime.start();
  const raw = runtime.handleInputChunk({ data: '\u001B[' });
  const decoded = runtime.handleInput({ kind: 'text', text: 'x', paste: false });
  const rawBatch = await raw;
  await decoded;

  assert.deepEqual(runtime.state(), ['text']);
  assert.deepEqual(
    transcript.snapshot().steps
      .filter((step) => step.kind === 'input')
      .map((step) => step.event.kind),
    ['unknown', 'text']
  );
  const capabilities = await harness.host.getCapabilities();
  assert.doesNotThrow(() => runtime.replaceTerminalProfile({
    capabilities,
    bracketedPaste: false
  }));
  assert.deepEqual(await rawBatch.pending, []);
  await runtime.dispose();
});

test('TUI runtime expires every incomplete terminal token before unrelated input arrives', async () => {
  const app = defineTui({
    id: 'incomplete-token-deadline',
    init: () => ({ state: ({ committed: false }) }),
    update: (_state, message) => ({ state: { committed: message.committed } }),
    view: (state) => textInput({ meta: { accessibleName: "Text input" },
      id: 'deadline-field',
      presentation: { value: state.committed ? 'committed' : 'pending', cursor: 0 },
      onAction: (action) => action.kind === 'submit' ? { committed: true } : ignoreMessage()
    })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 20, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host, input: { escapeDelayMs: 25 } });

  await runtime.start();
  const incomplete = await runtime.handleInputChunk({ data: '\u001B[' });
  assert.deepEqual(incomplete.results, []);
  assert.notEqual(incomplete.pending, undefined);

  harness.clock.advance(25);
  const expired = await incomplete.pending;
  assert.equal(expired.length, 1);
  assert.equal(expired[0]?.handled, false);

  const enter = await runtime.handleInputChunk({ data: '\r' });
  assert.equal(enter.results[0]?.handled, true);
  assert.deepEqual(runtime.state(), { committed: true });
});

test('TUI runtime does not expire an active bracketed paste as Escape ambiguity', async () => {
  const app = defineTui({
    id: 'slow-paste',
    init: () => ({ state: '' }),
    update: (state, message) => ({
      state: message.operation.kind === 'insert'
        ? state.slice(0, message.operation.at) + message.operation.text + state.slice(message.operation.at)
        : state
    }),
    view: (value) => textInput({ meta: { accessibleName: "Text input" },
      id: 'slow-paste-field',
      presentation: { value, cursor: value.length },
      onAction: (action) => action.kind === 'edit'
        ? { operation: action.operation }
        : ignoreMessage()
    })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 20, rows: 3 } });
  const runtime = createTuiRuntime({
    app,
    host: harness.host,
    input: { bracketedPaste: true, escapeDelayMs: 25 }
  });

  await runtime.start();
  const opening = await runtime.handleInputChunk({ data: '\u001B[200~Ada' });
  assert.deepEqual(opening, { results: [] });
  harness.clock.advance(25);
  const closing = await runtime.handleInputChunk({ data: '\u001B[201~' });

  assert.equal(closing.results.length, 1);
  assert.equal(closing.results[0]?.handled, true);
  assert.equal(runtime.state(), 'Ada');
});

test('TUI runtime ignores non-command paste, focus, and mouse events without corrupting state', async () => {
  const app = defineTui({
    id: 'protocol-input',
    init: () => ({ state: ({ committed: false }) }),
    update: (_state, message) => ({ state: { committed: message.committed } }),
    view: (state) => textInput({ meta: { accessibleName: "Text input" },
      id: 'protocol-field',
      presentation: { value: state.committed ? 'committed' : 'pending', cursor: 0 },
      onAction: (action) => action.kind === 'submit' ? { committed: true } : ignoreMessage()
    })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 20, rows: 3 } });
  const runtime = createTuiRuntime({
    app,
    host: harness.host,
    input: { bracketedPaste: true, focusReporting: true, mouseReporting: 'drag' }
  });

  await runtime.start();
  const ignored = await runtime.handleInputChunk({
    data: '\u001B[200~clip\u001B[201~\u001B[I\u001B[<0;4;5M'
  });
  const committed = await runtime.handleInputChunk({ data: '\r' });

  assert.equal(ignored.results.length, 3);
  assert.equal(ignored.results.every((result) => result.handled === false), true);
  assert.equal(committed.results[0]?.handled, true);
  assert.deepEqual(runtime.state(), { committed: true });
});

test('character bindings and Space activation do not depend on host chunk boundaries', async () => {
  const stream = 'x q';
  const expected = await actionsForChunks([stream]);
  assert.deepEqual(expected, ['space', 'q']);
  for (let split = 1; split < stream.length; split += 1) {
    assert.deepEqual(
      await actionsForChunks([stream.slice(0, split), stream.slice(split)]),
      expected,
      String(split)
    );
  }
  assert.deepEqual(await actionsForChunks([...stream]), expected);
});

test('multi-code-point grapheme bindings do not depend on host chunk boundaries', async () => {
  const binding = 'e\u0301';
  assert.deepEqual(await graphemeActions([binding], binding), ['activate']);
  assert.deepEqual(await graphemeActions(['e', '\u0301'], binding), ['activate']);
});

async function actionsForChunks(chunks) {
  const app = defineTui({
    id: 'partition-invariant-input',
    init: () => ({ state: ({ actions: [] }) }),
    update: (state, message) => ({ state: { actions: [...state.actions, message.kind] } }),
    inputBindings: [{
      id: 'q',
      triggers: [{ kind: 'text', text: 'q' }],
      message: { kind: 'q' }
    }],
    view: () => button({
      id: 'partition-button',
      label: 'Run',
      onAction: () => ({ kind: 'space' })
    })
  });
  const host = createTerminalHarness({ terminalSize: { columns: 20, rows: 3 } }).host;
  const runtime = createTuiRuntime({ app, host });
  await runtime.start();
  for (const data of chunks) await runtime.handleInputChunk({ data });
  await runtime.flushInput();
  const actions = runtime.state().actions;
  await runtime.dispose();
  return actions;
}

async function graphemeActions(chunks, binding) {
  const app = defineTui({
    id: 'grapheme-partition-input',
    init: () => ({ state: [] }),
    update: (state, message) => ({ state: [...state, message] }),
    inputBindings: [{
      id: 'grapheme',
      triggers: [{ kind: 'text', text: binding }],
      message: 'activate'
    }],
    view: () => button({
      id: 'grapheme-button',
      label: 'Run',
      onAction: () => ignoreMessage()
    })
  });
  const host = createTerminalHarness({ terminalSize: { columns: 20, rows: 3 } }).host;
  const runtime = createTuiRuntime({ app, host });
  await runtime.start();
  for (const data of chunks) await runtime.handleInputChunk({ data });
  await runtime.flushInput();
  const actions = runtime.state();
  await runtime.dispose();
  return actions;
}

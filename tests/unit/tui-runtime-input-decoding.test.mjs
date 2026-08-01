import assert from 'node:assert/strict';
import test from 'node:test';
import { createTuiRuntime, defineTui } from '../../dist/tui/index.js';
import { createTerminalHarness } from '../../dist/testing/index.js';
import { renderFramePlain } from '../../dist/renderer/index.js';
import { textInput as createTextInput } from '../../dist/components/index.js';

function textInput(options) {
  return createTextInput(
    options.onAction !== undefined || options.onSubmit !== undefined
      ? options
      : { onSubmit: () => undefined, ...options }
  );
}

test('TUI runtime does not reserve escape or ctrlC key events', async () => {
  const app = defineTui({
    id: 'unreserved-keys',
    init: () => ({ ready: true }),
    update: (state) => ({ state }),
    view: () => textInput({ id: 'exit-field', presentation: { value: 'ready', cursor: 0 } })
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
    init: () => ({ committed: false }),
    update: (_state, message) => ({ state: { committed: message.committed } }),
    view: (state) => textInput({
      id: 'commit-field',
      presentation: { value: state.committed ? 'committed' : 'pending', cursor: 0 },
      onSubmit: () => ({ committed: true })
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
    init: () => ({ committed: false }),
    update: (_state, message) => ({ state: { committed: message.committed } }),
    view: (state) => textInput({
      id: 'split-commit-field',
      presentation: { value: state.committed ? 'committed' : 'pending', cursor: 0 },
      onSubmit: () => ({ committed: true })
    })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 20, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

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

test('TUI runtime ignores non-command paste, focus, and mouse events without corrupting state', async () => {
  const app = defineTui({
    id: 'protocol-input',
    init: () => ({ committed: false }),
    update: (_state, message) => ({ state: { committed: message.committed } }),
    view: (state) => textInput({
      id: 'protocol-field',
      presentation: { value: state.committed ? 'committed' : 'pending', cursor: 0 },
      onSubmit: () => ({ committed: true })
    })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 20, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

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

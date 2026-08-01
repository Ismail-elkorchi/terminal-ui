import assert from 'node:assert/strict';
import test from 'node:test';
import { createTuiRuntime, defineTui } from '../../dist/tui/index.js';
import { createMemoryTerminalHost } from '../../dist/host/index.js';
import { ignoreMessage } from '../../dist/interaction/index.js';
import { createTerminalHarness } from '../../dist/testing/index.js';
import { renderFramePlain } from '../../dist/renderer/index.js';
import { textInput as createTextInput } from '../../dist/components/index.js';
import { column } from '../../dist/layout/index.js';

function textInput(options) {
  return createTextInput(
    options.onAction !== undefined || options.onSubmit !== undefined
      ? options
      : { onSubmit: () => undefined, ...options }
  );
}

test('defineTui rejects duplicate binding identities and duplicate triggers within one binding', () => {
  const trigger = { kind: 'key', key: 'enter' };
  assert.throws(() => defineTui({
    init: () => null,
    update: (state) => ({ state }),
    view: () => textInput({ presentation: { value: '', cursor: 0 } }),
    inputBindings: [
      { id: 'submit', triggers: [trigger], message: 'first' },
      { id: 'submit', triggers: [{ kind: 'key', key: 'escape' }], message: 'second' }
    ]
  }), /binding id .* duplicated/u);
  assert.throws(() => defineTui({
    init: () => null,
    update: (state) => ({ state }),
    view: () => textInput({ presentation: { value: '', cursor: 0 } }),
    inputBindings: [{ id: 'submit', triggers: [trigger, trigger], message: 'submit' }]
  }), /duplicate trigger/u);
});

test('TUI runtime routes key events through focused element keymaps', async () => {
  const app = defineTui({
    id: 'keymap-routing',
    init: () => ({ active: 'none' }),
    update: (_state, message) => ({ state: { active: message.active } }),
    view: (state) => column([
      textInput({ id: 'first', presentation: { value: state.active, cursor: 0 }, keys: { enter: () => ({ active: 'first' }) } }),
      textInput({ id: 'second', presentation: { value: state.active, cursor: 0 }, keys: { enter: () => ({ active: 'second' }) } })
    ])
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 20, rows: 4 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  const first = await runtime.handleInput({ kind: 'key', key: 'enter', modifiers: { ctrl: false, alt: false, shift: false, meta: false }, eventType: 'press', location: 'standard' });
  const tab = await runtime.handleInput({ kind: 'key', key: 'tab', modifiers: { ctrl: false, alt: false, shift: false, meta: false }, eventType: 'press', location: 'standard' });
  const second = await runtime.handleInput({ kind: 'key', key: 'enter', modifiers: { ctrl: false, alt: false, shift: false, meta: false }, eventType: 'press', location: 'standard' });

  assert.equal(first.handled, true);
  assert.equal(tab.handled, true);
  assert.equal(second.handled, true);
  assert.deepEqual(runtime.state(), { active: 'second' });
  assert.deepEqual(runtime.frame().focusPath, ['column:0', 'second']);
  assert.equal(harness.frames().length, 4);
  assert.equal(harness.diffs()[0].fullRewrite, true);
  assert.match(renderFramePlain(runtime.frame()), /second/);
});

test('TUI runtime lets focused elements handle tab before focus traversal', async () => {
  const app = defineTui({
    id: 'tab-keymap-routing',
    init: () => ({ active: 'none' }),
    update: (_state, message) => ({ state: { active: message.active } }),
    view: (state) => column([
      textInput({ id: 'first', presentation: { value: state.active, cursor: 0 }, keys: { tab: () => ({ active: 'accepted' }) } }),
      textInput({ id: 'second', presentation: { value: state.active, cursor: 0 }, keys: { enter: () => ({ active: 'second' }) } })
    ])
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 24, rows: 4 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  const focusBefore = runtime.frame().focusPath;
  const handled = await runtime.handleInput({ kind: 'key', key: 'tab', modifiers: { ctrl: false, alt: false, shift: false, meta: false }, eventType: 'press', location: 'standard' });

  assert.equal(handled.handled, true);
  assert.deepEqual(runtime.state(), { active: 'accepted' });
  assert.deepEqual(runtime.frame().focusPath, focusBefore);
  assert.match(renderFramePlain(runtime.frame()), /accepted/);
});

test('TUI runtime routes default app key bindings after focused elements', async () => {
  const app = defineTui({
    id: 'app-key-binding-after-focus',
    init: () => ({ active: 'open' }),
    inputBindings: [
      { id: 'close', triggers: [{ kind: 'key', key: 'escape' }], message: { active: 'closed' } }
    ],
    update: (_state, message) => ({ state: { active: message.active } }),
    view: (state) => textInput({ id: 'field', presentation: { value: state.active, cursor: 0 } })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 24, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  const handled = await runtime.handleInput({
    kind: 'key',
    key: 'escape',
    sequence: '\u001B',
    modifiers: { ctrl: false, alt: false, shift: false, meta: false },
    eventType: 'press',
    location: 'standard'
  });

  assert.equal(handled.handled, true);
  assert.deepEqual(runtime.state(), { active: 'closed' });
  assert.match(renderFramePlain(runtime.frame()), /closed/);
});

test('TUI runtime lets focused elements override after-focus app bindings', async () => {
  const app = defineTui({
    id: 'app-key-binding-focused-wins',
    init: () => ({ active: 'open' }),
    inputBindings: [
      { id: 'global-close', triggers: [{ kind: 'key', key: 'escape' }], message: { active: 'global' } }
    ],
    update: (_state, message) => ({ state: { active: message.active } }),
    view: (state) => textInput({
      id: 'field',
      presentation: { value: state.active, cursor: 0 },
      keys: { escape: () => ({ active: 'local' }) }
    })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 24, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  await runtime.handleInput({
    kind: 'key',
    key: 'escape',
    sequence: '\u001B',
    modifiers: { ctrl: false, alt: false, shift: false, meta: false },
    eventType: 'press',
    location: 'standard'
  });

  assert.deepEqual(runtime.state(), { active: 'local' });
  assert.match(renderFramePlain(runtime.frame()), /local/);
});

test('TUI runtime lets before-focus app bindings intentionally preempt elements', async () => {
  const app = defineTui({
    id: 'app-key-binding-before-focus',
    init: () => ({ active: 'open' }),
    inputBindings: [
      { id: 'priority-enter', triggers: [{ kind: 'key', key: 'enter' }], phase: 'beforeFocus', message: { active: 'global' } }
    ],
    update: (_state, message) => ({ state: { active: message.active } }),
    view: (state) => textInput({
      id: 'field',
      presentation: { value: state.active, cursor: 0 },
      keys: { enter: () => ({ active: 'local' }) }
    })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 24, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  await runtime.handleInput({ kind: 'key', key: 'enter', modifiers: { ctrl: false, alt: false, shift: false, meta: false }, eventType: 'press', location: 'standard' });

  assert.deepEqual(runtime.state(), { active: 'global' });
  assert.match(renderFramePlain(runtime.frame()), /global/);
});

test('TUI runtime does not steal printable text for default app bindings', async () => {
  const app = defineTui({
    id: 'app-key-binding-printable-after-focus',
    init: () => ({ value: '' }),
    inputBindings: [
      { id: 'quit', triggers: [{ kind: 'text', text: 'q' }], message: { value: 'quit' } }
    ],
    update: (state, message) => ({ state: { value: `${state.value}${message.value}` } }),
    view: (state) => textInput({
      id: 'field',
          presentation: { value: state.value, cursor: 0 },
          onAction: ({ operation }) => ({ value: operation.kind === 'insert' ? operation.text : '' })
    })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 24, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  await runtime.handleInput({ kind: 'text', text: 'q' });

  assert.deepEqual(runtime.state(), { value: 'q' });
  assert.match(renderFramePlain(runtime.frame()), /q/);
});

test('TUI runtime routes committed text before after-focus app bindings', async () => {
  const app = defineTui({
    id: 'committed-text-before-app-binding',
    init: () => ({ value: '' }),
    inputBindings: [{
      id: 'global-space',
      triggers: [{ kind: 'text', text: ' ' }],
      message: { value: 'global' }
    }],
    update: (state, message) => ({ state: { value: `${state.value}${message.value}` } }),
    view: (state) => textInput({
      id: 'field',
      presentation: { value: state.value, cursor: state.value.length },
      onAction: ({ operation }) => ({ value: operation.kind === 'insert' ? operation.text : '' })
    })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 24, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  await runtime.handleInput({
    kind: 'key',
    key: 'space',
    committedText: ' ',
    modifiers: { ctrl: false, alt: false, shift: false, meta: false },
    eventType: 'press',
    location: 'standard'
  });

  assert.deepEqual(runtime.state(), { value: ' ' });
});

test('TUI runtime routes committed text through app text bindings', async () => {
  const app = defineTui({
    id: 'committed-text-app-binding',
    init: () => ({ value: 'idle' }),
    inputBindings: [{
      id: 'quit',
      triggers: [{ kind: 'text', text: 'q' }],
      message: { value: 'quit' }
    }],
    update: (_state, message) => ({ state: message }),
    view: (state) => textInput({
      id: 'field',
      presentation: { value: state.value, cursor: 0 }
    })
  });
  const runtime = createTuiRuntime({
    app,
    host: createMemoryTerminalHost({ terminalSize: { columns: 24, rows: 3 } })
  });

  await runtime.start();
  const handled = await runtime.handleInput({
    kind: 'key',
    key: 'q',
    committedText: 'q',
    modifiers: { ctrl: false, alt: false, shift: false, meta: false },
    eventType: 'press',
    location: 'standard'
  });

  assert.equal(handled.handled, true);
  assert.deepEqual(runtime.state(), { value: 'quit' });
});

test('TUI runtime routes committed text through component text key bindings', async () => {
  const app = defineTui({
    id: 'committed-text-component-binding',
    init: () => ({ value: 'idle' }),
    update: (_state, message) => ({ state: message }),
    view: (state) => textInput({
      id: 'field',
      presentation: { value: state.value, cursor: 0 },
      keys: { text: { q: () => ({ value: 'component' }) } }
    })
  });
  const runtime = createTuiRuntime({
    app,
    host: createMemoryTerminalHost({ terminalSize: { columns: 24, rows: 3 } })
  });

  await runtime.start();
  const handled = await runtime.handleInput({
    kind: 'key',
    key: 'q',
    committedText: 'q',
    modifiers: { ctrl: false, alt: false, shift: false, meta: false },
    eventType: 'press',
    location: 'standard'
  });

  assert.equal(handled.handled, true);
  assert.deepEqual(runtime.state(), { value: 'component' });
});

test('TUI runtime evaluates app key binding predicates and dynamic messages', async () => {
  const app = defineTui({
    id: 'app-key-binding-dynamic',
    init: () => ({ active: 'blocked', enabled: false }),
    inputBindings: [
      {
        id: 'dynamic-help',
        triggers: [{ kind: 'key', key: 'q', modifiers: { ctrl: true } }],
        enabled: ({ state }) => state.enabled,
        toMessage: ({ focusPath }) => ({ active: focusPath?.join('/') ?? 'none', enabled: true })
      }
    ],
    update: (_state, message) => ({ state: message }),
    view: (state) => textInput({
      id: 'field',
      presentation: { value: state.active, cursor: 0 },
      keys: { enter: () => ({ active: 'ready', enabled: true }) }
    })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 32, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  const disabled = await runtime.handleInput({ kind: 'key', key: 'q', modifiers: { ctrl: true, alt: false, shift: false, meta: false }, eventType: 'press', location: 'standard' });
  await runtime.handleInput({ kind: 'key', key: 'enter', modifiers: { ctrl: false, alt: false, shift: false, meta: false }, eventType: 'press', location: 'standard' });
  const enabled = await runtime.handleInput({ kind: 'key', key: 'q', modifiers: { ctrl: true, alt: false, shift: false, meta: false }, eventType: 'press', location: 'standard' });

  assert.equal(disabled.handled, false);
  assert.equal(enabled.handled, true);
  assert.deepEqual(runtime.state(), { active: 'field', enabled: true });
});

test('TUI runtime keeps scanning app key bindings when earlier matches decline', async () => {
  const app = defineTui({
    id: 'app-key-binding-declined-fallback',
    init: () => ({ active: 'open' }),
    inputBindings: [
      {
        id: 'contextual-help',
        triggers: [{ kind: 'key', key: 'q', modifiers: { ctrl: true } }],
        toMessage: ignoreMessage
      },
      {
        id: 'fallback-help',
        triggers: [{ kind: 'key', key: 'q', modifiers: { ctrl: true } }],
        message: { active: 'fallback' }
      }
    ],
    update: (_state, message) => ({ state: { active: message.active } }),
    view: (state) => textInput({ id: 'field', presentation: { value: state.active, cursor: 0 } })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 32, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  const handled = await runtime.handleInput({ kind: 'key', key: 'q', modifiers: { ctrl: true, alt: false, shift: false, meta: false }, eventType: 'press', location: 'standard' });

  assert.equal(handled.handled, true);
  assert.deepEqual(runtime.state(), { active: 'fallback' });
});

test('TUI runtime routes escape through focused element keymaps', async () => {
  const app = defineTui({
    id: 'escape-keymap-routing',
    init: () => ({ active: 'open' }),
    update: (_state, message) => ({ state: { active: message.active } }),
    view: (state) => textInput({
      id: 'dialog-field',
      presentation: { value: state.active, cursor: 0 },
      keys: { escape: () => ({ active: 'closed' }) }
    })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 24, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  const handled = await runtime.handleInput({
    kind: 'key',
    key: 'escape',
    sequence: '\u001B',
    modifiers: { ctrl: false, alt: false, shift: false, meta: false },
    eventType: 'press',
    location: 'standard'
  });

  assert.equal(handled.handled, true);
  assert.equal(handled.exit, undefined);
  assert.equal(runtime.exit(), undefined);
  assert.deepEqual(runtime.state(), { active: 'closed' });
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
      presentation: { value: state.value, cursor: 0 },
      onAction: ({ operation }) => ({ operation })
    })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 30, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  const typed = await runtime.handleInput({ kind: 'text', text: 'a' });
  const pasted = await runtime.handleInput({ kind: 'paste', text: 'bc' });

  assert.equal(typed.handled, true);
  assert.equal(pasted.handled, true);
  assert.deepEqual(runtime.state(), { value: 'abc' });
  assert.match(renderFramePlain(runtime.frame()), /abc/);
});

test('TUI runtime routes single-space input chunks as text for editable focused elements', async () => {
  const app = defineTui({
    id: 'space-input-routing',
    init: () => ({ value: '' }),
    update: (state, message) => ({ state: { value: `${state.value}${message.text}` } }),
    view: (state) => textInput({
      id: 'field',
      presentation: { value: state.value, cursor: 0 },
      onAction: ({ operation }) => ({ text: operation.kind === 'insert' ? operation.text : '' })
    })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 30, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  await runtime.handleInputChunk({ data: '/folder' });
  const space = await runtime.handleInputChunk({ data: ' ' });
  await runtime.handleInputChunk({ data: 'src' });

  assert.equal(space.results.some((result) => result.handled), true);
  assert.deepEqual(runtime.state(), { value: '/folder src' });
  assert.match(renderFramePlain(runtime.frame()), /\/folder src/u);
});

test('TUI runtime lets focused space key bindings override text insertion', async () => {
  const app = defineTui({
    id: 'space-key-routing',
    init: () => ({ value: '' }),
    update: (_state, message) => ({ state: { value: message.text } }),
    view: (state) => textInput({
      id: 'field',
      presentation: { value: state.value, cursor: 0 },
      keys: { space: () => ({ text: 'space-key' }) },
      onAction: ({ operation }) => ({ text: operation.kind === 'insert' ? operation.text : '' })
    })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 30, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  const space = await runtime.handleInputChunk({ data: ' ' });

  assert.equal(space.results.some((result) => result.handled), true);
  assert.deepEqual(runtime.state(), { value: 'space-key' });
});

test('TUI runtime decodes input chunks through the configured input pipeline', async () => {
  const app = defineTui({
    id: 'input-pipeline-routing',
    init: () => ({ value: '' }),
    update: (state, message) => ({ state: { value: `${state.value}${message.text}` } }),
    view: (state) => textInput({
      id: 'pipeline-field',
      presentation: { value: state.value, cursor: 0 },
      onAction: ({ operation }) => ({ text: operation.kind === 'insert' ? operation.text : '' })
    })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 30, rows: 3 } });
  const runtime = createTuiRuntime({
    app,
    host: harness.host,
    input: { bracketedPaste: false }
  });

  await runtime.start();
  const results = await runtime.handleInputChunk({ data: '\u001B[200~pasted\ntext\u001B[201~' });

  assert.equal(results.results.some((result) => result.handled), true);
  assert.deepEqual(runtime.state(), { value: 'pastedtext' });
  assert.match(renderFramePlain(runtime.frame()), /pastedtext/);
});

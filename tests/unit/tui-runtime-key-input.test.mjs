import assert from 'node:assert/strict';
import test from 'node:test';
import { createTuiRuntime, defineTui, projectTuiBindingHelp } from '../../dist/tui/index.js';
import { createMemoryTerminalHost } from '../../dist/host/index.js';
import { listboxReducer } from '../../dist/behavior/index.js';
import { ignoreMessage } from '../../dist/component/index.js';
import { createTerminalHarness } from '../../dist/testing/index.js';
import { renderFramePlain } from '../../dist/renderer/index.js';
import { button, listbox, textInput as createTextInput } from '../../dist/components/index.js';
import { column } from '../../dist/layout/index.js';
import { kittyKeyboardProfile } from '../../dist/protocol/index.js';
import { InputDecodeError } from '../../dist/input/index.js';
import { testKeyInput } from '../helpers/component-definition.mjs';

function textInput(options) {
  if (options.keys !== undefined) return testKeyInput(options);
  return createTextInput(
    options.onAction !== undefined
      ? options
      : { onAction: () => ignoreMessage(), ...options }
  );
}

test('defineTui rejects duplicate binding identities and duplicate triggers within one binding', () => {
  const trigger = { kind: 'key', key: 'enter' };
  assert.throws(() => defineTui({
    init: () => ({ state: null }),
    update: (state) => ({ state }),
    view: () => textInput({ meta: { accessibleName: "Text input" }, presentation: { value: '', cursor: 0 } }),
    inputBindings: [
      { id: 'submit', triggers: [trigger], message: 'first' },
      { id: 'submit', triggers: [{ kind: 'key', key: 'escape' }], message: 'second' }
    ]
  }), /binding id .* duplicated/u);
  assert.throws(() => defineTui({
    init: () => ({ state: null }),
    update: (state) => ({ state }),
    view: () => textInput({ meta: { accessibleName: "Text input" }, presentation: { value: '', cursor: 0 } }),
    inputBindings: [{ id: 'submit', triggers: [trigger, trigger], message: 'submit' }]
  }), /duplicate trigger/u);
});

test('defineTui owns input bindings and validates the fields it consumes', async () => {
  const trigger = { kind: 'key', key: 'enter' };
  const bindings = [{ id: 'submit', label: 'Submit', triggers: [trigger], message: 'submitted' }];
  const definition = {
    id: 'exact-bindings',
    init: () => ({ state: 'idle' }),
    update: (_state, message) => ({ state: message }),
    view: () => createTextInput({ meta: { accessibleName: "Text input" },
      id: 'exact-field',
      presentation: { value: '', cursor: 0 },
      onAction: () => ignoreMessage()
    }),
    inputBindings: bindings
  };
  const app = defineTui(definition);

  trigger.key = 'escape';
  bindings.push({ id: 'late', triggers: [{ kind: 'key', key: 'escape' }], message: 'late' });
  assert.deepEqual(projectTuiBindingHelp(app), [{
    id: 'submit',
    label: 'Submit',
    bindings: [{ binding: { kind: 'key', key: 'enter' }, label: 'Submit' }]
  }]);
  assert.equal(Object.isFrozen(projectTuiBindingHelp(app)), true);
  assert.equal(Object.isFrozen(projectTuiBindingHelp(app)[0]?.bindings), true);
  assert.equal(Object.isFrozen(projectTuiBindingHelp(app)[0]?.bindings[0]?.binding), true);

  assert.doesNotThrow(() => defineTui({ ...definition, unsupported: true }));
  assert.doesNotThrow(() => defineTui({
    ...definition,
    inputBindings: [{ ...bindings[0], typo: true }]
  }));
  assert.throws(() => defineTui({
    ...definition,
    inputBindings: [{ ...bindings[0], phase: 'capture' }]
  }), /phase/u);
  assert.throws(() => defineTui({
    ...definition,
    inputBindings: [{ ...bindings[0], toMessage: () => 'other' }]
  }), /exactly one/u);

  const invalidPredicate = defineTui({
    ...definition,
    inputBindings: [{
      ...bindings[0],
      triggers: [{ kind: 'key', key: 'enter' }],
      enabled: () => 'yes'
    }]
  });
  const runtime = createTuiRuntime({
    app: invalidPredicate,
    host: createMemoryTerminalHost({ terminalSize: { columns: 12, rows: 1 } })
  });
  await runtime.start();
  await assert.rejects(
    runtime.handleInput({
      kind: 'key',
      key: 'enter',
      modifiers: { ctrl: false, alt: false, shift: false, meta: false },
      eventType: 'press',
      location: 'standard'
    }),
    /enabled predicate must return a boolean/u
  );
});

test('Kitty release and repeat events cannot activate controls or traverse focus', async () => {
  const app = defineTui({
    id: 'kitty-event-types',
    init: () => ({ state: ({ activations: [] }) }),
    update: (state, message) => ({
      state: { activations: [...state.activations, message.id] }
    }),
    view: () => column([
      button({ id: 'first', label: 'First', onAction: () => ({ id: 'first' }) }),
      button({ id: 'second', label: 'Second', onAction: () => ({ id: 'second' }) })
    ])
  });
  const host = createMemoryTerminalHost({
    terminalSize: { columns: 20, rows: 4 },
    capabilities: { probes: { keyboardProtocol: 'supported' } }
  });
  const capabilities = await host.getCapabilities();
  const runtime = createTuiRuntime({
    app,
    host,
    input: { capabilities, keyboard: kittyKeyboardProfile(3) }
  });

  await runtime.start();
  const initialFocus = runtime.frame().focusPath;
  const enterRepeat = await runtime.handleInputChunk({ data: '\u001B[13;1:2u' });
  const enterRelease = await runtime.handleInputChunk({ data: '\u001B[13;1:3u' });
  const tabRepeat = await runtime.handleInputChunk({ data: '\u001B[9;1:2u' });
  const tabRelease = await runtime.handleInputChunk({ data: '\u001B[9;1:3u' });

  assert.equal(enterRepeat.results[0]?.handled, false);
  assert.equal(enterRelease.results[0]?.handled, false);
  assert.equal(tabRepeat.results[0]?.handled, false);
  assert.equal(tabRelease.results[0]?.handled, false);
  assert.deepEqual(runtime.state(), { activations: [] });
  assert.deepEqual(runtime.frame().focusPath, initialFocus);

  const enterPress = await runtime.handleInputChunk({ data: '\u001B[13;1:1u' });
  const tabPress = await runtime.handleInputChunk({ data: '\u001B[9;1:1u' });
  assert.equal(enterPress.results[0]?.handled, true);
  assert.equal(tabPress.results[0]?.handled, true);
  assert.deepEqual(runtime.state(), { activations: ['first'] });
  assert.deepEqual(runtime.frame().focusPath, ['column:0', 'second']);
});

test('editable controls opt cursor movement into Kitty key repeat', async () => {
  const app = defineTui({
    id: 'kitty-repeat-editing',
    init: () => ({ state: ({ actions: [] }) }),
    update: (state, message) => ({ state: { actions: [...state.actions, message] } }),
    view: () => createTextInput({ meta: { accessibleName: "Text input" },
      id: 'editor',
      presentation: { value: 'ab', cursor: 1 },
      onAction: (action) => action
    })
  });
  const host = createMemoryTerminalHost({
    terminalSize: { columns: 20, rows: 2 },
    capabilities: { probes: { keyboardProtocol: 'supported' } }
  });
  const capabilities = await host.getCapabilities();
  const runtime = createTuiRuntime({
    app,
    host,
    input: { capabilities, keyboard: kittyKeyboardProfile(3) }
  });

  await runtime.start();
  const repeated = await runtime.handleInputChunk({ data: '\u001B[1;1:2C' });

  assert.equal(repeated.results[0]?.handled, true);
  assert.deepEqual(runtime.state().actions, [
    { kind: 'edit', operation: { kind: 'moveRight' } }
  ]);
});

test('TUI runtime reduces Kitty repeat bursts before the render boundary', async () => {
  const items = Array.from({ length: 10 }, (_value, index) => `item-${String(index)}`);
  const reducerOptions = { items, projectItem: (item) => ({ id: item, label: item }) };
  const app = defineTui({
    id: 'kitty-repeat-burst',
    init: () => ({
      state: {
        activeId: 'item-0',
        selection: { mode: 'single', selectedId: 'item-0', selectionFollowsActive: true }
      },
      focus: { kind: 'element', elementId: 'repeat-listbox' }
    }),
    update: (state, transition) => ({ state: listboxReducer(state, transition, reducerOptions) }),
    view: (presentation) => listbox({
      id: 'repeat-listbox',
      meta: { accessibleName: 'Repeat navigation' },
      items,
      projectItem: reducerOptions.projectItem,
      presentation,
      onTransition: (transition) => transition
    })
  });
  const host = createMemoryTerminalHost({
    terminalSize: { columns: 10, rows: 1 },
    capabilities: { probes: { keyboardProtocol: 'supported' } }
  });
  const capabilities = await host.getCapabilities();
  const runtime = createTuiRuntime({
    app,
    host,
    input: { capabilities, keyboard: kittyKeyboardProfile(3) }
  });

  await runtime.start();
  const burst = await runtime.handleInputChunk({
    data: `\u001B[B${'\u001B[1;1:2B'.repeat(99)}`
  });
  assert.equal(burst.results.length, 1);
  assert.equal(runtime.state().activeId, 'item-9');
  assert.equal(runtime.metrics().frameCommits, 2);

  const released = await runtime.handleInputChunk({
    data: `${'\u001B[1;1:2B'.repeat(100)}\u001B[1;1:3B`
  });
  assert.equal(released.results.length, 2);
  assert.equal(released.results.at(-1)?.handled, false);
  assert.equal(runtime.state().activeId, 'item-9');
  assert.equal(runtime.metrics().frameCommits, 2);
  assert.equal(runtime.metrics().decodedInputEvents, 201);
});

test('application navigation bindings retain every admitted transition', async () => {
  const app = defineTui({
    id: 'legacy-navigation-burst',
    init: () => ({ state: 0 }),
    update: (state) => ({ state: state + 1 }),
    inputBindings: [{
      id: 'move',
      triggers: [{ kind: 'key', key: 'arrowDown' }],
      message: 'move'
    }],
    view: (state) => button({ id: 'count', label: String(state), onAction: () => ignoreMessage() })
  });
  const runtime = createTuiRuntime({
    app,
    host: createMemoryTerminalHost({ terminalSize: { columns: 10, rows: 1 } })
  });

  await runtime.start();
  const burst = await runtime.handleInputChunk({ data: '\u001B[B'.repeat(3) });

  assert.equal(burst.results.length, 3);
  assert.equal(runtime.state(), 3);
  assert.equal(runtime.metrics().frameCommits, 4);
  assert.equal(runtime.metrics().decodedInputEvents, 3);
});

test('state-dependent navigation bindings retain sequential routing semantics', async () => {
  const app = defineTui({
    id: 'state-dependent-navigation',
    init: () => ({ state: 0 }),
    update: (_state, message) => ({ state: message }),
    inputBindings: [{
      id: 'move',
      triggers: [{ kind: 'key', key: 'arrowDown' }],
      toMessage: ({ state }) => state + 1
    }],
    view: (state) => button({ id: 'count', label: String(state), onAction: () => ignoreMessage() })
  });
  const runtime = createTuiRuntime({
    app,
    host: createMemoryTerminalHost({ terminalSize: { columns: 10, rows: 1 } })
  });

  await runtime.start();
  await runtime.handleInputChunk({ data: '\u001B[B'.repeat(3) });

  assert.equal(runtime.state(), 3);
  assert.equal(runtime.metrics().frameCommits, 4);
});

test('TUI runtime exposes input-profile fallback diagnostics', async () => {
  const host = createMemoryTerminalHost({ terminalSize: { columns: 12, rows: 1 } });
  const app = defineTui({
    id: 'input-profile-diagnostic',
    init: () => ({ state: 'ready' }),
    update: (state) => ({ state }),
    view: () => createTextInput({ meta: { accessibleName: "Text input" },
      id: 'profile-field',
      presentation: { value: 'ready', cursor: 0 },
      onAction: () => ignoreMessage()
    })
  });
  const runtime = createTuiRuntime({
    app,
    host,
    input: { keyboard: kittyKeyboardProfile(3) }
  });

  await runtime.start();
  assert.equal(
    runtime.diagnostics().some((item) => item.diagnostic.code === 'INPUT_PROFILE_UNSUPPORTED'),
    true
  );
});

test('TUI runtime routes key events through focused element keymaps', async () => {
  const app = defineTui({
    id: 'keymap-routing',
    init: () => ({ state: ({ active: 'none' }) }),
    update: (_state, message) => ({ state: { active: message.active } }),
    view: (state) => column([
      textInput({ meta: { accessibleName: "Text input" }, id: 'first', presentation: { value: state.active, cursor: 0 }, keys: { enter: () => ({ active: 'first' }) } }),
      textInput({ meta: { accessibleName: "Text input" }, id: 'second', presentation: { value: state.active, cursor: 0 }, keys: { enter: () => ({ active: 'second' }) } })
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
    init: () => ({ state: ({ active: 'none' }) }),
    update: (_state, message) => ({ state: { active: message.active } }),
    view: (state) => column([
      textInput({ meta: { accessibleName: "Text input" }, id: 'first', presentation: { value: state.active, cursor: 0 }, keys: { tab: () => ({ active: 'accepted' }) } }),
      textInput({ meta: { accessibleName: "Text input" }, id: 'second', presentation: { value: state.active, cursor: 0 }, keys: { enter: () => ({ active: 'second' }) } })
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
    init: () => ({ state: ({ active: 'open' }) }),
    inputBindings: [
      { id: 'close', triggers: [{ kind: 'key', key: 'escape' }], message: { active: 'closed' } }
    ],
    update: (_state, message) => ({ state: { active: message.active } }),
    view: (state) => textInput({ meta: { accessibleName: "Text input" }, id: 'field', presentation: { value: state.active, cursor: 0 } })
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
    init: () => ({ state: ({ active: 'open' }) }),
    inputBindings: [
      { id: 'global-close', triggers: [{ kind: 'key', key: 'escape' }], message: { active: 'global' } }
    ],
    update: (_state, message) => ({ state: { active: message.active } }),
    view: (state) => textInput({ meta: { accessibleName: "Text input" },
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
    init: () => ({ state: ({ active: 'open' }) }),
    inputBindings: [
      { id: 'priority-enter', triggers: [{ kind: 'key', key: 'enter' }], phase: 'beforeFocus', message: { active: 'global' } }
    ],
    update: (_state, message) => ({ state: { active: message.active } }),
    view: (state) => textInput({ meta: { accessibleName: "Text input" },
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
    init: () => ({ state: ({ value: '' }) }),
    inputBindings: [
      { id: 'quit', triggers: [{ kind: 'text', text: 'q' }], message: { value: 'quit' } }
    ],
    update: (state, message) => ({ state: { value: `${state.value}${message.value}` } }),
    view: (state) => textInput({ meta: { accessibleName: "Text input" },
      id: 'field',
          presentation: { value: state.value, cursor: 0 },
          onAction: (action) => ({
            value: action.kind === 'edit' && action.operation.kind === 'insert'
              ? action.operation.text
              : ''
          })
    })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 24, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  await runtime.handleInput({ kind: 'text', text: 'q', paste: false });

  assert.deepEqual(runtime.state(), { value: 'q' });
  assert.match(renderFramePlain(runtime.frame()), /q/);
});

test('TUI runtime routes committed text before after-focus app bindings', async () => {
  const app = defineTui({
    id: 'committed-text-before-app-binding',
    init: () => ({ state: ({ value: '' }) }),
    inputBindings: [{
      id: 'global-space',
      triggers: [{ kind: 'text', text: ' ' }],
      message: { value: 'global' }
    }],
    update: (state, message) => ({ state: { value: `${state.value}${message.value}` } }),
    view: (state) => textInput({ meta: { accessibleName: "Text input" },
      id: 'field',
      presentation: { value: state.value, cursor: state.value.length },
      onAction: (action) => ({
        value: action.kind === 'edit' && action.operation.kind === 'insert'
          ? action.operation.text
          : ''
      })
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
    init: () => ({ state: ({ value: 'idle' }) }),
    inputBindings: [{
      id: 'quit',
      triggers: [{ kind: 'text', text: 'q' }],
      message: { value: 'quit' }
    }],
    update: (_state, message) => ({ state: message }),
    view: (state) => textInput({ meta: { accessibleName: "Text input" },
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
    init: () => ({ state: ({ value: 'idle' }) }),
    update: (_state, message) => ({ state: message }),
    view: (state) => testKeyInput({
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
    init: () => ({ state: ({ active: 'blocked', enabled: false }) }),
    inputBindings: [
      {
        id: 'dynamic-help',
        triggers: [{ kind: 'key', key: 'q', modifiers: { ctrl: true } }],
        enabled: ({ state }) => state.enabled,
        toMessage: ({ focusPath }) => ({ active: focusPath?.join('/') ?? 'none', enabled: true })
      }
    ],
    update: (_state, message) => ({ state: message }),
    view: (state) => textInput({ meta: { accessibleName: "Text input" },
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
    init: () => ({ state: ({ active: 'open' }) }),
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
    view: (state) => textInput({ meta: { accessibleName: "Text input" }, id: 'field', presentation: { value: state.active, cursor: 0 } })
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
    init: () => ({ state: ({ active: 'open' }) }),
    update: (_state, message) => ({ state: { active: message.active } }),
    view: (state) => textInput({ meta: { accessibleName: "Text input" },
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
    init: () => ({ state: ({ value: '' }) }),
    update: (state, message) => ({
      state: {
        value: message.operation.kind === 'insert'
          ? `${state.value}${message.operation.text}`
          : state.value
      }
    }),
    view: (state) => textInput({ meta: { accessibleName: "Text input" },
      id: 'field',
      presentation: { value: state.value, cursor: 0 },
      onAction: (action) => action.kind === 'edit'
        ? { operation: action.operation }
        : ignoreMessage()
    })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 30, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  const typed = await runtime.handleInput({ kind: 'text', text: 'a', paste: false });
  const pasted = await runtime.handleInput({ kind: 'paste', text: 'bc', bracketed: false });

  assert.equal(typed.handled, true);
  assert.equal(pasted.handled, true);
  assert.deepEqual(runtime.state(), { value: 'abc' });
  assert.match(renderFramePlain(runtime.frame()), /abc/);
});

test('TUI runtime routes single-space input chunks as text for editable focused elements', async () => {
  const app = defineTui({
    id: 'space-input-routing',
    init: () => ({ state: ({ value: '' }) }),
    update: (state, message) => ({ state: { value: `${state.value}${message.text}` } }),
    view: (state) => textInput({ meta: { accessibleName: "Text input" },
      id: 'field',
      presentation: { value: state.value, cursor: 0 },
      onAction: (action) => ({ text: action.kind === 'edit' && action.operation.kind === 'insert' ? action.operation.text : '' })
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
    init: () => ({ state: ({ value: '' }) }),
    update: (_state, message) => ({ state: { value: message.text } }),
    view: (state) => textInput({ meta: { accessibleName: "Text input" },
      id: 'field',
      presentation: { value: state.value, cursor: 0 },
      keys: { space: () => ({ text: 'space-key' }) },
      onAction: (action) => ({ text: action.kind === 'edit' && action.operation.kind === 'insert' ? action.operation.text : '' })
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
    init: () => ({ state: ({ value: '' }) }),
    update: (state, message) => ({ state: { value: `${state.value}${message.text}` } }),
    view: (state) => textInput({ meta: { accessibleName: "Text input" },
      id: 'pipeline-field',
      presentation: { value: state.value, cursor: 0 },
      onAction: (action) => ({
        text: action.kind === 'edit' && action.operation.kind === 'insert'
          ? action.operation.text
          : ''
      })
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

test('character bindings isolate bound graphemes and retain unmatched text runs', async () => {
  const app = defineTui({
    id: 'bounded-character-routing',
    init: () => ({ state: ({ actions: [] }) }),
    inputBindings: [{
      id: 'quit',
      phase: 'beforeFocus',
      triggers: [{ kind: 'text', text: 'q' }],
      message: { kind: 'shortcut', text: 'q' }
    }],
    update: (state, message) => ({ state: { actions: [...state.actions, message] } }),
    view: () => textInput({ meta: { accessibleName: "Text input" },
      id: 'field',
      presentation: { value: '', cursor: 0 },
      onAction: (action) =>
        action.kind === 'edit' && action.operation.kind === 'insert'
          ? { kind: 'insert', text: action.operation.text }
          : ignoreMessage()
    })
  });
  const runtime = createTuiRuntime({
    app,
    host: createMemoryTerminalHost({ terminalSize: { columns: 24, rows: 3 } })
  });

  await runtime.start();
  const batch = await runtime.handleInputChunk({ data: 'abqcd' });

  assert.equal(batch.results.length, 3);
  assert.deepEqual(runtime.state().actions, [
    { kind: 'insert', text: 'ab' },
    { kind: 'shortcut', text: 'q' },
    { kind: 'insert', text: 'cd' }
  ]);
});

test('character routing applies the decode event budget before dispatch', async () => {
  const app = defineTui({
    id: 'character-routing-budget',
    init: () => ({ state: ({ actions: [] }) }),
    inputBindings: [{
      id: 'quit',
      triggers: [{ kind: 'text', text: 'q' }],
      message: { kind: 'shortcut' }
    }],
    update: (state, message) => ({ state: { actions: [...state.actions, message] } }),
    view: () => textInput({ meta: { accessibleName: "Text input" },
      id: 'field',
      presentation: { value: '', cursor: 0 },
      onAction: (action) =>
        action.kind === 'edit' && action.operation.kind === 'insert'
          ? { kind: 'insert', text: action.operation.text }
          : ignoreMessage()
    })
  });
  const runtime = createTuiRuntime({
    app,
    host: createMemoryTerminalHost({ terminalSize: { columns: 24, rows: 3 } }),
    input: { limits: { maxEventsPerBatch: 2 } }
  });

  await runtime.start();
  await assert.rejects(
    runtime.handleInputChunk({ data: 'aqb' }),
    (cause) => cause instanceof InputDecodeError && cause.code === 'event_batch_limit_exceeded'
  );
  assert.deepEqual(runtime.state(), { actions: [] });
  assert.equal(runtime.metrics().frameCommits, 1);
});

test('component code-point and physical-key triggers match unnamed keys', async () => {
  const app = defineTui({
    id: 'unnamed-component-key-triggers',
    init: () => ({ state: ({ actions: [] }) }),
    update: (state, message) => ({ state: { actions: [...state.actions, message] } }),
    view: () => testKeyInput({
      id: 'field',
      presentation: { value: '', cursor: 0 },
      keys: {
        triggers: [
          {
            trigger: { kind: 'codePoint', codePoint: 92, modifiers: { ctrl: true } },
            onKey: () => ({ kind: 'codePoint' })
          },
          {
            trigger: { kind: 'physicalKey', codePoint: 113 },
            onKey: () => ({ kind: 'physicalKey' })
          }
        ]
      }
    })
  });
  const runtime = createTuiRuntime({
    app,
    host: createMemoryTerminalHost({ terminalSize: { columns: 24, rows: 3 } })
  });

  await runtime.start();
  await runtime.handleInput({
    kind: 'key',
    key: 'unknown',
    keyCodePoint: 92,
    modifiers: { ctrl: true, alt: false, shift: false, meta: false },
    eventType: 'press',
    location: 'standard'
  });
  await runtime.handleInput({
    kind: 'key',
    key: 'unknown',
    keyCodePoint: 120,
    alternateCodePoints: { baseLayout: 113 },
    modifiers: { ctrl: false, alt: false, shift: false, meta: false },
    eventType: 'press',
    location: 'standard'
  });

  assert.deepEqual(runtime.state().actions, [
    { kind: 'codePoint' },
    { kind: 'physicalKey' }
  ]);
});

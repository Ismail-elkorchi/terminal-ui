import assert from 'node:assert/strict';
import test from 'node:test';

import {
  checkbox,
  commandInput,
  dataGrid,
  listbox,
  prepareCommandSuggestions,
  searchPicker,
  slider,
  tabs,
  text,
  textArea
} from '../../dist/components/index.js';
import { defineComponent, ignoreMessage } from '../../dist/component/index.js';
import type { TabCloseEvent } from '../../dist/components/index.js';
import { prepareSearchPickerIndex } from '../../dist/behavior/index.js';
import { createMemoryTerminalHost } from '../../dist/host/index.js';
import type { InputEvent } from '../../dist/input/index.js';
import { renderElementFrame } from '../../dist/renderer/index.js';
import { createTuiRuntime, defineTui } from '../../dist/tui/index.js';
import { prepareTextDocument, textCaretAt } from '../../dist/text/index.js';

void test('component construction and rendering do not execute event handlers', () => {
  let calls = 0;
  const message = () => {
    calls += 1;
    return { kind: 'event' };
  };
  const elements = [
    checkbox({ id: 'check', label: 'Check', checked: false, onAction: message }),
    slider({ id: 'slider', label: 'Value', value: 4, onAction: message }),
    listbox({ id: 'listbox', items: ['a'], projectItem: (item) => ({ id: item, label: item }), presentation: { activeId: 'a', selection: { mode: 'single', selectedId: 'a' } }, onTransition: message }),
    dataGrid({ id: 'grid', rows: ['a'], getRowId: (row) => row, presentation: { interaction: { kind: 'row',
    selectionMode: 'single' as const, activeRowId: 'a', selectedRowIds: ['a'] } }, onTransition: message }),
    textArea({ id: 'area', presentation: { document: prepareTextDocument('a'), caret: textCaretAt(0 )}, onAction: message }),
    commandInput({
      id: 'command',
      presentation: { value: 'a', cursor: 0, suggestions: prepareCommandSuggestions([]) },
      onTransition: message
    }),
    searchPicker({ id: 'searchPicker', presentation: { query: { text: '', mode: 'fuzzy' } }, searchPickerIndex: prepareSearchPickerIndex([{ id: 'a', label: 'A', value: 'a' }]), onTransition: message })
  ];

  for (const element of elements) renderElementFrame(element, { columns: 40, rows: 6 });

  assert.equal(calls, 0);
});

void test('component key handlers run at dispatch time with the normalized event and focus path', async () => {
  interface State {
    readonly value: string;
  }
  interface Message {
    readonly value: string;
  }
  const observed: { readonly input: InputEvent; readonly focusPath: readonly string[] }[] = [];
  interface FieldAction {
    readonly kind: 'enter';
    readonly event: { readonly input: InputEvent; readonly focusPath: readonly string[] };
  }
  const field = defineComponent<Record<never, never>, Record<never, never>, FieldAction>({
    name: 'terminal-ui-tests/components/deferred-key-field',
    identity: 'required',
    structure: 'leaf',
    semantics: 'semantic',
    accessibleRole: 'textbox',
    measure: () => ({ minWidth: 1, minHeight: 1, preferredWidth: 1, preferredHeight: 1 }),
    render: () => undefined,
    focusTargets: ({ bounds }) => [{ id: 'self', bounds }],
    keys: () => ({ enter: (event) => ({ kind: 'enter', event }) }),
    accessibility: ({ id, focused }) => ({
      id,
      role: 'textbox',
      label: 'Field',
      ...(focused ? { focused } : {})
    })
  });
  const app = defineTui<State, Message>({
    id: 'deferred-component-key',
    init: () => ({ value: 'idle' }),
    update: (_state, message) => ({ state: { value: message.value } }),
    view: () => {
      return field({
        id: 'field',
        onAction: (action) => {
          observed.push(action.event);
          return { value: 'handled' };
        }
      });
    }
  });
  const runtime = createTuiRuntime({
    app,
    host: createMemoryTerminalHost({ terminalSize: { columns: 24, rows: 3 } })
  });

  await runtime.start();
  assert.equal(observed.length, 0);
  await runtime.handleInput({
    kind: 'key',
    key: 'enter',
    modifiers: { ctrl: false, alt: false, shift: false, meta: false },
    eventType: 'press',
    location: 'standard'
  });

  assert.equal(observed.length, 1);
  assert.equal(observed[0]?.input.kind, 'key');
  assert.deepEqual(observed[0].focusPath, ['field']);
  assert.deepEqual(runtime.state(), { value: 'handled' });
  await runtime.dispose();
});

void test('tabs route delete to the selected close action without selecting twice', async () => {
  interface State {
    readonly selected: string;
  }
  interface Message {
    readonly kind: 'tabs';
    readonly action: TabCloseEvent;
  }
  const messages: Message[] = [];
  const app = defineTui<State, Message>({
    id: 'tabs-close-contract',
    init: () => ({ selected: 'second' }),
    update: (state, message) => {
      messages.push(message);
      return { state };
    },
    view: (state) => tabs({
      id: 'tabs',
      presentation: { activeId: state.selected, selectedId: state.selected },
      tabs: [
        { id: 'first', label: 'First', panel: text({ content: 'First' }) },
        { id: 'second', label: 'Second', closable: true, panel: text({ content: 'Second' }) }
      ],
      onTransition: () => ignoreMessage(),
      onClose: (action) => ({ kind: 'tabs', action })
    })
  });
  const runtime = createTuiRuntime({
    app,
    host: createMemoryTerminalHost({ terminalSize: { columns: 24, rows: 4 } })
  });

  await runtime.start();
  await runtime.handleInput({ kind: 'key', key: 'delete', modifiers: { ctrl: false, alt: false, shift: false, meta: false }, eventType: 'press', location: 'standard' });

  assert.deepEqual(messages, [{ kind: 'tabs', action: { kind: 'close', id: 'second' } }]);
  await runtime.dispose();
});

void test('tabs do not consume keys handled by the selected panel', async () => {
  type Message =
    | { readonly kind: 'panel' }
    | { readonly kind: 'tabs'; readonly action: import('../../dist/components/index.js').TabsTransition };
  const messages: Message[] = [];
  const focusPanel = defineComponent({
    identity: 'required',
    structure: 'leaf',
    semantics: 'semantic',
    accessibleRole: 'document',
    name: 'terminal-ui-tests/components/focusPanel',
    parts: [],
    measure: () => ({
      minWidth: 0,
      minHeight: 0,
      preferredWidth: 1,
      preferredHeight: 1
    }),
    render() {},
    accessibility: ({ id, focusedTargetId }) => ({
      id,
      role: 'document',
      label: 'Panel',
      ...(focusedTargetId === 'action' ? { focused: true } : {})
    }),
    focusTargets: ({ bounds }) => [{ id: 'action', bounds }]
  });
  const app = defineTui<undefined, Message>({
    id: 'tabs-panel-keys',
    init: () => undefined,
    update: (state, message) => {
      messages.push(message);
      return { state };
    },
    view: () => tabs({
      id: 'tabs',
      presentation: { activeId: 'current', selectedId: 'current' },
      tabs: [{
        id: 'current',
        label: 'Current',
        panel: focusPanel({ id: 'panel' })
      }],
      onTransition: (action) => ({ kind: 'tabs', action })
    }),
    inputBindings: [{
      id: 'panel-enter',
      phase: 'afterFocus',
      triggers: [{ kind: 'key', key: 'enter' }],
      message: { kind: 'panel' }
    }]
  });
  const runtime = createTuiRuntime({
    app,
    host: createMemoryTerminalHost({ terminalSize: { columns: 24, rows: 4 } }),
    initialFocus: { kind: 'elementTarget', elementId: 'panel', targetId: 'action' }
  });

  await runtime.start();
  await runtime.handleInput({
    kind: 'key',
    key: 'enter',
    modifiers: { ctrl: false, alt: false, shift: false, meta: false },
    eventType: 'press',
    location: 'standard'
  });

  assert.deepEqual(messages, [{ kind: 'panel' }]);
  await runtime.dispose();
});

void test('checkbox keyboard and pointer activation evaluate the same handler at interaction time', async () => {
  interface State {
    readonly checked: boolean;
  }
  interface Message {
    readonly checked: boolean;
  }
  const actionKinds: string[] = [];
  const app = defineTui<State, Message>({
    id: 'deferred-checkbox',
    init: () => ({ checked: false }),
    update: (_state, message) => ({ state: { checked: message.checked } }),
    view: (state) => checkbox({
      id: 'check',
      label: 'Check',
      checked: state.checked,
      onAction: (action) => {
        actionKinds.push(action.kind);
        return { checked: action.checked };
      }
    })
  });
  const host = createMemoryTerminalHost({ terminalSize: { columns: 24, rows: 3 } });
  const runtime = createTuiRuntime({ app, host, input: { mouseReporting: 'drag' } });

  await runtime.start();
  assert.deepEqual(actionKinds, []);
  await runtime.handleInput({ kind: 'key', key: 'enter', modifiers: { ctrl: false, alt: false, shift: false, meta: false }, eventType: 'press', location: 'standard' });
  assert.deepEqual(actionKinds, ['change']);
  assert.equal(runtime.state().checked, true);
  await runtime.handleInputChunk({ data: '\u001B[<0;1;1M\u001B[<0;1;1m' });
  assert.equal(actionKinds.filter((kind) => kind === 'change').length, 2);
  assert.equal(actionKinds.filter((kind) => kind === 'pointer').length, 0);
  assert.equal(runtime.state().checked, false);
  await runtime.dispose();
});

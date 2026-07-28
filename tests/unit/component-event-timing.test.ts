import assert from 'node:assert/strict';
import test from 'node:test';

import {
  checkbox,
  commandInput,
  list,
  searchPicker,
  slider,
  table,
  tabs,
  text,
  textArea,
  textInput
} from '../../dist/components/index.js';
import { custom } from '../../dist/component/index.js';
import type { TabAction } from '../../dist/components/index.js';
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
    checkbox({ id: 'check', label: 'Check', checked: false, onChange: message }),
    slider({ id: 'slider', value: 4, onChange: message }),
    list({ id: 'list', items: ['a'], projectItem: (item) => ({ id: item, label: item }), selectedId: 'a', onAction: message }),
    table({ id: 'table', rows: ['a'], getRowId: (row) => row, presentation: { selectedRowId: 'a' }, onAction: message }),
    textArea({ id: 'area', presentation: { document: prepareTextDocument('a'), caret: textCaretAt(0 )}, onAction: message }),
    commandInput({ id: 'command', presentation: { value: 'a', cursor: 0, suggestions: [] }, onAction: message }),
    searchPicker({ id: 'searchPicker', searchPickerIndex: prepareSearchPickerIndex([{ id: 'a', label: 'A', value: 'a' }]), onAction: message })
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
  const app = defineTui<State, Message>({
    id: 'deferred-component-key',
    init: () => ({ value: 'idle' }),
    update: (_state, message) => ({ state: { value: message.value } }),
    view: (state) => {
      const onEnter = (event: { readonly input: InputEvent; readonly focusPath: readonly string[] }): Message => {
        observed.push(event);
        return { value: 'handled' };
      };
      return textInput<
        never,
        never,
        never,
        { readonly enter: typeof onEnter }
      >({
        id: 'field',
        presentation: { value: state.value, cursor: 0 },
        keys: { enter: onEnter }
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
    readonly action: TabAction;
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
      selected: state.selected,
      tabs: [
        { id: 'first', label: 'First', panel: text('First') },
        { id: 'second', label: 'Second', closable: true, panel: text('Second') }
      ],
      onAction: (action) => ({ kind: 'tabs', action })
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
    | { readonly kind: 'tabs'; readonly action: TabAction };
  const messages: Message[] = [];
  const app = defineTui<undefined, Message>({
    id: 'tabs-panel-keys',
    init: () => undefined,
    update: (state, message) => {
      messages.push(message);
      return { state };
    },
    view: () => tabs({
      id: 'tabs',
      selected: 'current',
      tabs: [{
        id: 'current',
        label: 'Current',
        panel: custom({
          id: 'panel',
          renderer: {
            render() {},
            accessibility: ({ id }) => ({ id, role: 'document', label: 'Panel' }),
            focusTargets: ({ bounds }) => [{ id: 'action', bounds }]
          }
        })
      }],
      onAction: (action) => ({ kind: 'tabs', action })
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
  let calls = 0;
  const app = defineTui<State, Message>({
    id: 'deferred-checkbox',
    init: () => ({ checked: false }),
    update: (_state, message) => ({ state: { checked: message.checked } }),
    view: (state) => checkbox({
      id: 'check',
      label: 'Check',
      checked: state.checked,
      onChange: (checked) => {
        calls += 1;
        return { checked };
      }
    })
  });
  const host = createMemoryTerminalHost({ terminalSize: { columns: 24, rows: 3 } });
  const runtime = createTuiRuntime({ app, host });

  await runtime.start();
  assert.equal(calls, 0);
  await runtime.handleInput({ kind: 'key', key: 'enter', modifiers: { ctrl: false, alt: false, shift: false, meta: false }, eventType: 'press', location: 'standard' });
  assert.equal(calls, 1);
  assert.equal(runtime.state().checked, true);
  await runtime.handleInputChunk({ data: '\u001B[<0;1;1M\u001B[<0;1;1m' });
  assert.equal(calls, 2);
  assert.equal(runtime.state().checked, false);
  await runtime.dispose();
});

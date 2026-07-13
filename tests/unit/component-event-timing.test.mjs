import assert from 'node:assert/strict';
import test from 'node:test';

import {
  checkbox,
  commandInput,
  list,
  palette,
  slider,
  table,
  textArea,
  textInput
} from '../../dist/components/index.js';
import { createMemoryTerminalHost } from '../../dist/host/index.js';
import { renderElementFrame } from '../../dist/renderer/index.js';
import { createTuiRuntime, defineTui } from '../../dist/tui/index.js';

test('component construction and rendering do not execute event handlers', () => {
  let calls = 0;
  const message = () => {
    calls += 1;
    return { kind: 'event' };
  };
  const elements = [
    checkbox({ id: 'check', label: 'Check', checked: false, onChange: message }),
    slider({ id: 'slider', value: 4, onChange: message }),
    list({ id: 'list', items: ['a'], getItemId: (item) => item, selectedId: 'a', onAction: message }),
    table({ id: 'table', rows: ['a'], getRowId: (row) => row, selectedRowId: 'a', onAction: message }),
    textArea({ id: 'area', value: 'a', onEdit: message }),
    commandInput({ id: 'command', value: 'a', onAction: message }),
    palette({ id: 'palette', entries: [{ id: 'a', label: 'A', value: 'a' }], onAction: message })
  ];

  for (const element of elements) renderElementFrame(element, { columns: 40, rows: 6 });

  assert.equal(calls, 0);
});

test('component key handlers run at dispatch time with the normalized event and focus path', async () => {
  const observed = [];
  const app = defineTui({
    id: 'deferred-component-key',
    init: () => ({ value: 'idle' }),
    update: (_state, message) => ({ state: { value: message.value } }),
    view: (state) => textInput({
      id: 'field',
      value: state.value,
      keys: {
        enter: (event) => {
          observed.push(event);
          return { value: 'handled' };
        }
      }
    })
  });
  const runtime = createTuiRuntime({
    app,
    host: createMemoryTerminalHost({ viewport: { columns: 24, rows: 3 } })
  });

  await runtime.start();
  assert.deepEqual(observed, []);
  await runtime.handleInput({
    kind: 'key',
    key: 'enter',
    ctrl: false,
    alt: false,
    shift: false,
    meta: false
  });

  assert.equal(observed.length, 1);
  assert.equal(observed[0]?.input.kind, 'key');
  assert.deepEqual(observed[0]?.focusPath, ['field']);
  assert.deepEqual(runtime.getState(), { value: 'handled' });
  await runtime.dispose();
});

test('checkbox keyboard and pointer activation evaluate the same handler at interaction time', async () => {
  let calls = 0;
  const app = defineTui({
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
  const host = createMemoryTerminalHost({ viewport: { columns: 24, rows: 3 } });
  const runtime = createTuiRuntime({ app, host });

  await runtime.start();
  assert.equal(calls, 0);
  await runtime.handleInput({ kind: 'key', key: 'enter', ctrl: false, alt: false, shift: false, meta: false });
  assert.equal(calls, 1);
  assert.equal(runtime.getState()?.checked, true);
  await runtime.handleInputChunk({ data: '\u001B[<0;1;1M\u001B[<0;1;1m' });
  assert.equal(calls, 2);
  assert.equal(runtime.getState()?.checked, false);
  await runtime.dispose();
});

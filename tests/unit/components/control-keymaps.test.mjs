import { createListboxFixture } from '../../support/collection-fixtures.mjs';
import { createTableCollection } from '../../../dist/behavior/index.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createListboxKeymap, createTreeKeymap, createSearchPickerKeymap,
  createTextInputKeymap, createTextAreaKeymap, createDataGridKeymap,
  controlKeymapHelp, textInput, passwordInput, textArea, listbox, tree, searchPicker, dataGrid,
} from '../../../dist/index.js';
import { createTuiRuntime, defineTui } from '../../../dist/tui/index.js';
import { createMemoryTerminalHost } from '../../../dist/host/index.js';
import { column } from '../../../dist/layout/index.js';
import { createTreeView, querySearchPickerIndex, createTreeSource, createSearchPickerIndex, createSearchPickerState, searchPickerView } from '../../../dist/behavior/index.js';
import { createTextDocument, textCaretAt } from '../../../dist/text/index.js';

const key = (name, modifiers = {}) => ({ kind: 'key', key: name, modifiers });
const event = (name, modifiers = {}, extra = {}) => ({
  ...key(name, { ctrl: false, alt: false, shift: false, meta: false, ...modifiers }),
  eventType: 'press', location: 'standard', ...extra,
});

async function session(view) {
  const messages = [];
  const runtime = createTuiRuntime({
    host: createMemoryTerminalHost({ terminalSize: { columns: 50, rows: 20 } }),
    app: defineTui({
      init: () => ({ state: 0 }),
      update: (state, message) => { messages.push(message); return { state }; },
      view,
    }),
  });
  await runtime.start();
  return { runtime, messages };
}

test('keymaps own overrides, preserve omitted defaults, disable explicitly, and derive exact help', () => {
  const trigger = key('j');
  const overrides = { next: [trigger], select: null };
  const map = createListboxKeymap(overrides);
  trigger.key = 'x';
  overrides.next.push(key('k'));
  assert.deepEqual(controlKeymapHelp(map, ['next']), [{ binding: key('j', {}), label: 'Next item' }]);
  assert.equal(map.bindings.some((entry) => entry.action === 'select'), false);
  assert.equal(map.bindings.some((entry) => entry.action === 'previous' && entry.binding.key === 'arrowUp'), true);
  assert.equal(map.bindings.some((entry) => entry.action === 'next' && entry.binding.key === 'arrowDown'), false);
  assert.equal(Object.isFrozen(map), true);
  assert.equal(Object.isFrozen(map.bindings), true);
  assert.equal(Object.isFrozen(map.bindings[0].binding.modifiers), true);
  assert.equal(controlKeymapHelp(createTextInputKeymap(), ['moveLeft']).length, 1);
});

test('keymap mistakes and ambiguous chords fail before an app starts', () => {
  assert.throws(() => createListboxKeymap({ typo: [key('j')] }), /Unknown.*action/u);
  assert.throws(() => createListboxKeymap({ next: undefined }), /array or null/u);
  assert.throws(() => createListboxKeymap({ next: [key('arrowUp')] }), /Conflicting/u);
  assert.throws(() => createListboxKeymap({ next: [key('j'), key('j')] }), /Conflicting/u);
  assert.throws(() => createListboxKeymap({ next: [key('j', { kind: 'any' })], previous: [key('j', { ctrl: true })] }), /Conflicting/u);
  assert.throws(() => createListboxKeymap({ next: [key('j')], previous: [{ ...key('j'), location: 'numpad' }] }), /Conflicting/u);
  assert.throws(() => createListboxKeymap({ next: [{ ...key('j'), eventType: 'release' }] }), /press or repeat/u);
  assert.throws(() => createListboxKeymap({ next: [{ kind: 'text', text: 'j' }] }), /keyboard/u);
  assert.doesNotThrow(() => createListboxKeymap({ next: [key('j')], previous: [key('j', { ctrl: true })] }));
  assert.throws(() => textInput({ meta: { accessibleName: 'Test control' }, id: 'field', state: { text: '', cursor: 0 }, keymap: createListboxKeymap(), onTransition: (value) => value }), /action vocabulary/u);
});

test('listbox remaps only focused control; neighboring editor keeps printable input', async () => {
  const keymap = createListboxKeymap({ next: [key('j')], previous: null });
  const { runtime, messages } = await session(() => column([
    listbox({ meta: { accessibleName: 'Test control' }, id: 'list', keymap, ...createListboxFixture(['one', 'two'], (value) => ({ id: value, label: value, value })),
      state: { activeId: 'one', selection: { mode: 'none' } }, onTransition: (value) => ({ list: value }) }),
    textInput({ meta: { accessibleName: 'Test control' }, id: 'editor', state: { text: '', cursor: 0 }, onTransition: (value) => ({ editor: value }) }),
  ]));
  try {
    await runtime.handleInputChunk({ data: 'j' });
    assert.deepEqual(messages, [{ list: { kind: 'moveActive', delta: 1 } }]);
    await runtime.handleInput(event('arrowDown'));
    await runtime.handleInput(event('arrowUp'));
    assert.equal(messages.length, 1);
    await runtime.handleInput(event('tab'));
    await runtime.handleInputChunk({ data: 'j' });
    assert.deepEqual(messages.at(-1), { editor: { kind: 'edit', operation: { kind: 'insert', text: 'j' } } });
  } finally { await runtime.dispose(); }
});

for (const factory of [textInput, passwordInput]) test(`${factory.name} preserves modifiers and read-only action gates`, async () => {
  const keymap = createTextInputKeymap({ moveHome: [key('a', { ctrl: true })], selectAll: null,
    deleteBackward: [key('w', { ctrl: true })], submit: [key('s', { ctrl: true })] });
  const { runtime, messages } = await session(() => factory({ meta: { accessibleName: 'Test control' }, id: 'field', keymap, readOnly: true,
    state: { text: 'hello', cursor: 3 }, onTransition: (value) => value, onSubmit: (value) => value }));
  try {
    await runtime.handleInput(event('a', { ctrl: true }));
    assert.deepEqual(messages, [{ kind: 'edit', operation: { kind: 'moveHome' } }]);
    await runtime.handleInput(event('a', { ctrl: true, shift: true }));
    await runtime.handleInput(event('w', { ctrl: true }));
    await runtime.handleInput(event('s', { ctrl: true }));
    await runtime.handleInput(event('a', { ctrl: true }, { eventType: 'release' }));
    assert.equal(messages.length, 1);
  } finally { await runtime.dispose(); }
});

test('text area remapping keeps visual wrapped navigation and editing/history semantics', async () => {
  const document = createTextDocument('one\ntwo');
  const keymap = createTextAreaKeymap({ moveLineDown: [key('n', { ctrl: true })],
    newline: null, undo: [key('u', { ctrl: true })] });
  const { runtime, messages } = await session(() => textArea({ meta: { accessibleName: 'Test control' }, id: 'notes', keymap,
    state: { document, caret: textCaretAt(1) }, onTransition: (value) => value }));
  try {
    await runtime.handleInput(event('n', { ctrl: true }));
    assert.equal(messages[0].operation.kind, 'moveTo');
    assert.equal(messages[0].operation.caret.position.offset, 5);
    await runtime.handleInput(event('enter'));
    assert.equal(messages.length, 1);
    await runtime.handleInput(event('u', { ctrl: true }));
    assert.deepEqual(messages.at(-1), { kind: 'undo' });
  } finally { await runtime.dispose(); }
});

test('tree and search picker resolve reused keymaps into existing domain transitions', async () => {
  const source = createTreeSource([{ meta: { accessibleName: 'Test control' }, id: 'root', label: 'Root', kind: 'branch', children: [{ meta: { accessibleName: 'Test control' }, id: 'child', label: 'Child', kind: 'leaf' }] }]);
  const treeState = { expandedIds: [], activeId: 'root', selection: { mode: 'none' } };
  const treeView = createTreeView(source, treeState);
  const treeSession = await session(() => tree({ meta: { accessibleName: 'Test control' }, id: 'tree', source,
    state: treeState, view: treeView,
    keymap: createTreeKeymap({ expand: [key('l')] }), onTransition: (value) => value }));
  try {
    await treeSession.runtime.handleInputChunk({ data: 'l' });
    assert.deepEqual(treeSession.messages, [{ kind: 'expand', id: 'root' }]);
  } finally { await treeSession.runtime.dispose(); }
  const index = createSearchPickerIndex([{ meta: { accessibleName: 'Test control' }, id: 'one', label: 'One', value: 1 }, { meta: { accessibleName: 'Test control' }, id: 'two', label: 'Two', value: 2 }]);
  const queryResult = querySearchPickerIndex(index, { text: '', mode: 'fuzzy' });
  const state = createSearchPickerState({ query: { text: '', mode: 'fuzzy' }, queryResult }, index);
  const picker = await session(() => searchPicker({ meta: { accessibleName: 'Test control' }, id: 'picker', searchPickerIndex: index, queryResult,
    view: searchPickerView(state), keymap: createSearchPickerKeymap({ next: [key('n', { ctrl: true })] }),
    onTransition: (value) => value }));
  try {
    await picker.runtime.handleInput(event('n', { ctrl: true }));
    assert.deepEqual(picker.messages, [{ kind: 'moveActive', delta: 1 }]);
    await picker.runtime.handleInputChunk({ data: 'n' });
    assert.deepEqual(picker.messages.at(-1), { kind: 'edit', operation: { kind: 'insert', text: 'n' } });
  } finally { await picker.runtime.dispose(); }
});

test('data grid configurable keys preserve row mode and sort/resize eligibility', async () => {
  const { runtime, messages } = await session(() => dataGrid({ meta: { accessibleName: 'Test control' }, id: 'grid', collection: createTableCollection([{ meta: { accessibleName: 'Test control' }, id: 'one', value: 1 }], (row) => row.id),
     columns: [{ meta: { accessibleName: 'Test control' }, id: 'value', value: (row) => row.value }],
    state: { interaction: { kind: 'row', activeRowId: 'one', selection: { mode: 'none' } } },
    keymap: createDataGridKeymap({ nextRow: [key('j')], sort: [key('s')], nextColumn: [key('l')] }),
    onTransition: (value) => value }));
  try {
    await runtime.handleInputChunk({ data: 'j' });
    assert.deepEqual(messages, [{ kind: 'moveRow', delta: 1 }]);
    await runtime.handleInputChunk({ data: 'sl' });
    assert.equal(messages.length, 1);
  } finally { await runtime.dispose(); }
});

test('remapped editing keys distinguish paste from shortcuts and opt into repeat explicitly', async () => {
  const keymap = createTextInputKeymap({ moveLeft: [key('h'), { ...key('h'), eventType: 'repeat' }] });
  const { runtime, messages } = await session(() => textInput({ meta: { accessibleName: 'Editor' },
    id: 'field', keymap, state: { text: 'abc', cursor: 2 }, onTransition: (value) => value }));
  try {
    await runtime.handleInputChunk({ data: 'h' });
    await runtime.handleInput(event('h', {}, { eventType: 'repeat' }));
    await runtime.handleInput({ kind: 'paste', text: 'h', bracketed: true });
    assert.deepEqual(messages, [
      { kind: 'edit', operation: { kind: 'moveLeft' } },
      { kind: 'edit', operation: { kind: 'moveLeft' } },
      { kind: 'edit', operation: { kind: 'insert', text: 'h' } },
    ]);
  } finally { await runtime.dispose(); }
});

for (const state of [{ disabled: true }, { busy: true }, { inert: true }]) {
  test(`custom listbox keys preserve ${Object.keys(state)[0]} gating`, async () => {
    const { runtime, messages } = await session(() => listbox({ meta: { accessibleName: 'List' },
      id: 'list', ...state, ...createListboxFixture(['one'], (value) => ({ id: value, label: value })),
      keymap: createListboxKeymap({ next: [key('j')] }), state: { selection: { mode: 'none' } },
      onTransition: (value) => value }));
    try {
      await runtime.handleInputChunk({ data: 'j' });
      assert.deepEqual(messages, []);
    } finally { await runtime.dispose(); }
  });
}

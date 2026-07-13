import assert from 'node:assert/strict';
import test from 'node:test';

import {
  checkboxGroupPresentation,
  checkboxGroupReducer,
  colorSwatchPickerReducer,
  dropdownMenuPresentation,
  dropdownMenuReducer,
  menuPresentation,
  menuReducer,
  radioGroupReducer,
  selectReducer,
  tabsPresentation,
  tabsReducer
} from '../../dist/behavior/index.js';
const choices = [
  { id: 'alpha', label: 'Alpha', value: 1 },
  { id: 'disabled', label: 'Disabled', value: 2, disabled: true },
  { id: 'beta', label: 'Beta', value: 3 }
];

test('menu behavior owns selection, hierarchy projection, and activation state', () => {
  const items = [
    { id: 'file', label: 'File', children: [{ id: 'open', label: 'Open' }] },
    { id: 'disabled', label: 'Disabled', disabled: true }
  ];
  const opened = menuReducer({ expandedIds: [] }, { kind: 'activate', id: 'file' }, items);
  const selected = menuReducer(opened, { kind: 'move', delta: 1 }, items);
  const projection = menuPresentation(items, selected);

  assert.deepEqual(opened.expandedIds, ['file']);
  assert.equal(selected.selected, 'file');
  assert.equal(projection.items[0]?.expanded, true);
  assert.equal(menuReducer(selected, { kind: 'select', id: 'disabled' }, items), selected);
});

test('dropdownMenu behavior separates highlighted and committed choices', () => {
  const opened = dropdownMenuReducer({ kind: 'closed', selected: 'alpha' }, { kind: 'open' }, choices);
  const moved = dropdownMenuReducer(opened, { kind: 'move', delta: 1 }, choices);
  const committed = dropdownMenuReducer(moved, { kind: 'activate', id: moved.highlighted }, choices);

  assert.equal(opened.highlighted, 'alpha');
  assert.equal(moved.highlighted, 'beta');
  assert.deepEqual(dropdownMenuPresentation(committed), { kind: 'closed', selected: 'beta' });
});

test('tabs behavior skips disabled tabs and leaves close ownership with the app', () => {
  const items = [
    { id: 'one' },
    { id: 'two', disabled: true },
    { id: 'three' }
  ];
  const moved = tabsReducer({ selected: 'one' }, { kind: 'move', delta: 1 }, items);

  assert.deepEqual(tabsPresentation(moved), { selected: 'three' });
  assert.equal(tabsReducer(moved, { kind: 'close', id: 'three' }, items), moved);
});

test('choice controls keep distinct action semantics while sharing item foundations', () => {
  const checked = checkboxGroupReducer({ selected: ['alpha'] }, { kind: 'toggle', id: 'beta' }, choices);
  const radio = radioGroupReducer({}, { kind: 'select', id: 'beta' }, choices);
  const selected = selectReducer({}, { kind: 'move', delta: 1 }, choices);
  const color = colorSwatchPickerReducer({}, { kind: 'select', id: 'beta' }, choices);

  assert.deepEqual(checkboxGroupPresentation(checked), { selected: ['alpha', 'beta'], focused: 'beta' });
  assert.deepEqual(radio, { selected: 'beta', focused: 'beta' });
  assert.deepEqual(selected, { focused: 'alpha' });
  assert.deepEqual(color, { selected: 'beta', focused: 'beta' });
});

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  checkboxGroupPresentation,
  checkboxGroupReducer,
  colorSwatchPickerPresentation,
  colorSwatchPickerReducer,
  dropdownMenuPresentation,
  dropdownMenuReducer,
  menuPresentation,
  menuReducer,
  radioGroupReducer,
  radioGroupPresentation,
  selectPresentation,
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
    { kind: 'submenu', id: 'file', label: 'File', children: [{ kind: 'action', id: 'open', label: 'Open' }] },
    { kind: 'action', id: 'disabled', label: 'Disabled', disabled: true }
  ];
  const entered = menuReducer({ activePath: ['file'] }, { kind: 'enter' }, items);
  const returned = menuReducer(entered, { kind: 'back' }, items);
  const projection = menuPresentation(items, entered);

  assert.deepEqual(entered.activePath, ['file', 'open']);
  assert.deepEqual(returned.activePath, ['file']);
  assert.equal(projection.items[0]?.expanded, true);
  assert.equal(menuReducer(returned, { kind: 'focus', id: 'disabled' }, items), returned);
});

test('dropdownMenu behavior separates popup navigation from committed action', () => {
  const actions = choices.map(({ id, label, disabled }) => ({ id, label, disabled, kind: 'action' }));
  const opened = dropdownMenuReducer({ kind: 'closed', active: 'alpha' }, { kind: 'open' }, actions);
  const moved = dropdownMenuReducer(opened, { kind: 'menu', action: { kind: 'move', delta: 1 } }, actions);
  const committed = dropdownMenuReducer(moved, { kind: 'menu', action: { kind: 'activate', id: 'beta' } }, actions);

  assert.deepEqual(opened.kind === 'open' ? opened.menu.activePath : [], ['alpha']);
  assert.deepEqual(moved.kind === 'open' ? moved.menu.activePath : [], ['beta']);
  assert.deepEqual(dropdownMenuPresentation(actions, committed), { kind: 'closed', active: 'beta' });
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
  const selected = selectReducer({ kind: 'closed' }, { kind: 'move', delta: 1 }, choices);
  const color = colorSwatchPickerReducer({}, { kind: 'select', id: 'beta' }, choices);

  assert.deepEqual(checkboxGroupPresentation(checked, choices), { selected: ['alpha', 'beta'], focused: 'beta' });
  assert.deepEqual(radio, { selected: 'beta', focused: 'beta' });
  assert.deepEqual(selected, { kind: 'open', highlighted: 'alpha' });
  assert.deepEqual(color, { selected: 'beta', focused: 'beta' });
});

test('choice presentations normalize dynamic option changes deterministically', () => {
  const changed = [
    { id: 'beta', label: 'Beta', value: 3 },
    { id: 'alpha', label: 'Alpha', value: 1, disabled: true },
    { id: 'gamma', label: 'Gamma', value: 4 }
  ];

  assert.deepEqual(
    checkboxGroupPresentation({ selected: ['missing', 'beta', 'beta', 'alpha'], focused: 'alpha' }, changed),
    { selected: ['beta'] }
  );
  assert.deepEqual(
    radioGroupPresentation({ selected: 'alpha', focused: 'missing' }, changed),
    {}
  );
  assert.deepEqual(
    colorSwatchPickerPresentation({ selected: 'beta', focused: 'alpha' }, changed),
    { selected: 'beta' }
  );
  assert.deepEqual(
    selectPresentation({ kind: 'open', selected: 'missing', highlighted: 'alpha' }, changed),
    { kind: 'open', highlighted: 'beta' }
  );
});

test('choice behavior rejects duplicate option identities at its boundary', () => {
  const duplicate = [choices[0], choices[0]];

  assert.throws(
    () => checkboxGroupPresentation({ selected: [] }, duplicate),
    /ids must be unique/u
  );
  assert.throws(
    () => selectPresentation({ kind: 'closed' }, duplicate),
    /ids must be unique/u
  );
});

test('select keeps highlight separate from committed selection and dismisses without committing', () => {
  const opened = selectReducer({ kind: 'closed', selected: 'alpha' }, { kind: 'open' }, choices);
  const moved = selectReducer(opened, { kind: 'move', delta: 1 }, choices);
  const dismissed = selectReducer(moved, { kind: 'dismiss', reason: 'escape' }, choices);
  const committed = selectReducer(moved, { kind: 'commit', id: 'beta' }, choices);

  assert.deepEqual(opened, { kind: 'open', selected: 'alpha', highlighted: 'alpha' });
  assert.deepEqual(moved, { kind: 'open', selected: 'alpha', highlighted: 'beta' });
  assert.deepEqual(dismissed, { kind: 'closed', selected: 'alpha' });
  assert.deepEqual(committed, { kind: 'closed', selected: 'beta' });
});

test('select never highlights or commits disabled options', () => {
  const opened = selectReducer({ kind: 'closed' }, { kind: 'open' }, choices);

  assert.equal(selectReducer(opened, { kind: 'highlight', id: 'disabled' }, choices), opened);
  assert.equal(selectReducer(opened, { kind: 'commit', id: 'disabled' }, choices), opened);
  assert.deepEqual(selectReducer(opened, { kind: 'last' }, choices), {
    kind: 'open',
    highlighted: 'beta'
  });
});

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  checkboxGroupPresentation,
  checkboxGroupReducer,
  colorSwatchPickerPresentation,
  colorSwatchPickerReducer,
  commitCombobox,
  comboboxReducer,
  menuPresentation,
  menuReducer,
  menuTriggerPresentation,
  menuTriggerReducer,
  radioGroupPresentation,
  radioGroupReducer,
  tabsReducer,
} from '../../dist/behavior/index.js';
import type { ChoiceItem, MenuItem } from '../../dist/components/index.js';

const choices = [
  { id: 'alpha', label: 'Alpha', value: 1 },
  { id: 'disabled', label: 'Disabled', value: 2, disabled: true },
  { id: 'beta', label: 'Beta', value: 3 },
] satisfies readonly ChoiceItem<number>[];

void test('menu behavior owns nested active position but not application activation', () => {
  const items = [
    { kind: 'submenu', id: 'file', label: 'File', children: [{ kind: 'action', id: 'open', label: 'Open' }] },
    { kind: 'separator', id: 'divider' },
    { kind: 'action', id: 'disabled', label: 'Disabled', disabled: true },
  ] satisfies readonly MenuItem[];
  const entered = menuReducer({ activePath: ['file'] }, { kind: 'enter' }, items);
  const returned = menuReducer(entered, { kind: 'back' }, items);
  const presentation = menuPresentation(items, entered);

  assert.deepEqual(entered.activePath, ['file', 'open']);
  assert.deepEqual(returned.activePath, ['file']);
  const fileItem = presentation.items[0];
  assert.equal(fileItem?.kind === 'submenu' ? fileItem.expanded : undefined, true);
  assert.equal(menuReducer(returned, { kind: 'setActive', id: 'disabled' }, items), returned);
});

void test('menu trigger reuses the menu foundation and keeps activation out of its reducer', () => {
  const items: readonly MenuItem[] = choices.map(({ id, label, disabled }) => ({
    id,
    label,
    kind: 'action',
    ...(disabled === undefined ? {} : { disabled }),
  }));
  const opened = menuTriggerReducer({ kind: 'closed', active: 'alpha' }, { kind: 'open' }, items);
  const moved = menuTriggerReducer(opened, {
    kind: 'menu',
    transition: { kind: 'move', delta: 1 },
  }, items);
  const dismissed = menuTriggerReducer(moved, { kind: 'dismiss', reason: 'escape' }, items);

  assert.deepEqual(opened.kind === 'open' ? opened.menu.activePath : [], ['alpha']);
  assert.deepEqual(moved.kind === 'open' ? moved.menu.activePath : [], ['beta']);
  assert.deepEqual(menuTriggerPresentation(items, dismissed), { kind: 'closed', active: 'alpha' });
});

void test('tabs support automatic and manual activation without conflating close events', () => {
  const tabs = [{ id: 'one' }, { id: 'two', disabled: true }, { id: 'three' }];
  const automatic = tabsReducer(
    { activeId: 'one', selectedId: 'one' },
    { kind: 'moveActive', delta: 1 },
    { tabs, activation: 'automatic' },
  );
  const manual = tabsReducer(
    { activeId: 'one', selectedId: 'one' },
    { kind: 'moveActive', delta: 1 },
    { tabs, activation: 'manual' },
  );
  const committed = tabsReducer(manual, { kind: 'selectActive' }, { tabs, activation: 'manual' });

  assert.deepEqual(automatic, { activeId: 'three', selectedId: 'three' });
  assert.deepEqual(manual, { activeId: 'three', selectedId: 'one' });
  assert.deepEqual(committed, { activeId: 'three', selectedId: 'three' });
});

void test('combobox focus and committed selection remain independent', () => {
  const initial = {
    open: false,
    interaction: { activeId: 'alpha', selection: { mode: 'single', selectedId: 'alpha' } },
  } as const;
  const opened = comboboxReducer(initial, { kind: 'open' }, { enabledIds: ['alpha', 'beta'] });
  const moved = comboboxReducer(opened, { kind: 'moveActive', delta: 1 }, { enabledIds: ['alpha', 'beta'] });
  const dismissed = comboboxReducer(moved, { kind: 'dismiss', reason: 'escape' }, { enabledIds: ['alpha', 'beta'] });

  assert.equal(moved.interaction.activeId, 'beta');
  assert.deepEqual(moved.interaction.selection, { mode: 'single', selectedId: 'alpha' });
  assert.equal(dismissed.open, false);
  assert.deepEqual(dismissed.interaction.selection, { mode: 'single', selectedId: 'alpha' });
});

void test('combobox page navigation preserves page intent and commitment closes the popup', () => {
  const enabledIds = ['one', 'two', 'three', 'four', 'five'];
  const initial = {
    open: true,
    interaction: { activeId: 'one', selection: { mode: 'single' as const } },
  };
  const paged = comboboxReducer(initial, { kind: 'pageActive', delta: 1 }, {
    enabledIds,
    pageSize: 3,
  });
  const committed = commitCombobox(paged, { kind: 'commit', id: 'four' }, { enabledIds });
  const ignored = commitCombobox(paged, { kind: 'commit', id: 'disabled' }, { enabledIds });

  assert.equal(paged.interaction.activeId, 'four');
  assert.deepEqual(paged.interaction.selection, { mode: 'single' });
  assert.deepEqual(committed, {
    open: false,
    interaction: {
      activeId: 'four',
      selection: { mode: 'single', selectedId: 'four' },
    },
  });
  assert.equal(ignored.open, true);
  assert.deepEqual(ignored.interaction.selection, { mode: 'single' });
});

void test('choice controls use active position and committed selection consistently', () => {
  const checked = checkboxGroupReducer(
    { activeId: 'alpha', selection: { mode: 'multiple', selectedIds: ['alpha'] } },
    { kind: 'toggleSelection', id: 'beta' },
    choices,
  );
  const emptySingle = { selection: { mode: 'single' as const } };
  const radio = radioGroupReducer(emptySingle, { kind: 'select', id: 'beta' }, choices);
  const color = colorSwatchPickerReducer(emptySingle, { kind: 'select', id: 'beta' }, choices);

  assert.deepEqual(checkboxGroupPresentation(checked, choices), {
    activeId: 'beta',
    selection: { mode: 'multiple', selectedIds: ['alpha', 'beta'], anchorId: 'beta' },
  });
  assert.deepEqual(radioGroupPresentation(radio, choices), {
    activeId: 'beta', selection: { mode: 'single', selectedId: 'beta' },
  });
  assert.deepEqual(colorSwatchPickerPresentation(color, choices), {
    activeId: 'beta', selection: { mode: 'single', selectedId: 'beta' },
  });
});

void test('choice presentations normalize replacement and reject duplicate identities', () => {
  const changed = [
    { id: 'beta', label: 'Beta', value: 3 },
    { id: 'alpha', label: 'Alpha', value: 1, disabled: true },
  ] satisfies readonly ChoiceItem<number>[];
  assert.deepEqual(
    checkboxGroupPresentation({
      activeId: 'alpha',
      selection: { mode: 'multiple', selectedIds: ['missing', 'beta', 'beta', 'alpha'] },
    }, changed),
    { selection: { mode: 'multiple', selectedIds: ['beta'] } },
  );
  assert.deepEqual(radioGroupPresentation({
    activeId: 'missing', selection: { mode: 'single', selectedId: 'alpha' },
  }, changed), { selection: { mode: 'single' } });
  const first = choices[0];
  assert.ok(first);
  assert.throws(() => checkboxGroupPresentation({
    selection: { mode: 'multiple', selectedIds: [] },
  }, [first, first]), /ids must be unique/u);
});

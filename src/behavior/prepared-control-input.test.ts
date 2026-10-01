import assert from 'node:assert/strict';
import test from 'node:test';
import { createSearchPickerIndex, searchPickerIndexStatistics } from './search-picker-index.ts';
import { createSearchPickerState, searchPickerView, searchPickerReducer } from './search-picker-operations.ts';
import type { TreeTransition } from './tree.ts';
import { createTreeSource } from './tree-operations.ts';
import { searchPicker } from '../components/search-picker/definition.ts';
import { tree } from '../components/tree/definition.ts';
import { renderElementFrame } from '../renderer/index.ts';

void test('live picker requires an explicit result and never evaluates a missing query', () => {
  const index = createSearchPickerIndex([{ id: 'one', label: 'One', value: 1 }]);
  assert.throws(() => createSearchPickerState({} as never, index), /query results/u);
  const state = createSearchPickerState({ queryResult: null }, index);
  const next = searchPickerReducer(state, { kind: 'setQuery', query: { text: 'One' } }, { searchPickerIndex: index, queryResult: null });
  const frame = renderElementFrame(searchPicker({ id: 'picker', title: 'Picker', searchPickerIndex: index, queryResult: null, view: searchPickerView(next), onTransition: value => value }), { columns: 30, rows: 8 });
  assert.match(JSON.stringify(frame.accessibility), /Results unavailable/u);
  assert.equal(searchPickerIndexStatistics(index).queryEvaluations, 0);
});

void test('live tree requires an explicit view and accepts pending projection without scanning', () => {
  const source = createTreeSource([{ id: 'one', label: 'One', kind: 'leaf' }]);
  const state = { expandedIds: [], selection: { mode: 'single' as const } };
  assert.throws(() => tree({ id: 'tree', meta: { accessibleName: 'Tree' }, source, state, onTransition: (value: TreeTransition) => value } as never), /tree view/u);
  const element = tree({ id: 'tree', meta: { accessibleName: 'Tree' }, source, state, view: null, onTransition: value => value });
  const frame = renderElementFrame(element, { columns: 30, rows: 8 });
  assert.equal(JSON.stringify(frame.accessibility).includes('One'), false);
  assert.match(JSON.stringify(frame.accessibility), /Tree not ready/u);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { searchPicker } from '../components/search-picker/definition.ts';
import { prepareRenderTree } from '../renderer/internal/prepare-render.ts';
import { toRenderNode } from '../renderer/internal/render-tree/element.ts';
import {
  createSearchPickerIndex,
  prepareSearchPickerQuery,
  searchPickerIndexStatistics,
} from './search-picker-index.ts';
import {
  createSearchPickerState,
  searchPickerReducer,
  searchPickerView,
  searchPickerWindow,
} from './search-picker-operations.ts';

void test('pending picker edits and stale results do not evaluate queries or expose stale activation', async () => {
  const index = createSearchPickerIndex(Array.from({ length: 2048 }, (_, i) => ({
    id: String(i), label: `Incident ${String(i)}`, value: i,
  })));
  const initial = createSearchPickerState({ queryResult: null }, index);
  const next = searchPickerReducer(initial, { kind: 'edit', operation: { kind: 'insert', text: 'Incident 1' } }, {
    searchPickerIndex: index, queryResult: null,
  });
  assert.equal(next.editor.input.text, 'Incident 1');
  assert.equal(next.editor.activeId, undefined);
  assert.equal(searchPickerIndexStatistics(index).queryEvaluations, 0);
  const result = await prepareSearchPickerQuery(index, { text: 'Incident 1', mode: 'fuzzy' }, {
    signal: new AbortController().signal, yield: () => Promise.resolve(),
  });
  const newest = searchPickerReducer(next, { kind: 'edit', operation: { kind: 'insert', text: '9' } }, {
    searchPickerIndex: index, queryResult: result,
  });
  const stale = searchPickerWindow({ searchPickerIndex: index, query: { text: newest.editor.input.text, mode: 'fuzzy' }, queryResult: result });
  assert.equal(stale.totalCount, 0);
  assert.equal(stale.activeEntry, undefined);
  assert.equal(searchPickerIndexStatistics(index).queryEvaluations, 1);
  const navigated = searchPickerReducer(newest, { kind: 'moveActive', delta: 1 }, { searchPickerIndex: index, queryResult: result });
  assert.equal(navigated.editor.activeId, undefined);
});

void test('default picker model defers cold query until cancellable render preparation', async () => {
  const index = createSearchPickerIndex(Array.from({ length: 4096 }, (_, i) => ({
    id: String(i), label: `Incident ${String(i)}`, value: i,
  })));
  const state = createSearchPickerState({ query: { text: 'Incident' }, queryResult: null }, index);
  const element = searchPicker({ id: 'picker', searchPickerIndex: index, view: searchPickerView(state), onTransition: () => ({ kind: 'change' }) });
  assert.equal(searchPickerIndexStatistics(index).queryEvaluations, 0);
  const controller = new AbortController();
  let yields = 0;
  await assert.rejects(prepareRenderTree(toRenderNode(element), {
    signal: controller.signal,
    yield: () => { yields += 1; controller.abort(new Error('new input')); return Promise.resolve(); },
  }), /new input/u);
  assert.equal(yields, 1);
  assert.equal(searchPickerIndexStatistics(index).cachedQueries, 0);
});

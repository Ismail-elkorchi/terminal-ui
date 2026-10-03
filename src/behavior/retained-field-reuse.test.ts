import assert from 'node:assert/strict';
import test from 'node:test';
import { finishWork } from '../foundation/cooperative-work.ts';
import { queryFieldSearchIndexWork } from '../text/query.ts';
import { createListboxCollection, readListboxSource, updateListboxCollection } from './listbox-source.ts';
import { createListboxView } from './listbox-view.ts';
import { createTreeSource, createTreeView, preparedTreeLabelMatch, treeSourceNodeById, updateTreeSource } from './tree-operations.ts';
import { createLogHistory, appendLogHistory, logHistoryEntryAt, logHistoryRecordMatches } from './log-history.ts';

void test('listbox joined field preserves cross-field phrases and reuses the original primary index', () => {
  const source = createListboxCollection([{ id: 'a', label: 'Álpha', description: 'béta', keywords: ['gámma'] }], value => value);
  const owner = readListboxSource(source).itemById('a');
  assert.ok(owner);
  const raw = finishWork(queryFieldSearchIndexWork(owner, 0, true));
  const combined = createListboxView(source, { query: { text: 'álpha béta', mode: 'contains' } });
  assert.equal(combined.count, 1);
  assert.equal(combined.entryAt(0)?.matches, undefined);
  const primary = createListboxView(source, { query: { text: 'ál', mode: 'prefix' } });
  assert.deepEqual(primary.entryAt(0)?.matches, [{ field: 'primary', fieldIndex: 0, start: 0, end: 2 }]);
  const next = updateListboxCollection(source, [{ kind: 'append', value: { id: 'b', label: 'other', description: '', keywords: [] }, option: { id: 'b', label: 'other' } }]);
  assert.equal(readListboxSource(next).itemById('a'), owner);
  assert.equal(finishWork(queryFieldSearchIndexWork(owner, 0, true)), raw);
  assert.equal(createListboxView(next, { query: { text: 'béta gámma', mode: 'contains' } }).entryAt(0)?.id, 'a');
});

void test('tree primary highlights remain independent of a better secondary winner and fields survive version updates', () => {
  const source = createTreeSource([{ id: 'a', kind: 'leaf', label: 'needle tail', description: 'needle' }]);
  const node = treeSourceNodeById(source, 'a');
  assert.ok(node);
  const raw = finishWork(queryFieldSearchIndexWork(node, 0, true));
  const state = { expandedIds: [], selection: { mode: 'none' as const }, query: { text: 'needle', mode: 'contains' as const } };
  const view = createTreeView(source, state);
  assert.equal(view.collection.count, 1);
  assert.deepEqual(preparedTreeLabelMatch(view, 'a'), { field: 'primary', fieldIndex: 0, start: 0, end: 6 });
  const next = updateTreeSource(source, [{ kind: 'append', entry: { node: { id: 'b', kind: 'leaf', label: 'other' } } }]);
  assert.equal(treeSourceNodeById(next, 'a'), node);
  assert.equal(finishWork(queryFieldSearchIndexWork(node, 0, true)), raw);
});

void test('log append retains original field owners across contains and ranked matching modes', () => {
  const history = createLogHistory([{ id: 'a', text: 'A\u0301lpha alpha', timestamp: 'time', metadata: { source: 'worker' } }]);
  const record = logHistoryEntryAt(history, 0);
  assert.ok(record);
  const before = logHistoryRecordMatches(record, { text: 'ál', mode: 'contains' });
  assert.deepEqual(before.map(match => [match.startOffset, match.endOffsetExclusive]), [[0, 3]]);
  assert.deepEqual(logHistoryRecordMatches(record, { text: 'ál', mode: 'prefix' }).map(match => [match.startOffset, match.endOffsetExclusive]), [[0, 3]]);
  const next = appendLogHistory(history, [{ id: 'b', text: 'later' }]);
  assert.equal(logHistoryEntryAt(next, 0), record);
  assert.equal(logHistoryEntryAt(next, 0)?.searchFields, record.searchFields);
  assert.deepEqual(logHistoryRecordMatches(record, { text: 'ál', mode: 'contains' }), before);
});

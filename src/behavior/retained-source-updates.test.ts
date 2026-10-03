import assert from 'node:assert/strict';
import test from 'node:test';
import { createSearchPickerIndex, updateSearchPickerIndex, querySearchPickerIndex, searchPickerEntryById } from './search-picker-index.ts';
import { createTreeSource, updateTreeSource, treeSourceNodeById, treeSourceChildren } from './tree-operations.ts';
import { createLogHistory, appendLogHistory, logHistoryEntryAt } from './log-history.ts';
import { createListboxCollection, updateListboxCollection } from './listbox-source.ts';
import { createListboxView } from './listbox-view.ts';
import { collectionInteractionCount, collectionInteractionIdAt, collectionInteractionPosition } from '../interaction/collection-interaction.ts';
import { createTableCollection, updateTableCollection } from './table-operations.ts';

function allocations<T>(operation: () => T): { value: T; frozen: number } {
  const original = Object.freeze;
  let frozen = 0;
  Object.freeze = ((value: unknown) => { frozen += 1; return original(value); });
  try { return { value: operation(), frozen }; }
  finally { Object.freeze = original; }
}

void test('localized picker, tree, log, table and listbox updates path-copy bounded structure across growing corpora', () => {
  const measurements: Record<string, number[]> = { picker: [], tree: [], log: [], table: [], listbox: [] };
  for (const size of [256, 4096, 16384]) {
    const rows = Array.from({ length: size }, (_, i) => Object.freeze({ id: String(i), label: `row ${String(i)}`, value: i }));
    const middle = String(Math.floor(size / 2));
    const last = String(size - 1);
    const picker = createSearchPickerIndex(rows);
    const oldQuery = querySearchPickerIndex(picker);
    const pickerChange = allocations(() => updateSearchPickerIndex(picker, [
      { kind: 'replace', entry: { id: '0', label: 'first replacement', value: -2, disabled: true } },
      { kind: 'replace', entry: { id: middle, label: 'replacement', value: -1 } },
      { kind: 'remove', id: last },
      { kind: 'append', entry: { id: 'new', label: 'appended', value: size } },
    ]));
    measurements['picker']?.push(pickerChange.frozen);
    assert.equal(searchPickerEntryById(pickerChange.value, '1'), searchPickerEntryById(picker, '1'));
    assert.equal(searchPickerEntryById(picker, middle)?.label, `row ${middle}`);
    assert.equal(searchPickerEntryById(pickerChange.value, middle)?.label, 'replacement');
    assert.equal(searchPickerEntryById(pickerChange.value, last), undefined);
    assert.equal(oldQuery.entryAt(size - 1)?.id, last);
    assert.equal(oldQuery.count, size);
    const emptyQuery = allocations(() => querySearchPickerIndex(pickerChange.value));
    assert.ok(emptyQuery.frozen <= 32, `empty picker query allocated ${String(emptyQuery.frozen)} objects for ${String(size)} rows`);
    assert.equal(emptyQuery.value.entryAt(size - 1)?.id, 'new');
    assert.equal(collectionInteractionCount(emptyQuery.value.interactionIndex), size - 1);
    assert.equal(collectionInteractionPosition(emptyQuery.value.interactionIndex, '0'), undefined);
    assert.equal(collectionInteractionIdAt(emptyQuery.value.interactionIndex, 0), '1');
    assert.equal(collectionInteractionIdAt(emptyQuery.value.interactionIndex, size - 2), 'new');
    assert.equal(collectionInteractionPosition(oldQuery.interactionIndex, '0'), 0);
    assert.equal(collectionInteractionIdAt(oldQuery.interactionIndex, size - 1), last);
    assert.deepEqual(emptyQuery.value.window(size - 2, size).map(entry => entry.id), [String(size - 2), 'new']);

    const tree = createTreeSource([{ id: 'root', kind: 'branch', label: 'Root', children: rows.map(row => ({ ...row, kind: 'leaf' as const })) }]);
    const treeChange = allocations(() => updateTreeSource(tree, [
      { kind: 'replace', node: { id: '0', label: 'first replacement', kind: 'leaf', disabled: true } },
      { kind: 'replace', node: { id: middle, label: 'replacement', kind: 'leaf' } },
      { kind: 'remove', id: last },
      { kind: 'append', entry: { parentId: 'root', node: { id: 'new', label: 'appended', kind: 'leaf' } } },
    ]));
    measurements['tree']?.push(treeChange.frozen);
    assert.equal(treeSourceNodeById(treeChange.value, '1'), treeSourceNodeById(tree, '1'));
    assert.equal(treeSourceNodeById(tree, middle)?.label, `row ${middle}`);
    assert.equal(treeSourceNodeById(treeChange.value, middle)?.label, 'replacement');
    assert.equal(treeSourceNodeById(treeChange.value, last), undefined);
    assert.equal(treeSourceNodeById(treeChange.value, '0')?.disabled, true);
    assert.equal(treeSourceNodeById(tree, '0')?.disabled, undefined);
    assert.deepEqual(treeSourceChildren(tree, 'root', size - 1, size).map(node => node.id), [last]);
    assert.deepEqual(treeSourceChildren(treeChange.value, 'root', size - 1, size).map(node => node.id), ['new']);

    const log = createLogHistory(rows.map(row => ({ id: row.id, text: row.label })));
    const originalLast = logHistoryEntryAt(log, size - 1);
    const logChange = allocations(() => appendLogHistory(log, [{ id: 'new', text: 'appended' }]));
    measurements['log']?.push(logChange.frozen);
    assert.equal(log.entryCount, size);
    assert.equal(logHistoryEntryAt(log, size), undefined);
    assert.equal(logHistoryEntryAt(logChange.value, size - 1), originalLast);
    assert.equal(logHistoryEntryAt(logChange.value, size)?.entry.id, 'new');

    const listbox = createListboxCollection(rows, row => row);
    const listboxChange = allocations(() => updateListboxCollection(listbox, [
      { kind: 'replace', value: { id: '0', label: 'first replacement', value: -2 }, option: { id: '0', label: 'first replacement', disabled: true } },
      { kind: 'replace', value: { id: middle, label: 'replacement', value: -1 }, option: { id: middle, label: 'replacement', disabled: true } },
      { kind: 'remove', id: last },
      { kind: 'append', value: { id: 'new', label: 'appended', value: size }, option: { id: 'new', label: 'appended' } },
    ]));
    measurements['listbox']?.push(listboxChange.frozen);
    assert.equal(listboxChange.value.itemById('1')?.option, listbox.itemById('1')?.option);
    assert.equal(listbox.itemById(middle)?.option.label, `row ${middle}`);
    assert.equal(listboxChange.value.itemById(middle)?.option.label, 'replacement');
    assert.equal(listboxChange.value.itemById(last), undefined);
    assert.equal(listbox.itemAt(size - 1)?.id, last);
    const listboxView = allocations(() => createListboxView(listboxChange.value));
    assert.ok(listboxView.frozen <= 32, `empty listbox view allocated ${String(listboxView.frozen)} objects for ${String(size)} rows`);
    assert.equal(listboxView.value.entryAt(size - 1)?.id, 'new');
    assert.equal(listboxView.value.entryById(middle)?.selectableIndex, undefined);
    assert.equal(listboxView.value.entryAt(size - 1)?.selectableIndex, size - 3);
    assert.equal(collectionInteractionCount(listboxView.value.interactionIndex), size - 2);
    assert.equal(collectionInteractionIdAt(listboxView.value.interactionIndex, 0), '1');
    assert.equal(collectionInteractionIdAt(listboxView.value.interactionIndex, size - 3), 'new');
    const oldListboxView = createListboxView(listbox);
    assert.equal(oldListboxView.entryAt(0)?.selectableIndex, 0);
    assert.equal(oldListboxView.entryAt(size - 1)?.id, last);

    const table = createTableCollection(rows, row => row.id);
    const tableChange = allocations(() => updateTableCollection(table, [
      { kind: 'replace', id: '0', row: { id: '0', label: 'first replacement', value: -2 } },
      { kind: 'replace', id: middle, row: { id: middle, label: 'replacement', value: -1 } },
      { kind: 'remove', id: last },
      { kind: 'append', id: 'new', row: { id: 'new', label: 'appended', value: size } },
    ]));
    measurements['table']?.push(tableChange.frozen);
    assert.equal(tableChange.value.itemById('1')?.row, table.itemById('1')?.row);
    assert.equal(table.itemById(middle)?.row.label, `row ${middle}`);
    assert.equal(tableChange.value.itemById(middle)?.row.label, 'replacement');
    assert.equal(tableChange.value.itemById(last), undefined);
    assert.equal(table.itemAt(size - 1)?.id, last);
    assert.equal(tableChange.value.itemAt(size - 1)?.id, 'new');
    assert.equal(tableChange.value.rank('new'), size - 1);
  }
  for (const [kind, counts] of Object.entries(measurements)) {
    assert.equal(counts.length, 3);
    assert.ok(counts.every(count => count < 512), `${kind} update rebuilt source-sized structure: ${counts.join(', ')}`);
    assert.ok((counts[2] ?? Infinity) <= (counts[0] ?? 0) + 128,
      `${kind} update allocation grew with the corpus rather than tree depth: ${counts.join(', ')}`);
  }
});

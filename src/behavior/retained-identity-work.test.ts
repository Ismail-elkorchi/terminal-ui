import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareWork, type CooperativeWorkContext } from '../foundation/cooperative-work.ts';
import {
  createPersistentSequence, readPersistentSequence, appendSequenceItemsWork,
  prependSequenceItemsWork, replaceSequenceValueWork, removeSequenceItemsWork,
} from '../foundation/persistent-sequence.ts';
import {
  createSearchPickerIndex, prepareSearchPickerIndexUpdate, updateSearchPickerIndex,
  querySearchPickerIndex, prepareSearchPickerQuery,
} from './search-picker-index.ts';
import { prepareListboxView } from './listbox-view.ts';
import { createListboxCollection, prepareListboxCollectionUpdate, updateListboxCollection } from './listbox-source.ts';
import { createTableCollection, prepareTableCollectionUpdate, updateTableCollection } from './table-operations.ts';
import {
  createTreeSource, prepareTreeSourceUpdate, updateTreeSource, treeSourceChildren,
  prepareTreeSource, prepareTreeView, treeSourceNodeById,
} from './tree-operations.ts';
import { createLogHistory, prepareAppendLogHistory, appendLogHistory, logHistoryEntryAt } from './log-history.ts';

const longId = 'identity'.repeat(4096);

/** Counts framework string scans, including the final turn after the last yield. */
async function scanProbe<T>(run: (context: CooperativeWorkContext) => Promise<T>): Promise<{ result: T; maximum: number; total: number }> {
  // eslint-disable-next-line @typescript-eslint/unbound-method -- Restored after this deterministic scan probe.
  const original = String.prototype.charCodeAt;
  let scans = 0;
  let total = 0;
  let maximum = 0;
  const checkpoint = () => { maximum = Math.max(maximum, scans); scans = 0; };
  String.prototype.charCodeAt = function (position: number): number {
    if (this.length >= longId.length) { scans++; total++; }
    return original.call(this, position);
  };
  try {
    const result = await run({ signal: new AbortController().signal, operationLimit: 256,
      yield: () => { checkpoint(); return Promise.resolve(); },
    });
    checkpoint();
    return { result, maximum, total };
  } finally { String.prototype.charCodeAt = original; }
}

function bounded(probe: { maximum: number; total: number }): void {
  assert.ok(probe.total >= longId.length, 'probe must reach identity hashing');
  assert.ok(probe.maximum <= 1024, `scanned ${String(probe.maximum)} code units in one scheduler turn`);
}

void test('persistent identity append, prepend, replace and remove cancel during hashing without changing accepted versions', async () => {
  const item = { id: longId, value: 'original', extent: 1 };
  const source = createPersistentSequence([item]);
  const empty = createPersistentSequence<string>([]);
  const operations = [
    () => appendSequenceItemsWork(empty, [item]),
    () => prependSequenceItemsWork(empty, [item]),
    () => replaceSequenceValueWork(source, { ...item, value: 'changed' }),
    () => removeSequenceItemsWork(source, [longId]),
  ];
  for (const operation of operations) {
    const probe = await scanProbe(async context => {
      const controller = new AbortController();
      let yields = 0;
      await assert.rejects(prepareWork(operation(), { ...context, signal: controller.signal, yield: () => {
        yields++;
        controller.abort(new Error('cancel identity hashing'));
        return context.yield();
      } }), /cancel identity hashing/u);
      assert.equal(yields, 1);
    });
    assert.equal(probe.total, 256);
    assert.equal(probe.maximum, 256);
    assert.equal(empty.itemCount, 0);
    assert.equal(readPersistentSequence(source).itemAt(0)?.value, 'original');
  }
});

void test('huge-ID table updates bound every scan turn and match synchronous append, replace and remove', async () => {
  const original = createTableCollection([{ id: 'original', label: 'original' }], row => row.id);
  const appended = { kind: 'append' as const, id: longId, row: { id: longId, label: 'appended' } };
  const replaced = { kind: 'replace' as const, id: longId, row: { id: longId, label: 'changed' } };
  const removed = { kind: 'remove' as const, id: longId };
  let current = original;
  for (const change of [appended, replaced, removed]) {
    const probe = await scanProbe(context => prepareTableCollectionUpdate(current, [[change]], context));
    bounded(probe);
    const expected = updateTableCollection(current, [change]);
    assert.deepEqual(probe.result.window(0, probe.result.count), expected.window(0, expected.count));
    current = probe.result;
  }
  assert.equal(original.count, 1);
  assert.equal(original.itemAt(0)?.row.label, 'original');
});

void test('huge-ID picker and listbox updates bound normalization and subsequent identity work', async () => {
  const initial = { id: 'original', label: 'original', value: 0 };
  let picker = createSearchPickerIndex([initial]);
  let listbox = createListboxCollection([initial], item => item);
  for (const kind of ['append', 'replace', 'remove'] as const) {
    const entry = { id: longId, label: kind, value: 1 };
    const pickerChange = kind === 'remove' ? { kind, id: longId } : { kind, entry };
    const pickerProbe = await scanProbe(context => prepareSearchPickerIndexUpdate(picker, [[pickerChange]], context));
    bounded(pickerProbe);
    const expectedPicker = querySearchPickerIndex(updateSearchPickerIndex(picker, [pickerChange]));
    assert.deepEqual(querySearchPickerIndex(pickerProbe.result).window(0, pickerProbe.result.size), expectedPicker.window(0, expectedPicker.count));
    picker = pickerProbe.result;
    const listboxChange = kind === 'remove' ? { kind, id: longId } : { kind, value: entry, option: entry };
    const listboxProbe = await scanProbe(context => prepareListboxCollectionUpdate(listbox, [[listboxChange]], context));
    bounded(listboxProbe);
    const expectedListbox = updateListboxCollection(listbox, [listboxChange]);
    assert.deepEqual(listboxProbe.result.window(0, listboxProbe.result.count), expectedListbox.window(0, expectedListbox.count));
    listbox = listboxProbe.result;
  }
});

void test('huge-ID tree construction, child edits, ancestor matching and subtree deletion share cooperative lookup work', async () => {
  const root = { id: longId, label: 'Root', kind: 'branch' as const };
  const build = await scanProbe(context => prepareTreeSource([[{ node: root }]], context));
  bounded(build);
  let tree = build.result;
  for (const kind of ['append', 'replace', 'remove'] as const) {
    const node = { id: `${longId}-child`, label: kind, kind: 'leaf' as const };
    const change = kind === 'append' ? { kind, entry: { parentId: longId, node } }
      : kind === 'replace' ? { kind, node } : { kind, id: node.id };
    const probe = await scanProbe(context => prepareTreeSourceUpdate(tree, [[change]], context));
    bounded(probe);
    const expected = updateTreeSource(tree, [change]);
    assert.deepEqual(treeSourceChildren(probe.result, longId), treeSourceChildren(expected, longId));
    tree = probe.result;
  }
  const expanded = createTreeSource([{ ...root, children: [
    { id: `${longId}-child`, label: 'needle', kind: 'leaf' },
  ] }]);
  for (const query of [undefined, { text: 'needle' }]) {
    const projection = await scanProbe(context => prepareTreeView(expanded, {
      expandedIds: [longId], selection: { mode: 'none' }, ...(query === undefined ? {} : { query }),
    }, context));
    bounded(projection);
    assert.equal(projection.result.collection.count, 2);
  }
  const removed = await scanProbe(context => prepareTreeSourceUpdate(expanded, [[{ kind: 'remove', id: longId }]], context));
  bounded(removed);
  assert.equal(removed.result.nodeCount, 0);
  assert.equal(treeSourceNodeById(expanded, longId)?.label, 'Root');
});

void test('huge-ID log append bounds shared identity work and preserves synchronous results', async () => {
  const original = createLogHistory([{ id: 'original', text: 'original' }]);
  const entry = { id: longId, text: 'appended' };
  const probe = await scanProbe(context => prepareAppendLogHistory(original, [[entry]], context));
  bounded(probe);
  const expected = appendLogHistory(original, [entry]);
  assert.deepEqual(logHistoryEntryAt(probe.result, 1), logHistoryEntryAt(expected, 1));
  assert.equal(original.entryCount, 1);
});

void test('cancelled huge-ID source updates close producers and keep every accepted source usable', async () => {
  const entry = { id: longId, label: 'original', value: 0 };
  const picker = createSearchPickerIndex([entry]);
  const listbox = createListboxCollection([entry], item => item);
  const table = createTableCollection([entry], item => item.id);
  const tree = createTreeSource([{ id: longId, label: 'original', kind: 'leaf' }]);
  for (const kind of ['append', 'replace', 'remove'] as const) {
    const id = kind === 'append' ? `${longId}-new` : longId;
    const updated = { id, label: 'changed', value: 1 };
    const node = { id, label: 'changed', kind: 'leaf' as const };
    const changes = [
      kind === 'remove' ? { kind, id } : { kind, entry: updated },
      kind === 'remove' ? { kind, id } : { kind, option: updated, value: updated },
      kind === 'remove' ? { kind, id } : { kind, id, row: updated },
      kind === 'append' ? { kind, entry: { node } } : kind === 'replace' ? { kind, node } : { kind, id },
    ];
    const operations: ((batches: Iterable<readonly never[]>, context: CooperativeWorkContext) => Promise<unknown>)[] = [
      (batches, context) => prepareSearchPickerIndexUpdate(picker, batches, context),
      (batches, context) => prepareListboxCollectionUpdate(listbox, batches, context),
      (batches, context) => prepareTableCollectionUpdate(table, batches, context),
      (batches, context) => prepareTreeSourceUpdate(tree, batches, context),
    ];
    for (const [index, operation] of operations.entries()) {
      let closed = false;
      function* batches(): IterableIterator<readonly never[]> {
        try { yield [changes[index]] as never[]; }
        finally { closed = true; }
      }
      const probe = await scanProbe(async context => {
        const controller = new AbortController();
        await assert.rejects(operation(batches(), { ...context, signal: controller.signal, yield: () => {
          controller.abort(new Error('cancel huge source identity'));
          return context.yield();
        } }), /cancel huge source identity/u);
      });
      assert.equal(closed, true);
      assert.ok(probe.total <= 1024, `scanned ${String(probe.total)} code units before cancellation`);
    }
  }
  assert.equal(querySearchPickerIndex(picker).entryAt(0)?.label, 'original');
  assert.equal(listbox.itemAt(0)?.option.label, 'original');
  assert.equal(table.itemAt(0)?.row.label, 'original');
  assert.equal(treeSourceNodeById(tree, longId)?.label, 'original');
});

void test('cooperative identity updates retain colliding IDs and prior receipts through replacement and deletion', async () => {
  // Both identities have the same 32-bit FNV-1a hash.
  const left = { id: 'costarring', value: 'left', extent: 1 };
  const right = { id: 'liquid', value: 'right', extent: 2 };
  const original = createPersistentSequence([left]);
  const context = { signal: new AbortController().signal, operationLimit: 1, yield: () => Promise.resolve() };
  const appended = await prepareWork(appendSequenceItemsWork(original, [right]), context);
  const replaced = await prepareWork(replaceSequenceValueWork(appended, { ...left, value: 'changed' }), context);
  const removed = await prepareWork(removeSequenceItemsWork(replaced, [left.id]), context);
  assert.equal(readPersistentSequence(original).itemById(left.id)?.value, 'left');
  assert.equal(readPersistentSequence(appended).itemById(right.id)?.value, 'right');
  assert.equal(readPersistentSequence(replaced).itemById(left.id)?.value, 'changed');
  assert.equal(readPersistentSequence(removed).itemById(left.id), undefined);
  assert.equal(readPersistentSequence(removed).itemById(right.id)?.value, 'right');
  assert.equal(removed.totalExtent, 2);
});

void test('query finalization adopts huge identities cooperatively without recovering matched owners', async () => {
  const entry = { id: longId, label: 'matched', value: 1 };
  const query = { text: 'matched', mode: 'exact' as const };
  const picker = createSearchPickerIndex([entry]);
  const listbox = createListboxCollection([entry], item => item);
  const operations: ((context: CooperativeWorkContext) => Promise<{
    readonly entryAt: (rank: number) => { readonly id: string } | undefined;
  }>)[] = [
    context => prepareSearchPickerQuery(picker, query, context),
    context => prepareListboxView(listbox, { query }, context),
  ];
  for (const prepare of operations) {
    const controller = new AbortController();
    let turns = 0;
    await assert.rejects(prepare({ signal: controller.signal, operationLimit: 256,
      yield: () => { turns++; controller.abort(new Error('cancel projection adoption')); return Promise.resolve(); },
    }), /cancel projection adoption/u);
    assert.equal(turns, 1, 'Huge ID admission must yield before any projection is published');
    const probe = await scanProbe(prepare);
    assert.equal(probe.total, 0, 'Matched owners must not be recovered through persistent identity hashing');
    assert.equal(probe.result.entryAt(0)?.id, longId);
  }
});

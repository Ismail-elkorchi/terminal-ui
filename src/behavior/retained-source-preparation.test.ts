import assert from 'node:assert/strict';
import test from 'node:test';
import { setImmediate } from 'node:timers/promises';
import type { CooperativeWorkContext } from '../foundation/cooperative-work.ts';
import { prepareSearchPickerIndex } from './search-picker-index.ts';
import { createTreeSource, prepareTreeSource, prepareTreeSourceUpdate, treeSourceNodeById, treeSourceChildren } from './tree-operations.ts';
import { createLogHistory, prepareLogHistory, prepareAppendLogHistory, logHistoryEntryAt } from './log-history.ts';
import { createTableCollection, prepareTableCollection, prepareTableCollectionUpdate } from './table-operations.ts';
import { createListboxCollection, prepareListboxCollection, prepareListboxCollectionUpdate } from './listbox-source.ts';
import { createListboxView, prepareListboxView, matchingListboxView } from './listbox-view.ts';
import { collectionInteractionReducer } from '../interaction/collection-interaction.ts';

function required<T>(value: T | undefined): T { assert.ok(value !== undefined); return value; }

const context = () => ({ signal: new AbortController().signal, yield: () => Promise.resolve() });

void test('tree, log and listbox batches own every descriptor before a yield, with later batches owned when consumed', async () => {
  const treeFirst = [{ node: { id: 'root', kind: 'branch' as const, label: 'A\u0301👩‍💻'.repeat(4000) } },
    { node: { id: 'child', kind: 'leaf' as const, label: 'original' }, parentId: 'root' }];
  const treeLater = [{ node: { id: 'later', kind: 'leaf' as const, label: 'before' }, parentId: 'root' }];
  let changed = false;
  const tree = await prepareTreeSource([treeFirst, treeLater], { ...context(), yield: () => {
    if (!changed) {
      changed = true;
      required(treeFirst[1]).node.label = 'mutated'; treeFirst.splice(0);
      required(treeLater[0]).node.label = 'after';
    }
    return Promise.resolve();
  } });
  assert.equal(changed, true);
  assert.equal(treeSourceNodeById(tree, 'child')?.label, 'original');
  assert.equal(treeSourceNodeById(tree, 'later')?.label, 'after');
  assert.deepEqual(treeSourceChildren(tree, 'root').map(node => node.id), ['child', 'later']);

  const logFirst = [{ id: 'one', text: 'é'.repeat(20_000), metadata: { source: 'original' } }, { id: 'two', text: 'second' }];
  const logLater = [{ id: 'three', text: 'before' }];
  changed = false;
  const log = await prepareLogHistory([logFirst, logLater], { ...context(), yield: () => {
    if (!changed) {
      changed = true; required(required(logFirst[0]).metadata).source = 'changed'; required(logFirst[1]).text = 'changed';
      logFirst.splice(0); required(logLater[0]).text = 'after';
    }
    return Promise.resolve();
  } });
  assert.equal(logHistoryEntryAt(log, 0)?.entry.metadata?.['source'], 'original');
  assert.equal(logHistoryEntryAt(log, 1)?.entry.text, 'second');
  assert.equal(logHistoryEntryAt(log, 2)?.entry.text, 'after');

  const listFirst = [{ id: 'one', label: 'x'.repeat(20_000), keywords: ['needle'] }, { id: 'two', label: 'original', keywords: [] as string[] }];
  const listLater = [{ id: 'three', label: 'before', keywords: [] as string[] }];
  changed = false;
  const list = await prepareListboxCollection([listFirst, listLater], value => value, { ...context(), yield: () => {
    if (!changed) {
      changed = true; required(listFirst[0]).keywords[0] = 'changed'; required(listFirst[1]).label = 'changed';
      listFirst.splice(0); required(listLater[0]).label = 'after';
    }
    return Promise.resolve();
  } });
  assert.equal(list.itemById('two')?.option.label, 'original');
  assert.equal(list.itemById('three')?.option.label, 'after');
  assert.equal(createListboxView(list, { query: { text: 'needle' } }).entryAt(0)?.id, 'one');
});

void test('bounded source ingestion rejects oversized, sparse and invalid batches before yielding', async () => {
  let yields = 0;
  const ctx = { ...context(), yield: () => { yields += 1; return Promise.resolve(); } };
  const oversized = Array.from({ length: 257 }, (_, index) => ({ id: String(index), label: 'label', text: 'text', kind: 'leaf' as const }));
  await assert.rejects(prepareTreeSource([oversized.map(node => ({ node }))], ctx), /256/u);
  await assert.rejects(prepareLogHistory([oversized], ctx), /256/u);
  await assert.rejects(prepareListboxCollection([oversized], item => item, ctx), /256/u);
  await assert.rejects(prepareTableCollection([oversized], item => item.id, ctx), /256/u);
  const sparse = new Array<typeof oversized[number]>(2); sparse[0] = required(oversized[0]);
  await assert.rejects(prepareTreeSource([new Array(2) as never[]], ctx), TypeError);
  await assert.rejects(prepareLogHistory([sparse], ctx), TypeError);
  await assert.rejects(prepareListboxCollection([sparse], item => item, ctx), TypeError);
  await assert.rejects(prepareTableCollection([sparse], item => item.id, ctx), TypeError);
  const metadata = Object.fromEntries(Array.from({ length: 1025 }, (_, i) => [String(i), 'value']));
  await assert.rejects(prepareLogHistory([[{ id: 'one', text: 'x'.repeat(20_000), metadata }]], ctx), /1024/u);
  await assert.rejects(prepareListboxCollection([[{ id: 'one', label: 'x'.repeat(20_000), keywords: Array<string>(1025).fill('value') }]], item => item, ctx), /1024/u);
  assert.equal(yields, 0);
});

void test('duplicate source identities across batches reject without changing accepted versions', async () => {
  const node = { id: 'same', kind: 'leaf' as const, label: 'one' };
  await assert.rejects(prepareTreeSource([[{ node }], [{ node }]], context()), /unique/u);
  await assert.rejects(prepareTreeSource([[{ node, parentId: 'absent' }]], context()), /existing branch/u);
  await assert.rejects(prepareLogHistory([[{ id: 'same', text: 'one' }], [{ id: 'same', text: 'two' }]], context()), /unique|duplicate/iu);
  await assert.rejects(prepareListboxCollection([[node], [node]], item => item, context()), /unique|duplicate/iu);
  await assert.rejects(prepareTableCollection([[node], [node]], item => item.id, context()), /unique|duplicate/iu);
});

void test('cancelled retained-source updates close producers and leave older versions valid', async () => {
  const tree = createTreeSource([{ id: 'one', kind: 'leaf', label: 'original' }]);
  const log = createLogHistory([{ id: 'one', text: 'original' }]);
  const table = createTableCollection([{ id: 'one' }], row => row.id);
  const list = createListboxCollection([{ id: 'one', label: 'original' }], item => item);
  const cases: ((batches: Iterable<readonly never[]>, ctx: CooperativeWorkContext) => Promise<unknown>)[] = [
    (batches, ctx) => prepareTreeSourceUpdate(tree, batches, ctx),
    (batches, ctx) => prepareAppendLogHistory(log, batches, ctx),
    (batches, ctx) => prepareTableCollectionUpdate(table, batches, ctx),
    (batches, ctx) => prepareListboxCollectionUpdate(list, batches, ctx),
  ];
  const changes = [
    { kind: 'replace', node: { id: 'one', kind: 'leaf', label: 'changed' } },
    { id: 'two', text: 'changed' },
    { kind: 'replace', id: 'one', row: { id: 'one', changed: true } },
    { kind: 'replace', value: { id: 'one', label: 'changed' }, option: { id: 'one', label: 'changed' } },
  ];
  for (const [index, prepare] of cases.entries()) {
    let closed = false;
    function* batches(): IterableIterator<readonly never[]> { try { yield [changes[index]] as never[]; } finally { closed = true; } }
    const controller = new AbortController();
    await assert.rejects(prepare(batches(), { signal: controller.signal, operationLimit: 1,
      yield: () => { controller.abort(new Error('cancelled')); return Promise.resolve(); },
    }), /cancelled/u);
    assert.equal(closed, true);
  }
  assert.equal(treeSourceNodeById(tree, 'one')?.label, 'original');
  assert.equal(log.entryCount, 1);
  assert.equal(table.itemAt(0)?.row.id, 'one');
  assert.equal(list.itemById('one')?.option.label, 'original');
});

void test('cooperative listbox queries release the event loop and reject replaced source and query receipts', async () => {
  const rows = Array.from({ length: 2048 }, (_, i) => ({ id: String(i), label: `needle ${String(i)}`, disabled: i === 0 }));
  const list = createListboxCollection(rows, item => item);
  let ticks = 0;
  const view = await prepareListboxView(list, { query: { text: 'needle' } }, {
    signal: new AbortController().signal, yield: async () => { await setImmediate(); ticks += 1; },
  });
  assert.ok(ticks > 0);
  assert.equal(view.count, rows.length);
  assert.equal(view.entryById('0')?.selectableIndex, undefined);
  assert.equal(matchingListboxView(list, { text: 'needle' }, view), view);
  assert.equal(matchingListboxView(list, { text: 'changed' }, view), undefined);
  assert.equal(matchingListboxView(createListboxCollection(rows, item => item), { text: 'needle' }, view), undefined);
  const state = collectionInteractionReducer({ activeId: '1', selection: { mode: 'single' } },
    { kind: 'moveActive', delta: 1 }, { index: view.interactionIndex });
  assert.equal(state.activeId, '2');
  assert.deepEqual(state.selection, { mode: 'single' });
  assert.deepEqual(collectionInteractionReducer(state, { kind: 'commitActive' }, { index: view.interactionIndex }).selection,
    { mode: 'single', selectedId: '2' });
});

void test('table batches own membership and mapped ids before yielding without mutating application row payloads', async () => {
  const firstRow = Object.freeze({ id: 'first' });
  const secondRow = Object.freeze({ id: 'second' });
  const laterRow = Object.freeze({ id: 'later' });
  const first: { readonly id: string }[] = [firstRow, secondRow];
  const later: { readonly id: string }[] = [Object.freeze({ id: 'before' })];
  let changed = false;
  const collection = await prepareTableCollection([first, later], row => row.id, {
    ...context(), operationLimit: 1, yield: () => {
      if (!changed) { changed = true; first.splice(0); later.splice(0, 1, laterRow); }
      return Promise.resolve();
    },
  });
  assert.equal(changed, true);
  assert.equal(collection.count, 3);
  assert.equal(collection.itemById('first')?.row, firstRow);
  assert.equal(collection.itemById('second')?.row, secondRow);
  assert.equal(collection.itemById('later')?.row, laterRow);
  assert.equal(collection.rank('later'), 2);
});

void test('cancelled listbox queries never publish partial ordered views or block a newer request', async () => {
  const list = createListboxCollection(Array.from({ length: 2048 }, (_, i) => ({ id: String(i), label: `needle ${String(i)}` })), item => item);
  const controller = new AbortController();
  const entered = Promise.withResolvers<undefined>();
  const released = Promise.withResolvers<undefined>();
  const old = prepareListboxView(list, { query: { text: 'needle' } }, {
    signal: controller.signal, yield: async () => { entered.resolve(undefined); await released.promise; },
  });
  await entered.promise;
  const latest = await prepareListboxView(list, { query: { text: '2047', mode: 'exact' } }, context());
  assert.equal(latest.count, 0);
  const narrowed = await prepareListboxView(list, { query: { text: '2047', mode: 'contains' } }, context());
  assert.equal(narrowed.count, 1);
  assert.equal(narrowed.entryAt(0)?.id, '2047');
  controller.abort(new Error('superseded'));
  released.resolve(undefined);
  await assert.rejects(old, /superseded/u);
  let resumed = false;
  const complete = await prepareListboxView(list, { query: { text: 'needle' } }, {
    ...context(), yield: () => { resumed = true; return Promise.resolve(); },
  });
  assert.equal(resumed, true);
  assert.equal(complete.count, 2048);
  assert.equal(complete.entryAt(2047)?.id, '2047');
  assert.equal(createListboxView(list, { query: { text: '2047', mode: 'contains' } }), narrowed);
});


void test('empty producer batches still consume a shared work budget and close promptly on cancellation', async () => {
  const builders: ((batches: Iterable<readonly never[]>, ctx: CooperativeWorkContext) => Promise<unknown>)[] = [
    (batches, ctx) => prepareSearchPickerIndex(batches, ctx),
    (batches, ctx) => prepareTreeSource(batches, ctx),
    (batches, ctx) => prepareLogHistory(batches, ctx),
    (batches, ctx) => prepareTableCollection(batches, () => '', ctx),
    (batches, ctx) => prepareListboxCollection(batches, () => ({ id: '', label: '' }), ctx),
  ];
  for (const build of builders) {
    let consumed = 0;
    let closed = false;
    function* batches(): IterableIterator<readonly never[]> {
      try { for (;;) { consumed += 1; yield []; } }
      finally { closed = true; }
    }
    const controller = new AbortController();
    await assert.rejects(build(batches(), {
      signal: controller.signal, operationLimit: 32,
      yield: () => { controller.abort(new Error('stop empty stream')); return Promise.resolve(); },
    }), /stop empty stream/u);
    assert.ok(consumed > 0 && consumed <= 32, `consumed ${String(consumed)} empty producer batches before yielding`);
    assert.equal(closed, true);
  }
});

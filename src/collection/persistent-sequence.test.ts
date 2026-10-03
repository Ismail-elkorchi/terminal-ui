import assert from 'node:assert/strict';
import test from 'node:test';
import { finishWork, prepareWork } from '../foundation/cooperative-work.ts';
import { createPersistentSequence, createPersistentSequenceWork, createPersistentSequenceCursor, appendSequenceItems, prependSequenceItems, replaceSequenceValue, removeSequenceItems, readPersistentSequence, type PersistentSequence, type PersistentSequenceItem } from '../foundation/persistent-sequence.ts';
import { createOrderedSource, appendOrderedItems, replaceOrderedItemWork, removeOrderedItemsWork } from '../foundation/ordered-source.ts';
import { createMeasuredCollection, appendMeasuredItems, prependMeasuredItems, replaceMeasuredItem, removeMeasuredItems, readMeasuredCollection } from './measured-collection.ts';
import { measuredAnchorAt, measuredWindow } from './measured-window-operations.ts';
import { createCollectionInteractionIndexFromSource, collectionInteractionReducer, collectionInteractionPosition } from '../interaction/collection-interaction.ts';

void test('neutral order preserves sparse ranks, enabled navigation and prior roots after mixed edits', () => {
  let source = createOrderedSource<{ readonly id: string; readonly value: number }>();
  const versions = [source];
  const expected: { readonly id: string; readonly value: number }[] = [];
  for (let index = 0; index < 4096; index++) {
    const value = Object.freeze({ id: String(index), value: index });
    expected.push(value);
    source = appendOrderedItems(source, [{ id: value.id, value, disabled: index % 3 === 0 }]);
    if (index % 257 === 0) versions.push(source);
  }
  const old = source;
  source = finishWork(removeOrderedItemsWork(source, ['0', '2048', '4095']));
  source = appendOrderedItems(source, [{ id: 'new', value: Object.freeze({ id: 'new', value: -1 }) }]);
  source = finishWork(replaceOrderedItemWork(source, { id: '3', value: expected[3] as { readonly id: string; readonly value: number }, disabled: false }));
  assert.equal(source.rank('new'), 4093);
  assert.equal(source.rank('2049'), 2047);
  assert.equal(source.itemAt(2047), expected[2049]);
  assert.equal(old.itemAt(2048), expected[2048]);
  assert.deepEqual(source.window(2045, 2049).map(value => value.id), ['2046', '2047', '2049', '2050']);
  assert.equal(source.enabledRank('3'), 2);
  assert.equal(source.enabledAt(2)?.id, '3');
  assert.equal(source.enabledRank('6'), undefined);
  for (const version of versions) {
    assert.equal(version.itemAt(version.count - 1)?.value, version.count === 0 ? undefined : version.count - 1);
  }
  const interaction = createCollectionInteractionIndexFromSource(source);
  assert.equal(collectionInteractionPosition(interaction, '6'), undefined);
  assert.equal(collectionInteractionReducer({ activeId: '3', selection: { mode: 'none' } }, { kind: 'moveActive', delta: 1 }, { index: interaction }).activeId, '4');
});

void test('measured adapter retains weighted anchors and shared item identity over persistent order edits', () => {
  const original = createMeasuredCollection(Array.from({ length: 4096 }, (_, index) => ({ id: String(index), value: index, rows: index % 5 + 1 })));
  const reader = readMeasuredCollection(original);
  const preserved = reader.itemById('2048');
  const position = reader.positionById('2048');
  assert.ok(position);
  const anchor = measuredAnchorAt(original, { offsetRow: position.startRowIndex + 1 });
  assert.ok(anchor);
  const appended = appendMeasuredItems(original, [{ id: 'last', value: 4096, rows: 2 }]);
  const prepended = prependMeasuredItems(appended, [{ id: 'first', value: -1, rows: 7 }]);
  const replaced = replaceMeasuredItem(prepended, { id: '0', value: 0, rows: 9 });
  const next = removeMeasuredItems(replaced, ['1']);
  assert.equal(readMeasuredCollection(next).itemById('2048'), preserved);
  assert.equal(readMeasuredCollection(original).itemById('last'), undefined);
  const nextPosition = readMeasuredCollection(next).positionById('2048');
  assert.ok(nextPosition);
  assert.equal(nextPosition.startRowIndex - position.startRowIndex, 13);
  const window = measuredWindow(next, { anchor, viewportRows: 8 });
  assert.equal(window.offsetRow, nextPosition.startRowIndex + 1);
  assert.equal(window.entries[0]?.item.id, '2048');
  assert.equal(original.totalRows, reader.totalRows);
});

void test('owned interaction adapters reject forged readers without invoking their methods', () => {
  let calls = 0;
  const forged = {
    kind: 'ordered-source', count: 1, enabledCount: 1,
    itemAt: () => { calls++; return { id: 'fake' }; },
    itemById: () => { calls++; return { id: 'fake' }; },
    rank: () => { calls++; return 0; }, enabledAt: () => { calls++; return { id: 'fake' }; },
    enabledRank: () => { calls++; return 0; }, window: () => [], values: function* () { calls++; yield { id: 'fake' }; },
  };
  assert.throws(() => createCollectionInteractionIndexFromSource(forged as never), /created by terminal-ui/u);
  assert.equal(calls, 0);
});


void test('sequence iteration uses one generator and a depth-bounded cursor for full and late windows', () => {
  const size = 65_536;
  const source = createPersistentSequence(Array.from({ length: size }, (_, value) => ({ id: String(value), value, extent: 1 })));
  const reader = readPersistentSequence(source);
  for (const [start, end] of [[0, size], [size - 17, size], [size / 2, size / 2 + 1]] as const) {
    const iterator = reader.items(start, end);
    const prototype = Object.getPrototypeOf(iterator) as object;
    const originalIterator = Object.getOwnPropertyDescriptor(prototype, Symbol.iterator);
    const originalPush = Array.prototype.push;
    let iteratorActivations = 0;
    let pushes = 0;
    let maximumDepth = 0;
    Object.defineProperty(prototype, Symbol.iterator, { configurable: true, value: function (this: IterableIterator<unknown>) {
      iteratorActivations++;
      return this;
    } });
    Array.prototype.push = function (...values: unknown[]): number {
      pushes += values.length;
      maximumDepth = Math.max(maximumDepth, this.length + values.length);
      return originalPush.apply(this, values);
    };
    let expected = start;
    try {
      for (const item of iterator) { assert.equal(item.value, expected); expected++; }
    } finally {
      Array.prototype.push = originalPush;
      if (originalIterator === undefined) Reflect.deleteProperty(prototype, Symbol.iterator);
      else Object.defineProperty(prototype, Symbol.iterator, originalIterator);
    }
    assert.equal(expected, end);
    assert.equal(iteratorActivations, 1, 'yield delegation must not allocate an iterator for every node');
    assert.ok(maximumDepth <= Math.ceil(Math.log2(size)) + 1);
    assert.ok(pushes <= end - start + Math.ceil(Math.log2(size)) + 1,
      'rank seek must not scan the prefix before a late window');
  }
});

void test('sequence cursors retain rank bounds, fractional reader bounds and old roots across edits', () => {
  const values = Array.from({ length: 31 }, (_, value) => ({ id: String(value), value, extent: value % 3 + 1, enabled: value % 2 === 0 }));
  const reader = readPersistentSequence(createPersistentSequence(values));
  for (const [start, end] of [[0, 31], [-5, 3], [1.5, 8.25], [30, 100], [31, 32], [3, 3], [8, 2], [NaN, 3], [1, NaN], [1, Infinity], [-Infinity, 3]] as const) {
    const expected = values.filter((_, index) => index >= Math.max(0, start) && index < Math.min(values.length, end));
    assert.deepEqual([...reader.items(start, end)], expected);
  }
  const original = createOrderedSource(values.map(value => ({ id: value.id, value, disabled: !value.enabled })));
  const retained = original.values(8, 15);
  const retainedFirst = retained.next();
  assert.ok(!retainedFirst.done);
  assert.equal(retainedFirst.value.value, 8);
  const prior = values[10];
  assert.ok(prior);
  const replacement = { ...prior, id: '10', value: -10, extent: 2 };
  const changed = appendOrderedItems(finishWork(removeOrderedItemsWork(
    finishWork(replaceOrderedItemWork(original, { id: '10', value: replacement })), ['11']
  )), [{ id: 'last', value: { id: 'last', value: 31, extent: 1, enabled: true } }]);
  assert.deepEqual([...retained].map(value => value.value), [9, 10, 11, 12, 13, 14]);
  assert.deepEqual([...changed.values(8, 14)].map(value => value.value), [8, 9, -10, 12, 13, 14]);
  assert.equal(original.enabledAt(5)?.value, 10);
  assert.equal(changed.enabledAt(5)?.value, -10);
  const stopped = changed.values();
  const stoppedFirst = stopped.next();
  assert.ok(!stoppedFirst.done);
  assert.equal(stoppedFirst.value.value, 0);
  assert.equal(stopped.return?.().done, true);
  assert.equal(stopped.next().done, true);
});


void test('bulk sequence assembly uses fixed generator count and preserves balanced order, extent and enabled indexes', async () => {
  const size = 4096;
  let ingestionDone = false;
  function* items(): IterableIterator<PersistentSequenceItem<number>> {
    for (let value = 0; value < size; value++) yield { id: String(value), value, extent: value % 3 + 1, enabled: value % 2 === 0 };
    ingestionDone = true;
  }
  const work = createPersistentSequenceWork(items());
  const generatorPrototype = Object.getPrototypeOf(Object.getPrototypeOf(work)) as object;
  const descriptor = Object.getOwnPropertyDescriptor(generatorPrototype, 'next');
  assert.ok(descriptor);
  const originalNext = descriptor.value as (this: object, value?: unknown) => IteratorResult<unknown>;
  const assemblyGenerators = new WeakSet<object>();
  let generatorCount = 0;
  Object.defineProperty(generatorPrototype, 'next', { ...descriptor, value: function (this: object, value?: unknown) {
    if (ingestionDone && !assemblyGenerators.has(this)) { assemblyGenerators.add(this); generatorCount++; }
    return originalNext.call(this, value);
  } });
  let sequence: PersistentSequence<number>;
  try {
    sequence = await prepareWork(work, { signal: new AbortController().signal, operationLimit: 256, yield: () => Promise.resolve() });
  } finally { Object.defineProperty(generatorPrototype, 'next', descriptor); }
  assert.ok(generatorCount >= 2 && generatorCount <= 3, `assembly allocated ${String(generatorCount)} generators`);
  const reader = readPersistentSequence(sequence);
  assert.equal(sequence.itemCount, size);
  assert.equal(sequence.enabledCount, size / 2);
  let extent = 0;
  for (let value = 0; value < size; value++) {
    const position = reader.positionById(String(value));
    assert.ok(position);
    assert.equal(position.itemIndex, value);
    assert.equal(position.startExtent, extent);
    extent += value % 3 + 1;
    assert.equal(position.endExtent, extent);
    assert.equal(reader.enabledRank(String(value)), value % 2 === 0 ? value / 2 : undefined);
  }
  assert.equal(sequence.totalExtent, extent);
});

void test('bulk sequence construction remains cancellable during AVL and HAMT assembly', async () => {
  const originalFreeze = Object.freeze;
  for (const phase of ['sequence', 'ids'] as const) {
    let sequenceNodes = 0;
    let idNodes = 0;
    Object.freeze = ((value: unknown) => {
      if (value !== null && typeof value === 'object') {
        if ('height' in value && 'order' in value) sequenceNodes++;
        if ('kind' in value && (value.kind === 'leaf' && 'entries' in value || value.kind === 'branch' && 'bitmap' in value)) idNodes++;
      }
      return originalFreeze(value);
    });
    const controller = new AbortController();
    try {
      await assert.rejects(prepareWork(createPersistentSequenceWork(Array.from({ length: 4096 }, (_, value) => ({ id: String(value), value, extent: 1 }))), {
        signal: controller.signal, operationLimit: 256, yield: () => {
          if ((phase === 'sequence' ? sequenceNodes : idNodes) >= 128) controller.abort(new Error(`cancel ${phase} assembly`));
          return Promise.resolve();
        },
      }), new RegExp(`cancel ${phase} assembly`, 'u'));
    } finally { Object.freeze = originalFreeze; }
    if (phase === 'sequence') { assert.ok(sequenceNodes >= 128 && sequenceNodes < 4096); assert.equal(idNodes, 0); }
    else { assert.equal(sequenceNodes, 4096); assert.ok(idNodes >= 128 && idNodes < 4096); }
  }
});


void test('compact singleton identities split and collapse collision leaves without changing retained versions', () => {
  // These distinct IDs have the same full 32-bit FNV-1a hash.
  const first = { id: 'costarring', value: 1, extent: 3, enabled: false };
  const second = { id: 'liquid', value: 2, extent: 5, enabled: true };
  const singleton = createPersistentSequence([first]);
  const collision = appendSequenceItems(singleton, [second]);
  const bulk = createPersistentSequence([first, second]);
  for (const sequence of [collision, bulk]) {
    const reader = readPersistentSequence(sequence);
    assert.equal(reader.positionById('liquid')?.startExtent, 3);
    assert.equal(reader.enabledRank('liquid'), 0);
    assert.equal(reader.enabledRank('costarring'), undefined);
    assert.equal(reader.itemById('missing'), undefined);
    assert.throws(() => appendSequenceItems(sequence, [second]), /unique/u);
    const changed = replaceSequenceValue(sequence, { ...second, extent: 7, value: 9 });
    const collapsed = removeSequenceItems(changed, ['costarring']);
    const restored = prependSequenceItems(collapsed, [first]);
    assert.equal(readPersistentSequence(collapsed).itemById('costarring'), undefined);
    assert.equal(readPersistentSequence(collapsed).positionById('liquid')?.startExtent, 0);
    assert.equal(readPersistentSequence(restored).positionById('liquid')?.startExtent, 3);
    assert.equal(readPersistentSequence(sequence).itemById('liquid')?.value, 2);
    assert.equal(removeSequenceItems(collapsed, ['missing']), collapsed);
    assert.equal(removeSequenceItems(collapsed, ['liquid']).itemCount, 0);
  }
  assert.equal(readPersistentSequence(singleton).itemById('liquid'), undefined);
  assert.equal(singleton.totalExtent, 3);
});

void test('sequence snapshots caller item fields and keeps unaffected item identities through rotations', () => {
  const supplied = { id: 'initial', value: { payload: 1 }, extent: 2, enabled: false };
  const original = createPersistentSequence([supplied]);
  const item = readPersistentSequence(original).itemAt(0);
  assert.ok(item);
  supplied.id = 'mutated'; supplied.extent = 100; supplied.enabled = true;
  const changed = appendSequenceItems(prependSequenceItems(original, [{ id: 'before', value: supplied.value, extent: 3 }]),
    Array.from({ length: 64 }, (_, index) => ({ id: String(index), value: supplied.value, extent: 1 })));
  assert.equal(readPersistentSequence(changed).itemById('initial'), item);
  assert.deepEqual(item, { id: 'initial', value: supplied.value, extent: 2, enabled: false });
  assert.ok(Object.isFrozen(item));
  assert.equal(original.totalExtent, 2);
  assert.equal(original.enabledCount, 0);
});


void test('direct sequence cursors are independent, seek late windows, and release cancelled traversal', () => {
  const original = createPersistentSequence(Array.from({ length: 1024 }, (_, value) => ({ id: String(value), value, extent: 1 })));
  const first = createPersistentSequenceCursor(original, 1000, 1004);
  const second = createPersistentSequenceCursor(original, 1001, 1003);
  const reader = readPersistentSequence(original);
  assert.equal(first.next(), reader.itemAt(1000));
  assert.equal(second.next(), reader.itemAt(1001));
  const edited = removeSequenceItems(original, ['1001']);
  assert.equal(first.next(), reader.itemAt(1001));
  first.close();
  assert.equal(first.next(), undefined);
  first.close();
  assert.equal(second.next(), reader.itemAt(1002));
  assert.equal(second.next(), undefined);
  assert.equal(second.next(), undefined);
  assert.equal(createPersistentSequenceCursor(edited, 1001, 1002).next()?.id, '1002');
  for (const [start, end] of [[3, 3], [8, 2], [NaN, 3], [1, NaN], [1024, 1025]] as const) {
    assert.equal(createPersistentSequenceCursor(original, start, end).next(), undefined);
  }
});


void test('bulk HAMT terminals reuse identity records without singleton leaf arrays', () => {
  const originalFreeze = Object.freeze;
  let identities = 0;
  let singletonLeaves = 0;
  Object.freeze = ((value: unknown) => {
    if (value !== null && typeof value === 'object' && 'kind' in value) {
      if (value.kind === 'entry') identities++;
      if (value.kind === 'leaf' && 'entries' in value && Array.isArray(value.entries) && value.entries.length === 1) singletonLeaves++;
    }
    return originalFreeze(value);
  });
  try {
    const sequence = createPersistentSequence(Array.from({ length: 1024 }, (_, value) => ({ id: String(value), value, extent: 1 })));
    assert.equal(sequence.itemCount, 1024);
  } finally { Object.freeze = originalFreeze; }
  assert.equal(identities, 1024);
  assert.equal(singletonLeaves, 0);
});

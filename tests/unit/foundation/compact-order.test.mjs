import assert from 'node:assert/strict';
import test from 'node:test';
import { createCompactOrderWork } from '../../../dist/foundation/compact-order.js';
import { collectionOrderReaderStorageBytes } from '../../../dist/foundation/order-reader.js';
import { createOrderedSource, appendOrderedItems } from '../../../dist/foundation/ordered-source.js';
import { finishWork, prepareWork } from '../../../dist/foundation/cooperative-work.js';
import { createCollectionInteractionIndexFromSource, collectionInteractionIds, createCollectionInteractionIndex } from '../../../dist/interaction/collection-interaction.js';

const item = (id, disabled = false) => ({ id, value: Object.freeze({ id }), disabled });

test('compact reader retains absolute and enabled rank with immutable windows', () => {
  const reader = finishWork(createCompactOrderWork([item('a'), item('b', true), item('c'), item('d', true)]));
  assert.equal(reader.count, 4);
  assert.equal(reader.enabledCount, 2);
  assert.deepEqual([...reader.values(-10, 100)].map(value => value.id), ['a', 'b', 'c', 'd']);
  assert.equal(reader.rank('c'), 2);
  assert.equal(reader.enabledRank('c'), 1);
  assert.equal(reader.enabledRank('b'), undefined);
  assert.equal(reader.itemById('b').id, 'b');
  assert.equal(reader.enabledAt(1).id, 'c');
  assert.equal(reader.enabledAt(-1), undefined);
  assert.equal(reader.itemAt(0.5), undefined);
  assert.equal(reader.enabledAt(0.5), undefined);
  assert.throws(() => reader.window(0, Infinity), RangeError);
  assert.ok(Object.isFrozen(reader));
  assert.ok(Object.isFrozen(reader.window(0, 4)));
  assert.deepEqual(collectionInteractionIds(createCollectionInteractionIndexFromSource(reader)), ['a', 'c']);
  assert.throws(() => appendOrderedItems(reader, [item('e')]), /Ordered sources/u);
});

test('both reader implementations authenticate without calling forged accessors', () => {
  const source = createOrderedSource([item('source')]);
  const projection = finishWork(createCompactOrderWork([item('projection')]));
  for (const reader of [source, projection]) {
    assert.deepEqual(collectionInteractionIds(createCollectionInteractionIndexFromSource(reader)), [reader.itemAt(0).id]);
    let reads = 0;
    const proxy = new Proxy(reader, { get() { reads += 1; throw new Error('accessed'); } });
    assert.throws(() => createCollectionInteractionIndexFromSource(proxy), /created by terminal-ui/u);
    assert.equal(reads, 0);
    assert.throws(() => createCollectionInteractionIndexFromSource({ ...reader }), /created by terminal-ui/u);
  }
});

test('all-enabled compact orders avoid enabled metadata and detached standalone identities reject duplicates', () => {
  const enabled = finishWork(createCompactOrderWork([item('a'), item('b')]));
  const disabled = finishWork(createCompactOrderWork([item('a'), item('b', true)]));
  assert.ok(collectionOrderReaderStorageBytes(enabled) < collectionOrderReaderStorageBytes(disabled));
  assert.equal(enabled.enabledRank('b'), 1);
  assert.equal(enabled.enabledAt(1), enabled.itemAt(1));
  assert.deepEqual(collectionInteractionIds(createCollectionInteractionIndex(['a', 'b'])), ['a', 'b']);
  assert.throws(() => createCollectionInteractionIndex(['a', 'a']), /unique/u);
});

test('long identity adoption and finalization stay cancellable before publication', async () => {
  for (const events of [[item('x'.repeat(8192))], Array.from({ length: 2000 }, (_, index) => item(String(index)))]) {
    const controller = new globalThis.AbortController();
    let completed = false;
    function* work() {
      const result = yield* createCompactOrderWork(events);
      completed = true;
      return result;
    }
    await assert.rejects(prepareWork(work(), {
      signal: controller.signal, operationLimit: 128,
      yield: async () => { controller.abort(new Error('cancelled')); },
    }), /cancelled/u);
    assert.equal(completed, false);
  }
});


test('finalization cancellation never returns a partially adopted reader', async () => {
  const controller = new globalThis.AbortController();
  let turns = 0;
  let published = false;
  function* work() {
    const reader = yield* createCompactOrderWork([item('a')]);
    published = true;
    return reader;
  }
  await assert.rejects(prepareWork(work(), {
    signal: controller.signal, operationLimit: 1,
    yield: async () => { if (++turns === 3) controller.abort(new Error('cancel finalization')); },
  }), /cancel finalization/u);
  assert.equal(turns, 3);
  assert.equal(published, false);
});

test('empty and all-disabled projections keep absolute lookup without enabled navigation', () => {
  const empty = finishWork(createCompactOrderWork([]));
  const disabled = finishWork(createCompactOrderWork([item('a', true), item('b', true)]));
  for (const reader of [empty, disabled]) {
    assert.equal(reader.enabledCount, 0);
    assert.equal(reader.enabledAt(0), undefined);
    assert.equal(reader.enabledRank('a'), undefined);
    assert.deepEqual(collectionInteractionIds(createCollectionInteractionIndexFromSource(reader)), []);
  }
  assert.equal(disabled.rank('b'), 1);
  assert.equal(disabled.itemAt(1).id, 'b');
  assert.deepEqual(empty.window(-10, 10), []);
});

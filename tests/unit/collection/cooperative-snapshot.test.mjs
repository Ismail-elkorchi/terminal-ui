import assert from 'node:assert/strict';
import test from 'node:test';
import { createCompleteCollectionWork, collectionItemById, collectionIds, isCollectionSnapshot } from '../../../dist/collection/snapshot.js';
import { finishWork, prepareWork } from '../../../dist/foundation/cooperative-work.js';

test('cooperative complete collections own items and prepare identity lookup before returning', async () => {
  const items = Array.from({ length: 1024 }, (_, itemIndex) => ({ id: String(itemIndex), itemIndex }));
  let yields = 0;
  const collection = await prepareWork(createCompleteCollectionWork(items), {
    signal: new globalThis.AbortController().signal, yield: async () => { yields += 1; },
  });
  assert.equal(yields, 4);
  assert.ok(isCollectionSnapshot(collection));
  assert.equal(collectionItemById(collection, '1023'), collection.items[1023]);
  assert.deepEqual(collectionIds(collection), items.map(item => item.id));
  items[0].id = 'changed';
  assert.equal(collection.items[0].id, '0');
  assert.ok(Object.isFrozen(collection.items[0]));
});

test('cooperative collection ownership rejects invalid identities and positions', () => {
  for (const [items, pattern] of [
    [[{ id: '', itemIndex: 0 }], /must not be empty/u],
    [[{ id: 'a', itemIndex: 0 }, { id: 'a', itemIndex: 1 }], /unique/u],
    [[{ id: 'a', itemIndex: 1 }], /stable position/u],
    [[{ id: 'a', itemIndex: 0, sectionId: '' }], /sectionId/u],
  ]) assert.throws(() => finishWork(createCompleteCollectionWork(items)), pattern);
});

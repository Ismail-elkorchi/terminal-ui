import assert from 'node:assert/strict';
import test from 'node:test';
import type { SearchEntry } from '../collection/item.ts';
import {
  createSearchPickerIndex, prepareSearchPickerIndex, querySearchPickerIndex,
  updateSearchPickerIndex, prepareSearchPickerIndexUpdate, searchPickerEntryById,
  searchPickerQueryPosition, searchPickerIndexStatistics,
} from './search-picker-index.ts';
import {
  collectionInteractionIds, collectionInteractionPosition, collectionInteractionReducer,
} from '../interaction/collection-interaction.ts';

const work = () => ({ signal: new AbortController().signal, yield: () => Promise.resolve() });

void test('each source batch is completely owned before yielding while future batches have consumption-time snapshots', async () => {
  const first = [
    { id: 'a', label: 'x'.repeat(10_000), value: 1, keywords: ['original'] },
    { id: 'b', label: 'second', value: 2, keywords: ['untouched'] },
  ];
  const later = [{ id: 'c', label: 'before', value: 3 }];
  let yields = 0;
  const index = await prepareSearchPickerIndex([first, later], {
    signal: new AbortController().signal,
    yield: () => {
      if (yields++ === 0) {
        const firstEntry = first[0];
        const secondEntry = first[1];
        assert.ok(firstEntry && secondEntry);
        firstEntry.keywords[0] = 'changed';
        secondEntry.label = 'changed';
        first.splice(0, first.length);
        const laterEntry = later[0];
        assert.ok(laterEntry);
        laterEntry.label = 'after';
      }
      return Promise.resolve();
    },
  });
  assert.equal(index.size, 3);
  assert.equal(searchPickerEntryById(index, 'b')?.label, 'second');
  assert.equal(searchPickerEntryById(index, 'c')?.label, 'after');
  assert.equal(querySearchPickerIndex(index, { text: 'original' }).entries[0]?.id, 'a');
});

void test('bounded batch validation accounts for keyword fanout before yielding or copying unbounded arrays', async () => {
  let yields = 0;
  const context = { signal: new AbortController().signal, yield: () => { yields += 1; return Promise.resolve(); } };
  await assert.rejects(prepareSearchPickerIndex([Array.from({ length: 257 }, (_, i) => ({ id: String(i), label: 'x', value: i }))], context), /256/u);
  await assert.rejects(prepareSearchPickerIndex([[{ id: 'a', label: 'x', value: 1, keywords: new Array<string>(100_000) }]], context), /1024/u);
  await assert.rejects(prepareSearchPickerIndex([[
    { id: 'a', label: 'x', value: 1, keywords: new Array<string>(600).fill('short') },
    { id: 'b', label: 'x', value: 2, keywords: new Array<string>(600).fill('short') },
  ]], context), /1024/u);
  assert.equal((() => yields)(), 0);
  const keywords = Array.from({ length: 1024 }, (_, i) => `keyword ${String(i)}`);
  const source = [{ id: 'one', label: 'x'.repeat(100_000), value: 1, keywords }];
  const result = await prepareSearchPickerIndex([source], context);
  assert.ok(yields > 50, 'both long content and keyword fanout yield');
  assert.equal(querySearchPickerIndex(result, { text: 'keyword 1023' }).entries.length, 1);
});

void test('invalid batches never yield partially validated descriptors', async () => {
  const invalid = [
    { id: 'a', label: 'x'.repeat(10_000), value: 1 },
    { id: 'b', label: 42, value: 2 },
  ] as unknown as SearchEntry<number>[];
  let yielded = false;
  await assert.rejects(prepareSearchPickerIndex([invalid], {
    signal: new AbortController().signal,
    yield: () => { yielded = true; return Promise.resolve(); },
  }), /must be strings/u);
  assert.equal(yielded, false);
});

void test('source arrays and change batches reject sparse holes before preparation yields', async () => {
  const entries = new Array<SearchEntry<number>>(2);
  entries[0] = { id: 'a', label: 'x'.repeat(10_000), value: 1 };
  const changes = new Array<{ readonly kind: 'remove'; readonly id: string }>(2);
  changes[0] = { kind: 'remove', id: 'a' };
  const initial = createSearchPickerIndex([{ id: 'a', label: 'original', value: 1 }]);
  let yields = 0;
  const context = { signal: new AbortController().signal, yield: () => { yields += 1; return Promise.resolve(); } };
  assert.throws(() => createSearchPickerIndex(entries), /entry must be an object/u);
  await assert.rejects(prepareSearchPickerIndex([entries], context), /entry must be an object/u);
  assert.throws(() => updateSearchPickerIndex(initial, changes), /change must be an object/u);
  await assert.rejects(prepareSearchPickerIndexUpdate(initial, [changes], context), /change must be an object/u);
  assert.equal(yields, 0);
  assert.equal(searchPickerEntryById(initial, 'a')?.label, 'original');
});

void test('immutable picker versions share unaffected entries and preserve ordered append, replace and removal semantics', async () => {
  const initial = createSearchPickerIndex([
    { id: 'a', label: 'Álpha', value: 1 }, { id: 'b', label: 'Bravo', value: 2 }, { id: 'c', label: 'Charlie', value: 3 },
  ]);
  const old = querySearchPickerIndex(initial);
  const unchanged = searchPickerEntryById(initial, 'a');
  const changes = [
    { kind: 'replace', entry: { id: 'b', label: 'Beta', value: 22 } },
    { kind: 'remove', id: 'c' },
    { kind: 'append', entry: { id: 'd', label: 'Delta', value: 4 } },
    { kind: 'append', entry: { id: 'e', label: 'Echo', value: 5 } },
    { kind: 'replace', entry: { id: 'd', label: 'D', value: 44 } },
  ] as const;
  const next = await prepareSearchPickerIndexUpdate(initial, [changes], work());
  const sync = updateSearchPickerIndex(initial, changes);
  assert.deepEqual(querySearchPickerIndex(next).entries, querySearchPickerIndex(sync).entries);
  assert.deepEqual(querySearchPickerIndex(next).entries.map(entry => entry.id), ['a', 'b', 'd', 'e']);
  assert.equal(searchPickerEntryById(next, 'a'), unchanged);
  assert.equal(searchPickerEntryById(next, 'b')?.label, 'Beta');
  assert.deepEqual(old.entries.map(entry => entry.label), ['Álpha', 'Bravo', 'Charlie']);
  assert.equal(searchPickerEntryById(initial, 'd'), undefined);
  assert.equal(updateSearchPickerIndex(next, []), next);
  const moved = updateSearchPickerIndex(next, [{ kind: 'remove', id: 'a' }, { kind: 'append', entry: { id: 'a', label: 'again', value: 1 } }]);
  assert.deepEqual(querySearchPickerIndex(moved).entries.map(entry => entry.id), ['b', 'd', 'e', 'a']);
  assert.throws(() => updateSearchPickerIndex(next, [{ kind: 'append', entry: { id: 'a', label: 'duplicate', value: 1 } }]), /unique/u);
  assert.throws(() => updateSearchPickerIndex(next, [{ kind: 'remove', id: 'missing' }]), /existing/u);
  assert.throws(() => updateSearchPickerIndex(next, [{ kind: 'replace', entry: { id: 'missing', label: 'x', value: 1 } }]), /existing/u);
});

void test('cancelled construction and updates close their producer and publish no changed source', async () => {
  const initial = createSearchPickerIndex(Array.from({ length: 2048 }, (_, i) => ({ id: String(i), label: `old ${String(i)}`, value: i })));
  const result = querySearchPickerIndex(initial);
  let closed = false;
  function* changes() {
    try { yield [{ kind: 'replace' as const, entry: { id: '0', label: 'changed', value: 0 } }]; }
    finally { closed = true; }
  }
  const controller = new AbortController();
  await assert.rejects(prepareSearchPickerIndexUpdate(initial, changes(), {
    signal: controller.signal,
    yield: () => { controller.abort(new Error('superseded')); return Promise.resolve(); },
  }), /superseded/u);
  assert.equal(closed, true);
  assert.equal(searchPickerEntryById(initial, '0')?.label, 'old 0');
  assert.equal(querySearchPickerIndex(initial), result);
});

void test('rank and enabled navigation share order while disabled matches keep their visible rank', () => {
  const index = createSearchPickerIndex([
    { id: 'a', label: 'xneedle', value: 1 },
    { id: 'disabled', label: 'needle', value: 2, disabled: true },
    { id: 'b', label: 'xneedle', value: 3 },
  ]);
  const result = querySearchPickerIndex(index, { text: 'needle', mode: 'contains' });
  assert.deepEqual(result.entries.map(entry => entry.id), ['disabled', 'a', 'b']);
  assert.deepEqual(collectionInteractionIds(result.interactionIndex), ['a', 'b']);
  assert.equal(searchPickerQueryPosition(result, 'a'), 1);
  assert.equal(collectionInteractionPosition(result.interactionIndex, 'a'), 0);
  assert.equal(searchPickerQueryPosition(result, 'disabled'), 0);
  assert.equal(collectionInteractionPosition(result.interactionIndex, 'disabled'), undefined);
  const moved = collectionInteractionReducer({ activeId: 'a', selection: { mode: 'none' } }, { kind: 'moveActive', delta: 1 }, { index: result.interactionIndex });
  assert.equal(moved.activeId, 'b');
});

void test('case folding and version updates reuse original Unicode segmentation and exact source offsets', () => {
  const descriptor = Object.getOwnPropertyDescriptor(Intl.Segmenter.prototype, 'segment');
  const segment = descriptor?.value as ((this: Intl.Segmenter, text: string) => Intl.Segments) | undefined;
  assert.ok(segment);
  const input = 'A\u0301👩‍💻 suffix';
  let originalSegmentations = 0;
  Intl.Segmenter.prototype.segment = function (text: string) {
    if (text === input) originalSegmentations += 1;
    return segment.call(this, text);
  };
  try {
    const first = createSearchPickerIndex([{ id: 'a', label: input, value: 1 }]);
    const count = originalSegmentations;
    assert.ok(count > 0);
    const folded = querySearchPickerIndex(first, { text: 'á', mode: 'prefix' });
    assert.deepEqual(folded.matches[0]?.ranges, [{ field: 'primary', fieldIndex: 0, start: 0, end: 2 }]);
    const next = updateSearchPickerIndex(first, [{ kind: 'append', entry: { id: 'b', label: 'plain', value: 2 } }]);
    assert.equal(querySearchPickerIndex(next, { text: 'suffix' }).entries[0], folded.entries[0]);
    assert.equal(originalSegmentations, count, 'folded fields and unchanged source versions do not resegment originals');
    assert.equal(searchPickerIndexStatistics(next).entries, 2);
  } finally { Intl.Segmenter.prototype.segment = segment; }
});

void test('source ingestion validates dynamic descriptors and update payloads without weakening ownership', async () => {
  const invalidEntries: unknown[] = [null, [], { id: 4, label: 'x' }, { id: 'a', label: 'x', description: 4 },
    { id: 'a', label: 'x', disabled: 'yes' }, { id: 'a', label: 'x', keywords: 'needle' },
    { id: 'a', label: 'x', keywords: [4] }, { id: ' ', label: 'x' }];
  for (const entry of invalidEntries) {
    await assert.rejects(prepareSearchPickerIndex([[entry] as SearchEntry<unknown>[]], work()), TypeError);
  }
  const initial = createSearchPickerIndex([{ id: 'a', label: 'first', value: 1 }]);
  for (const change of [null, [], { kind: 'unknown' }, { kind: 'remove', id: 4 }]) {
    await assert.rejects(prepareSearchPickerIndexUpdate(initial, [[change] as never], work()), TypeError);
  }
  assert.throws(() => updateSearchPickerIndex(initial, null as never), /array/u);
  await assert.rejects(prepareSearchPickerIndexUpdate(initial, [[{ kind: 'append', entry: {
    id: 'b', label: 'second', value: 2, keywords: new Array<string>(1025).fill('x'),
  } }]], work()), /1024/u);
});

void test('bounded version batches own all changes before a content checkpoint and share unchanged long fields', async () => {
  const first = createSearchPickerIndex([{ id: 'a', label: 'original', value: 1 }, { id: 'untouched', label: 'ü'.repeat(5000), value: 2 }]);
  const changes = [
    { kind: 'replace' as const, entry: { id: 'a', label: 'x'.repeat(10_000), value: 1, keywords: ['needle'] } },
    { kind: 'append' as const, entry: { id: 'b', label: 'added', value: 3, keywords: [] as string[] } },
  ];
  let yields = 0;
  const next = await prepareSearchPickerIndexUpdate(first, [changes], {
    signal: new AbortController().signal,
    yield: () => {
      if (yields++ === 0) {
        const replacement = changes[0];
        const appended = changes[1];
        assert.ok(replacement && appended);
        replacement.entry.keywords[0] = 'changed';
        appended.entry.id = 'mutated';
        changes.splice(0, changes.length);
      }
      return Promise.resolve();
    },
  });
  assert.equal(searchPickerEntryById(next, 'untouched'), searchPickerEntryById(first, 'untouched'));
  assert.equal(querySearchPickerIndex(next, { text: 'needle' }).entries[0]?.id, 'a');
  assert.equal(searchPickerEntryById(next, 'b')?.label, 'added');
  assert.equal(searchPickerEntryById(next, 'mutated'), undefined);
});

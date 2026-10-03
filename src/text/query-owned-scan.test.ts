import assert from 'node:assert/strict';
import test from 'node:test';
import { finishWork, prepareWork } from '../foundation/cooperative-work.ts';
import { createCompactOrderWork } from '../foundation/compact-order.ts';
import { createOrderedSource, appendOrderedItems } from '../foundation/ordered-source.ts';
import { createCollectionOrderScan, ownCollectionOrderReader } from '../foundation/order-reader.ts';
import { compileCollectionQuery, indexQueryCandidate, queryIndexedCandidatesWork, queryIndexedOwnedScanWork } from './query.ts';
import type { QueryMatch } from './query.ts';

function drain(work: Generator<number, readonly QueryMatch[]>) {
  const charges: number[] = [];
  let step = work.next();
  while (!step.done) { charges.push(step.value); step = work.next(); }
  return { matches: step.value, charges };
}

function drainOwned(work: ReturnType<typeof queryIndexedOwnedScanWork>) {
  const charges: number[] = [];
  let step = work.next();
  while (!step.done) { charges.push(step.value); step = work.next(); }
  return { matches: step.value.matches, charges };
}

function items() {
  return [
    { id: 'first', primary: 'aa', secondary: ['aa'] },
    { id: 'second', primary: 'aa', group: 'group' },
    { id: 'combining', primary: 'e\u0301clair', secondary: ['Éclair'] },
    { id: 'emoji', primary: '👩‍💻_é_👩‍💻', secondary: ['👩‍💻é'] },
    { id: 'expansion', primary: 'İIı', secondary: ['i\u0307Iı'] },
    { id: 'long', primary: `${'É'.repeat(2500)}_x_y`, secondary: ['x-y'] },
  ].map(candidate => ({ id: candidate.id, value: indexQueryCandidate(candidate) }));
}

void test('owned scans preserve every match and exact cold/warm work charges across all modes', () => {
  for (const mode of ['contains', 'prefix', 'exact', 'fuzzy'] as const) {
    for (const text of ['', 'aa', 'é', '👩‍💻', 'İ', 'xy', 'missing']) {
      for (const caseSensitive of [false, true]) {
        const query = compileCollectionQuery({ text, mode, caseSensitive });
        const reference = createOrderedSource(items());
        const owned = createOrderedSource(items());
        const compact = finishWork(createCompactOrderWork(items()));
        for (let pass = 0; pass < 2; pass += 1) {
          const expected = drain(queryIndexedCandidatesWork(reference.values(), query));
          const ownedResult = drainOwned(queryIndexedOwnedScanWork(() => createCollectionOrderScan(owned), query));
          const compactResult = drainOwned(queryIndexedOwnedScanWork(() => createCollectionOrderScan(compact), query));
          assert.deepEqual(ownedResult.matches, expected.matches);
          assert.deepEqual(compactResult, ownedResult, 'both owned representations charge exactly the same work');
          assert.ok(ownedResult.charges.reduce((sum, charge) => sum + charge, 0)
            >= expected.charges.reduce((sum, charge) => sum + charge, 0) + expected.matches.length * 2,
          'owner append and finalization are charged in addition to the unchanged matching work');
        }
      }
    }
  }
});

void test('owned scans bypass public iterators and release the scan cursor on cancellation', async () => {
  const values = Array.from({ length: 4096 }, (_, rank) => ({
    id: String(rank), value: indexQueryCandidate({ id: String(rank), primary: 'short ASCII field' }),
  }));
  const source = createOrderedSource(values);
  let closed = 0;
  let opened = 0;
  let advances = 0;
  const observed = ownCollectionOrderReader({ ...source, values: () => { throw new Error('public iterator used'); } }, 0, () => {
    opened += 1;
    const cursor = createCollectionOrderScan(source);
    return {
      get value() { return cursor.value; },
      advance() { advances += 1; return cursor.advance(); },
      close() { closed += 1; cursor.close(); assert.equal(cursor.value, undefined); },
    };
  });
  const query = compileCollectionQuery({ text: 'missing', caseSensitive: true });
  const preaborted = new AbortController();
  preaborted.abort(new Error('already cancelled'));
  await assert.rejects(prepareWork(queryIndexedOwnedScanWork(() => createCollectionOrderScan(observed), query), {
    signal: preaborted.signal, yield: () => Promise.resolve(),
  }), /already cancelled/u);
  assert.equal(opened, 0, 'a pre-cancelled query must not acquire a cursor');
  const controller = new AbortController();
  await assert.rejects(prepareWork(queryIndexedOwnedScanWork(() => createCollectionOrderScan(observed), query), {
    signal: controller.signal,
    yield: () => { controller.abort(new Error('superseded scan')); return Promise.resolve(); },
  }), /superseded scan/u);
  assert.equal(closed, 1);
  assert.ok(advances > 0 && advances < source.count);
  advances = 0;
  assert.deepEqual(finishWork(queryIndexedOwnedScanWork(() => createCollectionOrderScan(observed), query)), { matches: [], owners: [] });
  assert.equal(advances, source.count + 1);
  assert.equal(closed, 2);
});

void test('interleaved immutable source versions retain independent positions and stable ties', () => {
  const initial = createOrderedSource(Array.from({ length: 500 }, (_, rank) => ({
    id: String(rank), value: indexQueryCandidate({ id: String(rank), primary: 'aa' }),
  })));
  const next = appendOrderedItems(initial, [{ id: 'last', value: indexQueryCandidate({ id: 'last', primary: 'aa' }) }]);
  const query = compileCollectionQuery({ text: 'aa', mode: 'exact' });
  const first = queryIndexedOwnedScanWork(() => createCollectionOrderScan(initial), query);
  const second = queryIndexedOwnedScanWork(() => createCollectionOrderScan(next), query);
  assert.equal(first.next().done, false);
  assert.equal(second.next().done, false);
  const firstResult = drainOwned(first).matches;
  const secondResult = drainOwned(second).matches;
  assert.deepEqual(firstResult.map(match => match.id), Array.from({ length: 500 }, (_, rank) => String(rank)));
  assert.deepEqual(secondResult.map(match => match.id), [...firstResult.map(match => match.id), 'last']);
});

void test('iterable protocol handles omitted done and closes on cancellation only', () => {
  const candidate = indexQueryCandidate({ id: 'one', primary: 'x'.repeat(5000) });
  let closed = 0;
  const values = {
    [Symbol.iterator]() {
      let read = false;
      return {
        next(): IteratorResult<typeof candidate> {
          if (read) return { done: true, value: undefined };
          read = true;
          return { value: candidate };
        },
        return(): IteratorResult<typeof candidate> { closed += 1; return { done: true, value: undefined }; },
      };
    },
  };
  const query = compileCollectionQuery({ text: 'x', caseSensitive: true });
  assert.equal(drain(queryIndexedCandidatesWork(values, query)).matches[0]?.id, 'one');
  assert.equal(closed, 0);
  const work = queryIndexedCandidatesWork(values, query);
  assert.equal(work.next().done, false);
  work.return([]);
  assert.equal(closed, 1);
});

void test('callable iterables use their iterator without invoking the callable body', () => {
  const candidate = indexQueryCandidate({ id: 'callable', primary: 'a-b-c' });
  const candidates = Object.assign(() => { throw new Error('callable body must not run'); }, {
    *[Symbol.iterator]() { yield candidate; },
  });
  const query = compileCollectionQuery({ text: 'ac', mode: 'fuzzy', caseSensitive: true });
  assert.deepEqual(drain(queryIndexedCandidatesWork(candidates, query)),
    drain(queryIndexedCandidatesWork([candidate], query)));
});

void test('iterable scan caches next with its receiver and preserves abrupt completion', () => {
  const candidate = indexQueryCandidate({ id: 'one', primary: 'aa' });
  const query = compileCollectionQuery({ text: 'aa', caseSensitive: true });
  let lookups = 0;
  const iterable = {
    [Symbol.iterator]() {
      return {
        read: false,
        get next() {
          assert.equal(++lookups, 1);
          return function (this: { read: boolean }): IteratorResult<typeof candidate> {
            if (this.read) return { done: true, value: undefined };
            this.read = true;
            return { value: candidate };
          };
        },
      };
    },
  };
  assert.deepEqual(drain(queryIndexedCandidatesWork(iterable, query)).matches.map(match => match.id), ['one']);
  let closes = 0;
  for (const next of [
    () => { throw new Error('step failed'); },
    () => 1 as unknown as IteratorResult<typeof candidate>,
    () => ({ get done(): boolean { throw new Error('done failed'); }, value: candidate }),
    () => ({ get value(): typeof candidate { throw new Error('value failed'); } }),
  ]) {
    const broken = { [Symbol.iterator]() { return { next, return() { closes += 1; return { done: true as const, value: undefined }; } }; } };
    assert.throws(() => drain(queryIndexedCandidatesWork(broken, query)));
  }
  assert.equal(closes, 0, 'iterator step and result access failures must not invoke return');
  const invalidCandidate = {
    [Symbol.iterator]() {
      return {
        next: () => ({ value: { id: 'unindexed' } }),
        return() { closes += 1; throw new Error('close failed'); },
      };
    },
  };
  assert.throws(() => drain(queryIndexedCandidatesWork(invalidCandidate, query)), /indexQueryCandidate/u);
  assert.equal(closes, 1, 'body failure closes once and wins over a close failure');
});

void test('iterator protocol invokes next and return without their overridable call properties', () => {
  const candidate = indexQueryCandidate({ id: 'one', primary: 'x'.repeat(5000) });
  const query = compileCollectionQuery({ text: 'x', caseSensitive: true });
  let closed = 0;
  const values = {
    [Symbol.iterator]() {
      const iterator = {
        read: false,
        next: Object.assign(function (this: { read: boolean }): IteratorResult<typeof candidate> {
          if (this.read) return { done: true, value: undefined };
          this.read = true;
          return { value: candidate };
        }, { call() { throw new Error('overridden next.call'); } }),
        return: Object.assign(function (this: { read: boolean }): IteratorResult<typeof candidate> {
          assert.equal(this.read, true);
          closed += 1;
          return { done: true, value: undefined };
        }, { call() { throw new Error('overridden return.call'); } }),
      };
      return iterator;
    },
  };
  assert.equal(drain(queryIndexedCandidatesWork(values, query)).matches[0]?.id, 'one');
  assert.equal(closed, 0);
  const work = queryIndexedCandidatesWork(values, query);
  assert.equal(work.next().done, false);
  work.return([]);
  assert.equal(closed, 1);
});

void test('owned match references stay aligned through unequal scores, stable ties and all query modes', () => {
  const candidates = [
    { id: 'late', primary: 'xx ab', secondary: ['e\u0301'] },
    { id: 'first', primary: 'ab', secondary: ['👩‍💻'] },
    { id: 'tie', primary: 'ab', secondary: ['e\u0301'] },
    { id: 'middle', primary: 'x ab', secondary: ['👩‍💻'] },
  ].map(indexQueryCandidate);
  const source = createOrderedSource(candidates.map(value => ({ id: value.id, value })));
  for (const mode of ['contains', 'prefix', 'exact', 'fuzzy'] as const) {
    for (const text of ['ab', 'é', '👩‍💻', 'missing', '']) {
      const query = compileCollectionQuery({ text, mode });
      const expected = finishWork(queryIndexedCandidatesWork(candidates, query));
      const result = finishWork(queryIndexedOwnedScanWork(() => createCollectionOrderScan(source), query));
      assert.deepEqual(result.matches, expected);
      assert.ok(Object.isFrozen(result.matches) && Object.isFrozen(result.owners));
      result.matches.forEach((match, rank) => {
        assert.equal(result.owners[rank], candidates.find(candidate => candidate.id === match.id));
        assert.deepEqual(Object.keys(match).sort(), ['id', 'ranges', 'score']);
      });
    }
  }
  const result = finishWork(queryIndexedOwnedScanWork(() => createCollectionOrderScan(source), compileCollectionQuery({ text: 'ab' })));
  assert.deepEqual(result.owners.map(owner => owner.id), ['first', 'tie', 'middle', 'late']);
  for (const [mode, extraCharges] of [['contains', 16], ['exact', 4]] as const) {
    const query = compileCollectionQuery({ text: 'ab', mode, caseSensitive: true });
    const plain = drain(queryIndexedCandidatesWork(candidates, query));
    const owned = drainOwned(queryIndexedOwnedScanWork(() => createCollectionOrderScan(source), query));
    assert.equal(owned.charges.reduce((sum, charge) => sum + charge, 0)
      - plain.charges.reduce((sum, charge) => sum + charge, 0), extraCharges,
    'charge one owner append and freeze per match, plus one companion move per merge pass');
  }
});

void test('owned aligned sort and finalization can cancel before publishing reference arrays', () => {
  const size = 1000;
  const candidates = Array.from({ length: size }, (_, index) => indexQueryCandidate({
    id: String(index), primary: `${'x'.repeat(index % 8)}ab`,
  }));
  const source = createOrderedSource(candidates.map(value => ({ id: value.id, value })));
  const query = compileCollectionQuery({ text: 'ab', caseSensitive: true });
  for (const targetCharge of [size * 2, size]) {
    let closed = 0;
    let published = false;
    function* work() {
      const result = yield* queryIndexedOwnedScanWork(() => {
        const cursor = createCollectionOrderScan(source);
        return {
          advance: () => cursor.advance(), get value() { return cursor.value; },
          close() { closed += 1; cursor.close(); },
        };
      }, query);
      published = true;
      return result;
    }
    const pending = work();
    let step = pending.next();
    while (!step.done && !(closed > 0 && step.value === targetCharge)) step = pending.next();
    assert.equal(step.done, false, 'must reach the requested sort or finalization checkpoint');
    pending.return({ matches: [], owners: [] });
    assert.equal(published, false);
    assert.equal(closed, 1);
  }
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { acceptMeasurements, createMeasurementState, measurementRequests, updateMeasurementState,
  createMeasuredCollection, appendMeasuredItems, prependMeasuredItems, removeMeasuredItems, replaceMeasuredItem,
  measuredAnchorAt } from '../../../dist/collection/index.js';

const geometry = { columns: 40, rows: 3, revision: 0 };
const item = (id, rows = 2, value = id) => ({ id, rows, value });
const create = (options = {}) => createMeasurementState({
  collection: createMeasuredCollection([item('a'), item('b'), item('c'), item('d')]),
  geometry, viewportRows: 3, ...options,
});
const update = (state, options) => updateMeasurementState(state, {
  collection: state.collection, geometry: state.geometry, viewportRows: state.viewportRows, ...options,
});
const measure = (state, height) => acceptMeasurements(state,
  measurementRequests(state).map(request => ({ request, rows: height ?? request.estimatedRows })));

test('accepting exact estimates settles once and duplicate batches preserve identity', () => {
  const state = create();
  const batch = measurementRequests(state).map(request => ({ request, rows: request.estimatedRows }));
  const accepted = acceptMeasurements(state, batch);
  assert.notEqual(accepted, state);
  assert.equal(accepted.collection.totalRows, state.collection.totalRows);
  assert.deepEqual(measurementRequests(accepted), []);
  assert.equal(acceptMeasurements(accepted, batch), accepted);
  assert.equal(update(accepted, {}), accepted);
  assert.equal(measurementRequests(state).length, 2, 'old controlled state remains estimated');
});

test('geometry changes invalidate lazily and stale measurements cannot enter the new geometry', () => {
  const state = measure(create());
  const changed = update(state, { geometry: { columns: 20, rows: 3, revision: 0 } });
  const batch = measurementRequests(changed).map(request => ({ request, rows: 7 }));
  const newer = update(changed, { geometry: { columns: 20, rows: 3, revision: 1 } });
  assert.equal(newer.collection, state.collection);
  assert.equal(acceptMeasurements(newer, batch), newer);
  assert.equal(measurementRequests(newer).length, 2);
  assert.deepEqual(measurementRequests(measure(newer)), []);
});

test('viewport-only resize retains accepted geometry and requests only newly visible items', () => {
  const accepted = measure(create());
  const expanded = update(accepted, { viewportRows: 5 });
  assert.equal(expanded.geometry, accepted.geometry);
  assert.equal(expanded.collection, accepted.collection);
  assert.deepEqual(measurementRequests(expanded).map(request => request.itemId), ['c']);
  const settled = measure(expanded);
  const shrunk = update(settled, { viewportRows: 2 });
  assert.equal(shrunk.geometry, accepted.geometry);
  assert.equal(shrunk.collection, settled.collection);
  assert.deepEqual(measurementRequests(shrunk), []);
  const hidden = update(shrunk, { viewportRows: 0 });
  assert.deepEqual(measurementRequests(hidden), []);
  assert.deepEqual(measurementRequests(update(hidden, { viewportRows: 5 })), []);
});

test('viewport-only resize preserves valid outstanding work and the logical anchor', () => {
  const state = create({ offsetRow: 3 });
  const batch = measurementRequests(state).map(request => ({ request, rows: 4 }));
  const resized = update(state, { viewportRows: 4 });
  const anchor = measuredAnchorAt(state.collection, { offsetRow: state.offsetRow });
  assert.equal(resized.geometry, state.geometry);
  const accepted = acceptMeasurements(resized, batch);
  assert.notEqual(accepted, resized);
  assert.deepEqual(measuredAnchorAt(accepted.collection, { offsetRow: accepted.offsetRow }), anchor);
  assert.deepEqual(measurementRequests(accepted), []);
});

test('measurement height changes invalidate accepted receipts without changing the visible window', () => {
  const accepted = measure(create());
  const changed = update(accepted, { geometry: { ...accepted.geometry, rows: 5 } });
  assert.equal(changed.viewportRows, accepted.viewportRows);
  assert.equal(changed.collection, accepted.collection);
  assert.notEqual(changed.geometry, accepted.geometry);
  assert.deepEqual(measurementRequests(changed).map(request => request.itemId), ['a', 'b']);
  assert.deepEqual(measurementRequests(measure(changed)), []);
});

test('content replacement and deletion reject stale results even with reused item id', () => {
  const state = create();
  const [request] = measurementRequests(state);
  const replaced = update(state, { collection: replaceMeasuredItem(state.collection, item('a', 2, 'new')) });
  assert.equal(acceptMeasurements(replaced, [{ request, rows: 8 }]), replaced);
  const removed = update(state, { collection: removeMeasuredItems(state.collection, ['a']) });
  assert.equal(acceptMeasurements(removed, [{ request, rows: 8 }]), removed);
  const remounted = update(removed, { collection: prependMeasuredItems(removed.collection, [item('a')]) });
  assert.equal(acceptMeasurements(remounted, [{ request, rows: 8 }]), remounted);
});

test('prepend, append, expansion and shrink preserve logical item and intra-item anchor', () => {
  let state = create({ offsetRow: 3 });
  const original = measuredAnchorAt(state.collection, { offsetRow: state.offsetRow });
  state = update(state, { collection: prependMeasuredItems(state.collection, [item('head', 4)]) });
  assert.equal(state.offsetRow, 7);
  assert.deepEqual(measuredAnchorAt(state.collection, { offsetRow: state.offsetRow }), original);
  state = update(state, { collection: appendMeasuredItems(state.collection, [item('tail', 9)]) });
  state = measure(state, 5);
  assert.deepEqual(measuredAnchorAt(state.collection, { offsetRow: state.offsetRow }), original);
  state = update(state, { collection: replaceMeasuredItem(state.collection, item('b', 1)) });
  assert.equal(measuredAnchorAt(state.collection, { offsetRow: state.offsetRow }).itemId, 'b');
  assert.equal(measuredAnchorAt(state.collection, { offsetRow: state.offsetRow }).rowWithinItem, 0);
});

test('tail following is explicit across append, accepted measurements and user scrolling', () => {
  let state = create({ followTail: true });
  assert.equal(state.offsetRow, 5);
  state = update(state, { collection: appendMeasuredItems(state.collection, [item('tail', 10)]) });
  assert.equal(state.offsetRow, 15);
  state = measure(state, 20);
  assert.equal(state.offsetRow, state.collection.totalRows - state.viewportRows);
  const geometryBeforeResize = state.geometry;
  state = update(state, { viewportRows: 5 });
  assert.equal(state.geometry, geometryBeforeResize);
  assert.equal(state.offsetRow, state.collection.totalRows - 5);
  state = update(state, { offsetRow: 0, followTail: false });
  assert.equal(state.offsetRow, 0);
  state = update(state, { collection: appendMeasuredItems(state.collection, [item('next', 10)]) });
  assert.equal(state.offsetRow, 0);
});

test('large history requests are bounded to visible rows and overscan, including after resize', () => {
  let state = create({ collection: createMeasuredCollection(Array.from({ length: 100000 }, (_, index) => item(String(index), 1))),
    offsetRow: 50000, viewportRows: 10 });
  assert.equal(measurementRequests(state, 3).length, 16);
  state = acceptMeasurements(state, measurementRequests(state, 3).map(request => ({ request, rows: 1 })));
  state = update(state, { viewportRows: 12 });
  assert.equal(measurementRequests(state, 3).length, 2);
  state = update(state, { geometry: { columns: 1, rows: 3, revision: 1 } });
  assert.equal(measurementRequests(state, 3).length, 18);
  assert.equal(measurementRequests(update(state, { viewportRows: 0 }), 100).length, 0);
});

test('invalid batch cannot partially accept heights or mutate previous state', () => {
  const state = create();
  const requests = measurementRequests(state);
  assert.throws(() => acceptMeasurements(state, [{ request: requests[0], rows: 9 }, { request: requests[1], rows: 0 }]), RangeError);
  assert.equal(state.collection.totalRows, 8);
  assert.equal(measurementRequests(state).length, 2);
  assert.throws(() => create({ geometry: { columns: -1, rows: 3, revision: 0 } }), RangeError);
  for (const invalid of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => create({ geometry: { ...geometry, rows: invalid } }), RangeError);
    assert.throws(() => update(state, { geometry: { ...geometry, rows: invalid } }), RangeError);
  }
  assert.throws(() => measurementRequests(state, -1), RangeError);
});

test('height constraints invalidate outstanding measurements and rejected fabricated requests do nothing', () => {
  const state = create();
  const [request] = measurementRequests(state);
  const resized = update(state, { geometry: { ...state.geometry, rows: 5 } });
  assert.equal(acceptMeasurements(resized, [{ request, rows: 8 }]), resized);
  assert.equal(acceptMeasurements(state, [{ request: { ...request }, rows: 8 }]), state);
  const ownedGeometry = { columns: 40, rows: 3, revision: 0 };
  const owned = create({ geometry: ownedGeometry });
  ownedGeometry.columns = 10;
  ownedGeometry.rows = 10;
  assert.equal(owned.geometry.columns, 40);
  assert.equal(owned.geometry.rows, 3);
});

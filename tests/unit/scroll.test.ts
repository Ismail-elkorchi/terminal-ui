import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyScrollEvent,
  createScrollState,
  normalizeScrollState,
  scrollReducer,
  visibleWindowFromScroll,
} from '../../dist/behavior/index.js';
import type { ScrollGeometry } from '../../dist/interaction/index.js';

const geometry: ScrollGeometry = {
  contentRows: 100,
  contentColumns: 60,
  viewportRows: 10,
  viewportColumns: 20,
};

void test('scroll state owns only intent while geometry clamps derived bounds', () => {
  const state = createScrollState({ offsetRow: 100, offsetColumn: 50 });
  assert.deepEqual(state, { offsetRow: 100, offsetColumn: 50, followTail: false });
  assert.deepEqual(normalizeScrollState(state, geometry), {
    offsetRow: 90,
    offsetColumn: 40,
    followTail: false,
  });
  assert.deepEqual(
    visibleWindowFromScroll(state, geometry),
    { startIndex: 90, endIndexExclusive: 100 },
  );
});

void test('scroll reducer applies line, page, edge, and absolute transitions', () => {
  let state = createScrollState();
  state = scrollReducer(state, { kind: 'scrollLines', rows: 3, columns: 2 }, geometry);
  assert.deepEqual(state, { offsetRow: 3, offsetColumn: 2, followTail: false });
  state = scrollReducer(state, { kind: 'scrollPages', rows: 2 }, geometry);
  assert.equal(state.offsetRow, 23);
  state = scrollReducer(state, { kind: 'setOffset', rows: 40, columns: 12 }, geometry);
  assert.deepEqual(state, { offsetRow: 40, offsetColumn: 12, followTail: false });
  state = scrollReducer(state, { kind: 'bottom' }, geometry);
  assert.deepEqual(state, { offsetRow: 90, offsetColumn: 12, followTail: true });
  state = scrollReducer(state, { kind: 'top' }, geometry);
  assert.deepEqual(state, { offsetRow: 0, offsetColumn: 12, followTail: false });
});

void test('scroll reducer preserves identity for normalized no-ops', () => {
  const top = createScrollState();
  assert.equal(scrollReducer(top, { kind: 'scrollLines', rows: -1 }, geometry), top);
  assert.notEqual(scrollReducer(top, { kind: 'scrollLines', rows: 1 }, geometry), top);
});

void test('follow-tail is recomputed from current geometry without storing dimensions', () => {
  const initial = scrollReducer(createScrollState(), { kind: 'bottom' }, {
    ...geometry,
    contentRows: 10,
    viewportRows: 4,
  });
  assert.deepEqual(initial, { offsetRow: 6, offsetColumn: 0, followTail: true });

  const grown = normalizeScrollState(initial, {
    ...geometry,
    contentRows: 15,
    viewportRows: 4,
  });
  assert.equal(grown.offsetRow, 11);
  const detached = scrollReducer(grown, { kind: 'scrollLines', rows: -2 }, {
    ...geometry,
    contentRows: 15,
    viewportRows: 4,
  });
  assert.deepEqual(detached, { offsetRow: 9, offsetColumn: 0, followTail: false });
});

void test('item-into-view changes scroll position without retaining collection selection', () => {
  const large = { ...geometry, contentRows: 50_000 };
  const state = scrollReducer(
    createScrollState(),
    { kind: 'itemIntoView', itemIndex: 40_000, alignment: 'nearest' },
    large,
  );
  assert.deepEqual(state, { offsetRow: 39_991, offsetColumn: 0, followTail: false });
  assert.deepEqual(visibleWindowFromScroll(state, large), {
    startIndex: 39_991,
    endIndexExclusive: 40_001,
  });
});

void test('scroll events expose semantic state and do not leak routed pointer input', () => {
  const stale = createScrollState({ offsetRow: 79 });
  const rendered = createScrollState({ offsetRow: 71 });
  const next = applyScrollEvent(stale, {
    nextState: rendered,
    source: 'wheel',
    target: 'content',
  });
  assert.equal(next, rendered);
});

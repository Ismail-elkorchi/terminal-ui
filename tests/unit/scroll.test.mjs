import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createScrollState,
  normalizeScrollState,
  scrollReducer,
  visibleWindowFromScroll
} from '../../dist/tui/index.js';

test('scroll state normalizes offsets and visible windows', () => {
  const state = createScrollState({
    offsetRow: 100,
    offsetColumn: 50,
    contentRows: 20,
    contentColumns: 12,
    viewportRows: 5,
    viewportColumns: 4
  });

  assert.deepEqual(state, {
    offsetRow: 15,
    offsetColumn: 8,
    contentRows: 20,
    contentColumns: 12,
    viewportRows: 5,
    viewportColumns: 4,
    followTail: false
  });
  assert.deepEqual(visibleWindowFromScroll(state), { start: 15, end: 20 });
});

test('scroll reducer supports line, page, top, and bottom actions', () => {
  let state = createScrollState({ contentRows: 100, viewportRows: 10 });

  state = scrollReducer(state, { kind: 'scrollLines', rows: 3 });
  assert.equal(state.offsetRow, 3);

  state = scrollReducer(state, { kind: 'scrollPages', rows: 2 });
  assert.equal(state.offsetRow, 23);

  state = scrollReducer(state, { kind: 'bottom' });
  assert.equal(state.offsetRow, 90);
  assert.equal(state.followTail, true);

  state = scrollReducer(state, { kind: 'top' });
  assert.equal(state.offsetRow, 0);
  assert.equal(state.followTail, false);
});

test('follow-tail stays at the bottom while content grows and freezes when the user scrolls up', () => {
  let state = createScrollState({ contentRows: 10, viewportRows: 4 });

  state = scrollReducer(state, { kind: 'bottom' });
  assert.equal(state.offsetRow, 6);
  assert.equal(state.followTail, true);

  state = scrollReducer(state, { kind: 'setContent', rows: 15 });
  assert.equal(state.offsetRow, 11);
  assert.equal(state.followTail, true);

  state = scrollReducer(state, { kind: 'scrollLines', rows: -2 });
  assert.equal(state.offsetRow, 9);
  assert.equal(state.followTail, false);

  state = scrollReducer(state, { kind: 'setContent', rows: 20 });
  assert.equal(state.offsetRow, 9);
  assert.equal(state.followTail, false);
});

test('item-into-view centers selected items and records selection', () => {
  const state = scrollReducer(
    createScrollState({ contentRows: 50_000, viewportRows: 10 }),
    { kind: 'itemIntoView', index: 40_000 }
  );

  assert.equal(state.selectedIndex, 40_000);
  assert.deepEqual(visibleWindowFromScroll(state), { start: 39_995, end: 40_005 });
});

test('normalizing a selected index clamps it to content bounds', () => {
  assert.deepEqual(
    normalizeScrollState({
      offsetRow: 0,
      offsetColumn: 0,
      contentRows: 3,
      contentColumns: 0,
      viewportRows: 1,
      viewportColumns: 0,
      followTail: false,
      selectedIndex: 99
    }).selectedIndex,
    2
  );
});

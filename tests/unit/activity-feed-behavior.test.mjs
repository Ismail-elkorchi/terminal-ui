import assert from 'node:assert/strict';
import test from 'node:test';

import {
  activityBlockCollapsed,
  activityFeedReducer,
  copyActivityFeedVisibleText
} from '../../dist/behavior/index.js';

const blocks = [
  {
    id: 'pending',
    title: 'Pending block',
    summary: 'Waiting',
    status: 'pending',
    collapsed: true
  },
  {
    id: 'warning',
    title: 'Warning block',
    summary: 'Needs attention',
    status: 'warning',
    body: 'Line one\nLine two'
  },
  {
    id: 'success',
    title: 'Success block',
    summary: 'Done',
    status: 'success'
  },
  {
    id: 'error',
    title: 'Error block',
    summary: 'Failed \u001B[31mred\u001B[0m',
    status: 'error',
    details: 'Stack trace'
  }
];

const initialState = {
  selectedId: 'pending',
  expandedIds: [],
  collapsedIds: []
};

test('activityFeedReducer selects visible items and wraps', () => {
  const next = activityFeedReducer(initialState, { kind: 'selectNext' }, { blocks });
  const previous = activityFeedReducer(next, { kind: 'selectPrevious' }, { blocks });

  assert.equal(next.selectedId, 'warning');
  assert.equal(previous.selectedId, 'pending');
});

test('activityFeedReducer enters from the nearest edge when no selection exists', () => {
  const state = { expandedIds: [], collapsedIds: [] };

  assert.equal(activityFeedReducer(state, { kind: 'selectNext' }, { blocks }).selectedId, 'pending');
  assert.equal(activityFeedReducer(state, { kind: 'selectPrevious' }, { blocks }).selectedId, 'error');
});

test('activityFeedReducer selects records by stable id and supports boundaries', () => {
  const selected = activityFeedReducer(initialState, { kind: 'select', id: 'success' }, { blocks });
  const first = activityFeedReducer(selected, { kind: 'selectFirst' }, { blocks });
  const last = activityFeedReducer(first, { kind: 'selectLast' }, { blocks });
  const invalid = activityFeedReducer(last, { kind: 'select', id: 'missing' }, { blocks });

  assert.equal(selected.selectedId, 'success');
  assert.equal(first.selectedId, 'pending');
  assert.equal(last.selectedId, 'error');
  assert.equal(invalid, last);
});

test('activityFeedReducer expands and collapses caller-owned block state', () => {
  const expanded = activityFeedReducer(initialState, { kind: 'expandBlock', id: 'pending' }, { blocks });
  const collapsed = activityFeedReducer(expanded, { kind: 'collapseBlock', id: 'pending' }, { blocks });

  assert.equal(activityBlockCollapsed(blocks[0], expanded), false);
  assert.equal(activityBlockCollapsed(blocks[0], collapsed), true);
  assert.deepEqual(expanded.expandedIds, ['pending']);
  assert.deepEqual(collapsed.collapsedIds, ['pending']);
});

test('copyActivityFeedVisibleText returns sanitized visible block text', () => {
  const text = copyActivityFeedVisibleText(blocks, {
    expandedIds: [],
    collapsedIds: []
  });

  assert.match(text, /\[error\] Error block\nFailed red\nStack trace/u);
  assert.doesNotMatch(text, /\u001B/u);
});

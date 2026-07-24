import assert from 'node:assert/strict';
import test from 'node:test';

import {
  activityBlockCollapsed,
  activityFeedReducer,
  copyActivityFeedVisibleText
} from '../../dist/behavior/index.js';
import type { StructuredBlock } from '../../dist/components/index.js';

const blocks = [
  {
    id: 'pending',
    title: 'Pending block',
    summary: 'Waiting',
    result: 'pending',
    collapsed: true
  },
  {
    id: 'warning',
    title: 'Warning block',
    summary: 'Needs attention',
    level: 'warning',
    body: 'Line one\nLine two'
  },
  {
    id: 'success',
    title: 'Success block',
    summary: 'Done',
    result: 'success'
  },
  {
    id: 'error',
    title: 'Error block',
    summary: 'Failed \u001B[31mred\u001B[0m',
    level: 'error',
    details: 'Stack trace'
  }
] satisfies readonly StructuredBlock[];

const initialState = {
  selectedId: 'pending',
  expandedIds: [],
  collapsedIds: []
};

void test('activityFeedReducer selects visible items and wraps', () => {
  const next = activityFeedReducer(initialState, { kind: 'selectNext' }, { blocks });
  const previous = activityFeedReducer(next, { kind: 'selectPrevious' }, { blocks });

  assert.equal(next.selectedId, 'warning');
  assert.equal(previous.selectedId, 'pending');
});

void test('activityFeedReducer enters from the nearest edge when no selection exists', () => {
  const state = { expandedIds: [], collapsedIds: [] };

  assert.equal(activityFeedReducer(state, { kind: 'selectNext' }, { blocks }).selectedId, 'pending');
  assert.equal(activityFeedReducer(state, { kind: 'selectPrevious' }, { blocks }).selectedId, 'error');
});

void test('activityFeedReducer selects records by stable id and supports boundaries', () => {
  const selected = activityFeedReducer(initialState, { kind: 'select', id: 'success' }, { blocks });
  const first = activityFeedReducer(selected, { kind: 'selectFirst' }, { blocks });
  const last = activityFeedReducer(first, { kind: 'selectLast' }, { blocks });
  const invalid = activityFeedReducer(last, { kind: 'select', id: 'missing' }, { blocks });

  assert.equal(selected.selectedId, 'success');
  assert.equal(first.selectedId, 'pending');
  assert.equal(last.selectedId, 'error');
  assert.equal(invalid, last);
});

void test('activityFeedReducer expands and collapses caller-owned block state', () => {
  const expanded = activityFeedReducer(initialState, { kind: 'expandBlock', id: 'pending' }, { blocks });
  const collapsed = activityFeedReducer(expanded, { kind: 'collapseBlock', id: 'pending' }, { blocks });
  const pending = blocks[0];
  assert.ok(pending);

  assert.equal(activityBlockCollapsed(pending, expanded), false);
  assert.equal(activityBlockCollapsed(pending, collapsed), true);
  assert.deepEqual(expanded.expandedIds, ['pending']);
  assert.deepEqual(collapsed.collapsedIds, ['pending']);
});

void test('copyActivityFeedVisibleText returns sanitized visible block text', () => {
  const text = copyActivityFeedVisibleText(blocks, {
    expandedIds: [],
    collapsedIds: []
  });

  assert.match(text, /\[error\] Error block\nFailed red\nStack trace/u);
  assert.doesNotMatch(text, /\u001B/u);
});

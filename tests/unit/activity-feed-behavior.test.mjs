import assert from 'node:assert/strict';
import test from 'node:test';

import {
  activityBlockCollapsed,
  activityFeedReducer,
  copyActivityFeedVisibleText,
  visibleActivityFeedBlocks
} from '../../dist/widgets/index.js';

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
  selected: 0,
  expandedIds: [],
  collapsedIds: []
};

test('activityFeedReducer selects visible items and wraps', () => {
  const next = activityFeedReducer(initialState, { kind: 'selectNext' }, { blocks });
  const previous = activityFeedReducer(next, { kind: 'selectPrevious' }, { blocks });

  assert.equal(next.selected, 1);
  assert.equal(previous.selected, 0);
});

test('activityFeedReducer filters by status and jumps to problem blocks', () => {
  const filtered = activityFeedReducer(initialState, { kind: 'setStatusFilter', statuses: ['success'] }, { blocks });
  const problem = activityFeedReducer(initialState, { kind: 'jumpToFirstProblem' }, { blocks });

  assert.equal(filtered.selected, 2);
  assert.deepEqual(visibleActivityFeedBlocks(blocks, filtered).map((entry) => entry.block.id), ['success']);
  assert.equal(problem.selected, 1);
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
    selected: 0,
    expandedIds: [],
    collapsedIds: [],
    statusFilter: ['error']
  });

  assert.equal(text, '[error] Error block\nFailed red\nStack trace');
});

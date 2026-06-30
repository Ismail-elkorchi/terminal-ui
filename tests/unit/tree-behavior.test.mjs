import assert from 'node:assert/strict';
import test from 'node:test';

import {
  renderFramePlain,
  renderWidgetFrame
} from '../../dist/tui/index.js';
import {
  tree,
  treeNodeMatches,
  treeReducer,
  treeStateReducer
} from '../../dist/widgets/index.js';

test('treeReducer models lazy pending success error and empty states', () => {
  const nodes = [{ id: 'root', label: 'Root', lazy: true }];
  const pending = treeReducer(nodes, { kind: 'lazyPending', id: 'root', message: 'Loading children' });
  const failed = treeReducer(pending, { kind: 'lazyError', id: 'root', message: 'Network failed' });
  const loaded = treeReducer(failed, { kind: 'lazySuccess', id: 'root', children: [{ id: 'child', label: 'Child' }] });
  const empty = treeReducer(loaded, { kind: 'lazySuccess', id: 'root', children: [] });

  assert.deepEqual(pending[0]?.lazyStatus, 'pending');
  assert.deepEqual(failed[0]?.lazyStatus, 'error');
  assert.equal(loaded[0]?.children?.[0]?.label, 'Child');
  assert.equal(empty[0]?.lazyStatus, 'empty');

  const failedFrame = renderWidgetFrame(tree({ id: 'lazy-error', nodes: failed }), { columns: 24, rows: 3 });
  assert.match(renderFramePlain(failedFrame), /Network failed/u);
});

test('treeReducer renames nodes without mutating input', () => {
  const nodes = [{ id: 'root', label: 'Root' }];
  const renamed = treeReducer(nodes, { kind: 'rename', id: 'root', label: 'Workspace' });

  assert.equal(nodes[0]?.label, 'Root');
  assert.equal(renamed[0]?.label, 'Workspace');
});

test('treeStateReducer owns selection filter and rename interaction state', () => {
  const selected = treeStateReducer({}, { kind: 'select', id: 'node-a' });
  const filtered = treeStateReducer(selected, { kind: 'filter', query: 'term' });
  const renaming = treeStateReducer(filtered, { kind: 'startRename', id: 'node-a', value: 'Node A' });
  const updated = treeStateReducer(renaming, { kind: 'updateRename', value: 'Node Alpha' });
  const committed = treeStateReducer(updated, { kind: 'commitRename' });
  const cleared = treeStateReducer(committed, { kind: 'filter', query: '' });

  assert.deepEqual(selected, { selected: 'node-a' });
  assert.deepEqual(filtered, { selected: 'node-a', filterQuery: 'term' });
  assert.deepEqual(updated.rename, { id: 'node-a', value: 'Node Alpha' });
  assert.equal(committed.rename, undefined);
  assert.equal(cleared.filterQuery, undefined);
});

test('treeNodeMatches searches label id icon lazy message and metadata', () => {
  const node = {
    id: 'api',
    label: 'Service',
    icon: 'S',
    lazyMessage: 'Network pending',
    metadata: { domain: 'server' }
  };

  assert.equal(treeNodeMatches(node, 'service'), true);
  assert.equal(treeNodeMatches(node, 'server'), true);
  assert.equal(treeNodeMatches(node, 'network'), true);
  assert.equal(treeNodeMatches(node, 'missing'), false);
});

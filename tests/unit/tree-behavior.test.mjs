import assert from 'node:assert/strict';
import test from 'node:test';

import {
  renderFramePlain,
  renderWidgetFrame
} from '../../dist/tui/index.js';
import {
  nextTreeRowId,
  selectableTreeRows,
  tree,
  treeDisclosureAction,
  treeNodeCanDisclose,
  treeNodeMatches,
  treeReducer,
  treeStateReducer,
  visibleTreeRows
} from '../../dist/widgets/index.js';

test('treeReducer models lazy pending success error and empty states', () => {
  const nodes = [{
    id: 'root',
    label: 'Root',
    description: 'workspace/root',
    lazy: true,
    metadata: { path: '/workspace/root' }
  }];
  const pending = treeReducer(nodes, { kind: 'lazyPending', id: 'root', message: 'Loading children' });
  const failed = treeReducer(pending, { kind: 'lazyError', id: 'root', message: 'Network failed' });
  const loaded = treeReducer(failed, { kind: 'lazySuccess', id: 'root', children: [{ id: 'child', label: 'Child' }] });
  const empty = treeReducer(loaded, { kind: 'lazySuccess', id: 'root', children: [] });

  assert.deepEqual(pending[0]?.lazyStatus, 'pending');
  assert.deepEqual(failed[0]?.lazyStatus, 'error');
  assert.equal(loaded[0]?.children?.[0]?.label, 'Child');
  assert.equal(loaded[0]?.description, 'workspace/root');
  assert.deepEqual(loaded[0]?.metadata, { path: '/workspace/root' });
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

test('treeNodeMatches searches label id description icon lazy message and metadata', () => {
  const node = {
    id: 'api',
    label: 'Service',
    description: 'Request handlers',
    icon: 'S',
    lazyMessage: 'Network pending',
    metadata: { domain: 'server' }
  };

  assert.equal(treeNodeMatches(node, 'service'), true);
  assert.equal(treeNodeMatches(node, 'handlers'), true);
  assert.equal(treeNodeMatches(node, 'server'), true);
  assert.equal(treeNodeMatches(node, 'network'), true);
  assert.equal(treeNodeMatches(node, 'missing'), false);
});

test('visibleTreeRows exposes depth paths expanded children and lazy placeholders', () => {
  const nodes = [{
    id: 'root',
    label: 'Root',
    expanded: true,
    children: [
      {
        id: 'src',
        label: 'Source',
        expanded: true,
        children: [{ id: 'src/index.ts', label: 'index.ts' }]
      },
      {
        id: 'lazy',
        label: 'Lazy',
        lazy: true,
        expanded: true,
        lazyStatus: 'pending'
      }
    ]
  }];

  const rows = visibleTreeRows(nodes);

  assert.deepEqual(rows.map((row) => row.node.id), ['root', 'src', 'src/index.ts', 'lazy', 'lazy:lazy']);
  assert.deepEqual(rows.map((row) => row.depth), [0, 1, 2, 1, 2]);
  assert.deepEqual(rows[2]?.path, ['root', 'src', 'src/index.ts']);
  assert.equal(rows[4]?.lazyPlaceholder, true);
  assert.equal(rows[4]?.node.disabled, true);
  assert.equal(rows[4]?.node.label, 'Loading…');
});

test('visibleTreeRows keeps matching descendants and their ancestors while filtering', () => {
  const nodes = [{
    id: 'root',
    label: 'Root',
    children: [
      {
        id: 'src',
        label: 'Source',
        children: [{ id: 'src/index.ts', label: 'index.ts' }]
      },
      {
        id: 'docs',
        label: 'Docs',
        children: [{ id: 'readme', label: 'README.md' }]
      }
    ]
  }];

  const rows = visibleTreeRows(nodes, { filterQuery: 'readme' });

  assert.deepEqual(rows.map((row) => row.node.id), ['root', 'docs', 'readme']);
  assert.deepEqual(rows.map((row) => row.path.join('/')), ['root', 'root/docs', 'root/docs/readme']);
});

test('nextTreeRowId skips disabled and lazy placeholder rows and wraps', () => {
  const rows = visibleTreeRows([{
    id: 'root',
    label: 'Root',
    expanded: true,
    children: [
      { id: 'disabled', label: 'Disabled', disabled: true },
      { id: 'file-a', label: 'A' },
      { id: 'lazy', label: 'Lazy', lazy: true, expanded: true },
      { id: 'file-b', label: 'B' }
    ]
  }]);

  assert.deepEqual(selectableTreeRows(rows).map((row) => row.node.id), ['root', 'file-a', 'lazy', 'file-b']);
  assert.equal(nextTreeRowId(rows, 'root', 1), 'file-a');
  assert.equal(nextTreeRowId(rows, 'file-b', 1), 'root');
  assert.equal(nextTreeRowId(rows, 'root', -1), 'file-b');
});

test('treeDisclosureAction returns only meaningful disclosure actions', () => {
  const leaf = { id: 'leaf', label: 'Leaf' };
  const collapsed = { id: 'folder', label: 'Folder', children: [{ id: 'child', label: 'Child' }] };
  const expanded = { ...collapsed, expanded: true };
  const lazy = { id: 'lazy', label: 'Lazy', lazy: true };

  assert.equal(treeNodeCanDisclose(leaf), false);
  assert.equal(treeDisclosureAction(leaf, 'toggle'), undefined);
  assert.deepEqual(treeDisclosureAction(collapsed, 'toggle'), { kind: 'toggle', id: 'folder' });
  assert.deepEqual(treeDisclosureAction(collapsed, 'expand'), { kind: 'expand', id: 'folder' });
  assert.equal(treeDisclosureAction(collapsed, 'collapse'), undefined);
  assert.equal(treeDisclosureAction(expanded, 'expand'), undefined);
  assert.deepEqual(treeDisclosureAction(expanded, 'collapse'), { kind: 'collapse', id: 'folder' });
  assert.deepEqual(treeDisclosureAction(lazy, 'toggle'), { kind: 'toggle', id: 'lazy' });
});

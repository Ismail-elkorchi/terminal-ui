import assert from 'node:assert/strict';
import test from 'node:test';

import {
  renderFramePlain,
  renderElementFrame
} from '../../dist/renderer/index.js';
import {
  nextTreeRowId,
  selectableTreeRows,
  treeDisclosureAction,
  treeNodeCanDisclose,
  treeNodeMatches,
  treePresentation,
  treeReducer,
  visibleTreeRows
} from '../../dist/behavior/index.js';
import { tree } from '../../dist/components/index.js';

test('treeReducer models lazy pending success error and empty states', () => {
  const nodes = [{
    id: 'root',
    label: 'Root',
    description: 'workspace/root',
    kind: 'lazy',
    expanded: false,
    loading: { kind: 'idle' },
    metadata: { path: '/workspace/root' }
  }];
  const pending = treeReducer({ nodes }, { kind: 'lazyPending', id: 'root', message: 'Loading children' });
  const failed = treeReducer(pending, { kind: 'lazyError', id: 'root', message: 'Network failed' });
  const loaded = treeReducer(failed, { kind: 'lazySuccess', id: 'root', children: [{ id: 'child', label: 'Child', kind: 'leaf' }] });
  const empty = treeReducer(loaded, { kind: 'lazySuccess', id: 'root', children: [] });

  assert.deepEqual(pending.nodes[0]?.loading?.kind, 'pending');
  assert.deepEqual(failed.nodes[0]?.loading?.kind, 'error');
  assert.equal(loaded.nodes[0]?.children?.[0]?.label, 'Child');
  assert.equal(loaded.nodes[0]?.description, 'workspace/root');
  assert.deepEqual(loaded.nodes[0]?.metadata, { path: '/workspace/root' });
  assert.equal(empty.nodes[0]?.loading?.kind, 'empty');

  const failedFrame = renderElementFrame(tree({ id: 'lazy-error', ...treePresentation(failed) }), { columns: 24, rows: 3 });
  assert.match(renderFramePlain(failedFrame), /Network failed/u);
});

test('treeReducer renames nodes without mutating input', () => {
  const nodes = [{ id: 'root', label: 'Root', kind: 'leaf' }];
  const started = treeReducer({ nodes }, { kind: 'startRename', id: 'root', value: 'Root' });
  const updated = treeReducer(started, { kind: 'updateRename', value: 'Workspace' });
  const renamed = treeReducer(updated, { kind: 'commitRename' });

  assert.equal(nodes[0]?.label, 'Root');
  assert.equal(renamed.nodes[0]?.label, 'Workspace');
  assert.equal(renamed.rename, undefined);
});

test('treeReducer owns hierarchy selection filter and rename state together', () => {
  const initial = { nodes: [{ id: 'node-a', label: 'Node A', kind: 'leaf' }] };
  const selected = treeReducer(initial, { kind: 'select', id: 'node-a' });
  const filtered = treeReducer(selected, { kind: 'filter', query: 'term' });
  const renaming = treeReducer(filtered, { kind: 'startRename', id: 'node-a', value: 'Node A' });
  const updated = treeReducer(renaming, { kind: 'updateRename', value: 'Node Alpha' });
  const committed = treeReducer(updated, { kind: 'commitRename' });
  const cleared = treeReducer(committed, { kind: 'filter', query: '' });

  assert.equal(selected.selected, 'node-a');
  assert.equal(filtered.filterQuery, 'term');
  assert.deepEqual(updated.rename, { id: 'node-a', value: 'Node Alpha' });
  assert.equal(committed.nodes[0]?.label, 'Node Alpha');
  assert.equal(committed.rename, undefined);
  assert.equal(cleared.filterQuery, undefined);
});

test('treeNodeMatches searches label id description icon lazy message and metadata', () => {
  const node = {
    id: 'api',
    label: 'Service',
    description: 'Request handlers',
    icon: 'S',
    kind: 'lazy',
    expanded: true,
    loading: { kind: 'pending', message: 'Network pending' },
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
    kind: 'branch',
    expanded: true,
    children: [
      {
        id: 'src',
        label: 'Source',
        kind: 'branch',
        expanded: true,
        children: [{ id: 'src/index.ts', label: 'index.ts', kind: 'leaf' }]
      },
      {
        id: 'lazy',
        label: 'Lazy',
        kind: 'lazy',
        expanded: true,
        loading: { kind: 'pending' }
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
    kind: 'branch',
    expanded: false,
    children: [
      {
        id: 'src',
        label: 'Source',
        kind: 'branch', expanded: false, children: [{ id: 'src/index.ts', label: 'index.ts', kind: 'leaf' }]
      },
      {
        id: 'docs',
        label: 'Docs',
        kind: 'branch', expanded: false, children: [{ id: 'readme', label: 'README.md', kind: 'leaf' }]
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
    kind: 'branch',
    expanded: true,
    children: [
      { id: 'disabled', label: 'Disabled', disabled: true, kind: 'leaf' },
      { id: 'file-a', label: 'A', kind: 'leaf' },
      { id: 'lazy', label: 'Lazy', kind: 'lazy', expanded: true, loading: { kind: 'pending' } },
      { id: 'file-b', label: 'B', kind: 'leaf' }
    ]
  }]);

  assert.deepEqual(selectableTreeRows(rows).map((row) => row.node.id), ['root', 'file-a', 'lazy', 'file-b']);
  assert.equal(nextTreeRowId(rows, 'root', 1), 'file-a');
  assert.equal(nextTreeRowId(rows, 'file-b', 1), 'root');
  assert.equal(nextTreeRowId(rows, 'root', -1), 'file-b');
  assert.equal(nextTreeRowId(rows, undefined, 1), 'root');
  assert.equal(nextTreeRowId(rows, undefined, -1), 'file-b');
});

test('treeDisclosureAction returns only meaningful disclosure actions', () => {
  const leaf = { id: 'leaf', label: 'Leaf', kind: 'leaf' };
  const collapsed = { id: 'folder', label: 'Folder', kind: 'branch', expanded: false, children: [{ id: 'child', label: 'Child', kind: 'leaf' }] };
  const expanded = { ...collapsed, expanded: true };
  const lazy = { id: 'lazy', label: 'Lazy', kind: 'lazy', expanded: false, loading: { kind: 'idle' } };

  assert.equal(treeNodeCanDisclose(leaf), false);
  assert.equal(treeDisclosureAction(leaf, 'toggle'), undefined);
  assert.deepEqual(treeDisclosureAction(collapsed, 'toggle'), { kind: 'toggle', id: 'folder' });
  assert.deepEqual(treeDisclosureAction(collapsed, 'expand'), { kind: 'expand', id: 'folder' });
  assert.equal(treeDisclosureAction(collapsed, 'collapse'), undefined);
  assert.equal(treeDisclosureAction(expanded, 'expand'), undefined);
  assert.deepEqual(treeDisclosureAction(expanded, 'collapse'), { kind: 'collapse', id: 'folder' });
  assert.deepEqual(treeDisclosureAction(lazy, 'toggle'), { kind: 'toggle', id: 'lazy' });
});

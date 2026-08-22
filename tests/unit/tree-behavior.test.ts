import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createScrollState,
  prepareTreeCollection,
  prepareTreeSource,
  prepareTreeView,
  prepareTreeRows,
  selectableTreeRows,
  treeDisclosureTransition,
  treeNodeMatches,
  treeReducer,
  visibleTreeRows,
} from '../../dist/behavior/index.js';
import type { TreeNode, UnscrolledTreePresentation } from '../../dist/components/index.js';

const nodes: readonly TreeNode<{ readonly path: string }>[] = [
  {
    id: 'src',
    label: 'Source',
    kind: 'branch',
    metadata: { path: '/src' },
    children: [
      { id: 'index', label: 'index.ts', kind: 'leaf', metadata: { path: '/src/index.ts' } },
      { id: 'disabled', label: 'generated.ts', kind: 'leaf', disabled: true, metadata: { path: '/src/generated.ts' } },
    ],
  },
  { id: 'remote', label: 'Remote', kind: 'lazy', metadata: { path: '/remote' } },
];
const sourceNode = nodes[0];
const remoteNode = nodes[1];
if (sourceNode?.kind !== 'branch' || remoteNode === undefined) {
  throw new Error('Invalid tree test fixture.');
}
const indexNode = sourceNode.children[0];
if (indexNode === undefined) throw new Error('Invalid tree child fixture.');

const initial = {
  expandedIds: ['src'],
  activeId: 'src',
  selection: { mode: 'single', selectedId: 'src' },
} as const satisfies UnscrolledTreePresentation;

const source = prepareTreeSource(nodes);
const options = { view: prepareTreeView(source, initial) };

void test('tree navigation changes active row without changing application selection', () => {
  const moved = treeReducer(initial, { kind: 'moveActive', delta: 1 }, options);
  const committed = treeReducer(moved, { kind: 'commitActive' }, options);

  assert.equal(moved.activeId, 'index');
  assert.deepEqual(moved.selection, { mode: 'single', selectedId: 'src' });
  assert.deepEqual(committed.selection, { mode: 'single', selectedId: 'index' });
});

void test('tree navigation clamps and skips disabled rows by default', () => {
  const last = treeReducer(initial, { kind: 'lastActive' }, options);
  const stillLast = treeReducer(last, { kind: 'moveActive', delta: 1 }, options);
  assert.equal(last.activeId, 'remote');
  assert.equal(stillLast.activeId, 'remote');
  assert.equal(stillLast, last);
});

void test('tree navigation keeps the active row inside the controlled viewport', () => {
  const scrolled = treeReducer({
    ...initial,
    scroll: createScrollState({}),
  }, { kind: 'lastActive' }, {
    ...options,
    pageSize: 2,
  });

  assert.equal(scrolled.activeId, 'remote');
  assert.equal(scrolled.scroll.offsetRow, 2);
});

void test('tree disclosure state is independent from immutable node data', () => {
  const collapsed = treeReducer(initial, { kind: 'collapse', id: 'src' }, options);
  const stillCollapsed = treeReducer(collapsed, { kind: 'collapse', id: 'src' }, {
    view: prepareTreeView(source, collapsed)
  });
  const expanded = treeReducer(collapsed, { kind: 'expandAll' }, { view: prepareTreeView(source, collapsed) });
  const stillExpanded = treeReducer(expanded, { kind: 'expandAll' }, { view: prepareTreeView(source, expanded) });
  const reset = treeReducer(expanded, { kind: 'collapseAll' }, { view: prepareTreeView(source, expanded) });

  assert.deepEqual(collapsed.expandedIds, []);
  assert.deepEqual(expanded.expandedIds, ['src', 'remote']);
  assert.deepEqual(reset.expandedIds, []);
  assert.equal(stillCollapsed, collapsed);
  assert.equal(stillExpanded, expanded);
  assert.equal('expanded' in sourceNode, false);
});

void test('tree disclosure events describe intent and lazy loading stays application-owned', () => {
  assert.deepEqual(treeDisclosureTransition(sourceNode, true, 'toggle'), { kind: 'toggle', id: 'src' });
  assert.equal(treeDisclosureTransition(sourceNode, true, 'expand'), undefined);
  assert.deepEqual(treeDisclosureTransition(remoteNode, false, 'expand'), { kind: 'expand', id: 'remote' });
  assert.equal(treeDisclosureTransition(indexNode, false, 'toggle'), undefined);
});

void test('shared collection queries reveal matching descendants and their ancestors', () => {
  const query = { text: 'index', mode: 'contains' } as const;
  const rows = visibleTreeRows(source, { expandedIds: [], query });
  assert.deepEqual(rows.map((row) => row.node.id), ['src', 'index']);
  assert.equal(treeNodeMatches(sourceNode, query), false);
  assert.equal(treeNodeMatches(indexNode, query), true);
});

void test('lazy presentation state belongs to TreePresentation and produces a nonselectable status row', () => {
  const rows = visibleTreeRows(source, {
    expandedIds: ['remote'],
    loadStates: { remote: { kind: 'pending', message: 'Fetching' } },
  });
  assert.deepEqual(rows.map((row) => row.node.id), ['src', 'remote', 'remote:status']);
  assert.deepEqual(selectableTreeRows(rows).map((row) => row.node.id), ['src', 'remote']);
});

void test('tree collections preserve stable row identity and window metadata', () => {
  const collection = prepareTreeCollection(source, initial);
  const windowed = prepareTreeRows(collection.records.map((record) => record.row), {
    startIndex: 10,
    totalCount: 20,
    domain: { kind: 'source' },
  });
  assert.deepEqual(collection.records.map((record) => record.id), ['src', 'index', 'disabled', 'remote']);
  assert.equal(windowed.kind, 'window');
  assert.equal(windowed.records[0]?.itemIndex, 10);
  assert.equal(windowed.totalCount, 20);
});

void test('tree rejects duplicate application identities at the projection boundary', () => {
  assert.throws(() => prepareTreeSource([
    { id: 'same', label: 'One', kind: 'leaf' },
    { id: 'same', label: 'Two', kind: 'leaf' },
  ]), /must be unique/u);
});

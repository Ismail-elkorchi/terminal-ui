import assert from 'node:assert/strict';
import test from 'node:test';
import { createTreeSource, treeReducer } from '../../../dist/behavior/index.js';
import { tree } from '../../../dist/components/index.js';
import { renderElementSnapshot } from '../../../dist/testing/index.js';

const source = createTreeSource([{
  id: 'parent',
  label: 'Parent',
  kind: 'branch',
  children: [{ id: 'child', label: 'Child', kind: 'leaf' }],
}]);
const selection = { mode: 'single' };

function paint(state) {
  return renderElementSnapshot({
    terminalSize: { columns: 24, rows: 3 },
    element: tree({
      id: 'navigation',
      meta: { accessibleName: 'Navigation' },
      source,
      state,
      onTransition: (transition) => transition,
    }),
  }).plainTextFrame;
}

test('tree rendering and navigation derive from the same current expansion state', () => {
  const collapsed = { activeId: 'parent', expandedIds: [], selection };
  assert.doesNotMatch(paint(collapsed), /Child/u);
  const expanded = treeReducer(collapsed, { kind: 'expand', id: 'parent' }, { source });
  assert.match(paint(expanded), /Child/u);
  const moved = treeReducer(expanded, { kind: 'moveActive', delta: 1 }, { source });
  assert.equal(moved.activeId, 'child');
  const closed = treeReducer(moved, { kind: 'collapse', id: 'parent' }, { source });
  assert.doesNotMatch(paint(closed), /Child/u);
});

test('tree projection changes when a caller mutates an expansion array', () => {
  const state = { expandedIds: [], selection };
  assert.doesNotMatch(paint(state), /Child/u);
  state.expandedIds.push('parent');
  assert.match(paint(state), /Child/u);
});

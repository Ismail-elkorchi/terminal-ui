import assert from 'node:assert/strict';
import test from 'node:test';
import { createTreeSource, createTreeView, treeReducer } from '../../../dist/behavior/index.js';
import { tree } from '../../../dist/components/index.js';
import { renderElementSnapshot } from '../../../dist/testing/index.js';

const source = createTreeSource([{
  id: 'parent',
  label: 'Parent',
  kind: 'branch',
  children: [{ id: 'child', label: 'Child', kind: 'leaf' }],
}]);
const selection = { mode: 'single' };

function paint(state, view) {
  return renderElementSnapshot({
    terminalSize: { columns: 24, rows: 3 },
    element: tree({
      id: 'navigation',
      meta: { accessibleName: 'Navigation' },
      source,
      state,
      view,
      onTransition: (transition) => transition,
    }),
  }).plainTextFrame;
}

test('tree rendering and navigation derive from the same current expansion state', () => {
  const collapsed = { activeId: 'parent', expandedIds: [], selection };
  assert.doesNotMatch(paint(collapsed, createTreeView(source, collapsed)), /Child/u);
  const expanded = treeReducer(collapsed, { kind: 'expand', id: 'parent' }, { source, view: createTreeView(source, collapsed) });
  assert.match(paint(expanded, createTreeView(source, expanded)), /Child/u);
  const moved = treeReducer(expanded, { kind: 'moveActive', delta: 1 }, { source, view: createTreeView(source, expanded) });
  assert.equal(moved.activeId, 'child');
  const closed = treeReducer(moved, { kind: 'collapse', id: 'parent' }, { source, view: createTreeView(source, moved) });
  assert.doesNotMatch(paint(closed, createTreeView(source, closed)), /Child/u);
});

test('tree projection changes when a caller mutates an expansion array', () => {
  const state = { expandedIds: [], selection };
  assert.doesNotMatch(paint(state, createTreeView(source, state)), /Child/u);
  state.expandedIds.push('parent');
  assert.match(paint(state, createTreeView(source, state)), /Child/u);
});

test('tree components leave stale source and projection results pending and reject forged views', () => {
  const collapsed = { expandedIds: [], selection };
  const accepted = createTreeView(source, collapsed);
  const expanded = { ...collapsed, expandedIds: ['parent'] };
  const filtered = { ...collapsed, query: { text: 'Child' } };
  for (const state of [expanded, filtered]) {
    assert.match(paint(state, accepted), /Tree not ready/u);
    assert.doesNotMatch(paint(state, accepted), /Parent|Child/u);
    const ready = paint(state, createTreeView(source, state));
    assert.match(ready, /Child/u);
    assert.doesNotMatch(ready, /Tree not ready/u);
  }
  const replaced = createTreeSource([{ id: 'other', label: 'Other', kind: 'leaf' }]);
  const replacedSnapshot = renderElementSnapshot({
    terminalSize: { columns: 24, rows: 3 },
    element: tree({ id: 'navigation', meta: { accessibleName: 'Navigation' },
      source: replaced, state: collapsed, view: accepted, onTransition: value => value }),
  });
  assert.match(replacedSnapshot.plainTextFrame, /Tree not ready/u);
  assert.match(replacedSnapshot.accessibilityJson, /Tree not ready/u);
  assert.doesNotMatch(replacedSnapshot.plainTextFrame, /Parent|Other/u);
  assert.throws(() => paint(collapsed, { ...accepted }), /must be created by terminal-ui/u);
  assert.throws(() => paint(collapsed, undefined), /tree view/u);
  assert.match(paint(collapsed, null), /Tree not ready/u);
  const noMatches = { ...collapsed, query: { text: 'absent' } };
  const readyEmpty = paint(noMatches, createTreeView(source, noMatches));
  assert.match(readyEmpty, /No items/u);
  assert.doesNotMatch(readyEmpty, /Tree not ready/u);
});

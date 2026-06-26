import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createScrollState,
  paginationWindow,
  renderFrame,
  renderWidgetFrame,
  treeReducer
} from '../../dist/tui/index.js';
import { list, table, tree } from '../../dist/widgets/index.js';

test('list widget filters items and can use explicit shared scroll state', () => {
  const frame = renderWidgetFrame(list({
    id: 'filtered-list',
    items: ['alpha', 'bravo', 'charlie', 'delta'],
    filterQuery: 'a',
    scroll: createScrollState({ offsetRow: 1, contentRows: 4, viewportRows: 2 })
  }), { columns: 24, rows: 2 });

  const output = renderFrame(frame);
  assert.match(output, /bravo/u);
  assert.match(output, /charlie/u);
  assert.doesNotMatch(output, /alpha/u);
  assert.equal(frame.accessibility.root.description, 'Showing 2-3 of 4 items.');
});

test('table widget renders constrained columns and selected rows', () => {
  const frame = renderWidgetFrame(table({
    id: 'table',
    selectedCell: { row: 1, column: 1 },
    columns: [
      { header: 'Name', width: 5 },
      { header: 'Value', width: 4 }
    ],
    rows: [
      ['alpha', '100'],
      ['bravo', '200']
    ]
  }), { columns: 24, rows: 3 });

  const output = renderFrame(frame);
  assert.match(output, /Name   Valu/u);
  assert.match(output, /› bravo  200/u);
  assert.equal(frame.accessibility.root.children?.[1]?.selected, true);
});

test('treeReducer toggles nested expansion without mutating input nodes', () => {
  const nodes = [{
    id: 'root',
    label: 'Root',
    children: [{ id: 'child', label: 'Child' }]
  }];
  const expanded = treeReducer(nodes, { kind: 'toggle', id: 'root' });
  const frame = renderWidgetFrame(tree({ id: 'tree', nodes: expanded }), { columns: 24, rows: 3 });

  assert.equal(nodes[0]?.expanded, undefined);
  assert.equal(expanded[0]?.expanded, true);
  assert.match(renderFrame(frame), /Child/u);
});

test('paginationWindow bounds pages and returns visible offsets', () => {
  assert.deepEqual(
    paginationWindow({ page: 99, pageSize: 10, total: 24 }),
    { page: 3, pageCount: 3, start: 20, end: 24 }
  );
});

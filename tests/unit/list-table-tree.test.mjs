import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createScrollState,
  paginationWindow,
  renderFramePlain,
  renderWidgetFrame,
  treeReducer
} from '../../dist/tui/index.js';
import { span } from '../../dist/tui/frame.js';
import { list, table, tree } from '../../dist/widgets/index.js';

test('list widget filters items and can use explicit shared scroll state', () => {
  const frame = renderWidgetFrame(list({
    id: 'filtered-list',
    items: ['alpha', 'bravo', 'charlie', 'delta'],
    filterQuery: 'a',
    scroll: createScrollState({ offsetRow: 1, contentRows: 4, viewportRows: 2 })
  }), { columns: 24, rows: 2 });

  const output = renderFramePlain(frame);
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

  const output = renderFramePlain(frame);
  assert.match(output, /Name   Val…/u);
  assert.match(output, /› bravo  200/u);
  assert.equal(frame.accessibility.root.children?.[1]?.selected, true);
});

test('table supports scroll state column sizing styled renderers sort markers empty states and cell selection', () => {
  const frame = renderWidgetFrame(table({
    id: 'table',
    selectedCell: { row: 2, column: 1 },
    scroll: createScrollState({ offsetRow: 1, offsetColumn: 0, contentRows: 3, viewportRows: 2 }),
    stickyHeader: true,
    columns: [
      { header: 'Hidden', hidden: true },
      { header: 'Name', width: { kind: 'content', max: 8 }, sort: 'ascending' },
      {
        header: 'Score',
        width: { kind: 'fixed', cells: 5 },
        align: 'end',
        render: ({ value }) => span(String(value), { style: { fg: { kind: 'theme', token: 'status.success' } } })
      },
      { header: 'Notes', width: { kind: 'fill' } }
    ],
    rows: [
      ['secret', 'alpha', 10, 'short'],
      ['secret', 'bravo🙂', 200, 'wide name'],
      ['secret', 'charlie', 3000, 'selected row']
    ]
  }), { columns: 34, rows: 3 });

  const output = renderFramePlain(frame);
  const styledScore = frame.cells.find((cell) => cell.text === '2');
  const selectedScore = frame.cells.find((cell) => cell.text === '0' && cell.style?.bg?.token === 'selection.background');

  assert.match(output, /Name ↑/u);
  assert.doesNotMatch(output, /Hidden/u);
  assert.match(output, /bravo🙂/u);
  assert.match(output, /charlie/u);
  assert.equal(styledScore?.style?.fg?.token, 'status.success');
  assert.equal(selectedScore?.style?.bg?.token, 'selection.background');
  assert.equal(frame.accessibility.root.children?.[1]?.children?.[1]?.selected, true);
});

test('table renders a styled empty state', () => {
  const frame = renderWidgetFrame(table({
    id: 'empty',
    rows: [],
    columns: [{ header: 'Name', width: 10 }],
    emptyText: 'No data'
  }), { columns: 24, rows: 3 });

  assert.match(renderFramePlain(frame), /No data/u);
  assert.equal(frame.cells.find((cell) => cell.row === 2 && cell.text === 'N')?.style?.fg?.token, 'input.placeholder');
});

test('table uses shared horizontal scroll state', () => {
  const frame = renderWidgetFrame(table({
    id: 'wide-table',
    scroll: createScrollState({
      offsetRow: 0,
      offsetColumn: 12,
      contentRows: 1,
      contentColumns: 40,
      viewportRows: 2,
      viewportColumns: 16
    }),
    columns: [
      { header: 'First', width: { kind: 'fixed', cells: 12 } },
      { header: 'Second', width: { kind: 'fixed', cells: 12 } }
    ],
    rows: [
      ['alpha-column', 'beta-column']
    ]
  }), { columns: 16, rows: 2 });

  const output = renderFramePlain(frame);
  assert.doesNotMatch(output, /alpha/u);
  assert.match(output, /Second/u);
  assert.match(output, /beta/u);
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
  assert.match(renderFramePlain(frame), /Child/u);
});

test('tree filters through descendants and exposes selected disabled metadata-rich nodes', () => {
  const frame = renderWidgetFrame(tree({
    id: 'tree',
    selected: 'api',
    filterQuery: 'server',
    nodes: [{
      id: 'root',
      label: 'Workspace',
      icon: '▣',
      children: [
        { id: 'ui', label: 'Terminal UI', metadata: { domain: 'widgets' } },
        { id: 'api', label: 'API Layer', disabled: true, metadata: { domain: 'server' } }
      ]
    }]
  }), { columns: 32, rows: 4 });

  const output = renderFramePlain(frame);
  const disabledCell = frame.cells.find((cell) => cell.text === 'A');

  assert.match(output, /Workspace/u);
  assert.match(output, /API Layer/u);
  assert.doesNotMatch(output, /Terminal UI/u);
  assert.equal(disabledCell?.style?.fg?.token, 'text.muted');
  assert.equal(frame.accessibility.root.children?.[1]?.selected, true);
  assert.equal(frame.accessibility.root.children?.[1]?.disabled, true);
  assert.equal(frame.accessibility.root.children?.[1]?.value, 'root/api');
});

test('tree renders lazy placeholders and clips tiny viewports safely', () => {
  const frame = renderWidgetFrame(tree({
    id: 'lazy-tree',
    nodes: [{
      id: 'root',
      label: 'Very long root label for clipping',
      expanded: true,
      lazy: true
    }]
  }), { columns: 14, rows: 2 });

  const output = renderFramePlain(frame);
  assert.match(output, /Very long…/u);
  assert.match(output, /Loading/u);
  assert.equal(frame.accessibility.root.children?.[1]?.disabled, true);
});

test('paginationWindow bounds pages and returns visible offsets', () => {
  assert.deepEqual(
    paginationWindow({ page: 99, pageSize: 10, total: 24 }),
    { page: 3, pageCount: 3, start: 20, end: 24 }
  );
});

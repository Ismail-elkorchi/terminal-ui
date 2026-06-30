import assert from 'node:assert/strict';
import test from 'node:test';

import { createMemoryTerminalHost } from '../../dist/host/index.js';
import {
  createScrollState,
  createTuiRuntime,
  dataWindow,
  defineTui,
  paginationWindow,
  renderFramePlain,
  renderWidgetFrame
} from '../../dist/tui/index.js';
import { span } from '../../dist/tui/frame.js';
import { list, paginatedTable, table, tree, treeReducer, virtualTable } from '../../dist/widgets/index.js';

const mousePress = (row, column) => ({
  kind: 'mouse',
  sequence: '',
  encoding: 'sgr',
  action: 'press',
  button: 'left',
  row,
  column,
  rawCode: 0,
  modifiers: { shift: false, alt: false, ctrl: false }
});

test('dataWindow keeps selected rows visible and preserves explicit scroll windows', () => {
  assert.deepEqual(
    dataWindow({ totalRows: 100, viewportRows: 5, selectedIndex: 40 }),
    {
      totalRows: 100,
      start: 38,
      end: 43,
      selectedIndex: 40,
      selectedVisibleIndex: 2,
      offsetColumn: 0,
      omittedBefore: 38,
      omittedAfter: 57
    }
  );

  assert.deepEqual(
    dataWindow({
      totalRows: 100,
      viewportRows: 5,
      scroll: createScrollState({
        offsetRow: 10,
        offsetColumn: 3,
        contentRows: 100,
        contentColumns: 20,
        viewportRows: 5,
        viewportColumns: 8
      })
    }),
    {
      totalRows: 100,
      start: 10,
      end: 15,
      offsetColumn: 3,
      omittedBefore: 10,
      omittedAfter: 85
    }
  );
});

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

test('list cursor and mouse hit targets use the filtered visible rows', async () => {
  const frame = renderWidgetFrame(list({
    id: 'clickable-list',
    items: ['alpha', 'bravo', 'charlie', 'delta'],
    filterQuery: 'br',
    selected: 0,
    toMessage: (value) => ({ kind: 'chosen', value })
  }), { columns: 24, rows: 2 });

  assert.deepEqual(frame.cursor, { row: 1, column: 1 });
  assert.deepEqual(frame.hitTargets?.map((target) => target.id), ['clickable-list:option:0']);

  const app = defineTui({
    id: 'list-click-flow',
    init: () => ({ selected: 'none' }),
    update: (_state, message) => ({ state: { selected: String(message.value) } }),
    view: () => list({
      id: 'clickable-list',
      items: ['alpha', 'bravo'],
      toMessage: (value) => ({ kind: 'chosen', value })
    })
  });
  const runtime = createTuiRuntime({ app, host: createMemoryTerminalHost({ viewport: { columns: 24, rows: 2 } }) });

  await runtime.start();
  const result = await runtime.handleInput(mousePress(2, 1));

  assert.equal(result.state.selected, 'bravo');
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
  assert.deepEqual(frame.accessibility.root.window, { start: 0, end: 2, total: 2, omittedBefore: 0, omittedAfter: 0 });
  assert.equal(frame.accessibility.root.children?.[0]?.children?.[1]?.position?.columnLabel, 'Value');
  assert.equal(frame.accessibility.root.children?.[2]?.selected, true);
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
  assert.equal(frame.accessibility.root.children?.[0]?.children?.[0]?.value, 'Name');
  assert.equal(frame.accessibility.root.children?.[2]?.children?.[1]?.selected, true);
  assert.equal(frame.accessibility.root.children?.[2]?.children?.[1]?.position?.columnLabel, 'Score');
});

test('table headers can expose a visible resize affordance without changing reducer ownership', () => {
  const frame = renderWidgetFrame(table({
    id: 'resizable-table',
    columns: [
      { header: 'Name', width: 8, resizable: true },
      { header: 'Score', width: 6 }
    ],
    rows: [['Atlas', 89]]
  }), { columns: 24, rows: 2 });

  assert.match(renderFramePlain(frame), /Name ↔/u);
});

test('paginatedTable composes table and paginator over a bounded page', () => {
  const frame = renderWidgetFrame(paginatedTable({
    id: 'fleet-pages',
    label: 'Fleet',
    page: 2,
    pageSize: 2,
    selected: 2,
    columns: [{ header: 'Name', width: 8 }],
    rows: [['Aster'], ['Atlas'], ['Pulse'], ['Lumen'], ['Vector']]
  }), { columns: 24, rows: 5 });

  const output = renderFramePlain(frame);
  assert.match(output, /Pulse/u);
  assert.doesNotMatch(output, /Aster/u);
  assert.match(output, /Fleet Page 2 of 3/u);
  assert.equal(frame.accessibility.root.children?.some((node) => node.role === 'table'), true);
});

test('virtualTable applies sticky headers and both-axis scrollbar defaults to existing table rendering', () => {
  const scroll = createScrollState({
    offsetRow: 2,
    contentRows: 8,
    viewportRows: 3,
    contentColumns: 40,
    viewportColumns: 14
  });
  const frame = renderWidgetFrame(virtualTable({
    id: 'virtual-table',
    scroll,
    columns: [{ header: 'Name', width: 12 }, { header: 'Score', width: 8 }],
    rows: Array.from({ length: 8 }, (_value, index) => [`Vessel ${String(index)}`, index * 10])
  }), { columns: 18, rows: 4 });

  const output = renderFramePlain(frame);
  assert.match(output, /Name/u);
  assert.match(output, /Vessel 2/u);
  assert.doesNotMatch(output, /Vessel 0/u);
  assert.match(output, /█/u);
  assert.match(output, /│/u);
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

test('table selected cell row drives the shared vertical window and scrollbar scope', () => {
  const frame = renderWidgetFrame(table({
    id: 'selected-cell-window',
    selectedCell: { row: 4, column: 0 },
    scrollbar: { visible: 'always' },
    columns: [{ header: 'Name', width: 12 }],
    rows: [
      ['alpha'],
      ['bravo'],
      ['charlie'],
      ['delta'],
      ['echo'],
      ['foxtrot']
    ]
  }), { columns: 16, rows: 3 });

  const output = renderFramePlain(frame);

  assert.doesNotMatch(output, /alpha/u);
  assert.match(output, /echo/u);
  assert.equal(frame.accessibility.root.description, 'Showing 4-5 of 6 rows.');
  assert.equal(frame.cells.filter((cell) => cell.column === 16).length, 2);
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

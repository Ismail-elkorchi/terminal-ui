import assert from 'node:assert/strict';
import test from 'node:test';

import { createMemoryTerminalHost } from '../../dist/host/index.js';
import { createTuiRuntime, defineTui } from '../../dist/tui/index.js';
import { createScrollState, paginationWindow, prepareTableCollection } from '../../dist/behavior/index.js';
import { dataGrid, listbox, pagination, table, tableColumn } from '../../dist/components/index.js';
import { column } from '../../dist/layout/index.js';
import { renderElementFrame, renderFramePlain } from '../../dist/renderer/index.js';

const mouse = (action, row, column) => ({
  kind: 'mouse',
  sequence: '',
  encoding: 'sgr',
  action,
  button: action === 'release' ? 'none' : 'left',
  row,
  column,
  rawCode: 0,
  modifiers: { shift: false, alt: false, ctrl: false }
});

async function clickAt(runtime, row, column) {
  await runtime.handleInput(mouse('press', row, column));
  return runtime.handleInput(mouse('release', row, column));
}

test('listbox and data grid reject invalid stable identities and interaction targets', () => {
  assert.throws(() => listbox({
    id: 'duplicate-listbox',
    items: ['alpha', 'alpha'],
    projectItem: (item) => ({ id: item, label: item }),
    presentation: { selection: { mode: 'none' } },
    onTransition: (transition) => transition
  }), /ids must be unique/u);

  assert.throws(() => dataGrid({
    id: 'empty-grid-id',
    rows: [['alpha']],
    getRowId: () => '',
    columns: [{ id: 'value', header: 'Value', value: (row) => row[0] }],
    presentation: { interaction: { kind: 'row',
    selectionMode: 'single', selectedRowIds: [] } },
    onTransition: (transition) => transition
  }), /id must be non-empty/u);

  assert.throws(() => dataGrid({
    id: 'invalid-cell',
    rows: [['alpha']],
    getRowId: () => 'alpha',
    columns: [{ id: 'value', value: (row) => row[0] }],
    presentation: {
      interaction: {
        kind: 'cell',
        selectionMode: 'single',
        activeCell: { rowId: 'alpha', columnId: 'missing' },
        selectedCells: []
      }
    },
    onTransition: (transition) => transition
  }), /active column is not present/u);
});

test('passive table renders tabular information without focus or selection targets', () => {
  const frame = renderElementFrame(table({
    id: 'summary',
    rows: [{ id: 'alpha', name: 'Alpha', score: 10 }],
    getRowId: (row) => row.id,
    columns: [
      { id: 'name', header: 'Name', value: (row) => row.name },
      { id: 'score', header: 'Score', value: (row) => row.score }
    ]
  }), { columns: 24, rows: 2 });

  assert.match(renderFramePlain(frame), /Alpha/u);
  assert.equal(frame.accessibility.root.role, 'table');
  assert.equal(frame.hitTargets?.length ?? 0, 0);
  assert.equal(frame.focusTargets?.length ?? 0, 0);
});

test('data grid renders stable row selection independently from active position', () => {
  const frame = renderElementFrame(dataGrid({
    id: 'fleet-grid',
    rows: [
      { id: 'alpha', name: 'Alpha', score: 10 },
      { id: 'bravo', name: 'Bravo', score: 20 }
    ],
    getRowId: (row) => row.id,
    columns: [
      { id: 'name', header: 'Name', value: (row) => row.name, width: 7 },
      { id: 'score', header: 'Score', value: (row) => row.score, width: 5 }
    ],
    presentation: {
      interaction: {
        kind: 'row',
        selectionMode: 'single',
        activeRowId: 'alpha',
        selectedRowIds: ['bravo']
      }
    },
    onTransition: (transition) => transition
  }), { columns: 24, rows: 3 });

  assert.match(renderFramePlain(frame), /Bravo/u);
  assert.equal(frame.accessibility.root.role, 'grid');
  assert.equal(frame.accessibility.root.activeDescendant, 'fleet-grid:row:alpha');
  assert.equal(frame.accessibility.root.children?.[2]?.selected, true);
  assert.equal(
    frame.cells.find((cell) => cell.source?.description === 'row.bravo.marker')?.source?.interactionState,
    'selected'
  );
});

test('cell grids address cells with stable row and column ids', () => {
  const frame = renderElementFrame(dataGrid({
    id: 'cell-grid',
    rows: [{ id: 'atlas', name: 'Atlas', score: 89 }],
    getRowId: (row) => row.id,
    columns: [
      { id: 'name', header: 'Name', value: (row) => row.name, width: 7 },
      { id: 'score', header: 'Score', value: (row) => row.score, width: 5 }
    ],
    presentation: {
      interaction: {
        kind: 'cell',
        selectionMode: 'single',
        activeCell: { rowId: 'atlas', columnId: 'name' },
        selectedCells: [{ rowId: 'atlas', columnId: 'score' }]
      }
    },
    onTransition: (transition) => transition
  }), { columns: 24, rows: 2 });

  assert.deepEqual(frame.hitTargets.map((target) => target.id), [
    'cell-grid:row:atlas:cell:0',
    'cell-grid:row:atlas:cell:1'
  ]);
  const row = frame.accessibility.root.children?.[1];
  assert.equal(frame.accessibility.root.activeDescendant, 'cell-grid:row:atlas:cell:0');
  assert.equal(row?.children?.[1]?.selected, true);
  assert.equal(row?.children?.[1]?.position?.columnLabel, 'Score');
});

test('pointer focus transitions and activation events use separate callbacks', async () => {
  const app = defineTui({
    id: 'grid-pointer-flow',
    init: () => ({ events: [] }),
    update: (state, event) => ({ state: { events: [...state.events, event] } }),
    view: () => dataGrid({
      id: 'pointer-grid',
      rows: [{ id: 'alpha', name: 'Alpha' }],
      getRowId: (row) => row.id,
      columns: [{ id: 'name', value: (row) => row.name }],
      presentation: { interaction: { kind: 'row',
      selectionMode: 'single', selectedRowIds: [] } },
      onTransition: (transition) => ({ channel: 'transition', transition }),
      onActivate: (event) => ({ channel: 'activate', event })
    })
  });
  const runtime = createTuiRuntime({
    app,
    host: createMemoryTerminalHost({ terminalSize: { columns: 20, rows: 2 } })
  });

  await runtime.start();
  await clickAt(runtime, 1, 1);
  await clickAt(runtime, 1, 1);

  assert.deepEqual(runtime.state().events, [
    { channel: 'transition', transition: { kind: 'setActiveRow', rowId: 'alpha' } },
    { channel: 'activate', event: { kind: 'activate', target: { kind: 'row', rowId: 'alpha' } } }
  ]);
  await runtime.dispose();
});

test('data grid evaluates cells once per instance and preserves renderer spans', () => {
  let calls = 0;
  const frame = renderElementFrame(dataGrid({
    id: 'cell-evaluation',
    rows: [{ id: 'row', value: 7 }],
    getRowId: (row) => row.id,
    columns: [tableColumn({
      id: 'value',
      value: (row) => row.value,
      render: ({ value }) => {
        calls += 1;
        return { kind: 'text', text: String(value), style: { bold: true } };
      }
    })],
    presentation: { interaction: { kind: 'row',
    selectionMode: 'single', selectedRowIds: [] } },
    onTransition: (transition) => transition
  }), { columns: 12, rows: 1 });

  assert.equal(calls, 1);
  assert.equal(frame.cells.find((cell) => cell.text === '7')?.style?.bold, true);
  assert.equal(frame.accessibility.root.children?.[0]?.children?.[0]?.value, '7');
});

test('data grid renders sorting, controlled widths, sticky headers, and both-axis scrolling', () => {
  const frame = renderElementFrame(dataGrid({
    id: 'scroll-grid',
    rows: Array.from({ length: 8 }, (_value, index) => ({
      id: `row-${String(index)}`,
      name: `Vessel ${String(index)}`,
      score: index * 10
    })),
    getRowId: (row) => row.id,
    columns: [
      { id: 'name', header: 'Name', value: (row) => row.name, width: 12, sortable: true, resizable: true },
      { id: 'score', header: 'Score', value: (row) => row.score, width: 8 }
    ],
    presentation: {
      interaction: { kind: 'cell',
      selectionMode: 'single', activeCell: { rowId: 'row-2', columnId: 'name' }, selectedCells: [] },
      sort: { columnId: 'name', direction: 'ascending' },
      columnWidths: { name: 14 },
      scroll: createScrollState({ offsetRow: 2, offsetColumn: 4 })
    },
    scrollbar: { axis: 'both' },
    stickyHeader: true,
    onTransition: (transition) => transition
  }), { columns: 18, rows: 4 });

  const output = renderFramePlain(frame);
  assert.match(output, /me/u);
  assert.match(output, /ssel 2/u);
  assert.doesNotMatch(output, /Vessel 0/u);
  assert.match(output, /[┃━]/u);
  assert.equal(frame.hitTargets.some((target) => target.id === 'scroll-grid:header:name:sort'), true);
  assert.equal(frame.hitTargets.some((target) => target.id === 'scroll-grid:header:name:resize'), true);
});

test('windowed table collections retain global accessibility windows', () => {
  const collection = prepareTableCollection(
    [{ id: '100', name: 'Hundred' }, { id: '101', name: 'Hundred one' }],
    (row) => row.id,
    { startIndex: 100, totalCount: 1_000, domain: { kind: 'source' } }
  );
  const frame = renderElementFrame(table({
    id: 'windowed-table',
    collection,
    columns: [{ id: 'name', value: (row) => row.name }]
  }), { columns: 20, rows: 2 });

  assert.deepEqual(frame.accessibility.root.window, {
    startIndex: 100,
    endIndexExclusive: 102,
    totalCount: 1_000,
    omittedBefore: 100,
    omittedAfter: 898
  });
});

test('table and pagination compose explicitly over a bounded page', () => {
  const rows = ['Aster', 'Atlas', 'Pulse', 'Lumen', 'Vector'];
  const page = paginationWindow({ pageNumber: 2, pageSize: 2, totalCount: rows.length });
  const frame = renderElementFrame(column([
    table({
      id: 'page-table',
      rows: rows.slice(page.startIndex, page.endIndexExclusive),
      getRowId: (row) => row,
      columns: [{ id: 'name', header: 'Name', value: (row) => row }]
    }),
    pagination({
      id: 'page-navigation',
      label: 'Fleet',
      pageNumber: page.pageNumber,
      pageCount: page.pageCount,
      onAction: (action) => action
    })
  ]), { columns: 40, rows: 5 });

  assert.match(renderFramePlain(frame), /Pulse/u);
  assert.doesNotMatch(renderFramePlain(frame), /Aster/u);
  assert.match(renderFramePlain(frame), /Page 2 of 3/u);
  assert.equal(frame.accessibility.root.children?.some((node) => node.role === 'table'), true);
});

test('data grid disabled state removes semantic and pointer interaction', () => {
  const frame = renderElementFrame(dataGrid({
    id: 'disabled-grid',
    rows: [{ id: 'row', name: 'Row' }],
    getRowId: (row) => row.id,
    columns: [{ id: 'name', value: (row) => row.name }],
    presentation: { interaction: { kind: 'row',
    selectionMode: 'single', activeRowId: 'row', selectedRowIds: [] } },
    disabled: true
  }), { columns: 20, rows: 2 });

  assert.equal(frame.hitTargets?.length ?? 0, 0);
  assert.equal(frame.focusTargets?.length ?? 0, 0);
  assert.equal(frame.accessibility.root.disabled, true);
});

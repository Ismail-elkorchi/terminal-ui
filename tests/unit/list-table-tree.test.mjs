import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createTuiRuntime,
  defineTui
} from '../../dist/tui/index.js';
import {
  createMemoryTerminalHost } from '../../dist/host/index.js';
import {
  createScrollState,
  dataWindow,
  listReducer,
  prepareListCollection,
  prepareTableCollection,
  prepareTreeRows,
  paginationWindow,
  tableReducer,
  treeReducer
} from '../../dist/behavior/index.js';
import {
  renderFramePlain,
  renderElementFrame
} from '../../dist/renderer/index.js';
import {
  list,
  paginator,
  table,
  tableColumn,
  tree
} from '../../dist/components/index.js';
import { column } from '../../dist/layout/index.js';

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
const mouseRelease = (row, column) => ({
  kind: 'mouse',
  sequence: '',
  encoding: 'sgr',
  action: 'release',
  button: 'none',
  row,
  column,
  rawCode: 0,
  modifiers: { shift: false, alt: false, ctrl: false }
});

async function clickAt(runtime, row, column) {
  await runtime.handleInput(mousePress(row, column));
  return runtime.handleInput(mouseRelease(row, column));
}

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

test('prepared collections reject ambiguous identity and invalid global windows', () => {
  assert.throws(
    () => prepareListCollection(['same', 'same'], (item) => ({ id: item, label: item })),
    /must be unique/u
  );
  assert.throws(
    () => prepareTableCollection([{ id: 'one' }, { id: 'two' }], () => 'same'),
    /must be unique/u
  );
  assert.throws(
    () => prepareTreeRows([{ node: { id: 'one', label: 'One', kind: 'leaf' }, depth: 0, path: ['one'] }], {
      start: 2,
      total: 2
    }),
    /must fit inside/u
  );
});

test('windowed collection filtering is explicit rather than incomplete', () => {
  const collection = prepareListCollection(
    ['Item 100'],
    (item, index) => ({ id: String(index), label: item }),
    { start: 100, total: 1_000 }
  );

  assert.throws(
    () => list({ id: 'window-filter', collection, filterQuery: 'item' }),
    /must be filtered before/u
  );
  assert.throws(
    () => listReducer({}, { kind: 'first' }, { collection, filterQuery: 'item' }),
    /must be filtered before/u
  );
});

test('list widget filters items and can use explicit shared scroll state', () => {
  const frame = renderElementFrame(list({
    projectItem: (item) => ({ id: String(item), label: String(item) }),
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

test('list widget exposes source-aware row values matches and empty filter state', () => {
  const frame = renderElementFrame(list({
    projectItem: (item) => ({ id: String(item), label: String(item) }),
    id: 'items',
    items: ['Atlas', 'Pulse'],
    selectedId: 'Atlas',
    filterQuery: 'at'
  }), { columns: 24, rows: 2 });
  const emptyFrame = renderElementFrame(list({
    projectItem: (item) => ({ id: String(item), label: String(item) }),
    id: 'empty-items',
    items: [],
    filterQuery: 'missing'
  }), { columns: 24, rows: 2 });

  assert.equal(frame.cells.find((cell) => cell.text === '›')?.source?.label, 'item.Atlas.marker');
  assert.equal(frame.cells.find((cell) => cell.text === 'A')?.source?.label, 'item.Atlas.match');
  assert.equal(frame.cells.find((cell) => cell.text === 'l')?.source?.label, 'item.Atlas.value');
  assert.equal(emptyFrame.cells.find((cell) => cell.text === 'N')?.source?.label, 'filter.empty');
  assert.match(renderFramePlain(emptyFrame), /No matching items/u);
});

test('list projects object values once for visible text filtering and accessibility', () => {
  const frame = renderElementFrame(list({
    id: 'object-list',
    items: [
      { key: 'atlas', title: 'Atlas', detail: 'Primary workspace', aliases: ['north'] },
      { key: 'pulse', title: 'Pulse', detail: 'Telemetry workspace', aliases: ['metrics'] }
    ],
    projectItem: (item) => ({
      id: item.key,
      label: item.title,
      description: item.detail,
      keywords: item.aliases
    }),
    filterQuery: 'metrics'
  }), { columns: 32, rows: 3 });

  const output = renderFramePlain(frame);
  assert.match(output, /Pulse/u);
  assert.match(output, /Telemetry workspace/u);
  assert.doesNotMatch(output, /\[object Object\]/u);
  assert.equal(frame.accessibility.root.children?.[0]?.label, 'Pulse');
  assert.equal(frame.accessibility.root.children?.[0]?.description, 'Telemetry workspace');
});

test('list cursor and mouse hit targets use the filtered visible rows', async () => {
  const frame = renderElementFrame(list({
    projectItem: (item) => ({ id: String(item), label: String(item) }),
    id: 'clickable-list',
    items: ['alpha', 'bravo', 'charlie', 'delta'],
    filterQuery: 'br',
    selectedId: 'bravo',
    onAction: (action) => ({ kind: 'chosen', action })
  }), { columns: 24, rows: 2 });

  assert.deepEqual(frame.cursor, { row: 1, column: 1 });
  assert.deepEqual(
    frame.hitTargets?.filter((target) => target.id.includes(':option:')).map((target) => target.id),
    ['clickable-list:option:bravo']
  );

  const app = defineTui({
    id: 'list-click-flow',
    init: () => ({ selected: 'none' }),
    update: (_state, message) => ({
      state: { selected: message.action.id }
    }),
    view: () => list({
    projectItem: (item) => ({ id: String(item), label: String(item) }),
    id: 'clickable-list',
      items: ['alpha', 'bravo'],
      onAction: (action) => ({ kind: 'chosen', action })
    })
  });
  const runtime = createTuiRuntime({ app, host: createMemoryTerminalHost({ viewport: { columns: 24, rows: 2 } }) });

  await runtime.start();
  const press = await runtime.handleInput(mousePress(2, 1));
  const release = await runtime.handleInput(mouseRelease(2, 1));

  assert.equal(press.handled, false);
  assert.equal(release.state.selected, 'bravo');
});

test('list selection uses stable identity across reorder, filter, insertion, and deletion', () => {
  const items = ['alpha', 'bravo', 'charlie'];
  const projectItem = (item) => ({ id: item, label: item });
  const selected = listReducer({}, { kind: 'select', id: 'bravo', index: 1 }, { items, projectItem });
  const reordered = [items[2], items[1], items[0]];
  const moved = listReducer(selected, { kind: 'move', delta: 1 }, { items: reordered, projectItem });
  const inserted = ['delta', ...reordered];
  const filtered = listReducer(selected, { kind: 'move', delta: 1 }, {
    items: inserted,
    projectItem,
    filterQuery: 'bravo'
  });
  const deleted = inserted.filter((item) => item !== 'bravo');
  const recovered = listReducer(selected, { kind: 'move', delta: 1 }, { items: deleted, projectItem });

  assert.equal(selected.selectedId, 'bravo');
  assert.equal(moved.selectedId, 'alpha');
  assert.equal(filtered.selectedId, 'bravo');
  assert.equal(recovered.selectedId, 'delta');
});

test('list pointer selection and double-click activation match keyboard semantics', async () => {
  const app = defineTui({
    id: 'list-pointer-activation',
    init: () => ({ actions: [] }),
    update: (state, message) => ({ state: { actions: [...state.actions, message] } }),
    view: () => list({
      id: 'activation-list',
      items: ['alpha'],
      projectItem: (item) => ({ id: item, label: item }),
      onAction: (action) => action
    })
  });
  const runtime = createTuiRuntime({ app, host: createMemoryTerminalHost({ viewport: { columns: 20, rows: 2 } }) });

  await runtime.start();
  await clickAt(runtime, 1, 1);
  await clickAt(runtime, 1, 1);

  assert.deepEqual(runtime.state().actions, [
    { kind: 'select', id: 'alpha', index: 0 },
    { kind: 'activate', id: 'alpha', index: 0 }
  ]);
});

test('list and table reject empty or duplicate stable ids at authoring time', () => {
  assert.throws(() => list({
    id: 'duplicate-list',
    items: ['alpha', 'alpha'],
    projectItem: (item) => ({ id: item, label: item })
  }), /ids must be unique/u);
  assert.throws(() => table({
    id: 'empty-table-id',
    rows: [['alpha']],
    getRowId: () => '',
    columns: [{ id: 'value', header: 'Value', value: (row) => row[0] }]
  }), /ids must not be empty/u);
});

test('table widget renders constrained columns and selected rows', () => {
  const frame = renderElementFrame(table({
    getRowId: (_row, index) => String(index),
    id: 'table',
    presentation: { selectedCell: { rowId: '1', column: 1 } },
    columns: [
      {
        id: 'name-0', value: (row) => Array.isArray(row) ? row[0] : row, header: 'Name', width: 5 },
      {
        id: 'value-1', value: (row) => Array.isArray(row) ? row[1] : undefined, header: 'Value', width: 4 }
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

test('table exposes row hit targets and routes row messages', async () => {
  const frame = renderElementFrame(table({
    getRowId: (_row, index) => String(index),
    id: 'clickable-table',
    rows: [
      ['alpha', '100'],
      ['bravo', '200']
    ],
    onAction: (action) => ({ kind: 'row', action })
  }), { columns: 24, rows: 2 });

  assert.deepEqual(frame.hitTargets?.map((target) => target.id), [
    'clickable-table:row:0',
    'clickable-table:row:1'
  ]);
  assert.deepEqual(frame.hitTargets?.[1]?.bounds, { row: 2, column: 1, width: 24, height: 1 });

  const app = defineTui({
    id: 'table-click-flow',
    init: () => ({ selected: 'none' }),
    update: (_state, message) => ({
      state: { selected: `${String(message.action.rowIndex)}:${['alpha', 'bravo'][message.action.rowIndex] ?? 'none'}` }
    }),
    view: () => table({
    getRowId: (_row, index) => String(index),
    id: 'clickable-table',
      rows: [
        ['alpha', '100'],
        ['bravo', '200']
      ],
      onAction: (action) => ({ kind: 'row', action })
    })
  });
  const runtime = createTuiRuntime({ app, host: createMemoryTerminalHost({ viewport: { columns: 24, rows: 2 } }) });

  await runtime.start();
  const press = await runtime.handleInput(mousePress(2, 1));
  const release = await runtime.handleInput(mouseRelease(2, 1));

  assert.equal(press.handled, false);
  assert.equal(release.state.selected, '1:bravo');
});

test('table exposes visible cell hit targets when cell selection is active', async () => {
  const frame = renderElementFrame(table({
    getRowId: (_row, index) => String(index),
    id: 'cell-table',
    presentation: { selectedCell: { rowId: '0', column: 1 } },
    columns: [
      {
        id: 'name-0', value: (row) => Array.isArray(row) ? row[0] : row, header: 'Name', width: 6 },
      {
        id: 'score-1', value: (row) => Array.isArray(row) ? row[1] : undefined, header: 'Score', width: 5 }
    ],
    rows: [
      ['Atlas', 89],
      ['Pulse', 92]
    ],
    onAction: (action) => ({ kind: 'cell', action })
  }), { columns: 24, rows: 3 });

  assert.deepEqual(frame.hitTargets?.map((target) => target.id), [
    'cell-table:row:0:cell:0',
    'cell-table:row:0:cell:1',
    'cell-table:row:1:cell:0',
    'cell-table:row:1:cell:1'
  ]);
  assert.deepEqual(frame.hitTargets?.[1]?.bounds, { row: 2, column: 11, width: 5, height: 1 });
  const app = defineTui({
    id: 'table-cell-click-flow',
    init: () => ({ selected: 'none' }),
    update: (_state, message) => ({
      state: {
        selected: `${String(message.action.rowIndex)}:${String([['Atlas', 89], ['Pulse', 92]][message.action.rowIndex]?.[message.action.column])}:${['Name', 'Score'][message.action.column]}`
      }
    }),
    view: () => table({
    getRowId: (_row, index) => String(index),
    id: 'cell-table',
      presentation: { selectedCell: { rowId: '0', column: 1 } },
      columns: [
        {
          id: 'name-0', value: (row) => Array.isArray(row) ? row[0] : row, header: 'Name', width: 6 },
        {
          id: 'score-1', value: (row) => Array.isArray(row) ? row[1] : undefined, header: 'Score', width: 5 }
      ],
      rows: [
        ['Atlas', 89],
        ['Pulse', 92]
      ],
      onAction: (action) => ({ kind: 'cell', action })
    })
  });
  const runtime = createTuiRuntime({ app, host: createMemoryTerminalHost({ viewport: { columns: 24, rows: 3 } }) });

  await runtime.start();
  await runtime.handleInput(mousePress(2, 11));
  const release = await runtime.handleInput(mouseRelease(2, 11));

  assert.equal(release.state.selected, '0:89:Score');
});

test('table row and cell double clicks emit the same activation action as Enter', async () => {
  const rowApp = defineTui({
    id: 'table-row-pointer-activation',
    init: () => ({ actions: [] }),
    update: (state, message) => ({ state: { actions: [...state.actions, message] } }),
    view: () => table({
      id: 'activation-table-row',
      rows: [['alpha']],
      getRowId: () => 'alpha',
      onAction: (action) => action
    })
  });
  const rowRuntime = createTuiRuntime({ app: rowApp, host: createMemoryTerminalHost({ viewport: { columns: 20, rows: 2 } }) });

  await rowRuntime.start();
  await clickAt(rowRuntime, 1, 1);
  await clickAt(rowRuntime, 1, 1);
  assert.deepEqual(rowRuntime.state().actions, [
    { kind: 'selectRow', rowId: 'alpha', rowIndex: 0 },
    { kind: 'activate', rowId: 'alpha', rowIndex: 0 }
  ]);

  const cellApp = defineTui({
    id: 'table-cell-pointer-activation',
    init: () => ({ actions: [] }),
    update: (state, message) => ({ state: { actions: [...state.actions, message] } }),
    view: () => table({
      id: 'activation-table-cell',
      presentation: { selectedCell: { rowId: 'alpha', column: 0 } },
      rows: [['alpha']],
      getRowId: () => 'alpha',
      columns: [{ id: 'name', header: 'Name', value: (row) => row[0] }],
      onAction: (action) => action
    })
  });
  const cellRuntime = createTuiRuntime({ app: cellApp, host: createMemoryTerminalHost({ viewport: { columns: 20, rows: 2 } }) });

  await cellRuntime.start();
  const cellTarget = cellRuntime.frame().hitTargets.find((target) => target.id.includes(':cell:'));
  assert.ok(cellTarget);
  await clickAt(cellRuntime, cellTarget.bounds.row, cellTarget.bounds.column);
  await clickAt(cellRuntime, cellTarget.bounds.row, cellTarget.bounds.column);
  assert.deepEqual(cellRuntime.state().actions, [
    { kind: 'selectCell', rowId: 'alpha', rowIndex: 0, column: 0 },
    { kind: 'activate', rowId: 'alpha', rowIndex: 0, column: 0 }
  ]);
});

test('table supports scroll state column sizing styled renderers sort markers empty states and cell selection', () => {
  const frame = renderElementFrame(table({
    getRowId: (_row, index) => String(index),
    id: 'table',
    presentation: {
      selectedCell: { rowId: '2', column: 1 },
      sort: { column: 'name-1', direction: 'ascending' },
      scroll: createScrollState({ offsetRow: 1, offsetColumn: 0, contentRows: 3, viewportRows: 2 })
    },
    onAction: (action) => action,
    stickyHeader: true,
    columns: [
      {
        id: 'hidden-0', value: (row) => Array.isArray(row) ? row[0] : row, header: 'Hidden', hidden: true },
      {
        id: 'name-1', value: (row) => Array.isArray(row) ? row[1] : undefined, header: 'Name', width: { kind: 'content', max: 8 } },
      tableColumn({
        id: 'score-2', value: (row) => Array.isArray(row) ? row[2] : undefined,
        header: 'Score',
        width: { kind: 'fixed', cells: 5 },
        align: 'end',
        render: ({ value }) => ({
          kind: 'text',
          text: String(value),
          style: { fg: { kind: 'theme', token: 'status.success' } }
        })
      }),
      {
        id: 'notes-3', value: (row) => Array.isArray(row) ? row[3] : undefined, header: 'Notes', width: { kind: 'fill' } }
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
  const sortMarker = frame.cells.find((cell) => cell.text === '↑');

  assert.match(output, /Name ↑/u);
  assert.doesNotMatch(output, /Hidden/u);
  assert.match(output, /bravo🙂/u);
  assert.match(output, /charlie/u);
  assert.equal(styledScore?.style?.fg?.token, 'status.success');
  assert.equal(styledScore?.source?.label, 'row.1.cell.2');
  assert.equal(styledScore?.source?.ownerKind, 'table');
  assert.equal(sortMarker?.source?.label, 'header.1.sort');
  assert.equal(selectedScore?.style?.bg?.token, 'selection.background');
  assert.equal(frame.accessibility.root.children?.[0]?.children?.[0]?.value, 'Name');
  assert.equal(frame.accessibility.root.children?.[2]?.children?.[1]?.selected, true);
  assert.equal(frame.accessibility.root.children?.[2]?.children?.[1]?.position?.columnLabel, 'Score');
});

test('table source metadata describes headers rows cells separators and empty state', () => {
  const frame = renderElementFrame(table({
    getRowId: (_row, index) => String(index),
    id: 'fleet-table',
    presentation: { selectedCell: { rowId: '1', column: 1 } },
    columns: [
      {
        id: 'name-0', value: (row) => Array.isArray(row) ? row[0] : row, header: 'Name', width: 6, resizable: true },
      {
        id: 'score-1', value: (row) => Array.isArray(row) ? row[1] : undefined, header: 'Score', width: 5 }
    ],
    rows: [
      ['Atlas', 89],
      ['Pulse', 92]
    ]
  }), { columns: 28, rows: 3 });
  const emptyFrame = renderElementFrame(table({
    getRowId: (_row, index) => String(index),
    id: 'empty-table',
    columns: [{
      id: 'name-0', value: (row) => Array.isArray(row) ? row[0] : row, header: 'Name', width: 8 }],
    rows: [],
    emptyText: 'No rows'
  }), { columns: 24, rows: 3 });

  assert.equal(frame.cells.find((cell) => cell.text === 'N')?.source?.label, 'header.0.label');
  assert.equal(frame.cells.find((cell) => cell.source?.label === 'header.0.resize')?.source?.role, 'decoration');
  assert.equal(frame.cells.find((cell) => cell.text === '›')?.source?.label, 'row.1.marker');
  assert.equal(frame.cells.find((cell) => cell.text === 'P')?.source?.label, 'row.1.cell.0');
  assert.equal(frame.cells.find((cell) => cell.source?.label === 'column.separator')?.source?.role, 'separator');
  assert.equal(emptyFrame.cells.find((cell) => cell.text === 'N' && cell.row === 2)?.source?.label, 'empty');
});

test('table compact metric semantics tighten spacing and expose metric metadata', () => {
  const frame = renderElementFrame(table({
    getRowId: (_row, index) => String(index),
    id: 'metrics-table',
    density: 'compact',
    presentation: { selectedRowId: '0' },
    stickyHeader: true,
    rows: [[18, 'node', '188M', 4.2]],
    columns: [
      tableColumn({ id: 'pid-0', value: (row) => Array.isArray(row) ? row[0] : row, header: 'PID', width: { kind: 'fixed', cells: 3 }, semantic: 'metadata', render: ({ value }) => String(value) }),
      tableColumn({ id: 'name-1', value: (row) => Array.isArray(row) ? row[1] : undefined, header: 'Name', width: { kind: 'fixed', cells: 6 }, render: ({ value }) => value }),
      tableColumn({ id: 'mem-2', value: (row) => Array.isArray(row) ? row[2] : undefined, header: 'Mem', width: { kind: 'fixed', cells: 5 }, align: 'end', semantic: 'metric', render: ({ value }) => value }),
      tableColumn({ id: 'cpu-3', value: (row) => Array.isArray(row) ? row[3] : undefined, header: 'CPU', width: { kind: 'fixed', cells: 4 }, align: 'end', semantic: 'metric', render: ({ value }) => Number(value).toFixed(1) })
    ]
  }), { columns: 24, rows: 2 });
  const metricCell = frame.cells.find((cell) => cell.text === '4' && cell.source?.label === 'row.0.cell.3');
  const metadataCell = frame.cells.find((cell) => cell.text === '1' && cell.source?.label === 'row.0.cell.0');
  const markerCell = frame.cells.find((cell) => cell.source?.label === 'row.0.marker');

  assert.equal(renderFramePlain(frame), '  PID Name     Mem  CPU\n› 18  node    188M  4.2');
  assert.equal(markerCell?.source?.partKind, 'marker');
  assert.equal(markerCell?.source?.state, 'selected');
  assert.equal(metadataCell?.source?.partKind, 'metadata');
  assert.equal(metadataCell?.style?.fg?.token, 'table.metadata');
  assert.equal(metricCell?.source?.partKind, 'metric');
  assert.equal(metricCell?.style?.fg?.token, 'table.metric');
  assert.equal(metricCell?.source?.state, 'selected');
});

test('table compact fill columns keep marker width aligned with cell hit targets', () => {
  const frame = renderElementFrame(table({
    getRowId: (_row, index) => String(index),
    id: 'dense-fill-table',
    density: 'compact',
    presentation: {
      selectedRowId: '0',
      selectedCell: { rowId: '0', column: 1 }
    },
    stickyHeader: true,
    rows: [[18, 'node', 4.2]],
    columns: [
      tableColumn({ id: 'pid-0', value: (row) => Array.isArray(row) ? row[0] : row, header: 'PID', width: { kind: 'fixed', cells: 3 }, render: ({ value }) => String(value) }),
      tableColumn({ id: 'name-1', value: (row) => Array.isArray(row) ? row[1] : undefined, header: 'Name', width: { kind: 'fill' }, render: ({ value }) => value }),
      tableColumn({ id: 'cpu-2', value: (row) => Array.isArray(row) ? row[2] : undefined, header: 'CPU', width: { kind: 'fixed', cells: 4 }, align: 'end', render: ({ value }) => Number(value).toFixed(1) })
    ],
    onAction: (action) => ({ kind: 'cell', action })
  }), { columns: 14, rows: 2 });

  assert.equal(renderFramePlain(frame), '  PID Na…  CPU\n› 18  no…  4.2');
  assert.deepEqual(frame.hitTargets.map((target) => target.bounds), [
    { row: 2, column: 3, width: 3, height: 1 },
    { row: 2, column: 7, width: 3, height: 1 },
    { row: 2, column: 11, width: 4, height: 1 }
  ]);
});

test('table headers can expose a visible resize affordance without changing reducer ownership', () => {
  const frame = renderElementFrame(table({
    getRowId: (_row, index) => String(index),
    id: 'resizable-table',
    columns: [
      {
        id: 'name-0', value: (row) => Array.isArray(row) ? row[0] : row, header: 'Name', width: 8, resizable: true },
      {
        id: 'score-1', value: (row) => Array.isArray(row) ? row[1] : undefined, header: 'Score', width: 6 }
    ],
    rows: [['Atlas', 89]]
  }), { columns: 24, rows: 2 });

  assert.match(renderFramePlain(frame), /Name ↔/u);
});

test('table header capabilities share geometry across keyboard, click, and captured resize drag', async () => {
  const rows = [['Atlas', 89], ['Pulse', 92]];
  const columns = [
    {
      id: 'name',
      value: (row) => row[0],
      header: 'Name',
      width: 8,
      sortable: true,
      resizable: true
    },
    { id: 'score', value: (row) => row[1], header: 'Score', width: 6 }
  ];
  const reducerOptions = {
    rows,
    getRowId: (_row, index) => String(index),
    columnCount: columns.length,
    minColumnWidth: 3
  };
  const app = defineTui({
    id: 'table-header-interaction',
    init: () => ({ selectedRowId: '0', selectedColumn: 0, columnWidths: { name: 8 } }),
    update: (state, message) => ({
      state: tableReducer(state, message.action, reducerOptions)
    }),
    view: (state) => table({
      id: 'metrics',
      rows,
      getRowId: reducerOptions.getRowId,
      columns,
      presentation: {
        selectedRowId: state.selectedRowId,
        selectedCell: { rowId: state.selectedRowId, column: state.selectedColumn },
        sort: state.sort,
        columnWidths: state.columnWidths
      },
      onAction: (action) => ({ action })
    })
  });
  const runtime = createTuiRuntime({
    app,
    host: createMemoryTerminalHost({ viewport: { columns: 24, rows: 4 } }),
    initialFocusPath: ['metrics']
  });

  await runtime.start();
  await runtime.handleInput({ kind: 'key', key: 'space', modifiers: { ctrl: false, alt: false, shift: false, meta: false }, eventType: 'press', location: 'standard' });
  assert.deepEqual(runtime.state()?.sort, { column: 'name', direction: 'ascending' });
  await runtime.handleInput({
    kind: 'key',
    key: 'arrowRight',
    modifiers: { ctrl: false, alt: true, shift: false, meta: false },
    eventType: 'press',
    location: 'standard'
  });
  assert.equal(runtime.state()?.columnWidths?.name, 9);

  const sortTarget = runtime.frame()?.hitTargets?.find((target) => target.id === 'metrics:header:name:sort');
  const resizeTarget = runtime.frame()?.hitTargets?.find((target) => target.id === 'metrics:header:name:resize');
  assert.ok(sortTarget);
  assert.ok(resizeTarget);
  assert.equal(sortTarget.bounds.row, resizeTarget.bounds.row);
  assert.equal(resizeTarget.bounds.column, sortTarget.bounds.column + sortTarget.bounds.width - 1);

  await runtime.handleInput(mousePress(sortTarget.bounds.row, sortTarget.bounds.column));
  await runtime.handleInput(mouseRelease(sortTarget.bounds.row, sortTarget.bounds.column));
  assert.deepEqual(runtime.state()?.sort, { column: 'name', direction: 'descending' });

  await runtime.handleInput(mousePress(resizeTarget.bounds.row, resizeTarget.bounds.column));
  await runtime.handleInput({
    ...mousePress(resizeTarget.bounds.row, resizeTarget.bounds.column + 2),
    action: 'drag',
    rawCode: 32
  });
  assert.equal(runtime.state()?.columnWidths?.name, 11);

  await runtime.dispose();
});

test('table headers emit no command targets without explicit column capabilities', () => {
  const frame = renderElementFrame(table({
    id: 'passive-headers',
    rows: [['Atlas', 89]],
    getRowId: () => 'atlas',
    columns: [
      { id: 'name', value: (row) => row[0], header: 'Name', width: 8 },
      { id: 'score', value: (row) => row[1], header: 'Score', width: 6 }
    ],
    onAction: (action) => ({ action })
  }), { columns: 24, rows: 3 });

  assert.equal(frame.hitTargets?.some((target) => target.id.includes(':header:')), false);
});

test('table and paginator compose explicitly over a bounded page', () => {
  const rows = [['Aster'], ['Atlas'], ['Pulse'], ['Lumen'], ['Vector']];
  const page = paginationWindow({ page: 2, pageSize: 2, total: rows.length });
  const frame = renderElementFrame(column([
    table({
    getRowId: (_row, index) => String(index),
    id: 'fleet-pages-table',
      presentation: { selectedRowId: '0' },
      columns: [{
        id: 'name-0', value: (row) => Array.isArray(row) ? row[0] : row, header: 'Name', width: 8 }],
      rows: rows.slice(page.start, page.end)
    }),
    paginator({
      id: 'fleet-pages-paginator',
      label: 'Fleet',
      page: page.page,
      pageCount: page.pageCount
    })
  ]), { columns: 24, rows: 5 });

  const output = renderFramePlain(frame);
  assert.match(output, /Pulse/u);
  assert.doesNotMatch(output, /Aster/u);
  assert.match(output, /Fleet Page 2 of 3/u);
  assert.equal(frame.cells.find((cell) => cell.text === 'F')?.source?.label, 'label');
  assert.equal(frame.cells.find((cell) => cell.text === '2')?.source?.label, 'page.value');
  assert.equal(frame.cells.find((cell) => cell.text === '3')?.source?.label, 'page.count');
  assert.equal(frame.accessibility.root.children?.some((node) => node.role === 'table'), true);
});

test('table supports sticky headers and both-axis scrollbars directly', () => {
  const scroll = createScrollState({
    offsetRow: 2,
    contentRows: 8,
    viewportRows: 3,
    contentColumns: 40,
    viewportColumns: 14
  });
  const frame = renderElementFrame(table({
    getRowId: (_row, index) => String(index),
    id: 'virtual-table',
    presentation: { scroll },
    scrollbar: { axis: 'both' },
    onAction: (action) => action,
    stickyHeader: true,
    columns: [{
      id: 'name-0', value: (row) => Array.isArray(row) ? row[0] : row, header: 'Name', width: 12 }, {
      id: 'score-1', value: (row) => Array.isArray(row) ? row[1] : undefined, header: 'Score', width: 8 }],
    rows: Array.from({ length: 8 }, (_value, index) => [`Vessel ${String(index)}`, index * 10])
  }), { columns: 18, rows: 4 });

  const output = renderFramePlain(frame);
  assert.match(output, /Name/u);
  assert.match(output, /Vessel 2/u);
  assert.doesNotMatch(output, /Vessel 0/u);
  assert.match(output, /[┃━]/u);
  assert.match(output, /│/u);
});

test('table renders a styled empty state', () => {
  const frame = renderElementFrame(table({
    getRowId: (_row, index) => String(index),
    id: 'empty',
    rows: [],
    columns: [{
      id: 'name-0', value: (row) => Array.isArray(row) ? row[0] : row, header: 'Name', width: 10 }],
    emptyText: 'No data'
  }), { columns: 24, rows: 3 });

  assert.match(renderFramePlain(frame), /No data/u);
  assert.equal(frame.cells.find((cell) => cell.row === 2 && cell.text === 'N')?.style?.fg?.token, 'text.muted');
});

test('table uses shared horizontal scroll state', () => {
  const frame = renderElementFrame(table({
    getRowId: (_row, index) => String(index),
    id: 'wide-table',
    presentation: {
      scroll: createScrollState({
        offsetRow: 0,
        offsetColumn: 12,
        contentRows: 1,
        contentColumns: 40,
        viewportRows: 2,
        viewportColumns: 16
      })
    },
    onAction: (action) => action,
    columns: [
      {
        id: 'first-0', value: (row) => Array.isArray(row) ? row[0] : row, header: 'First', width: { kind: 'fixed', cells: 12 } },
      {
        id: 'second-1', value: (row) => Array.isArray(row) ? row[1] : undefined, header: 'Second', width: { kind: 'fixed', cells: 12 } }
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

test('table controlled scroll presentation drives the vertical window and scrollbar scope', () => {
  const frame = renderElementFrame(table({
    getRowId: (_row, index) => String(index),
    id: 'selected-cell-window',
    presentation: {
      selectedCell: { rowId: '4', column: 0 },
      scroll: createScrollState({ contentRows: 6, offsetRow: 3 })
    },
    scrollbar: { visible: 'always' },
    onAction: (action) => action,
    columns: [{
      id: 'name-0', value: (row) => Array.isArray(row) ? row[0] : row, header: 'Name', width: 12 }],
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
  assert.match(output, /delta/u);
  assert.doesNotMatch(output, /echo/u);
  assert.equal(frame.accessibility.root.description, 'Showing 4-5 of 6 rows.');
  assert.equal(frame.cells.filter((cell) => cell.column === 16).length, 2);
});

test('treeReducer toggles nested expansion without mutating input nodes', () => {
  const nodes = [{
    id: 'root',
    label: 'Root',
    kind: 'branch',
    expanded: false,
    children: [{ id: 'child', label: 'Child', kind: 'leaf' }]
  }];
  const expanded = treeReducer({ nodes }, { kind: 'toggle', id: 'root' });
  const frame = renderElementFrame(tree({ id: 'tree', nodes: expanded.nodes }), { columns: 24, rows: 3 });

  assert.equal(nodes[0]?.expanded, false);
  assert.equal(expanded.nodes[0]?.expanded, true);
  assert.match(renderFramePlain(frame), /Child/u);
});

test('tree authoring rejects duplicate identities across nested branches', () => {
  assert.throws(() => tree({
    id: 'duplicate-tree',
    nodes: [
      {
        id: 'root',
        label: 'Root',
        kind: 'branch',
        expanded: true,
        children: [{ id: 'duplicate', label: 'Nested', kind: 'leaf' }]
      },
      { id: 'duplicate', label: 'Top level', kind: 'leaf' }
    ]
  }), /tree item ids must be unique; duplicate id: duplicate/u);
});

test('tree pointer selection and double-click activation match keyboard semantics', async () => {
  const app = defineTui({
    id: 'tree-pointer-activation',
    init: () => ({ actions: [] }),
    update: (state, message) => ({ state: { actions: [...state.actions, message] } }),
    view: () => tree({
      id: 'activation-tree',
      nodes: [{ id: 'leaf', label: 'Leaf', kind: 'leaf' }],
      onAction: (action) => action
    })
  });
  const runtime = createTuiRuntime({ app, host: createMemoryTerminalHost({ viewport: { columns: 20, rows: 2 } }) });

  await runtime.start();
  const target = runtime.frame().hitTargets.find((candidate) => candidate.id.endsWith(':body'));
  assert.ok(target);
  await clickAt(runtime, target.bounds.row, target.bounds.column);
  await clickAt(runtime, target.bounds.row, target.bounds.column);

  assert.deepEqual(runtime.state().actions, [
    { kind: 'select', id: 'leaf' },
    { kind: 'activate', id: 'leaf' }
  ]);
});

test('tree filters through descendants and exposes selected disabled metadata-rich nodes', () => {
  const frame = renderElementFrame(tree({
    id: 'tree',
    selected: 'api',
    filterQuery: 'server',
    nodes: [{
      id: 'root',
      label: 'Workspace',
      icon: '▣',
      kind: 'branch',
      expanded: false,
      children: [
        { id: 'ui', label: 'Terminal UI', kind: 'leaf', metadata: { domain: 'widgets' } },
        { id: 'api', label: 'API Layer', kind: 'leaf', description: 'Server request boundary', disabled: true, metadata: { domain: 'server' } }
      ]
    }]
  }), { columns: 32, rows: 4 });

  const output = renderFramePlain(frame);
  const disabledCell = frame.cells.find((cell) => cell.text === 'A');

  assert.match(output, /Workspace/u);
  assert.match(output, /API Layer/u);
  assert.doesNotMatch(output, /Terminal UI/u);
  assert.equal(disabledCell?.style?.fg?.token, 'text.disabled');
  assert.equal(frame.cells.find((cell) => cell.text === '▣')?.source?.label, 'node.root.icon');
  assert.equal(frame.cells.find((cell) => cell.text === 'A')?.source?.label, 'node.api.label');
  assert.equal(frame.cells.find((cell) => cell.text === 'L')?.source?.label, 'node.api.label');
  assert.equal(frame.accessibility.root.children?.[1]?.selected, true);
  assert.equal(frame.accessibility.root.children?.[1]?.disabled, true);
  assert.equal(frame.accessibility.root.children?.[1]?.description, 'Server request boundary');
  assert.equal(frame.accessibility.root.children?.[1]?.value, 'root/api');
});

test('tree renders lazy placeholders and clips tiny viewports safely', () => {
  const frame = renderElementFrame(tree({
    id: 'lazy-tree',
    nodes: [{
      id: 'root',
      label: 'Very long root label for clipping',
      kind: 'lazy',
      expanded: true,
      loading: { kind: 'pending' }
    }]
  }), { columns: 14, rows: 2 });

  const output = renderFramePlain(frame);
  assert.match(output, /Very long…/u);
  assert.match(output, /Loading/u);
  assert.equal(frame.cells.find((cell) => cell.text === 'L')?.source?.label, 'node.root:lazy.label');
  assert.equal(frame.accessibility.root.children?.[1]?.disabled, true);
});

test('paginationWindow bounds pages and returns visible offsets', () => {
  assert.deepEqual(
    paginationWindow({ page: 99, pageSize: 10, total: 24 }),
    { page: 3, pageCount: 3, start: 20, end: 24 }
  );
});

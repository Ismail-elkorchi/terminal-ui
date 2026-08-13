import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createScrollState,
  dataGridReducer,
  prepareTableCollection,
  sortTableRows,
} from '../../dist/behavior/index.js';
import type { DataGridReducerOptions } from '../../dist/behavior/index.js';

const rows = ['row-0', 'row-1', 'row-2', 'row-3'];
const collection = prepareTableCollection(rows, (row) => row);
const rowOptions: DataGridReducerOptions<string> = {
  collection,
  columnIds: ['name', 'status', 'owner'],
  selection: { mode: 'single', commitment: 'manual' },
};

void test('row-grid navigation changes active position without committing selection', () => {
  const initial = {
    interaction: {
      kind: 'row' as const,
      selectionMode: 'single' as const,
      activeRowId: 'row-0',
      selectedRowIds: ['row-0'],
    },
  };
  const moved = dataGridReducer(initial, { kind: 'moveRow', delta: 2 }, rowOptions);
  const committed = dataGridReducer(moved, { kind: 'commit' }, rowOptions);

  assert.equal(moved.interaction.kind, 'row');
  assert.deepEqual(moved.interaction, {
    kind: 'row',
    selectionMode: 'single' as const,
    activeRowId: 'row-2',
    selectedRowIds: ['row-0'],
  });
  assert.deepEqual(committed.interaction, {
    kind: 'row',
    selectionMode: 'single' as const,
    activeRowId: 'row-2',
    selectedRowIds: ['row-2'],
    selectionAnchorId: 'row-2',
  });
});

void test('cell-grid mode uses stable row and column identities and clamps by default', () => {
  const initial = {
    interaction: {
      kind: 'cell' as const,
      selectionMode: 'single' as const,
      activeCell: { rowId: 'row-0', columnId: 'name' },
      selectedCells: [],
    },
  };
  const column = dataGridReducer(initial, { kind: 'moveColumn', delta: 99 }, rowOptions);
  const row = dataGridReducer(column, { kind: 'moveRow', delta: -99 }, rowOptions);

  assert.deepEqual(column.interaction.kind === 'cell' ? column.interaction.activeCell : undefined, {
    rowId: 'row-0',
    columnId: 'owner',
  });
  assert.deepEqual(row.interaction.kind === 'cell' ? row.interaction.activeCell : undefined, {
    rowId: 'row-0',
    columnId: 'owner',
  });
});

void test('multiple row selection supports toggle and anchored ranges', () => {
  const options: DataGridReducerOptions<string> = {
    ...rowOptions,
    selection: { mode: 'multiple', commitment: 'manual', range: true },
  };
  const initial = {
    interaction: {
      kind: 'row' as const,
      selectionMode: 'multiple' as const,
      activeRowId: 'row-1',
      selectedRowIds: ['row-1'],
      selectionAnchorId: 'row-1',
    },
  };
  const moved = dataGridReducer(initial, { kind: 'moveRow', delta: 2 }, options);
  const ranged = dataGridReducer(moved, { kind: 'commit', extend: true }, options);
  const toggled = dataGridReducer(ranged, { kind: 'commit', toggle: true }, options);

  assert.deepEqual(ranged.interaction.kind === 'row' ? ranged.interaction.selectedRowIds : [], [
    'row-1',
    'row-2',
    'row-3',
  ]);
  assert.deepEqual(toggled.interaction.kind === 'row' ? toggled.interaction.selectedRowIds : [], [
    'row-1',
    'row-2',
  ]);
});

void test('data-grid sorting and column resizing remain controlled transitions', () => {
  const initial = {
    interaction: { kind: 'row' as const,
    selectionMode: 'single' as const, selectedRowIds: [] },
  };
  const first = dataGridReducer(initial, { kind: 'sortBy', columnId: 'name' }, rowOptions);
  const second = dataGridReducer(first, { kind: 'sortBy', columnId: 'name' }, rowOptions);
  const resized = dataGridReducer(second, {
    kind: 'resizeColumnBy',
    columnId: 'name',
    delta: 4,
  }, { ...rowOptions, minColumnWidth: 3 });
  const shrunk = dataGridReducer(resized, {
    kind: 'setColumnWidth',
    columnId: 'name',
    width: 1,
  }, { ...rowOptions, minColumnWidth: 3 });

  assert.deepEqual(first.sort, { columnId: 'name', direction: 'ascending' });
  assert.deepEqual(second.sort, { columnId: 'name', direction: 'descending' });
  assert.equal(resized.columnWidths?.['name'], 7);
  assert.equal(shrunk.columnWidths?.['name'], 3);
});

void test('grid scroll transitions accept renderer-derived semantic state', () => {
  const initial = {
    interaction: { kind: 'row' as const,
    selectionMode: 'single' as const, selectedRowIds: [] },
    scroll: createScrollState(),
  };
  const rendered = createScrollState({ offsetRow: 2, offsetColumn: 1 });
  const state = dataGridReducer(initial, {
    kind: 'scroll',
    event: {
      nextState: rendered,
      source: 'wheel',
      target: 'content',
    },
  }, rowOptions);
  assert.equal(state.scroll, rendered);
});

void test('sortTableRows sorts with caller-controlled column accessors', () => {
  const values = [
    { name: 'zeta', count: 2 },
    { name: 'alpha', count: 10 },
    { name: 'beta', count: 1 },
  ];
  const valueForColumn = (row: typeof values[number], column: string): unknown =>
    column === 'name' ? row.name : column === 'count' ? row.count : undefined;
  assert.deepEqual(
    sortTableRows(values, { columnId: 'name', direction: 'ascending' }, valueForColumn).map((row) => row.name),
    ['alpha', 'beta', 'zeta'],
  );
  assert.deepEqual(
    sortTableRows(values, { columnId: 'count', direction: 'descending' }, valueForColumn).map((row) => row.count),
    [10, 2, 1],
  );
});

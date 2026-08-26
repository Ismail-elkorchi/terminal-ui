import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createScrollState,
  dataGridReducer,
  createTableCollection,
  sortTableRows,
} from '../../dist/behavior/index.js';
import type { DataGridReducerOptions } from '../../dist/behavior/index.js';

const rows = ['row-0', 'row-1', 'row-2', 'row-3'];
const collection = createTableCollection(rows, (row) => row);
const rowOptions: DataGridReducerOptions<string> = {
  collection,
  columnIds: ['name', 'status', 'owner'],
};

void test('grid navigation applies the initial policy before movement', () => {
  const rowInitial = {
    interaction: { kind: 'row' as const, selection: { mode: 'single' as const } },
  };
  const firstRow = dataGridReducer(rowInitial, { kind: 'moveRow', delta: 1 }, rowOptions);
  const lastRow = dataGridReducer(rowInitial, { kind: 'moveRow', delta: -1 }, rowOptions);
  assert.equal(firstRow.interaction.kind === 'row' ? firstRow.interaction.activeRowId : undefined, 'row-0');
  assert.equal(lastRow.interaction.kind === 'row' ? lastRow.interaction.activeRowId : undefined, 'row-3');

  const cellInitial = {
    interaction: { kind: 'cell' as const, selection: { mode: 'single' as const } },
  };
  const firstColumn = dataGridReducer(cellInitial, { kind: 'moveColumn', delta: 1 }, rowOptions);
  const lastColumn = dataGridReducer(cellInitial, { kind: 'moveColumn', delta: -1 }, rowOptions);
  assert.deepEqual(firstColumn.interaction.kind === 'cell' ? firstColumn.interaction.activeCell : undefined, {
    rowId: 'row-0',
    columnId: 'name',
  });
  assert.deepEqual(lastColumn.interaction.kind === 'cell' ? lastColumn.interaction.activeCell : undefined, {
    rowId: 'row-0',
    columnId: 'owner',
  });
});

void test('row-grid navigation changes active position without committing selection', () => {
  const initial = {
    interaction: {
      kind: 'row' as const,
      activeRowId: 'row-0',
      selection: { mode: 'single' as const, selectedRowId: 'row-0' },
    },
  };
  const moved = dataGridReducer(initial, { kind: 'moveRow', delta: 2 }, rowOptions);
  const committed = dataGridReducer(moved, { kind: 'commit' }, rowOptions);

  assert.equal(moved.interaction.kind, 'row');
  assert.deepEqual(moved.interaction, {
    kind: 'row',
    activeRowId: 'row-2',
    selection: { mode: 'single' as const, selectedRowId: 'row-0' },
  });
  assert.deepEqual(committed.interaction, {
    kind: 'row',
    activeRowId: 'row-2',
    selection: { mode: 'single' as const, selectedRowId: 'row-2' },
  });
});

void test('cell-grid mode uses stable row and column identities and clamps by default', () => {
  const initial = {
    interaction: {
      kind: 'cell' as const,
      activeCell: { rowId: 'row-0', columnId: 'name' },
      selection: { mode: 'single' as const },
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
  assert.equal(dataGridReducer(column, { kind: 'moveColumn', delta: 99 }, rowOptions), column);
  assert.equal(dataGridReducer(row, { kind: 'moveRow', delta: -99 }, rowOptions), row);
});

void test('multiple row selection supports toggle and anchored ranges', () => {
  const options: DataGridReducerOptions<string> = rowOptions;
  const initial = {
    interaction: {
      kind: 'row' as const,
      activeRowId: 'row-1',
      selection: {
        mode: 'multiple' as const,
        selectedRowIds: ['row-1'],
        selectionAnchorId: 'row-1',
        rangeSelectionEnabled: true,
      },
    },
  };
  const moved = dataGridReducer(initial, { kind: 'moveRow', delta: 2 }, options);
  const ranged = dataGridReducer(moved, { kind: 'commit', extendSelection: true }, options);
  const toggled = dataGridReducer(ranged, { kind: 'commit', toggleSelection: true }, options);

  assert.deepEqual(ranged.interaction.kind === 'row' && ranged.interaction.selection.mode === 'multiple'
    ? ranged.interaction.selection.selectedRowIds : [], [
    'row-1',
    'row-2',
    'row-3',
  ]);
  assert.deepEqual(toggled.interaction.kind === 'row' && toggled.interaction.selection.mode === 'multiple'
    ? toggled.interaction.selection.selectedRowIds : [], [
    'row-1',
    'row-2',
  ]);
});

void test('data-grid sorting and column resizing remain controlled transitions', () => {
  const initial = {
    interaction: { kind: 'row' as const, selection: { mode: 'single' as const } },
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
    interaction: { kind: 'row' as const, selection: { mode: 'single' as const } },
    scroll: createScrollState(),
  };
  const rendered = createScrollState({ offsetRow: 2, offsetColumn: 1 });
  const state = dataGridReducer(initial, {
    kind: 'scroll',
    request: {
      nextState: rendered,
      source: 'wheel',
      target: 'content',
    },
  }, rowOptions);
  assert.equal(state.scroll, rendered);
  assert.equal(dataGridReducer(state, {
    kind: 'scroll',
    request: { nextState: rendered, source: 'wheel', target: 'content' },
  }, rowOptions), state);
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

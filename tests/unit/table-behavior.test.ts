import assert from 'node:assert/strict';
import test from 'node:test';

import { createScrollState } from '../../dist/behavior/index.js';
import {
  sortTableRows,
  tableScrollablePresentation,
  tableReducer
} from '../../dist/behavior/index.js';
import type { TableReducerOptions } from '../../dist/behavior/index.js';

const rows = ['row-0', 'row-1', 'row-2', 'row-3'];
const options: TableReducerOptions<string> = {
  rows,
  getRowId: (row) => row,
  columnCount: 3
};

void test('tableReducer selects rows by stable id and clamps cell columns', () => {
  const row = tableReducer({}, { kind: 'selectRow', rowId: 'row-2', rowIndex: 2 }, options);
  const cell = tableReducer(row, { kind: 'selectCell', rowId: 'row-0', rowIndex: 0, column: 99 }, options);

  assert.deepEqual(row, { selectedRowId: 'row-2' });
  assert.deepEqual(cell, { selectedRowId: 'row-0', selectedColumn: 2 });
});

void test('tableReducer preserves identity across reorder and recovers after deletion', () => {
  const selected = tableReducer({}, { kind: 'selectRow', rowId: 'row-2', rowIndex: 2 }, options);
  const reordered = { ...options, rows: ['row-3', 'row-2', 'row-0', 'row-1'] };
  const moved = tableReducer(selected, { kind: 'moveRow', delta: 1 }, reordered);
  const deleted = { ...options, rows: ['row-3', 'row-0', 'row-1'] };
  const recoveredNext = tableReducer(selected, { kind: 'moveRow', delta: 1 }, deleted);
  const recoveredPrevious = tableReducer(selected, { kind: 'moveRow', delta: -1 }, deleted);

  assert.equal(selected.selectedRowId, 'row-2');
  assert.equal(moved.selectedRowId, 'row-0');
  assert.equal(recoveredNext.selectedRowId, 'row-3');
  assert.equal(recoveredPrevious.selectedRowId, 'row-1');
});

void test('tableReducer toggles sort state and resizes columns', () => {
  const first = tableReducer({}, { kind: 'sortBy', column: 'name' }, options);
  const second = tableReducer(first, { kind: 'sortBy', column: 'name' }, options);
  const resized = tableReducer(second, { kind: 'resizeColumnBy', column: 'name', delta: 4 }, { ...options, minColumnWidth: 3 });
  const shrunk = tableReducer(resized, { kind: 'resizeColumnBy', column: 'name', delta: -100 }, { ...options, minColumnWidth: 3 });
  const absolute = tableReducer(shrunk, { kind: 'setColumnWidth', column: 'name', width: 11 }, { ...options, minColumnWidth: 3 });

  assert.deepEqual(first.sort, { column: 'name', direction: 'ascending' });
  assert.deepEqual(second.sort, { column: 'name', direction: 'descending' });
  assert.equal(resized.columnWidths?.['name'], 7);
  assert.equal(shrunk.columnWidths?.['name'], 3);
  assert.equal(absolute.columnWidths?.['name'], 11);
});

void test('tablePresentation projects every renderer-owned table state field', () => {
  const scroll = createScrollState({ contentRows: 20, viewportRows: 5 });
  assert.deepEqual(tableScrollablePresentation({
    selectedRowId: 'row-3',
    selectedColumn: 2,
    sort: { column: 'name', direction: 'descending' },
    columnWidths: { name: 18 },
    scroll
  }), {
    selectedRowId: 'row-3',
    selectedCell: { rowId: 'row-3', column: 2 },
    sort: { column: 'name', direction: 'descending' },
    columnWidths: { name: 18 },
    scroll
  });
});

void test('tableReducer forwards scroll actions without creating hidden table state', () => {
  const scroll = createScrollState({
    contentRows: 100,
    viewportRows: 10,
    contentColumns: 20,
    viewportColumns: 10
  });
  const state = tableReducer({ scroll }, {
    kind: 'scroll',
    event: {
      action: { kind: 'scrollLines', rows: 4, columns: 2 },
      scroll,
      source: 'wheel',
      target: 'content',
      pointer: {
        kind: 'scroll',
        source: 'mouse',
        row: 1,
        column: 1,
        button: 'wheelDown',
        modifiers: { shift: false, alt: false, ctrl: false },
        deltaRows: 4,
        deltaColumns: 2,
        clickCount: 0,
        raw: {
          kind: 'mouse',
          sequence: '',
          encoding: 'sgr',
          action: 'wheel',
          button: 'wheelDown',
          deltaRows: 1,
          deltaColumns: 0,
          row: 1,
          column: 1,
          rawCode: 0,
          modifiers: { shift: false, alt: false, ctrl: false }
        }
      }
    }
  }, options);

  assert.equal(state.scroll.offsetRow, 4);
  assert.equal(state.scroll.offsetColumn, 2);
});

void test('sortTableRows sorts with caller-owned column accessors', () => {
  const rows = [
    { name: 'zeta', count: 2 },
    { name: 'alpha', count: 10 },
    { name: 'beta', count: 1 }
  ];

  const valueForColumn = (row: typeof rows[number], column: string): unknown => {
    if (column === 'name') return row.name;
    if (column === 'count') return row.count;
    return undefined;
  };

  assert.deepEqual(
    sortTableRows(rows, { column: 'name', direction: 'ascending' }, valueForColumn).map((row) => row.name),
    ['alpha', 'beta', 'zeta']
  );
  assert.deepEqual(
    sortTableRows(rows, { column: 'count', direction: 'descending' }, valueForColumn).map((row) => row.count),
    [10, 2, 1]
  );
});

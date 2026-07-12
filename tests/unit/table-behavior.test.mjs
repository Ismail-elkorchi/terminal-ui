import assert from 'node:assert/strict';
import test from 'node:test';

import { createScrollState } from '../../dist/behavior/index.js';
import {
  sortTableRows,
  tablePresentation,
  tableReducer
} from '../../dist/behavior/index.js';

test('tableReducer clamps row and cell selection through caller-provided bounds', () => {
  const row = tableReducer({}, { kind: 'selectRow', row: 12 }, { rowCount: 3 });
  const cell = tableReducer(row, { kind: 'selectCell', row: -1, column: 99 }, { rowCount: 3, columnCount: 2 });

  assert.deepEqual(row, { selectedRow: 2 });
  assert.deepEqual(cell, { selectedRow: 0, selectedColumn: 1 });
});

test('tableReducer toggles sort state and resizes columns', () => {
  const first = tableReducer({}, { kind: 'sortBy', column: 'name' });
  const second = tableReducer(first, { kind: 'sortBy', column: 'name' });
  const resized = tableReducer(second, { kind: 'resizeColumn', column: 'name', delta: 4 }, { minColumnWidth: 3 });
  const shrunk = tableReducer(resized, { kind: 'resizeColumn', column: 'name', delta: -100 }, { minColumnWidth: 3 });

  assert.deepEqual(first.sort, { column: 'name', direction: 'ascending' });
  assert.deepEqual(second.sort, { column: 'name', direction: 'descending' });
  assert.equal(resized.columnWidths?.['name'], 7);
  assert.equal(shrunk.columnWidths?.['name'], 3);
});

test('tablePresentation projects every renderer-owned table state field', () => {
  const scroll = createScrollState({ contentRows: 20, viewportRows: 5 });
  assert.deepEqual(tablePresentation({
    selectedRow: 3,
    selectedColumn: 2,
    sort: { column: 'name', direction: 'descending' },
    columnWidths: { name: 18 },
    scroll
  }), {
    selected: 3,
    selectedCell: { row: 3, column: 2 },
    sort: { column: 'name', direction: 'descending' },
    columnWidths: { name: 18 },
    scroll
  });
});

test('tableReducer forwards scroll actions without creating hidden table state', () => {
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
        raw: {
          kind: 'mouse',
          sequence: '',
          encoding: 'sgr',
          action: 'wheel',
          button: 'wheelDown',
          row: 1,
          column: 1,
          rawCode: 0,
          modifiers: { shift: false, alt: false, ctrl: false }
        }
      }
    }
  });

  assert.equal(state.scroll?.offsetRow, 4);
  assert.equal(state.scroll?.offsetColumn, 2);
});

test('sortTableRows sorts with caller-owned column accessors', () => {
  const rows = [
    { name: 'zeta', count: 2 },
    { name: 'alpha', count: 10 },
    { name: 'beta', count: 1 }
  ];

  assert.deepEqual(
    sortTableRows(rows, { column: 'name', direction: 'ascending' }, (row, column) => row[column]).map((row) => row.name),
    ['alpha', 'beta', 'zeta']
  );
  assert.deepEqual(
    sortTableRows(rows, { column: 'count', direction: 'descending' }, (row, column) => row[column]).map((row) => row.count),
    [10, 2, 1]
  );
});

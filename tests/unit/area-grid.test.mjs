import assert from 'node:assert/strict';
import test from 'node:test';

import { renderFramePlain, renderWidgetFrame } from '../../dist/tui/index.js';
import { areaGrid, text } from '../../dist/widgets/index.js';

const rows = [{ kind: 'fixed', cells: 1 }, { kind: 'fill' }, { kind: 'fixed', cells: 1 }];
const columns = [{ kind: 'fixed', cells: 8 }, { kind: 'fill' }];

test('areaGrid lays out named rectangular areas without adaptive policy', () => {
  const frame = renderWidgetFrame(areaGrid({
    id: 'layout',
    areas: `
      top top
      nav main
      bottom bottom
    `,
    rows,
    columns,
    children: {
      top: text('Header'),
      nav: text('Nav'),
      main: text('Main'),
      bottom: text('Footer')
    }
  }), { columns: 30, rows: 6 });
  const plain = renderFramePlain(frame);
  const main = frame.cells.find((cell) => cell.text === 'M');

  assert.match(plain, /Header/u);
  assert.match(plain, /Nav/u);
  assert.match(plain, /Main/u);
  assert.match(plain, /Footer/u);
  assert.deepEqual({ row: main?.row, column: main?.column }, { row: 2, column: 9 });
});

test('areaGrid rejects invalid, missing, unused, and non-rectangular area contracts', () => {
  assert.throws(() => areaGrid({
    areas: 'top top',
    rows: [],
    columns,
    children: { top: text('x') }
  }), /rows length/u);

  assert.throws(() => areaGrid({
    areas: 'top main',
    rows: [{ kind: 'fill' }],
    columns,
    children: { top: text('x') }
  }), /missing child/u);

  assert.throws(() => areaGrid({
    areas: 'top',
    rows: [{ kind: 'fill' }],
    columns: [{ kind: 'fill' }],
    children: { top: text('x'), other: text('unused') }
  }), /not used/u);

  assert.throws(() => areaGrid({
    areas: `
      a b
      a a
    `,
    rows: [{ kind: 'fill' }, { kind: 'fill' }],
    columns,
    children: { a: text('a'), b: text('b') }
  }), /rectangular/u);
});

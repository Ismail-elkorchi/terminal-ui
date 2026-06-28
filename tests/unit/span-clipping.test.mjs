import assert from 'node:assert/strict';
import test from 'node:test';

import { clipRenderSpans, createScrollState, renderFramePlain, renderWidgetFrame } from '../../dist/tui/index.js';
import { table } from '../../dist/widgets/index.js';

const red = { fg: { kind: 'ansi', value: 1 } };
const blue = { fg: { kind: 'ansi', value: 4 } };

test('clipRenderSpans clips by cell width while preserving style link and source', () => {
  const clipped = clipRenderSpans([
    { text: 'ab', style: red, link: { href: 'https://example.test/a' }, source: { id: 'a', kind: 'token' } },
    { text: '🙂cd', style: blue, link: { href: 'https://example.test/b' }, source: { id: 'b', kind: 'token' } }
  ], 5, { ellipsis: '…' });

  assert.deepEqual(clipped, [
    { text: 'ab', style: red, link: { href: 'https://example.test/a' }, source: { id: 'a', kind: 'token' } },
    { text: '🙂…', style: blue, link: { href: 'https://example.test/b' }, source: { id: 'b', kind: 'token' } }
  ]);
});

test('table clipping keeps multi-span cell styles instead of flattening to plain text', () => {
  const frame = renderWidgetFrame(table({
    id: 'styled-table',
    rows: [{ value: 'unused' }],
    columns: [{
      header: 'State',
      width: 6,
      render: () => [
        { text: 'pass', style: red },
        { text: '-fail', style: blue }
      ]
    }]
  }), { columns: 10, rows: 2 });

  assert.equal(renderFramePlain(frame), '  State\n› pass-…');
  assert.deepEqual(
    frame.cells
      .filter((cell) => cell.row === 2 && cell.column >= 3)
      .map((cell) => [cell.text, cell.style]),
    [
      ['p', red],
      ['a', red],
      ['s', red],
      ['s', red],
      ['-', blue],
      ['…', blue]
    ]
  );
});

test('table horizontal scrolling keeps span styles after clipped cells are shifted', () => {
  const frame = renderWidgetFrame(table({
    id: 'scrolled-styled-table',
    rows: [{ value: 'unused' }],
    scroll: createScrollState({ offsetColumn: 6, contentRows: 1, viewportRows: 1, contentColumns: 12, viewportColumns: 6 }),
    columns: [{
      width: 8,
      render: () => [
        { text: 'left', style: red },
        { text: 'right', style: blue }
      ]
    }]
  }), { columns: 6, rows: 1 });

  assert.equal(renderFramePlain(frame), 'rig…');
  assert.deepEqual(
    frame.cells.map((cell) => [cell.text, cell.style]),
    [
      ['r', blue],
      ['i', blue],
      ['g', blue],
      ['…', blue]
    ]
  );
});

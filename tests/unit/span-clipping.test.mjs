import assert from 'node:assert/strict';
import test from 'node:test';

import { createScrollState } from '../../dist/behavior/index.js';
import {
  alignRenderLine,
  clipRenderLine,
  clipRenderSpans,
  compactRenderSpans,
  measureRenderBlock,
  measureRenderLine,
  measureRenderSpans,
  padRenderLine,
  renderFramePlain,
  renderElementFrame,
  wrapRenderSpans
} from '../../dist/renderer/index.js';
import { table, tableColumn } from '../../dist/components/index.js';

const red = { fg: { kind: 'ansi', value: 1 } };
const blue = { fg: { kind: 'ansi', value: 4 } };
const selectedRed = selectedCellStyle(red);
const selectedBlue = selectedCellStyle(blue);

test('clipRenderSpans clips by cell width while preserving style link and source', () => {
  const clipped = clipRenderSpans([
    { text: 'ab', style: red, link: { href: 'https://example.test/a' }, source: { elementId: 'a', elementKind: 'token' } },
    { text: '🙂cd', style: blue, link: { href: 'https://example.test/b' }, source: { elementId: 'b', elementKind: 'token' } }
  ], 5, { ellipsis: '…' });

  assert.deepEqual(clipped, [
    { text: 'ab', style: red, link: { href: 'https://example.test/a' }, source: { elementId: 'a', elementKind: 'token' } },
    { text: '🙂…', style: blue, link: { href: 'https://example.test/b' }, source: { elementId: 'b', elementKind: 'token' } }
  ]);
});

test('clipRenderSpans supports middle ellipsis while preserving edge metadata', () => {
  const clipped = clipRenderSpans([
    { text: 'src/', style: red, source: { elementId: 'prefix', elementKind: 'token' } },
    { text: 'accessibility/', style: blue, source: { elementId: 'middle', elementKind: 'token' } },
    { text: 'snapshot.ts', style: red, source: { elementId: 'suffix', elementKind: 'token' } }
  ], 12, { ellipsis: '…', mode: 'middle' });

  assert.deepEqual(clipped, [
    { text: 'src/', style: red, source: { elementId: 'prefix', elementKind: 'token' } },
    { text: 'ac…', style: blue, source: { elementId: 'middle', elementKind: 'token' } },
    { text: 'ot.ts', style: red, source: { elementId: 'suffix', elementKind: 'token' } }
  ]);
});

test('wrapRenderSpans wraps by cell width while preserving style link and source', () => {
  const wrapped = wrapRenderSpans([
    { text: 'ab', style: red, link: { href: 'https://example.test/a' }, source: { elementId: 'a', elementKind: 'token' } },
    { text: '🙂cd', style: blue, link: { href: 'https://example.test/b' }, source: { elementId: 'b', elementKind: 'token' } }
  ], 4);

  assert.deepEqual(wrapped, [
    {
      spans: [
        { text: 'ab', style: red, link: { href: 'https://example.test/a' }, source: { elementId: 'a', elementKind: 'token' } },
        { text: '🙂', style: blue, link: { href: 'https://example.test/b' }, source: { elementId: 'b', elementKind: 'token' } }
      ]
    },
    {
      spans: [
        { text: 'cd', style: blue, link: { href: 'https://example.test/b' }, source: { elementId: 'b', elementKind: 'token' } }
      ]
    }
  ]);
});

test('render span utilities measure compact pad clip and align while preserving metadata', () => {
  const link = { href: 'https://example.test/a' };
  const source = {
    elementId: 'segment',
    elementKind: 'richText',
    rendererFamily: 'text',
    cellRole: 'text',
    description: 'segment'
  };
  const spans = [
    { text: 'ab', style: red, link, source },
    { text: '', style: red, link, source },
    { text: 'c', style: red, link, source },
    { text: '🙂', style: blue, source: { elementId: 'emoji', elementKind: 'richText', rendererFamily: 'text' } }
  ];
  const compacted = compactRenderSpans(spans);

  assert.deepEqual(compacted, [
    { text: 'abc', style: red, link, source },
    { text: '🙂', style: blue, source: { elementId: 'emoji', elementKind: 'richText', rendererFamily: 'text' } }
  ]);
  assert.equal(measureRenderSpans(compacted), 5);
  assert.equal(measureRenderLine({ spans: compacted }), 5);
  assert.deepEqual(measureRenderBlock({ lines: [{ spans: compacted }, { spans: [{ text: '界' }] }] }), { width: 5, height: 2 });

  assert.deepEqual(clipRenderLine({ spans: compacted }, 4, { ellipsis: '…' }).spans, [
    { text: 'abc…', style: red, link, source }
  ]);
  assert.deepEqual(padRenderLine({ spans: [{ text: 'ok', style: blue, source }] }, 5, {
    align: 'center',
    fill: { text: '.', style: red, source: { elementId: 'pad', elementKind: 'pad' } }
  }).spans, [
    { text: '.', style: red, source: { elementId: 'pad', elementKind: 'pad' } },
    { text: 'ok', style: blue, source },
    { text: '..', style: red, source: { elementId: 'pad', elementKind: 'pad' } }
  ]);
  assert.deepEqual(alignRenderLine({ spans: [{ text: 'toolong', source }] }, 4, 'end').spans, [
    { text: 'tool', source }
  ]);
});

test('table clipping keeps multi-span cell styles instead of flattening to plain text', () => {
  const frame = renderElementFrame(table({
    getRowId: (_row, index) => String(index),
    id: 'styled-table',
    presentation: { selectedRowId: '0' },
    rows: [{ value: 'unused' }],
    columns: [tableColumn({
      id: 'state-0', value: (row) => Array.isArray(row) ? row[0] : row,
      header: 'State',
      width: 6,
      render: () => [
        { kind: 'text', text: 'pass', style: red },
        { kind: 'text', text: '-fail', style: blue }
      ]
    })]
  }), { columns: 10, rows: 2 });

  assert.equal(renderFramePlain(frame), '  State\n› pass-…');
  assert.deepEqual(
    frame.cells
      .filter((cell) =>
        cell.row === 2
        && cell.column >= 3
        && cell.source?.elementId === 'styled-table'
      )
      .map((cell) => [cell.text, cell.style]),
    [
      ['p', selectedRed],
      ['a', selectedRed],
      ['s', selectedRed],
      ['s', selectedRed],
      ['-', selectedBlue],
      ['…', selectedBlue]
    ]
  );
});

test('table horizontal scrolling keeps span styles after clipped cells are shifted', () => {
  const frame = renderElementFrame(table({
    getRowId: (_row, index) => String(index),
    id: 'scrolled-styled-table',
    presentation: {
      selectedRowId: '0',
      scroll: createScrollState({ offsetColumn: 6, contentRows: 1, viewportRows: 1, contentColumns: 12, viewportColumns: 6 })
    },
    rows: [{ value: 'unused' }],
    onAction: (action) => action,
    columns: [tableColumn({
      id: 'column-0', value: (row) => Array.isArray(row) ? row[0] : row,
      width: 8,
      render: () => [
        { kind: 'text', text: 'left', style: red },
        { kind: 'text', text: 'right', style: blue }
      ]
    })]
  }), { columns: 6, rows: 1 });

  assert.equal(renderFramePlain(frame), 'rig…');
  assert.deepEqual(
    frame.cells
      .filter((cell) => cell.source?.elementId === 'scrolled-styled-table')
      .map((cell) => [cell.text, cell.style]),
    [
      ['r', selectedBlue],
      ['i', selectedBlue],
      ['g', selectedBlue],
      ['…', selectedBlue]
    ]
  );
});

function selectedCellStyle(style) {
  return {
    bg: { kind: 'theme', token: 'selection.background' },
    bold: true,
    ...style
  };
}

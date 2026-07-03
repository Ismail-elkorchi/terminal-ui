import assert from 'node:assert/strict';
import test from 'node:test';

import {
  alignRenderLine,
  clipRenderLine,
  clipRenderSpans,
  compactRenderSpans,
  createScrollState,
  measureRenderBlock,
  measureRenderLine,
  measureRenderSpans,
  padRenderLine,
  renderFramePlain,
  renderWidgetFrame,
  wrapRenderSpans
} from '../../dist/tui/index.js';
import { table } from '../../dist/widgets/index.js';

const red = { fg: { kind: 'ansi', value: 1 } };
const blue = { fg: { kind: 'ansi', value: 4 } };
const selectedRed = selectedCellStyle(red);
const selectedBlue = selectedCellStyle(blue);

test('clipRenderSpans clips by cell width while preserving style link and source', () => {
  const clipped = clipRenderSpans([
    { text: 'ab', style: red, link: { href: 'https://example.test/a' }, source: { ownerId: 'a', ownerKind: 'token' } },
    { text: '🙂cd', style: blue, link: { href: 'https://example.test/b' }, source: { ownerId: 'b', ownerKind: 'token' } }
  ], 5, { ellipsis: '…' });

  assert.deepEqual(clipped, [
    { text: 'ab', style: red, link: { href: 'https://example.test/a' }, source: { ownerId: 'a', ownerKind: 'token' } },
    { text: '🙂…', style: blue, link: { href: 'https://example.test/b' }, source: { ownerId: 'b', ownerKind: 'token' } }
  ]);
});

test('wrapRenderSpans wraps by cell width while preserving style link and source', () => {
  const wrapped = wrapRenderSpans([
    { text: 'ab', style: red, link: { href: 'https://example.test/a' }, source: { ownerId: 'a', ownerKind: 'token' } },
    { text: '🙂cd', style: blue, link: { href: 'https://example.test/b' }, source: { ownerId: 'b', ownerKind: 'token' } }
  ], 4);

  assert.deepEqual(wrapped, [
    {
      spans: [
        { text: 'ab', style: red, link: { href: 'https://example.test/a' }, source: { ownerId: 'a', ownerKind: 'token' } },
        { text: '🙂', style: blue, link: { href: 'https://example.test/b' }, source: { ownerId: 'b', ownerKind: 'token' } }
      ]
    },
    {
      spans: [
        { text: 'cd', style: blue, link: { href: 'https://example.test/b' }, source: { ownerId: 'b', ownerKind: 'token' } }
      ]
    }
  ]);
});

test('render span utilities measure compact pad clip and align while preserving metadata', () => {
  const link = { href: 'https://example.test/a' };
  const source = { ownerId: 'segment', ownerKind: 'richText', family: 'text', role: 'text', label: 'segment' };
  const spans = [
    { text: 'ab', style: red, link, source },
    { text: '', style: red, link, source },
    { text: 'c', style: red, link, source },
    { text: '🙂', style: blue, source: { ownerId: 'emoji', ownerKind: 'richText', family: 'text' } }
  ];
  const compacted = compactRenderSpans(spans);

  assert.deepEqual(compacted, [
    { text: 'abc', style: red, link, source },
    { text: '🙂', style: blue, source: { ownerId: 'emoji', ownerKind: 'richText', family: 'text' } }
  ]);
  assert.equal(measureRenderSpans(compacted), 5);
  assert.equal(measureRenderLine({ spans: compacted }), 5);
  assert.deepEqual(measureRenderBlock({ lines: [{ spans: compacted }, { spans: [{ text: '界' }] }] }), { width: 5, height: 2 });

  assert.deepEqual(clipRenderLine({ spans: compacted }, 4, { ellipsis: '…' }).spans, [
    { text: 'abc…', style: red, link, source }
  ]);
  assert.deepEqual(padRenderLine({ spans: [{ text: 'ok', style: blue, source }] }, 5, {
    align: 'center',
    fill: { text: '.', style: red, source: { ownerId: 'pad', ownerKind: 'pad' } }
  }).spans, [
    { text: '.', style: red, source: { ownerId: 'pad', ownerKind: 'pad' } },
    { text: 'ok', style: blue, source },
    { text: '..', style: red, source: { ownerId: 'pad', ownerKind: 'pad' } }
  ]);
  assert.deepEqual(alignRenderLine({ spans: [{ text: 'toolong', source }] }, 4, 'end').spans, [
    { text: 'tool', source }
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

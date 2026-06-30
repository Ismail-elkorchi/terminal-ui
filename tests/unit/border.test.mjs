import assert from 'node:assert/strict';
import test from 'node:test';

import { defaultTheme } from '../../dist/theme/index.js';
import { createFrameBuffer, drawBorder, renderFramePlain } from '../../dist/tui/index.js';

test('drawBorder ignores empty rectangles without writing cells', () => {
  const zeroWidth = createFrameBuffer(3, 3);
  const zeroHeight = createFrameBuffer(3, 3);

  drawBorder(zeroWidth, { row: 1, column: 1, width: 0, height: 2 }, { kind: 'single' }, defaultTheme);
  drawBorder(zeroHeight, { row: 1, column: 1, width: 2, height: 0 }, { kind: 'single' }, defaultTheme);

  assert.equal(zeroWidth.snapshot().cells.length, 0);
  assert.equal(zeroHeight.snapshot().cells.length, 0);
});

test('drawBorder renders 2x2 corners for every visible border kind', () => {
  const cases = [
    { kind: 'single', expected: '┌┐\n└┘' },
    { kind: 'rounded', expected: '╭╮\n╰╯' },
    { kind: 'double', expected: '╔╗\n╚╝' },
    { kind: 'heavy', expected: '┏┓\n┗┛' },
    { kind: 'ascii', expected: '++\n++' },
    { kind: 'dashed', expected: '┌┐\n└┘' },
    { kind: 'dotted', expected: '┌┐\n└┘' },
    { kind: 'empty', expected: '' }
  ];

  for (const current of cases) {
    const buffer = createFrameBuffer(2, 2);

    drawBorder(buffer, { row: 1, column: 1, width: 2, height: 2 }, { kind: current.kind }, defaultTheme);

    assert.equal(renderFramePlain(buffer.snapshot()), current.expected, current.kind);
  }
});

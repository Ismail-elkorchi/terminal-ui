import assert from 'node:assert/strict';
import test from 'node:test';

import {
  blockSpan,
  brailleCharacter,
  brailleCellForPoint,
  createCanvas2D,
  createFrameBuffer,
  horizontalAxis,
  linePoints,
  renderFramePlain,
  tooltipLines
} from '../../dist/tui/index.js';

test('Canvas2D draws points lines rectangles text and block spans through FrameBuffer', () => {
  const buffer = createFrameBuffer(14, 6);
  const canvas = createCanvas2D(buffer, { row: 1, column: 1, width: 14, height: 6 });

  canvas.point(0, 0, { text: 'A' });
  canvas.line(2, 0, 5, 0, { text: '-' });
  canvas.rect({ row: 1, column: 1, width: 5, height: 3 }, {
    stroke: { text: '#' },
    fill: { text: '.' }
  });
  canvas.text(7, 2, [{ text: 'Hi' }]);
  canvas.text(10, 2, [blockSpan('full')]);

  assert.equal(renderFramePlain(buffer.snapshot()), 'A ----\n #####\n #...# Hi █\n #####');
});

test('Canvas2D clips drawing to the supplied canvas bounds', () => {
  const buffer = createFrameBuffer(8, 3);
  const canvas = createCanvas2D(buffer, { row: 2, column: 3, width: 3, height: 1 });

  canvas.point(-1, 0, { text: 'x' });
  canvas.text(0, 0, [{ text: 'abcd' }]);
  canvas.point(3, 0, { text: 'y' });
  canvas.point(1, 1, { text: 'z' });

  assert.equal(renderFramePlain(buffer.snapshot()), '\n  abc');
});

test('Canvas2D accumulates braille points into terminal cells', () => {
  const buffer = createFrameBuffer(4, 2);
  const canvas = createCanvas2D(buffer, { row: 1, column: 1, width: 4, height: 2 });

  canvas.braillePoint(0, 0);
  canvas.braillePoint(1, 0);
  canvas.braillePoint(0, 1);

  const frame = buffer.snapshot();
  const cell = frame.cells.find((current) => current.row === 1 && current.column === 1);

  assert.equal(cell?.text, brailleCharacter(0x0b));
  assert.deepEqual(brailleCellForPoint(5, 9), { cell: { x: 2, y: 2 }, mask: 0x10 });
});

test('Canvas2D helpers provide deterministic path axis and tooltip primitives', () => {
  assert.deepEqual(linePoints(0, 0, 3, 0), [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 2, y: 0 },
    { x: 3, y: 0 }
  ]);
  assert.deepEqual(horizontalAxis(5, 2, { text: '-' }, 2).tickPoints, [
    { x: 0, y: 2 },
    { x: 2, y: 2 },
    { x: 4, y: 2 }
  ]);
  assert.deepEqual(tooltipLines([{ text: 'Heading' }], [[{ text: 'Body text' }]], 4), [
    { spans: [{ text: 'Head' }] },
    { spans: [{ text: 'Body' }] }
  ]);
});

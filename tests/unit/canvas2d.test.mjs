import assert from 'node:assert/strict';
import test from 'node:test';

import {
  blockSpan,
  brailleCharacter,
  brailleCellForPoint,
  brailleMaskForSubcell,
  canvasTransform,
  createCanvas2D,
  createFrameBuffer,
  ellipseStrokePoints,
  horizontalAxis,
  linePoints,
  renderFramePlain,
  transformCanvasPoint,
  transformCanvasRect,
  tooltipLines
} from '../../dist/renderer/index.js';
import { defaultTextWidthProfile } from '../../dist/text/index.js';

test('Canvas2D draws points lines rectangles text and block spans through FrameBuffer', () => {
  const buffer = createFrameBuffer(14, 6);
  const canvas = createCanvas2D(buffer, { row: 1, column: 1, width: 14, height: 6 });

  canvas.point(0, 0, { text: 'A' });
  canvas.line(2, 0, 5, 0, { text: '-' });
  canvas.rect({ x: 1, y: 1, width: 5, height: 3 }, {
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
  assert.deepEqual(
    buffer.snapshot().cells.slice(0, 3).map(({ row, column }) => ({ row, column })),
    [{ row: 2, column: 3 }, { row: 2, column: 4 }, { row: 2, column: 5 }]
  );
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
  assert.deepEqual(tooltipLines([{ text: 'Heading' }], [[{ text: 'Body text' }]], 4, defaultTextWidthProfile), [
    { spans: [{ text: 'Head' }] },
    { spans: [{ text: 'Body' }] }
  ]);
});

test('Canvas2D rejects invalid terminal-cell coordinates, rectangles, radii, angles, and bounds', () => {
  const buffer = createFrameBuffer(8, 4);
  const canvas = createCanvas2D(buffer, { row: 1, column: 1, width: 8, height: 4 });
  const mark = { text: '*' };
  const point = { x: 1, y: 1 };
  const rect = { x: 1, y: 1, width: 2, height: 2 };
  const invalidCases = [
    ['point x', () => canvas.point(Number.NaN, 1, mark)],
    ['point y', () => canvas.point(1, Number.POSITIVE_INFINITY, mark)],
    ['fractional point', () => canvas.point(0.5, 1, mark)],
    ['line start x', () => canvas.line(Number.NaN, 1, 2, 2, mark)],
    ['line start y', () => canvas.line(1, Number.NaN, 2, 2, mark)],
    ['line end x', () => canvas.line(1, 1, Number.NaN, 2, mark)],
    ['line end y', () => canvas.line(1, 1, 2, Number.NaN, mark)],
    ['polyline x', () => canvas.polyline([point, { ...point, x: Number.NaN }], mark)],
    ['polyline y', () => canvas.polyline([point, { ...point, y: Number.NaN }], mark)],
    ['rectangle x', () => canvas.rect({ ...rect, x: Number.NaN }, { fill: mark })],
    ['rectangle y', () => canvas.rect({ ...rect, y: Number.NaN }, { fill: mark })],
    ['rectangle width', () => canvas.rect({ ...rect, width: -1 }, { fill: mark })],
    ['rectangle height', () => canvas.rect({ ...rect, height: 1.5 }, { fill: mark })],
    ['circle center x', () => canvas.circle({ ...point, x: Number.NaN }, 1, { stroke: mark })],
    ['circle center y', () => canvas.circle({ ...point, y: Number.NaN }, 1, { stroke: mark })],
    ['circle radius', () => canvas.circle(point, -1, { stroke: mark })],
    ['ellipse x radius', () => canvas.ellipse(point, Number.NaN, 1, { stroke: mark })],
    ['ellipse y radius', () => canvas.ellipse(point, 1, 1.5, { stroke: mark })],
    ['arc radius', () => canvas.arc(point, Number.NaN, 0, 1, { stroke: mark })],
    ['arc start angle', () => canvas.arc(point, 1, Number.NaN, 1, { stroke: mark })],
    ['arc end angle', () => canvas.arc(point, 1, 0, Number.POSITIVE_INFINITY, { stroke: mark })],
    ['polygon x', () => canvas.fillPolygon([point, { ...point, x: Number.NaN }], mark)],
    ['polygon y', () => canvas.fillPolygon([point, { ...point, y: Number.NaN }], mark)],
    ['text x', () => canvas.text(Number.NaN, 1, [mark])],
    ['text y', () => canvas.text(1, 0.5, [mark])],
    ['Braille x', () => canvas.braillePoint(Number.NaN, 1)],
    ['Braille y', () => canvas.braillePoint(1, 0.5)],
    ['clear x', () => canvas.clear({ ...rect, x: Number.NaN })],
    ['clear y', () => canvas.clear({ ...rect, y: Number.NaN })],
    ['clear width', () => canvas.clear({ ...rect, width: Number.NaN })],
    ['clear height', () => canvas.clear({ ...rect, height: -1 })]
  ];

  for (const [label, draw] of invalidCases) {
    assert.throws(draw, RangeError, label);
  }
  assert.throws(
    () => createCanvas2D(buffer, { row: 0, column: 1, width: 2, height: 2 }),
    /bounds/u
  );
  assert.throws(
    () => createCanvas2D(buffer, { row: 4, column: 8, width: 2, height: 2 }),
    /bounds/u
  );
  assert.equal(buffer.snapshot().cells.length, 0);
});

test('Canvas2D rejects invalid transforms without changing its terminal-cell transform', () => {
  const buffer = createFrameBuffer(4, 2);
  const canvas = createCanvas2D(buffer, { row: 1, column: 1, width: 4, height: 2 });
  const invalidCases = [
    ['translate x', () => canvas.translate(Number.NaN, 1)],
    ['translate y', () => canvas.translate(1, 0.5)],
    ['scale x', () => canvas.scale(0, 1)],
    ['scale y', () => canvas.scale(1, Number.NaN)],
    ['withTransform translateX', () => canvas.withTransform({ translateX: Number.NaN }, () => assert.fail())],
    ['withTransform translateY', () => canvas.withTransform({ translateY: 0.5 }, () => assert.fail())],
    ['withTransform scaleX', () => canvas.withTransform({ scaleX: 0 }, () => assert.fail())],
    ['withTransform scaleY', () => canvas.withTransform({ scaleY: Number.NaN }, () => assert.fail())]
  ];
  for (const [label, transform] of invalidCases) {
    assert.throws(transform, RangeError, label);
  }

  canvas.point(0, 0, { text: 'A' });
  assert.equal(renderFramePlain(buffer.snapshot()), 'A');
  for (const input of [
    { translateX: Number.NaN },
    { translateY: 0.5 },
    { scaleX: 0 },
    { scaleY: 1.5 }
  ]) {
    assert.throws(() => canvasTransform(input), RangeError);
  }
  assert.throws(
    () => transformCanvasPoint(
      { translateX: 0, translateY: 0, scaleX: Number.POSITIVE_INFINITY, scaleY: 1 },
      { x: 0, y: 0 }
    ),
    RangeError
  );
  assert.throws(
    () => transformCanvasPoint(
      { translateX: 0, translateY: 0, scaleX: 1, scaleY: 1 },
      { x: 0.5, y: 0 }
    ),
    RangeError
  );
  assert.throws(
    () => transformCanvasRect(
      { translateX: 0, translateY: 0, scaleX: 1, scaleY: 1 },
      { x: 0, y: 0, width: -1, height: 1 }
    ),
    RangeError
  );
});

test('Canvas2D helpers reject invalid path, shape, and Braille inputs', () => {
  assert.throws(() => linePoints(0, 0, Number.NaN, 1), /finite/u);
  assert.throws(
    () => ellipseStrokePoints({ x: 0, y: 0 }, -1, 1),
    /radius/u
  );
  assert.throws(
    () => ellipseStrokePoints({ x: 0, y: 0 }, 1, 1, 0, Number.NaN),
    /angles/u
  );
  assert.throws(() => brailleCellForPoint(0.5, 0), /integer/u);
  assert.throws(() => brailleMaskForSubcell(2, 0), /two-by-four/u);
  assert.throws(() => brailleMaskForSubcell(0, 4), /two-by-four/u);
  assert.throws(() => brailleCharacter(256), /0 through 255/u);
});

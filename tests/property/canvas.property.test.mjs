import assert from 'node:assert/strict';
import test from 'node:test';

import { renderWidgetFrame } from '../../dist/tui/index.js';
import { canvas } from '../../dist/widgets/index.js';

test('Canvas2D primitives clip out-of-bounds drawing to the viewport', () => {
  for (let index = 0; index < 64; index += 1) {
    const width = 4 + (index % 9);
    const height = 3 + (index % 5);
    const offset = index - 32;
    const frame = renderWidgetFrame(canvas({
      id: `canvas-property-${String(index)}`,
      painter({ canvas: drawing }) {
        drawing.withTransform({ translateX: offset, translateY: -offset, scaleX: 1 + (index % 3), scaleY: 1 + (index % 2) }, (current) => {
          current.circle({ x: 2, y: 2 }, 4 + (index % 4), { stroke: { text: 'o' } });
          current.ellipse({ x: 4, y: 3 }, 5, 2, { fill: { text: 'e' } });
          current.arc({ x: 1, y: 1 }, 6, -Math.PI, Math.PI / 2, { stroke: { text: 'a' } });
          current.fillPolygon([
            { x: -4, y: 1 },
            { x: 12, y: 2 },
            { x: 2, y: 9 }
          ], { text: 'p' });
        });
      }
    }), { columns: width, rows: height });

    for (const cell of frame.cells) {
      assert.equal(cell.row >= 1 && cell.row <= height, true, `row outside frame for case ${String(index)}`);
      assert.equal(cell.column >= 1 && cell.column <= width, true, `column outside frame for case ${String(index)}`);
    }
  }
});

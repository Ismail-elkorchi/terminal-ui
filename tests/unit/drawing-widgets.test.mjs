import assert from 'node:assert/strict';
import test from 'node:test';

import { blockSpan, renderFramePlain, renderWidgetFrame, renderWidgetRegions } from '../../dist/tui/index.js';
import { absolute, button, canvas, overlay, surface, text } from '../../dist/widgets/index.js';

test('canvas writes styled spans through safe frame-buffer APIs', () => {
  const frame = renderWidgetFrame(canvas({
    id: 'canvas',
    label: 'Game board',
    painter({ buffer, bounds }) {
      buffer.write(bounds.row, bounds.column, [{ text: 'A🙂B', style: { fg: { kind: 'theme', token: 'accent.primary' } } }]);
      buffer.write(bounds.row + 1, bounds.column + 2, [{ text: '\u001B[31msafe' }]);
    }
  }), { columns: 8, rows: 3 });

  assert.equal(renderFramePlain(frame), 'A🙂B\n  safe');
  assert.equal(frame.cells.find((cell) => cell.text === 'A')?.style?.fg?.token, 'accent.primary');
  assert.equal(frame.cells.some((cell) => cell.text.includes('\u001B')), false);
  assert.equal(frame.accessibility.root.role, 'application');
  assert.equal(frame.accessibility.root.label, 'Game board');
});

test('canvas painters receive Canvas2D helpers while keeping direct buffer access', () => {
  const frame = renderWidgetFrame(canvas({
    id: 'canvas2d',
    label: 'Canvas2D board',
    painter({ buffer, bounds, canvas }) {
      canvas.line(0, 0, 3, 0, { text: '-' });
      canvas.rect({ row: 0, column: 0, width: 4, height: 2 }, {
        stroke: blockSpan('full')
      });
      canvas.text(5, 0, [{ text: 'ok' }]);
      buffer.write(bounds.row + 2, bounds.column, [{ text: 'raw ' }]);
    }
  }), { columns: 8, rows: 3 });

  assert.equal(renderFramePlain(frame), '████ ok\n████\nraw');
});

test('Canvas2D draws curves polygons and transformed paths through the frame buffer', () => {
  const frame = renderWidgetFrame(canvas({
    id: 'canvas2d-shapes',
    painter({ canvas }) {
      canvas.circle({ x: 3, y: 2 }, 2, { stroke: { text: 'o' } });
      canvas.ellipse({ x: 8, y: 2 }, 2, 1, { fill: { text: 'e' } });
      canvas.arc({ x: 8, y: 4 }, 2, 0, Math.PI, { stroke: { text: 'a' } });
      canvas.fillPolygon([
        { x: 1, y: 4 },
        { x: 4, y: 4 },
        { x: 2, y: 5 }
      ], { text: 'p' });
      canvas.withTransform({ translateX: 9, translateY: 0 }, (drawing) => {
        drawing.polyline([{ x: 0, y: 0 }, { x: 2, y: 0 }], { text: 't' });
      });
      canvas.point(99, 99, { text: 'x' });
    }
  }), { columns: 12, rows: 6 });

  const marks = frame.cells.map((cell) => `${String(cell.row)}:${String(cell.column)}:${cell.text}`);

  assert.equal(marks.includes('1:10:t'), true);
  assert.equal(frame.cells.some((cell) => cell.text === 'o'), true);
  assert.equal(frame.cells.some((cell) => cell.text === 'e'), true);
  assert.equal(frame.cells.some((cell) => cell.text === 'a'), true);
  assert.equal(frame.cells.some((cell) => cell.text === 'p'), true);
  assert.equal(frame.cells.some((cell) => cell.text === 'x'), false);
});

test('surface absolute and overlay compose arbitrary positioned overlapping content', () => {
  const frame = renderWidgetFrame(surface(
    overlay([
      canvas({
        id: 'base-canvas',
        painter({ buffer, bounds }) {
          buffer.write(bounds.row, bounds.column, [{ text: 'base-line' }]);
          buffer.write(bounds.row + 1, bounds.column, [{ text: 'wide界tail' }]);
        }
      }),
      absolute(text('TOP', { id: 'top-text' }), {
        id: 'absolute-top',
        row: 1,
        column: 6,
        width: 3,
        height: 1
      }),
      absolute(canvas({
        id: 'mark-canvas',
        painter({ buffer, bounds }) {
          buffer.write(bounds.row, bounds.column, [{ text: '!' }]);
        }
      }), {
        id: 'absolute-mark',
        row: 2,
        column: 7,
        width: 1,
        height: 1
      })
    ], {
      id: 'overlay'
    }),
    { id: 'surface', label: 'Drawing surface' }
  ), { columns: 12, rows: 3 });

  const output = renderFramePlain(frame);

  assert.equal(output, 'base-TOPe\nwide界!ail');
  assert.equal(frame.accessibility.root.label, 'Drawing surface');
  assert.equal(frame.accessibility.root.children?.[0]?.role, 'application');
});

test('region projection keeps overlapping z-index content separate before compositing', () => {
  const widget = surface(
    overlay([
      text('lower', { id: 'lower', zIndex: 0 }),
      text('UPPER', { id: 'upper', zIndex: 10 })
    ], { id: 'layer-overlay' }),
    { id: 'layer-surface' }
  );

  const regions = renderWidgetRegions(widget, { columns: 8, rows: 2 });
  const frame = renderWidgetFrame(widget, { columns: 8, rows: 2 });

  assert.deepEqual(regions.map((region) => region.zIndex), [0, 10]);
  assert.equal(regions[0]?.cells.some((cell) => cell.text === 'l'), true);
  assert.equal(regions[1]?.cells.some((cell) => cell.text === 'U'), true);
  assert.equal(regions[1]?.opacity, 'transparent');
  assert.equal(renderFramePlain(frame), 'UPPER');
});

test('region-local overlay buffers preserve clipped viewport coordinates and hit targets', () => {
  const widget = surface(
    overlay([
      canvas({
        id: 'region-base',
        painter({ buffer, bounds }) {
          for (let row = bounds.row; row < bounds.row + bounds.height; row += 1) {
            buffer.write(row, bounds.column, [{ text: '..........' }]);
          }
        }
      }),
      absolute(button({ id: 'region-button', label: 'Launch', message: { kind: 'launch' }, zIndex: 10 }), {
        id: 'region-absolute',
        row: 2,
        column: 7,
        width: 8,
        height: 1
      })
    ], { id: 'region-overlay' }),
    { id: 'region-surface' }
  );

  const regions = renderWidgetRegions(widget, { columns: 10, rows: 3 });
  const frame = renderWidgetFrame(widget, { columns: 10, rows: 3 });
  const overlayRegion = regions.find((region) => region.zIndex === 10);
  const hitTarget = frame.hitTargets?.find((item) => item.id.startsWith('region-button'));

  assert.deepEqual(overlayRegion?.bounds, { row: 2, column: 7, width: 4, height: 1 });
  assert.equal(overlayRegion?.cells.every((cell) => cell.row === 2 && cell.column >= 7 && cell.column <= 10), true);
  assert.deepEqual(overlayRegion?.metadata.writtenBounds.rects, [
    { row: 2, column: 7, width: 4, height: 1 }
  ]);
  assert.deepEqual(hitTarget?.bounds, { row: 2, column: 7, width: 4, height: 1 });
  assert.match(renderFramePlain(frame).split('\n')[1] ?? '', /^......../u);
});

test('canvas rejects missing painters as programmer errors', () => {
  assert.throws(
    () => canvas({ id: 'bad-canvas-factory', painter: undefined }),
    /Canvas widgets must provide a painter function/u
  );
  assert.throws(
    () => renderWidgetFrame({ id: 'bad-canvas', kind: 'canvas', props: {} }, { columns: 4, rows: 2 }),
    /Canvas widgets must provide a painter/u
  );
});

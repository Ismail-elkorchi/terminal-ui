import assert from 'node:assert/strict';
import test from 'node:test';

import { defaultTheme, noColorTheme } from '../../dist/theme/index.js';
import { blockSpan,
  layoutElement,
  renderFramePlain,
  renderElementFrame
} from '../../dist/renderer/index.js';
import { renderElementRegions } from '../../dist/renderer/internal/render.js';
import {
  absolute,
  overlay,
  column,
  surface
} from '../../dist/layout/index.js';
import {
  button,
  text
} from '../../dist/components/index.js';
import { testCanvas as canvas } from '../helpers/canvas.mjs';

test('canvas component writes styled spans through safe Canvas2D APIs', () => {
  const frame = renderElementFrame(canvas({
    id: 'canvas',
    label: 'Game board',
    painter({ canvas }) {
      canvas.text(0, 0, [{ text: 'A🙂B', style: { fg: { kind: 'theme', token: 'accent.primary' } } }]);
      canvas.text(2, 1, [{ text: '\u001B[31msafe' }]);
    }
  }), { columns: 8, rows: 3 });

  assert.equal(renderFramePlain(frame), 'A🙂B\n  safe');
  assert.equal(frame.cells.find((cell) => cell.text === 'A')?.style?.fg?.token, 'accent.primary');
  assert.equal(frame.cells.some((cell) => cell.text.includes('\u001B')), false);
  assert.equal(frame.accessibility.root.role, 'image');
  assert.equal(frame.accessibility.root.label, 'Game board');
});

test('canvas painters receive Canvas2D helpers without raw frame-buffer access', () => {
  const frame = renderElementFrame(canvas({
    id: 'canvas2d',
    label: 'Canvas2D board',
    painter({ canvas }) {
      canvas.line(0, 0, 3, 0, { text: '-' });
      canvas.rect({ x: 0, y: 0, width: 4, height: 2 }, {
        stroke: blockSpan('full')
      });
      canvas.text(5, 0, [{ text: 'ok' }]);
      canvas.text(0, 2, [{ text: 'raw ' }]);
    }
  }), { columns: 8, rows: 3 });

  assert.equal(renderFramePlain(frame), '████ ok\n████\nraw');
});

test('canvas painters can provide source metadata without becoming pseudo-controls', () => {
  const frame = renderElementFrame(canvas({
    id: 'inspectable-canvas',
    label: 'Inspectable canvas',
    painter({ canvas }) {
      canvas.text(0, 0, [{
        text: 'node',
        source: { elementId: 'node-a', elementKind: 'diagram', cellRole: 'content', description: 'node.label' }
      }]);
    }
  }), { columns: 12, rows: 2 });

  assert.equal(renderFramePlain(frame), 'node');
  assert.equal(frame.focusPath, undefined);
  assert.equal(frame.accessibility.root.focused, undefined);
  assert.equal(frame.cells.find((cell) => cell.text === 'n')?.source?.description, 'node.label');
  assert.equal(frame.cells.find((cell) => cell.text === 'n')?.source?.cellRole, 'content');
  assert.equal(frame.cells.find((cell) => cell.text === 'n')?.source?.rendererFamily, 'component');
});

test('Canvas2D draws curves polygons and transformed paths through the frame buffer', () => {
  const frame = renderElementFrame(canvas({
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
  const frame = renderElementFrame(surface(
    overlay([
      canvas({
        id: 'base-canvas',
        painter({ canvas }) {
          canvas.text(0, 0, [{ text: 'base-line' }]);
          canvas.text(0, 1, [{ text: 'wide界tail' }]);
        }
      }),
      absolute(text({ content: 'TOP', id: 'top-text' }), {
        id: 'absolute-top',
        row: 1,
        column: 6,
        width: 3,
        height: 1
      }),
      absolute(canvas({
        id: 'mark-canvas',
        painter({ canvas }) {
          canvas.text(0, 0, [{ text: '!' }]);
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
    { id: 'surface' }
  ), { columns: 12, rows: 3 });

  const output = renderFramePlain(frame);

  assert.equal(output, 'base-TOPe\nwide界!ail');
  assert.equal(frame.accessibility.root.label, undefined);
  assert.equal(frame.accessibility.root.role, 'group');
  assert.equal(frame.accessibility.root.children?.[0]?.role, 'group');
});

test('surface is a single-child visual wrapper, not a layout container', () => {
  assert.throws(
    () => surface([text({ content: 'one' }), text({ content: 'two' })]),
    /surface\(\) expects exactly one non-surface child/u
  );

  const element = surface(column([
    text({ content: 'one' }),
    text({ content: 'two' })
  ], {
    gap: 1
  }), {
    id: 'single-child-surface',
    padding: 1,
    gap: 5
  });
  const frame = renderElementFrame(element, { columns: 18, rows: 5 });
  const layout = layoutElement(element, { columns: 18, rows: 5 });

  assert.equal(layout.children.length, 1);
  assert.equal(renderFramePlain(frame), '\n one\n\n two');
});

test('surface appearance draws background border and shadow', () => {
  const element = surface(text({ content: 'inside', id: 'surface-content' }), {
    id: 'visual-surface',
    appearance: 'raised',
    title: 'Alert',
    border: { kind: 'dashed' },
    shadow: true
  });
  const frame = renderElementFrame(element, { columns: 14, rows: 4 }, { theme: defaultTheme });
  const output = renderFramePlain(frame);
  const backgroundCell = frame.cells.find((cell) => cell.source?.elementKind === 'surface' && cell.source.cellRole === 'decoration' && cell.style?.bg !== undefined);
  const borderCell = frame.cells.find((cell) => cell.source?.cellRole === 'border');
  const shadowCell = frame.cells.find((cell) => cell.source?.description === 'shadow');

  assert.match(output, /Alert/u);
  assert.match(output, /inside/u);
  assert.deepEqual(backgroundCell?.style?.bg, { kind: 'theme', token: 'surface.raised.background' });
  assert.deepEqual(borderCell?.style?.fg, { kind: 'theme', token: 'surface.raised.border' });
  assert.deepEqual(shadowCell?.style?.fg, { kind: 'theme', token: 'surface.shadow' });
  assert.equal(shadowCell?.style?.dim, true);
  assert.equal(shadowCell?.text, '░');
  assert.deepEqual(
    frame.cells.find((cell) => cell.text === 'i' && cell.source?.elementId === 'surface-content')?.style?.bg,
    { kind: 'theme', token: 'surface.raised.background' }
  );
});

test('surface backgrounds remain behind wide child glyphs', () => {
  const frame = renderElementFrame(surface(text({ content: '界', id: 'wide-surface-text' }), {
    id: 'wide-surface',
    appearance: 'inset'
  }), { columns: 8, rows: 3 });
  const glyph = frame.cells.find((cell) => cell.text === '界');
  const continuation = frame.cells.find((cell) => cell.continuation === true);

  assert.deepEqual(glyph?.style?.bg, { kind: 'theme', token: 'surface.inset.background' });
  assert.deepEqual(continuation?.style?.bg, { kind: 'theme', token: 'surface.inset.background' });
});

test('surface titles preserve caller-supplied inline styles with renderer-produced source metadata', () => {
  const frame = renderElementFrame(surface(text({ content: 'body', id: 'body' }), {
    id: 'metric-panel',
    title: [
      { kind: 'text', text: 'cpu', style: { fg: { kind: 'theme', token: 'chart.label' } } },
      { kind: 'text', text: ' 38%', style: { fg: { kind: 'theme', token: 'chart.value' } } }
    ],
    border: { kind: 'single' },
    appearance: 'inset'
  }), { columns: 16, rows: 3 });
  const titleLabel = frame.cells.find((cell) => cell.text === 'c' && cell.source?.partType === 'title');
  const titleMetric = frame.cells.find((cell) => cell.text === '3' && cell.source?.partType === 'title');

  assert.match(renderFramePlain(frame).split('\n')[0] ?? '', /cpu 38%/u);
  assert.equal(titleLabel?.source?.elementKind, 'surface');
  assert.equal(titleLabel?.source?.description, 'title.0');
  assert.equal(titleLabel?.style?.fg?.token, 'chart.label');
  assert.equal(titleMetric?.source?.description, 'title.1');
  assert.equal(titleMetric?.style?.fg?.token, 'chart.value');
});

test('surface title slots render start center and end zones in the border line', () => {
  const frame = renderElementFrame(surface(text({ content: 'body', id: 'slot-body' }), {
    id: 'slot-surface',
    title: {
      start: [{ kind: 'text', text: 'cpu', style: { fg: { kind: 'theme', token: 'surface.title' } } }],
      center: [{ kind: 'text', text: 'btop', style: { fg: { kind: 'theme', token: 'accent.primary' }, bold: true } }],
      end: [{ kind: 'text', text: 'BAT 84%', style: { fg: { kind: 'theme', token: 'chart.value' } } }]
    },
    border: { kind: 'single' },
    appearance: 'bar'
  }), { columns: 40, rows: 3 });
  const titleLine = renderFramePlain(frame).split('\n')[0] ?? '';

  assert.match(titleLine, /cpu/u);
  assert.match(titleLine, /btop/u);
  assert.match(titleLine, /BAT 84%/u);
  assert.equal(frame.cells.find((cell) => cell.text === 'c')?.source?.description, 'title.start.0');
  assert.equal(frame.cells.find((cell) => cell.text === 'b')?.style?.fg?.token, 'accent.primary');
  assert.equal(frame.cells.find((cell) => cell.text === 'B')?.style?.fg?.token, 'chart.value');
});

test('surface appearance controls fill independently from an explicit frame', () => {
  const neutral = renderElementFrame(surface(text({ content: 'neutral', id: 'neutral-inner' }), {
    id: 'neutral',
    appearance: 'neutral'
  }), { columns: 10, rows: 2 }, { theme: defaultTheme });
  const unframed = renderElementFrame(surface(text({ content: 'inner', id: 'unframed-inner' }), {
    id: 'unframed',
    appearance: 'raised'
  }), { columns: 10, rows: 3 }, { theme: defaultTheme });
  const framed = renderElementFrame(surface(text({ content: 'inner', id: 'framed-inner' }), {
    id: 'framed',
    appearance: 'raised',
    border: { kind: 'single' }
  }), { columns: 10, rows: 3 }, { theme: defaultTheme });
  const transparent = renderElementFrame(surface(text({ content: 'flush', id: 'flush' }), {
    id: 'plain'
  }), { columns: 10, rows: 3 });

  assert.deepEqual(neutral.cells.find((cell) => cell.source?.elementKind === 'surface')?.style?.bg, { kind: 'theme', token: 'surface.background' });
  assert.match(renderFramePlain(unframed).split('\n')[0] ?? '', /^inner/u);
  assert.match(renderFramePlain(framed).split('\n')[1] ?? '', /^│inner/u);
  assert.equal(renderFramePlain(transparent), 'flush');
});

test('surface appearance remains structural across theme capabilities', () => {
  const noColor = renderElementFrame(surface(text({ content: 'plain', id: 'plain-body' }), {
    id: 'plain-surface',
    title: 'Plain',
    appearance: 'raised'
  }), { columns: 12, rows: 3 }, { theme: noColorTheme });

  assert.equal(renderFramePlain(noColor).split('\n')[0], '+ Plain ---+');
});

test('preserve underlay leaves unwritten lower cells in the composed frame', () => {
  const element = surface(
    overlay([
      text({ content: 'lower!', id: 'lower',
    meta: {
        layer: {
            zIndex: 0
        }
    } }),
      text({ content: 'UPPER', id: 'upper',
    meta: {
        layer: {
            zIndex: 10
        }
    } })
    ], { id: 'layer-overlay' }),
    { id: 'layer-surface' }
  );

  const regions = renderElementRegions(element, { columns: 8, rows: 2 });
  const frame = renderElementFrame(element, { columns: 8, rows: 2 });

  assert.deepEqual(regions.map((region) => region.zIndex), [0, 10]);
  assert.equal(regions[0]?.cells.some((cell) => cell.text === 'l'), true);
  assert.equal(regions[1]?.cells.some((cell) => cell.text === 'U'), true);
  assert.equal(regions[1]?.underlay, 'preserve');
  assert.equal(renderFramePlain(frame), 'UPPER!');
});

test('region-local overlay buffers preserve clipped viewport coordinates and hit targets', () => {
  const element = surface(
    overlay([
      canvas({
        id: 'region-base',
        painter({ canvas, bounds }) {
          for (let row = 0; row < bounds.height; row += 1) {
            canvas.text(0, row, [{ text: '..........' }]);
          }
        }
      }),
      absolute(button({
    id: 'region-button', label: 'Launch', onAction: () => ({ kind: 'launch' }),
    meta: {
        layer: {
            zIndex: 10
        }
    }
}), {
        id: 'region-absolute',
        row: 2,
        column: 7,
        width: 8,
        height: 1
      })
    ], { id: 'region-overlay' }),
    { id: 'region-surface' }
  );

  const regions = renderElementRegions(element, { columns: 10, rows: 3 });
  const frame = renderElementFrame(element, { columns: 10, rows: 3 });
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
    (error) => error.name === 'ComponentExecutionError' && error.cause instanceof TypeError
  );
});

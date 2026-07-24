import assert from 'node:assert/strict';
import test from 'node:test';

import {
  highContrastTheme,
  noColorTheme } from '../../dist/theme/index.js';
import { blockSpan,
  layoutElement,
  renderFramePlain,
  renderElementFrame
} from '../../dist/renderer/index.js';
import { renderElementRegions } from '../../dist/testing/index.js';
import {
  absolute,
  overlay,
  column,
  surface
} from '../../dist/layout/index.js';
import {
  button,
  canvas,
  text
} from '../../dist/components/index.js';

test('canvas writes styled spans through safe Canvas2D APIs', () => {
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
        source: { ownerId: 'node-a', ownerKind: 'diagram', role: 'custom', label: 'node.label' }
      }]);
    }
  }), { columns: 12, rows: 2 });

  assert.equal(renderFramePlain(frame), 'node');
  assert.equal(frame.focusPath, undefined);
  assert.equal(frame.accessibility.root.focused, undefined);
  assert.equal(frame.cells.find((cell) => cell.text === 'n')?.source?.label, 'node.label');
  assert.equal(frame.cells.find((cell) => cell.text === 'n')?.source?.role, 'custom');
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
      absolute(text('TOP', { id: 'top-text' }), {
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
    { id: 'surface', label: 'Drawing surface' }
  ), { columns: 12, rows: 3 });

  const output = renderFramePlain(frame);

  assert.equal(output, 'base-TOPe\nwide界!ail');
  assert.equal(frame.accessibility.root.label, 'Drawing surface');
  assert.equal(frame.accessibility.root.children?.[0]?.role, 'application');
});

test('surface is a single-child visual wrapper, not a layout container', () => {
  assert.throws(
    () => surface([text('one'), text('two')]),
    /surface\(\) expects exactly one non-surface child/u
  );

  const widget = surface(column([
    text('one'),
    text('two')
  ], {
    gap: 1
  }), {
    id: 'single-child-surface',
    label: 'Composed surface',
    padding: 1,
    gap: 5
  });
  const frame = renderElementFrame(widget, { columns: 18, rows: 5 });
  const layout = layoutElement(widget, { columns: 18, rows: 5 });

  assert.equal(layout.children.length, 1);
  assert.equal(renderFramePlain(frame), '\n one\n\n two');
});

test('surface variants draw semantic background border and shadow without owning state', () => {
  const widget = surface(text('inside', { id: 'surface-content' }), {
    id: 'visual-surface',
    label: 'Visual surface',
    variant: 'warning',
    title: 'Alert',
    border: { kind: 'dashed' },
    shadow: true
  });
  const frame = renderElementFrame(widget, { columns: 14, rows: 4 });
  const output = renderFramePlain(frame);
  const backgroundCell = frame.cells.find((cell) => cell.source?.ownerKind === 'surface' && cell.source.role === 'decoration' && cell.style?.bg !== undefined);
  const borderCell = frame.cells.find((cell) => cell.source?.role === 'border');
  const shadowCell = frame.cells.find((cell) => cell.source?.label === 'shadow');

  assert.match(output, /Alert/u);
  assert.match(output, /inside/u);
  assert.deepEqual(backgroundCell?.style?.bg, { kind: 'theme', token: 'surface.warning.background' });
  assert.deepEqual(borderCell?.style?.fg, { kind: 'theme', token: 'surface.warning.border' });
  assert.deepEqual(shadowCell?.style?.fg, { kind: 'theme', token: 'surface.shadow' });
});

test('surface titles preserve authored inline styles with renderer-owned source metadata', () => {
  const frame = renderElementFrame(surface(text('body', { id: 'body' }), {
    id: 'metric-panel',
    title: [
      { kind: 'text', text: 'cpu', style: { fg: { kind: 'theme', token: 'chart.label' } } },
      { kind: 'text', text: ' 38%', style: { fg: { kind: 'theme', token: 'chart.value' } } }
    ],
    border: { kind: 'single' },
    variant: 'inset'
  }), { columns: 16, rows: 3 });
  const titleLabel = frame.cells.find((cell) => cell.text === 'c' && cell.source?.partKind === 'title');
  const titleMetric = frame.cells.find((cell) => cell.text === '3' && cell.source?.partKind === 'title');

  assert.match(renderFramePlain(frame).split('\n')[0] ?? '', /cpu 38%/u);
  assert.equal(titleLabel?.source?.ownerKind, 'surface');
  assert.equal(titleLabel?.source?.label, 'title.0');
  assert.equal(titleLabel?.style?.fg?.token, 'chart.label');
  assert.equal(titleMetric?.source?.label, 'title.1');
  assert.equal(titleMetric?.style?.fg?.token, 'chart.value');
});

test('surface title rails render start center and end zones in the border line', () => {
  const frame = renderElementFrame(surface(text('body', { id: 'rail-body' }), {
    id: 'rail-surface',
    title: {
      start: [{ kind: 'text', text: 'cpu', style: { fg: { kind: 'theme', token: 'surface.title' } } }],
      center: [{ kind: 'text', text: 'btop', style: { fg: { kind: 'theme', token: 'accent.primary' }, bold: true } }],
      end: [{ kind: 'text', text: 'BAT 84%', style: { fg: { kind: 'theme', token: 'chart.value' } } }]
    },
    border: { kind: 'single' },
    variant: 'chrome'
  }), { columns: 40, rows: 3 });
  const titleLine = renderFramePlain(frame).split('\n')[0] ?? '';

  assert.match(titleLine, /cpu/u);
  assert.match(titleLine, /btop/u);
  assert.match(titleLine, /BAT 84%/u);
  assert.equal(frame.cells.find((cell) => cell.text === 'c')?.source?.label, 'title.start.0');
  assert.equal(frame.cells.find((cell) => cell.text === 'b')?.style?.fg?.token, 'accent.primary');
  assert.equal(frame.cells.find((cell) => cell.text === 'B')?.style?.fg?.token, 'chart.value');
});

test('surface variants reserve border content space while plain surfaces stay transparent', () => {
  const neutral = renderElementFrame(surface(text('neutral', { id: 'neutral-inner' }), {
    id: 'neutral',
    variant: 'neutral'
  }), { columns: 10, rows: 2 });
  const visualLayout = renderElementFrame(surface(text('inner', { id: 'inner' }), {
    id: 'visual',
    variant: 'raised'
  }), { columns: 10, rows: 3 });
  const transparent = renderElementFrame(surface(text('flush', { id: 'flush' }), {
    id: 'plain'
  }), { columns: 10, rows: 3 });

  assert.deepEqual(neutral.cells.find((cell) => cell.source?.ownerKind === 'surface')?.style?.bg, { kind: 'theme', token: 'surface.background' });
  assert.match(renderFramePlain(visualLayout).split('\n')[1] ?? '', /^│inner/u);
  assert.equal(renderFramePlain(transparent), 'flush');
});

test('surface labels disabled state and theme variants stay structural', () => {
  const disabled = renderElementFrame(surface(text('locked', { id: 'locked-body' }), {
    id: 'locked-surface',
    label: 'Locked',
    variant: 'raised',
    disabled: true,
    keys: { enter: () => ({ kind: 'locked' }) }
  }), { columns: 14, rows: 3 }, { focusPath: ['locked-surface'] });
  const highContrast = renderElementFrame(surface(text('selected', { id: 'selected-body' }), {
    id: 'selected-surface',
    label: 'Selected',
    variant: 'selected'
  }), { columns: 14, rows: 3 }, { theme: highContrastTheme });
  const noColor = renderElementFrame(surface(text('plain', { id: 'plain-body' }), {
    id: 'plain-surface',
    label: 'Plain',
    variant: 'raised'
  }), { columns: 12, rows: 3 }, { theme: noColorTheme });

  const disabledBorder = disabled.cells.find((cell) => cell.source?.role === 'border');
  const disabledBackground = disabled.cells.find((cell) => cell.source?.ownerKind === 'surface' && cell.style?.bg !== undefined);
  const selectedBorder = highContrast.cells.find((cell) => cell.source?.role === 'border');
  const selectedBackground = highContrast.cells.find((cell) => cell.source?.ownerKind === 'surface' && cell.style?.bg !== undefined);

  assert.match(renderFramePlain(disabled).split('\n')[0] ?? '', /Locked/u);
  assert.equal(disabled.focusPath, undefined);
  assert.equal(disabled.accessibility.root.disabled, true);
  assert.equal(disabledBorder?.style?.fg?.token, 'text.disabled');
  assert.equal(disabledBackground?.style?.bg?.token, 'surface.raised.background');
  assert.equal(disabledBackground?.style?.fg?.token, 'text.disabled');
  assert.equal(selectedBorder?.style?.fg?.token, 'surface.selected.border');
  assert.equal(selectedBackground?.style?.bg?.token, 'surface.selected.background');
  assert.equal(renderFramePlain(noColor).split('\n')[0], '+ Plain ---+');
});

test('region projection keeps overlapping z-index content separate before compositing', () => {
  const widget = surface(
    overlay([
      text('lower', {
    id: 'lower',
    meta: {
        layer: {
            zIndex: 0
        }
    }
}),
      text('UPPER', {
    id: 'upper',
    meta: {
        layer: {
            zIndex: 10
        }
    }
})
    ], { id: 'layer-overlay' }),
    { id: 'layer-surface' }
  );

  const regions = renderElementRegions(widget, { columns: 8, rows: 2 });
  const frame = renderElementFrame(widget, { columns: 8, rows: 2 });

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
        painter({ canvas, bounds }) {
          for (let row = 0; row < bounds.height; row += 1) {
            canvas.text(0, row, [{ text: '..........' }]);
          }
        }
      }),
      absolute(button({
    id: 'region-button', label: 'Launch', onPress: () => ({ kind: 'launch' }),
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

  const regions = renderElementRegions(widget, { columns: 10, rows: 3 });
  const frame = renderElementFrame(widget, { columns: 10, rows: 3 });
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
});

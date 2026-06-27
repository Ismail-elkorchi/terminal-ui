import assert from 'node:assert/strict';
import test from 'node:test';

import { renderFrame, renderWidgetFrame } from '../../dist/tui/index.js';
import { absolute, canvas, overlay, surface, text } from '../../dist/widgets/index.js';

test('canvas writes styled spans through safe frame-buffer APIs', () => {
  const frame = renderWidgetFrame(canvas({
    id: 'canvas',
    label: 'Game board',
    painter({ buffer, bounds }) {
      buffer.write(bounds.row, bounds.column, [{ text: 'A🙂B', style: { fg: { kind: 'theme', token: 'accent.primary' } } }]);
      buffer.write(bounds.row + 1, bounds.column + 2, [{ text: '\u001B[31msafe' }]);
    }
  }), { columns: 8, rows: 3 });

  assert.equal(renderFrame(frame), 'A🙂B\n  safe');
  assert.equal(frame.cells.find((cell) => cell.text === 'A')?.style?.fg?.token, 'accent.primary');
  assert.equal(frame.cells.some((cell) => cell.text.includes('\u001B')), false);
  assert.equal(frame.accessibility.root.role, 'application');
  assert.equal(frame.accessibility.root.label, 'Game board');
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

  const output = renderFrame(frame);

  assert.equal(output, 'base-TOPe\nwide界!ail');
  assert.equal(frame.accessibility.root.label, 'Drawing surface');
  assert.equal(frame.accessibility.root.children?.[0]?.role, 'application');
});

test('canvas rejects missing painters as programmer errors', () => {
  assert.throws(
    () => renderWidgetFrame({ id: 'bad-canvas', kind: 'canvas', props: {} }, { columns: 4, rows: 2 }),
    /Canvas widgets must provide a painter/u
  );
});

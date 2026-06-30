import assert from 'node:assert/strict';
import test from 'node:test';

import { placeTooltip, renderFramePlain, renderWidgetFrame } from '../../dist/tui/index.js';
import { tooltip } from '../../dist/widgets/index.js';

test('tooltip renders bounded popover content with semantic surface tokens', () => {
  const frame = renderWidgetFrame(tooltip({
    id: 'tip',
    title: 'Hint',
    content: ['Use Enter', 'Press Esc'],
    tone: 'info'
  }), { columns: 14, rows: 4 });
  const output = renderFramePlain(frame);
  const border = frame.cells.find((cell) => cell.source?.role === 'border');
  const content = frame.cells.find((cell) => cell.text === 'U');

  assert.match(output, /Hint/u);
  assert.match(output, /Use Enter/u);
  assert.deepEqual(border?.style?.fg, { kind: 'theme', token: 'surface.selected.border' });
  assert.deepEqual(content?.style?.fg, { kind: 'theme', token: 'text.default' });
  assert.equal(frame.accessibility.root.scope?.kind, 'popover');
  assert.equal(frame.accessibility.root.live, 'polite');
});

test('tooltip placement flips and clamps inside viewport', () => {
  const viewport = { row: 1, column: 1, width: 30, height: 10 };
  const targetNearBottom = { row: 9, column: 8, width: 4, height: 1 };
  const targetNearRight = { row: 3, column: 28, width: 2, height: 1 };

  assert.deepEqual(placeTooltip({
    viewport,
    target: targetNearBottom,
    size: { width: 8, height: 3 },
    placement: 'below'
  }), { row: 5, column: 8, width: 8, height: 3 });

  assert.deepEqual(placeTooltip({
    viewport,
    target: targetNearRight,
    size: { width: 8, height: 3 },
    placement: 'right'
  }), { row: 3, column: 19, width: 8, height: 3 });

  assert.deepEqual(placeTooltip({
    viewport,
    target: { row: 1, column: 1, width: 1, height: 1 },
    size: { width: 40, height: 20 },
    placement: 'above'
  }), { row: 1, column: 1, width: 30, height: 10 });
});

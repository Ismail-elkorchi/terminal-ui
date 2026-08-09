import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveTerminalCapabilities } from '../../dist/host/index.js';
import { createVisualSnapshot } from '../../dist/testing/index.js';
import { highContrastTheme } from '../../dist/theme/index.js';
import { placeAnchoredSurface } from '../../dist/interaction/index.js';
import {
  renderFramePlain,
  renderElementFrame
} from '../../dist/renderer/index.js';
import { tooltip } from '../../dist/components/index.js';

test('tooltip renders bounded popover content with semantic surface tokens', () => {
  const frame = renderElementFrame(tooltip({
    id: 'tip',
    presentation: { kind: 'visible', anchor: { kind: 'cursor', row: 1, column: 1 } },
    title: 'Hint',
    content: ['Use Enter', 'Press Esc'],
    tone: 'info'
  }), { columns: 14, rows: 4 });
  const output = renderFramePlain(frame);
  const border = frame.cells.find((cell) => cell.source?.cellRole === 'border');
  const content = frame.cells.find((cell) => cell.text === 'U');
  const highContrastFrame = renderElementFrame(tooltip({
    id: 'tip-hc',
    presentation: { kind: 'visible', anchor: { kind: 'cursor', row: 1, column: 1 } },
    title: 'Hint',
    content: ['Use Enter', 'Press Esc'],
    tone: 'info'
  }), { columns: 14, rows: 4 }, { theme: highContrastTheme });
  const noColor = createVisualSnapshot({
    frame: highContrastFrame,
    ansi: { capabilities: noColorCapabilities(), theme: highContrastTheme }
  });

  assert.match(output, /Hint/u);
  assert.match(output, /Use Enter/u);
  assert.deepEqual(border?.style?.fg, { kind: 'theme', token: 'surface.selected.border' });
  assert.deepEqual(content?.style?.fg, { kind: 'theme', token: 'text.default' });
  assert.deepEqual(content?.source, {
    elementKind: 'terminal-ui/components/text',
    rendererFamily: 'component',
    cellRole: 'text',
    partName: 'role.body',
    partType: 'text',
    description: 'role.body'
  });
  assert.match(noColor.plainTextFrame, /Hint/u);
  assert.doesNotMatch(noColor.ansiFrame, /\\x1b\[[0-9;]*m/u);
  assert.equal(frame.accessibility.root.scope?.kind, 'popover');
  assert.equal(frame.accessibility.root.live, 'polite');
});

test('tooltip visibility and anchor determine painted geometry', () => {
  const hidden = renderElementFrame(tooltip({
    id: 'hidden-tip',
    content: 'Hidden',
    presentation: { kind: 'hidden' }
  }), { columns: 20, rows: 6 });
  const visible = renderElementFrame(tooltip({
    id: 'visible-tip',
    content: 'Visible',
    presentation: { kind: 'visible', anchor: { kind: 'cursor', row: 5, column: 18 } },
    placement: 'below'
  }), { columns: 20, rows: 6 });

  assert.equal(hidden.cells.some((cell) => cell.source?.elementId === 'hidden-tip'), false);
  assert.match(renderFramePlain(visible), /Visible/u);
  assert.equal(visible.cells.every((cell) => cell.row >= 1 && cell.row <= 6 && cell.column >= 1 && cell.column <= 20), true);
});

test('tooltip placement flips and clamps inside viewport', () => {
  const viewport = { row: 1, column: 1, width: 30, height: 10 };
  const targetNearBottom = { row: 9, column: 8, width: 4, height: 1 };
  const targetNearRight = { row: 3, column: 28, width: 2, height: 1 };

  assert.deepEqual(placeAnchoredSurface({
    viewport,
    anchor: { kind: 'target', bounds: targetNearBottom },
    size: { width: 8, height: 3 },
    placement: 'below'
  }), { row: 5, column: 8, width: 8, height: 3 });

  assert.deepEqual(placeAnchoredSurface({
    viewport,
    anchor: { kind: 'target', bounds: targetNearRight },
    size: { width: 8, height: 3 },
    placement: 'right'
  }), { row: 3, column: 19, width: 8, height: 3 });

  assert.deepEqual(placeAnchoredSurface({
    viewport,
    anchor: { kind: 'target', bounds: { row: 1, column: 1, width: 1, height: 1 } },
    size: { width: 40, height: 20 },
    placement: 'above'
  }), { row: 1, column: 1, width: 30, height: 10 });
});

test('anchored placement recomputes fallback and bounds after viewport resize', () => {
  const anchor = { kind: 'target', bounds: { row: 8, column: 18, width: 3, height: 1 } };
  const wide = placeAnchoredSurface({
    viewport: { row: 1, column: 1, width: 30, height: 12 },
    anchor,
    size: { width: 10, height: 4 },
    placement: 'below'
  });
  const narrow = placeAnchoredSurface({
    viewport: { row: 1, column: 1, width: 20, height: 9 },
    anchor,
    size: { width: 10, height: 4 },
    placement: 'below'
  });

  assert.deepEqual(wide, { row: 3, column: 18, width: 10, height: 4 });
  assert.deepEqual(narrow, { row: 6, column: 11, width: 10, height: 4 });
});

test('anchored placement rejects malformed public runtime input', () => {
  const base = {
    viewport: { row: 1, column: 1, width: 20, height: 10 },
    anchor: { kind: 'cursor', row: 1, column: 1 },
    size: { width: 5, height: 2 }
  };

  assert.throws(
    () => placeAnchoredSurface({ ...base, fallback: ['diagonal'] }),
    /fallback must contain only/u
  );
  assert.throws(
    () => placeAnchoredSurface({ ...base, margin: Number.POSITIVE_INFINITY }),
    /margin must be finite/u
  );
  assert.throws(
    () => placeAnchoredSurface({
      ...base,
      viewport: { ...base.viewport, width: Number.NaN }
    }),
    /viewport width must be finite/u
  );
});

function colorCapabilities() {
  return resolveTerminalCapabilities({
    host: {
      runtime: 'memory',
      inputIsTty: true,
      outputIsTty: true,
      rawInput: true
    }
  });
}

function noColorCapabilities() {
  return {
    ...colorCapabilities(),
    color: {
      depth: 0,
      hasBasicColors: false,
      has256Colors: false,
      hasTrueColor: false
    }
  };
}

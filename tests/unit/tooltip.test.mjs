import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveTerminalCapabilities } from '../../dist/host/index.js';
import { createMemoryTerminalHost } from '../../dist/host/index.js';
import { createVisualSnapshot } from '../../dist/testing/index.js';
import { highContrastTheme } from '../../dist/theme/index.js';
import { placeAnchoredSurface } from '../../dist/interaction/index.js';
import {
  renderFramePlain,
  renderElementFrame
} from '../../dist/renderer/index.js';
import { button, tooltip } from '../../dist/components/index.js';
import { createTuiRuntime, defineTui } from '../../dist/tui/index.js';

function trigger(id) {
  return button({ id: `${id}-trigger`, label: 'Trigger', onAction: () => ({ kind: 'trigger' }) });
}

test('tooltip renders bounded popover content with semantic surface tokens', () => {
  const frame = renderElementFrame(tooltip({
    id: 'tip',
    trigger: trigger('tip'),
    open: true,
    onTransition: (action) => action,
    title: 'Hint',
    content: ['Use Enter', 'Press Esc'],
    tone: 'info'
  }), { columns: 14, rows: 4 });
  const output = renderFramePlain(frame);
  const border = frame.cells.find((cell) => cell.source?.cellRole === 'border');
  const content = frame.cells.find((cell) => cell.text === 'U');
  const highContrastFrame = renderElementFrame(tooltip({
    id: 'tip-hc',
    trigger: trigger('tip-hc'),
    open: true,
    onTransition: (action) => action,
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
  const accessibleTooltip = frame.accessibility.root.children?.find((node) => node.role === 'tooltip');
  const accessibleTrigger = frame.accessibility.root.children?.find((node) => node.role === 'button');
  assert.equal(accessibleTooltip?.scope?.kind, 'popover');
  assert.equal(accessibleTooltip?.live, 'polite');
  assert.deepEqual(accessibleTrigger?.describedBy, ['tip:tooltip']);
});

test('tooltip follows trigger keyboard focus and Escape dismisses without moving focus', async () => {
  const transitions = [];
  const app = defineTui({
    id: 'tooltip-focus',
    init: () => ({ state: ({ open: false }) }),
    update: (_state, transition) => {
      transitions.push(transition);
      return { state: { open: transition.open } };
    },
    view: (state) => tooltip({
      id: 'focus-tip',
      trigger: trigger('focus-tip'),
      content: 'Keyboard help',
      open: state.open,
      onTransition: (transition) => transition
    })
  });
  const runtime = createTuiRuntime({
    app,
    host: createMemoryTerminalHost({ terminalSize: { columns: 24, rows: 5 } })
  });

  await runtime.start();
  assert.deepEqual(transitions, [{ kind: 'setOpen', open: true, reason: 'focus' }]);
  assert.deepEqual(runtime.frame().accessibility.root.children?.[0]?.describedBy, ['focus-tip:tooltip']);
  await runtime.handleInput({
    kind: 'key', key: 'escape',
    modifiers: { ctrl: false, alt: false, shift: false, meta: false },
    eventType: 'press', location: 'standard'
  });
  assert.deepEqual(transitions.at(-1), { kind: 'setOpen', open: false, reason: 'escape' });
  assert.deepEqual(runtime.frame().focusPath, ['focus-tip', 'focus-tip-trigger']);
  assert.equal(runtime.frame().accessibility.root.children?.[0]?.describedBy, undefined);
  await runtime.dispose();
});

test('tooltip visibility and anchor determine painted geometry', () => {
  const hidden = renderElementFrame(tooltip({
    id: 'hidden-tip',
    content: 'Hidden',
    trigger: trigger('hidden-tip'),
    open: false,
    onTransition: (action) => action
  }), { columns: 20, rows: 6 });
  const visible = renderElementFrame(tooltip({
    id: 'visible-tip',
    content: 'Visible',
    trigger: trigger('visible-tip'),
    open: true,
    placement: 'below',
    onTransition: (action) => action
  }), { columns: 20, rows: 6 });

  assert.doesNotMatch(renderFramePlain(hidden), /Hidden/u);
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
      supportsRawInput: true
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

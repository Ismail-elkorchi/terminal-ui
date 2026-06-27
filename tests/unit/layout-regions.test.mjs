import assert from 'node:assert/strict';
import test from 'node:test';

import {
  activeScreen,
  createFrameBuffer,
  drawBorder,
  gridCellRects,
  layoutWidget,
  renderFrame,
  renderWidgetFrame,
  screenStackReducer,
  splitTracks
} from '../../dist/tui/index.js';
import { box, commandBar, grid, inputField, modal, splitPane, tabs, text } from '../../dist/widgets/index.js';

test('track helpers split fixed, percent, and fill regions deterministically', () => {
  assert.deepEqual(
    splitTracks(
      { row: 1, column: 1, width: 100, height: 10 },
      'horizontal',
      [{ kind: 'fixed', cells: 20 }, { kind: 'percent', value: 25 }, { kind: 'fill' }]
    ),
    [
      { row: 1, column: 1, width: 20, height: 10 },
      { row: 1, column: 21, width: 25, height: 10 },
      { row: 1, column: 46, width: 55, height: 10 }
    ]
  );

  assert.deepEqual(
    splitTracks(
      { row: 1, column: 1, width: 20, height: 5 },
      'horizontal',
      [{ kind: 'content', min: 4 }, { kind: 'fill' }],
      { margin: { left: 1, right: 1 }, padding: 1, gap: 2 }
    ),
    [
      { row: 2, column: 3, width: 4, height: 3 },
      { row: 2, column: 9, width: 10, height: 3 }
    ]
  );

  assert.deepEqual(
    gridCellRects(
      { row: 1, column: 1, width: 10, height: 4 },
      [{ kind: 'fixed', cells: 1 }, { kind: 'fill' }],
      [{ kind: 'fixed', cells: 3 }, { kind: 'fill' }]
    ),
    [
      { row: 1, column: 1, width: 3, height: 1 },
      { row: 1, column: 4, width: 7, height: 1 },
      { row: 2, column: 1, width: 3, height: 3 },
      { row: 2, column: 4, width: 7, height: 3 }
    ]
  );
});

test('grid and splitPane widgets lay out common app shells', () => {
  const widget = grid([
    text('header', { id: 'header' }),
    splitPane([
      text('left', { id: 'left' }),
      text('main', { id: 'main' }),
      text('right', { id: 'right' })
    ], {
      id: 'body',
      direction: 'horizontal',
      sizes: [{ kind: 'fixed', cells: 10 }, { kind: 'fill' }, { kind: 'fixed', cells: 8 }]
    }),
    text('status', { id: 'status' }),
    commandBar({ id: 'command', value: '/help' })
  ], {
    id: 'shell',
    rows: [{ kind: 'fixed', cells: 1 }, { kind: 'fill' }, { kind: 'fixed', cells: 1 }, { kind: 'fixed', cells: 1 }],
    columns: [{ kind: 'fill' }]
  });

  const layout = layoutWidget(widget, { columns: 40, rows: 8 });
  assert.deepEqual(layout.children[0]?.bounds, { row: 1, column: 1, width: 40, height: 1 });
  assert.deepEqual(layout.children[1]?.bounds, { row: 2, column: 1, width: 40, height: 5 });
  assert.deepEqual(layout.children[1]?.children[0]?.bounds, { row: 2, column: 1, width: 10, height: 5 });
  assert.deepEqual(layout.children[1]?.children[1]?.bounds, { row: 2, column: 11, width: 22, height: 5 });
  assert.deepEqual(layout.children[2]?.bounds, { row: 7, column: 1, width: 40, height: 1 });
  assert.deepEqual(layout.children[3]?.bounds, { row: 8, column: 1, width: 40, height: 1 });
});

test('layout flow options align, justify, and bound content regions', () => {
  const widget = box(text('centered', { id: 'centered' }), {
    id: 'aligned-box',
    border: { kind: 'none' },
    maxWidth: 4,
    maxHeight: 1,
    align: 'center',
    justify: 'end'
  });

  const layout = layoutWidget(widget, { columns: 10, rows: 4 });

  assert.deepEqual(layout.children[0]?.bounds, { row: 4, column: 4, width: 4, height: 1 });
});

test('layout overflow controls whether min sizes can exceed parent bounds', () => {
  const clipped = layoutWidget(box(text('clip', { id: 'clip' }), {
    border: { kind: 'none' },
    minWidth: 8
  }), { columns: 4, rows: 2 });
  const visible = layoutWidget(box(text('visible', { id: 'visible' }), {
    border: { kind: 'none' },
    minWidth: 8,
    overflow: 'visible'
  }), { columns: 4, rows: 2 });

  assert.deepEqual(clipped.children[0]?.bounds, { row: 1, column: 1, width: 4, height: 2 });
  assert.deepEqual(visible.children[0]?.bounds, { row: 1, column: 1, width: 8, height: 2 });
});

test('tabs render only the selected panel as focusable content', () => {
  const widget = tabs({
    id: 'tabs',
    selected: 'second',
    tabs: [
      { id: 'first', label: 'First', panel: inputField({ id: 'first-input', value: 'hidden' }) },
      { id: 'second', label: 'Second', panel: inputField({ id: 'second-input', value: 'visible' }) }
    ]
  });

  const layout = layoutWidget(widget, { columns: 32, rows: 5 });
  assert.deepEqual(layout.children[0]?.bounds, { row: 1, column: 1, width: 0, height: 0 });
  assert.deepEqual(layout.children[1]?.bounds, { row: 2, column: 1, width: 32, height: 4 });

  const frame = renderWidgetFrame(widget, { columns: 32, rows: 5 });
  assert.ok(frame.focusPath?.includes('second-input'));
  assert.ok(!frame.focusPath?.includes('first-input'));
  assert.match(frame.cells.map((cell) => cell.text).join(''), /\[Second\]/u);
});

test('modal centers a bounded dialog and lays out child content inside the border', () => {
  const widget = modal(text('inside', { id: 'inside' }), {
    id: 'dialog',
    title: 'Confirm',
    width: 12,
    height: 5
  });
  const layout = layoutWidget(widget, { columns: 30, rows: 9 });

  assert.deepEqual(layout.children[0]?.bounds, { row: 4, column: 11, width: 10, height: 3 });
  const frame = renderWidgetFrame(widget, { columns: 30, rows: 9 });
  const rendered = frame.cells.map((cell) => cell.text).join('');
  assert.equal(frame.accessibility.root.label, 'Confirm');
  assert.match(rendered, /inside/u);
});

test('border model supports styled widget borders and borderless layout', () => {
  const doubleFrame = renderWidgetFrame(box(text('inside', { id: 'inside' }), {
    id: 'panel',
    border: { kind: 'double', title: 'Panel' }
  }), { columns: 14, rows: 4 });
  const doubleOutput = renderFrame(doubleFrame);

  assert.match(doubleOutput, /╔ Panel/u);
  assert.match(doubleOutput, /╗/u);
  assert.match(doubleOutput, /║/u);
  assert.match(doubleOutput, /╚/u);

  const borderless = box(text('flush', { id: 'flush' }), {
    id: 'plain',
    border: { kind: 'none' }
  });
  const borderlessLayout = layoutWidget(borderless, { columns: 8, rows: 2 });
  const borderlessFrame = renderWidgetFrame(borderless, { columns: 8, rows: 2 });

  assert.deepEqual(borderlessLayout.children[0]?.bounds, { row: 1, column: 1, width: 8, height: 2 });
  assert.equal(renderFrame(borderlessFrame), 'flush');
});

test('shared border renderer clips titles and supports tiny ascii borders', () => {
  const buffer = createFrameBuffer(8, 3);
  drawBorder(buffer, { row: 1, column: 1, width: 8, height: 3 }, {
    kind: 'ascii',
    title: 'Very long title'
  });
  const frame = buffer.snapshot();

  assert.equal(renderFrame(frame).split('\n')[0], '+ Very +');

  const tiny = createFrameBuffer(1, 1);
  drawBorder(tiny, { row: 1, column: 1, width: 1, height: 1 }, { kind: 'heavy' });

  assert.equal(renderFrame(tiny.snapshot()), '┏');
});

test('layers render top z-index content last and hide invisible widgets', () => {
  const widget = box([
    text('lower', { id: 'lower', zIndex: 0 }),
    text('UPPER', { id: 'upper', zIndex: 5 }),
    text('hidden', { id: 'hidden', zIndex: 10, visible: false })
  ], {
    id: 'layer-root',
    border: { kind: 'none' }
  });

  const layout = layoutWidget(widget, { columns: 12, rows: 2 });
  const frame = renderWidgetFrame(widget, { columns: 12, rows: 2 });
  const output = renderFrame(frame);

  assert.equal(layout.children[0]?.layer.zIndex, 0);
  assert.equal(layout.children[1]?.layer.zIndex, 5);
  assert.equal(layout.children[2]?.visible, false);
  assert.match(output, /^UPPER/u);
  assert.doesNotMatch(output, /lower/u);
  assert.doesNotMatch(output, /hidden/u);
});

test('focus is scoped to the topmost visible focus layer', () => {
  const widget = box([
    inputField({ id: 'lower-input', value: 'lower', zIndex: 0 }),
    inputField({ id: 'upper-input', value: 'upper', zIndex: 8 })
  ], {
    id: 'focus-root',
    border: { kind: 'none' }
  });

  const frame = renderWidgetFrame(widget, { columns: 16, rows: 2 }, { focusPath: ['focus-root', 'lower-input'] });

  assert.deepEqual(frame.focusPath, ['focus-root', 'upper-input']);
  assert.deepEqual(frame.cursor, { row: 1, column: 1 });
});

test('screen stack supports push, pop, replace, reset, and active screen lookup', () => {
  const first = { id: 'home', state: { path: '/' } };
  const second = { id: 'details', state: { path: '/details' } };
  const pushed = screenStackReducer({ screens: [first] }, { kind: 'push', screen: second });
  assert.equal(activeScreen(pushed)?.id, 'details');

  const replaced = screenStackReducer(pushed, { kind: 'replace', screen: { id: 'settings', state: {} } });
  assert.deepEqual(replaced.screens.map((screen) => screen.id), ['home', 'settings']);

  const popped = screenStackReducer(replaced, { kind: 'pop' });
  assert.deepEqual(popped.screens.map((screen) => screen.id), ['home']);

  const reset = screenStackReducer(popped, { kind: 'reset', screens: [] });
  assert.equal(activeScreen(reset), undefined);
});

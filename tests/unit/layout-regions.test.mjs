import assert from 'node:assert/strict';
import test from 'node:test';

import {
  activeScreen,
  gridCellRects,
  layoutWidget,
  renderWidgetFrame,
  screenStackReducer,
  splitTracks
} from '../../dist/tui/index.js';
import { commandBar, grid, inputField, modal, splitPane, tabs, text } from '../../dist/widgets/index.js';

test('track helpers split fixed, percent, and fill regions deterministically', () => {
  assert.deepEqual(
    splitTracks(
      { row: 1, column: 1, width: 100, height: 10 },
      'horizontal',
      [{ kind: 'fixed', size: 20 }, { kind: 'percent', percent: 25 }, { kind: 'fill' }]
    ),
    [
      { row: 1, column: 1, width: 20, height: 10 },
      { row: 1, column: 21, width: 25, height: 10 },
      { row: 1, column: 46, width: 55, height: 10 }
    ]
  );

  assert.deepEqual(
    gridCellRects(
      { row: 1, column: 1, width: 10, height: 4 },
      [{ kind: 'fixed', size: 1 }, { kind: 'fill' }],
      [{ kind: 'fixed', size: 3 }, { kind: 'fill' }]
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
      sizes: [{ kind: 'fixed', size: 10 }, { kind: 'fill' }, { kind: 'fixed', size: 8 }]
    }),
    text('status', { id: 'status' }),
    commandBar({ id: 'command', value: '/help' })
  ], {
    id: 'shell',
    rows: [{ kind: 'fixed', size: 1 }, { kind: 'fill' }, { kind: 'fixed', size: 1 }, { kind: 'fixed', size: 1 }],
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

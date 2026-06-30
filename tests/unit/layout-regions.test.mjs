import assert from 'node:assert/strict';
import test from 'node:test';

import {
  activeScreen,
  createFrameBuffer,
  drawBorder,
  gridCellRects,
  layoutWidget,
  renderFramePlain,
  renderWidgetFrame,
  renderWidgetRegions,
  screenStackReducer,
  splitTracks
} from '../../dist/tui/index.js';
import { defaultTheme } from '../../dist/theme/index.js';
import {
  box,
  canvas,
  commandBar,
  contextMenu,
  dropdown,
  grid,
  inputField,
  modal,
  overlay,
  splitPane,
  table,
  tabs,
  text
} from '../../dist/widgets/index.js';

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

test('splitPane content tracks use measured child width', () => {
  const widget = splitPane([
    text('measured', { id: 'measured' }),
    text('remaining', { id: 'remaining' })
  ], {
    id: 'measured-pane',
    direction: 'horizontal',
    sizes: [{ kind: 'content' }, { kind: 'fill' }]
  });

  const layout = layoutWidget(widget, { columns: 20, rows: 3 });

  assert.deepEqual(layout.children[0]?.bounds, { row: 1, column: 1, width: 8, height: 3 });
  assert.deepEqual(layout.children[1]?.bounds, { row: 1, column: 9, width: 12, height: 3 });
});

test('grid content rows and columns use measured child dimensions', () => {
  const widget = grid([
    text('wide-label', { id: 'wide-label' }),
    text('two\nrows', { id: 'two-rows' }),
    text('x', { id: 'x' }),
    text('y', { id: 'y' })
  ], {
    id: 'measured-grid',
    rows: [{ kind: 'content' }, { kind: 'fill' }],
    columns: [{ kind: 'content' }, { kind: 'fill' }],
    rowGap: 1,
    columnGap: 1
  });

  const layout = layoutWidget(widget, { columns: 20, rows: 6 });

  assert.deepEqual(layout.children[0]?.bounds, { row: 1, column: 1, width: 10, height: 2 });
  assert.deepEqual(layout.children[1]?.bounds, { row: 1, column: 12, width: 9, height: 2 });
  assert.deepEqual(layout.children[2]?.bounds, { row: 4, column: 1, width: 10, height: 3 });
  assert.deepEqual(layout.children[3]?.bounds, { row: 4, column: 12, width: 9, height: 3 });
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
  const doubleOutput = renderFramePlain(doubleFrame);

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
  assert.equal(renderFramePlain(borderlessFrame), 'flush');
});

test('shared border renderer clips titles and supports tiny ascii borders', () => {
  const buffer = createFrameBuffer(8, 3);
  drawBorder(buffer, { row: 1, column: 1, width: 8, height: 3 }, {
    kind: 'ascii',
    title: 'Very long title'
  });
  const frame = buffer.snapshot();

  assert.equal(renderFramePlain(frame).split('\n')[0], '+ Very +');

  const tiny = createFrameBuffer(1, 1);
  drawBorder(tiny, { row: 1, column: 1, width: 1, height: 1 }, { kind: 'heavy' });

  assert.equal(renderFramePlain(tiny.snapshot()), '┏');
});

test('shared border renderer aligns titles and clips wide unicode safely', () => {
  const centered = createFrameBuffer(12, 1);
  drawBorder(centered, { row: 1, column: 1, width: 12, height: 1 }, {
    kind: 'single',
    title: 'Hi',
    titleAlign: 'center'
  }, defaultTheme);
  const ended = createFrameBuffer(12, 1);
  drawBorder(ended, { row: 1, column: 1, width: 12, height: 1 }, {
    kind: 'single',
    title: 'Hi',
    titleAlign: 'end'
  }, defaultTheme);
  const wide = createFrameBuffer(6, 1);
  drawBorder(wide, { row: 1, column: 1, width: 6, height: 1 }, {
    kind: 'rounded',
    title: '界界界',
    titleAlign: 'center'
  }, defaultTheme);

  assert.equal(renderFramePlain(centered.snapshot()), '┌─── Hi ───┐');
  assert.equal(renderFramePlain(ended.snapshot()), '┌────── Hi ┐');
  assert.equal(renderFramePlain(wide.snapshot()), '╭ 界─╮');
});

test('focused bordered widgets use focus border style without changing layout', () => {
  const frame = renderWidgetFrame(box(text('inside', { id: 'inside' }), {
    id: 'focus-panel',
    border: { kind: 'single', title: 'Panel' },
    keyMap: { Enter: { kind: 'submit' } }
  }), { columns: 12, rows: 3 });
  const topLeft = frame.cells.find((cell) => cell.row === 1 && cell.column === 1);

  assert.equal(renderFramePlain(frame).split('\n')[0], '┌ Panel ───┐');
  assert.deepEqual(topLeft?.style?.fg, { kind: 'theme', token: 'focus.border' });
});

test('focused bordered widgets respect explicit focus style override', () => {
  const frame = renderWidgetFrame(box(text('inside', { id: 'inside' }), {
    id: 'focus-panel-custom',
    border: {
      kind: 'heavy',
      title: 'Panel',
      focusStyle: { fg: { kind: 'theme', token: 'status.warning' }, bold: true }
    },
    keyMap: { Enter: { kind: 'submit' } }
  }), { columns: 12, rows: 3 });
  const topLeft = frame.cells.find((cell) => cell.row === 1 && cell.column === 1);

  assert.deepEqual(topLeft?.style?.fg, { kind: 'theme', token: 'status.warning' });
  assert.equal(topLeft?.style?.bold, true);
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
  const output = renderFramePlain(frame);

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
  assert.deepEqual(frame.cursor, { row: 1, column: 6 });
});

test('overlapping modal renders above lower region content', () => {
  const widget = box([
    canvas({
      id: 'modal-backdrop-canvas',
      zIndex: 0,
      painter({ buffer, bounds }) {
        for (let row = bounds.row; row < bounds.row + bounds.height; row += 1) {
          buffer.write(row, bounds.column, [{ text: 'backdrop backdrop backdrop' }]);
        }
      }
    }),
    modal(text('front', { id: 'front' }), {
      id: 'dialog-layer',
      title: 'Dialog',
      width: 14,
      height: 5,
      zIndex: 20
    })
  ], {
    id: 'modal-layer-root',
    border: { kind: 'none' }
  });

  const regions = renderWidgetRegions(widget, { columns: 24, rows: 7 });
  const frame = renderWidgetFrame(widget, { columns: 24, rows: 7 });
  const output = renderFramePlain(frame);
  const modalRegion = regions[1];
  const leakedBackdropCells = modalRegion === undefined
    ? []
    : frame.cells.filter((cell) => cell.text === 'b' && cellInsideRect(cell, modalRegion.bounds));

  assert.deepEqual(regions.map((region) => region.zIndex), [0, 20]);
  assert.equal(modalRegion?.opacity, 'opaque');
  assert.equal(regions[0]?.cells.some((cell) => cell.text === 'b'), true);
  assert.equal(regions[1]?.cells.some((cell) => cell.text === 'f'), true);
  assert.deepEqual(leakedBackdropCells, []);
  assert.match(output, /Dialog/u);
  assert.match(output, /front/u);
});

test('dropdown renders above table content in a higher region', () => {
  const widget = box([
    table({
      id: 'settings-table',
      zIndex: 0,
      columns: [
        { header: 'Name', width: 8 },
        { header: 'Value', width: 8 }
      ],
      rows: [
        ['Theme', 'System'],
        ['Mode', 'Compact']
      ]
    }),
    dropdown({
      id: 'theme-dropdown-layer',
      zIndex: 15,
      label: 'Theme',
      selected: 'dark',
      open: true,
      items: [
        { id: 'light', label: 'Light', message: { kind: 'theme', value: 'light' } },
        { id: 'dark', label: 'Dark', message: { kind: 'theme', value: 'dark' } }
      ]
    })
  ], {
    id: 'dropdown-layer-root',
    border: { kind: 'none' }
  });

  const regions = renderWidgetRegions(widget, { columns: 28, rows: 5 });
  const output = renderFramePlain(renderWidgetFrame(widget, { columns: 28, rows: 5 }));
  const firstLine = output.split('\n')[0] ?? '';

  assert.deepEqual(regions.map((region) => region.zIndex), [0, 15]);
  assert.equal(regions[0]?.cells.some((cell) => cell.text === 'N'), true);
  assert.equal(regions[1]?.cells.some((cell) => cell.text === 'L'), true);
  assert.match(firstLine, /^Theme: Dark/u);
  assert.doesNotMatch(firstLine, /^Name/u);
  assert.match(output, /Light/u);
});

test('context menu renders above canvas content in a higher region', () => {
  const widget = box([
    canvas({
      id: 'context-menu-canvas',
      zIndex: 0,
      painter({ buffer, bounds }) {
        for (let row = bounds.row; row < bounds.row + bounds.height; row += 1) {
          buffer.write(row, bounds.column, [{ text: 'canvas canvas canvas' }]);
        }
      }
    }),
    contextMenu({
      id: 'canvas-context-menu',
      zIndex: 12,
      title: 'Actions',
      selected: 'copy',
      items: [
        { id: 'copy', label: 'Copy', message: { kind: 'copy' } },
        { id: 'paste', label: 'Paste', message: { kind: 'paste' } }
      ]
    })
  ], {
    id: 'context-layer-root',
    border: { kind: 'none' }
  });

  const regions = renderWidgetRegions(widget, { columns: 24, rows: 4 });
  const output = renderFramePlain(renderWidgetFrame(widget, { columns: 24, rows: 4 }));
  const firstLine = output.split('\n')[0] ?? '';

  assert.deepEqual(regions.map((region) => region.zIndex), [0, 12]);
  assert.equal(regions[1]?.opacity, 'transparent');
  assert.equal(regions[0]?.cells.some((cell) => cell.text === 'c'), true);
  assert.equal(regions[1]?.cells.some((cell) => cell.text === 'A'), true);
  assert.match(firstLine, /^Actions/u);
  assert.doesNotMatch(firstLine, /^canvas/u);
  assert.match(output, /Copy/u);
});

test('inheritBackground regions preserve lower background styles', () => {
  const widget = overlay([
    canvas({
      id: 'background-style-canvas',
      painter({ buffer }) {
        buffer.write(1, 1, [{ text: 'A', style: { bg: { kind: 'ansi', value: 1 } } }]);
      }
    }),
    canvas({
      id: 'inherited-background-canvas',
      zIndex: 4,
      opacity: 'inheritBackground',
      painter({ buffer }) {
        buffer.write(1, 1, [{ text: 'B', style: { fg: { kind: 'ansi', value: 2 } } }]);
      }
    })
  ], { id: 'inherit-background-root' });
  const frame = renderWidgetFrame(widget, { columns: 4, rows: 2 });
  const cell = frame.cells.find((item) => item.row === 1 && item.column === 1);

  assert.equal(cell?.text, 'B');
  assert.deepEqual(cell?.style?.fg, { kind: 'ansi', value: 2 });
  assert.deepEqual(cell?.style?.bg, { kind: 'ansi', value: 1 });
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

function cellInsideRect(cell, rect) {
  return cell.row >= rect.row
    && cell.row < rect.row + rect.height
    && cell.column >= rect.column
    && cell.column < rect.column + rect.width;
}

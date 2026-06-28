import assert from 'node:assert/strict';
import test from 'node:test';

import { asciiSymbols, defaultTheme, defineTheme, unicodeSymbols } from '../../dist/theme/index.js';
import {
  createFrameBuffer,
  createScrollState,
  renderFramePlain,
  renderScrollbars,
  renderWidgetFrame,
  scrollbarLayout
} from '../../dist/tui/index.js';
import { menu, palette, scrollback, table, textArea, tree, viewport, text } from '../../dist/widgets/index.js';

test('scrollbarLayout reserves edge tracks and computes proportional thumbs', () => {
  const layout = scrollbarLayout(
    { row: 1, column: 1, width: 10, height: 5 },
    { offsetRow: 5, offsetColumn: 0, contentRows: 20, contentColumns: 10 },
    { axis: 'vertical' }
  );

  assert.deepEqual(layout.contentBounds, { row: 1, column: 1, width: 9, height: 5 });
  assert.deepEqual(layout.verticalTrack?.bounds, { row: 1, column: 10, width: 1, height: 5 });
  assert.deepEqual(layout.verticalTrack?.thumb, { start: 1, size: 1 });
  assert.equal(layout.horizontalTrack, undefined);
});

test('renderScrollbars uses theme scrollbar symbols and tokens', () => {
  const buffer = createFrameBuffer(4, 3);
  const layout = scrollbarLayout(
    { row: 1, column: 1, width: 4, height: 3 },
    { offsetRow: 1, offsetColumn: 0, contentRows: 6, contentColumns: 4 },
    { axis: 'vertical' }
  );

  renderScrollbars(buffer, layout, defaultTheme);
  const frame = buffer.snapshot();
  const trackCells = frame.cells.filter((cell) => cell.column === 4);

  assert.equal(trackCells.length, 3);
  assert.ok(trackCells.some((cell) => cell.text === defaultTheme.symbols.scrollbarVerticalThumb));
  assert.ok(trackCells.every((cell) => cell.style?.fg?.kind === 'theme'));
});

test('scrollbar visibility modes control whether edge tracks reserve space', () => {
  const bounds = { row: 1, column: 1, width: 8, height: 4 };
  const fullyVisibleState = { offsetRow: 0, offsetColumn: 0, contentRows: 4, contentColumns: 8 };
  const overflowingState = { ...fullyVisibleState, contentRows: 10 };

  assert.equal(scrollbarLayout(bounds, fullyVisibleState, { axis: 'vertical', visible: 'auto' }).verticalTrack, undefined);
  assert.deepEqual(
    scrollbarLayout(bounds, fullyVisibleState, { axis: 'vertical', visible: 'always' }).verticalTrack?.bounds,
    { row: 1, column: 8, width: 1, height: 4 }
  );
  assert.equal(scrollbarLayout(bounds, overflowingState, { axis: 'vertical', visible: 'never' }).verticalTrack, undefined);
});

test('scrollbars render ASCII and Unicode symbol sets through theme data', () => {
  const layout = scrollbarLayout(
    { row: 1, column: 1, width: 5, height: 3 },
    { offsetRow: 1, offsetColumn: 2, contentRows: 9, contentColumns: 9 },
    { axis: 'both', visible: 'always' }
  );
  const asciiTheme = defineTheme({ name: 'ascii-scrollbars', symbols: asciiSymbols });
  const unicodeTheme = defineTheme({ name: 'unicode-scrollbars', symbols: unicodeSymbols });
  const ascii = createFrameBuffer(5, 3);
  const unicode = createFrameBuffer(5, 3);

  renderScrollbars(ascii, layout, asciiTheme);
  renderScrollbars(unicode, layout, unicodeTheme);

  assert.match(renderFramePlain(ascii.snapshot()), /[#|-]/u);
  assert.match(renderFramePlain(unicode.snapshot()), /[█│─]/u);
});

test('scrollback scrollbar is opt-in and preserves scoped visible-window accessibility', () => {
  const items = Array.from({ length: 8 }, (_value, index) => ({ id: `row-${index}`, text: `Row ${index}` }));
  const frame = renderWidgetFrame(scrollback({
    id: 'log',
    items,
    scroll: createScrollState({ offsetRow: 0, contentRows: 8, viewportRows: 3 }),
    scrollbar: {}
  }), { columns: 12, rows: 3 });

  assert.equal(frame.cells.filter((cell) => cell.column === 12).length, 3);
  assert.match(renderFramePlain(frame), /Row 0/u);
  assert.equal(frame.accessibility.root.description, 'Showing 1-3 of 8 scrollback rows. Omitted before: 0. Omitted after: 5.');
});

test('textArea scrollbar follows explicit text scroll state', () => {
  const frame = renderWidgetFrame(textArea({
    id: 'body',
    value: 'alpha\nbravo\ncharlie',
    scroll: createScrollState({ offsetRow: 1, contentRows: 3, viewportRows: 2 }),
    scrollbar: {}
  }), { columns: 10, rows: 2 });

  const output = renderFramePlain(frame);
  assert.doesNotMatch(output, /alpha/u);
  assert.match(output, /bravo/u);
  assert.match(output, /charlie/u);
  assert.equal(frame.cells.filter((cell) => cell.column === 10).length, 2);
});

test('table scrollbar can expose vertical and horizontal scroll scope together', () => {
  const frame = renderWidgetFrame(table({
    id: 'wide',
    rows: [
      ['alpha-column', 'one'],
      ['bravo-column', 'two'],
      ['charlie-column', 'three']
    ],
    columns: [
      { header: 'Name', width: { kind: 'fixed', cells: 14 } },
      { header: 'Value', width: { kind: 'fixed', cells: 10 } }
    ],
    scroll: createScrollState({
      offsetRow: 1,
      offsetColumn: 8,
      contentRows: 3,
      contentColumns: 30,
      viewportRows: 3,
      viewportColumns: 14
    }),
    scrollbar: { axis: 'both' }
  }), { columns: 14, rows: 3 });

  assert.ok(frame.cells.some((cell) => cell.column === 14 && cell.style?.fg?.token === 'scrollbar.track'));
  assert.ok(frame.cells.some((cell) => cell.row === 3 && cell.style?.fg?.token === 'scrollbar.track'));
});

test('menu scrollbar windows menu rows instead of drawing decorative chrome only', () => {
  const frame = renderWidgetFrame(menu({
    id: 'menu',
    items: [
      { id: 'new', label: 'New' },
      { id: 'open', label: 'Open' },
      { id: 'save', label: 'Save' },
      { id: 'quit', label: 'Quit' }
    ],
    scroll: createScrollState({ offsetRow: 2, contentRows: 4, viewportRows: 2 }),
    scrollbar: {}
  }), { columns: 14, rows: 2 });

  const output = renderFramePlain(frame);
  assert.doesNotMatch(output, /New/u);
  assert.match(output, /Save/u);
  assert.match(output, /Quit/u);
  assert.equal(frame.cells.filter((cell) => cell.column === 14).length, 2);
});

test('tree scrollbar follows explicit tree scroll state', () => {
  const frame = renderWidgetFrame(tree({
    id: 'tree',
    nodes: [
      { id: 'a', label: 'Alpha' },
      { id: 'b', label: 'Bravo' },
      { id: 'c', label: 'Charlie' },
      { id: 'd', label: 'Delta' }
    ],
    scroll: createScrollState({ offsetRow: 1, contentRows: 4, viewportRows: 2 }),
    scrollbar: {}
  }), { columns: 16, rows: 2 });

  const output = renderFramePlain(frame);
  assert.doesNotMatch(output, /Alpha/u);
  assert.match(output, /Bravo/u);
  assert.match(output, /Charlie/u);
  assert.equal(frame.cells.filter((cell) => cell.column === 16).length, 2);
});

test('palette scrollbar renders beside the filtered result window', () => {
  const frame = renderWidgetFrame(palette({
    id: 'palette',
    title: 'Actions',
    entries: [
      { id: 'one', label: 'One', value: 'one' },
      { id: 'two', label: 'Two', value: 'two' },
      { id: 'three', label: 'Three', value: 'three' },
      { id: 'four', label: 'Four', value: 'four' }
    ],
    scroll: createScrollState({ offsetRow: 1, contentRows: 4, viewportRows: 4 }),
    scrollbar: { visible: 'always' }
  }), { columns: 18, rows: 4 });

  assert.match(renderFramePlain(frame), /Actions/u);
  assert.equal(frame.cells.filter((cell) => cell.column === 18).length, 4);
});

test('viewport scrollbar clips child rendering to content bounds', () => {
  const frame = renderWidgetFrame(viewport(text('abcdef'), {
    contentColumns: 6,
    scrollbar: { axis: 'horizontal' }
  }), { columns: 4, rows: 2 });

  const output = renderFramePlain(frame);
  assert.match(output, /abcd/u);
  assert.ok(frame.cells.some((cell) => cell.row === 2 && cell.style?.fg?.token === 'scrollbar.track'));
});

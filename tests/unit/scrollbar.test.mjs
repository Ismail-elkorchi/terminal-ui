import assert from 'node:assert/strict';
import test from 'node:test';

import { createScrollState, prepareSearchPickerIndex, prepareLogHistory } from '../../dist/behavior/index.js';
import {
  asciiSymbols,
  defaultTheme,
  defineTheme,
  unicodeSymbols } from '../../dist/theme/index.js';
import {
  createFrameBuffer,
  renderFramePlain,
  renderElementFrame
} from '../../dist/renderer/index.js';
import {
  renderScrollbars,
  scrollbarInteractionReducer,
  scrollbarLayout,
  scrollbarVisualStateForTarget
} from '../../dist/testing/index.js';
import {
  menu,
  searchPicker,
  logViewer,
  table,
  textArea,
  tree,
  text
} from '../../dist/components/index.js';
import { viewport } from '../../dist/layout/index.js';
import { prepareTextDocument, textCaretAt } from '../../dist/text/index.js';

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
  const thumbCell = trackCells.find((cell) => cell.text === defaultTheme.tokens.symbols.scrollbarVerticalThumb);
  const trackCell = trackCells.find((cell) => cell.text === defaultTheme.tokens.symbols.scrollbarVerticalTrack);

  assert.equal(trackCells.length, 3);
  assert.ok(thumbCell);
  assert.ok(trackCell);
  assert.ok(trackCells.every((cell) => cell.style?.fg?.kind === 'theme'));
  assert.equal(thumbCell.source?.cellRole, 'scrollbar');
  assert.equal(thumbCell.source?.elementKind, 'scrollbar');
  assert.equal(thumbCell.source?.rendererFamily, 'scroll');
  assert.equal(thumbCell.source?.partName, 'vertical.thumb');
  assert.equal(thumbCell.source?.partType, 'thumb');
  assert.equal(thumbCell.source?.interactionState, undefined);
  assert.equal(trackCell.source?.partName, 'vertical.track');
  assert.equal(trackCell.source?.partType, 'track');
});

test('renderScrollbars keeps one-cell tracks under ambiguous-wide profiles', () => {
  const buffer = createFrameBuffer(4, 3, {
    widthProfile: { emoji: 'wide', ambiguous: 'wide' }
  });
  const layout = scrollbarLayout(
    { row: 1, column: 1, width: 4, height: 3 },
    { offsetRow: 1, offsetColumn: 0, contentRows: 6, contentColumns: 4 },
    { axis: 'vertical' }
  );

  renderScrollbars(buffer, layout, defaultTheme);

  const cells = buffer.snapshot().cells.filter((cell) => cell.column === 4);
  assert.equal(cells.length, 3);
  assert.ok(cells.every((cell) => cell.text === '|' && cell.width === 1));
});

test('scrollbarLayout exposes inactive state for visible non-overflowing tracks', () => {
  const layout = scrollbarLayout(
    { row: 1, column: 1, width: 4, height: 3 },
    { offsetRow: 0, offsetColumn: 0, contentRows: 2, contentColumns: 4 },
    { axis: 'vertical', visible: 'always' }
  );

  assert.equal(layout.verticalTrack?.state, 'inactive');
  assert.equal(layout.verticalTrack?.scrollable, false);

  const buffer = createFrameBuffer(4, 3);
  renderScrollbars(buffer, layout, defaultTheme);
  const cells = buffer.snapshot().cells.filter((cell) => cell.column === 4);

  assert.equal(cells.length, 3);
  assert.ok(cells.every((cell) => cell.source?.interactionState === 'disabled'));
  assert.ok(cells.every((cell) => cell.style?.fg?.token === 'scrollbar.track'));
  assert.ok(cells.every((cell) => cell.style?.dim === true));
});

test('scrollbar visualState controls active and hover thumb styling', () => {
  const activeLayout = scrollbarLayout(
    { row: 1, column: 1, width: 4, height: 3 },
    { offsetRow: 1, offsetColumn: 0, contentRows: 8, contentColumns: 4 },
    { axis: 'vertical', visualState: 'active' }
  );
  const hoverLayout = scrollbarLayout(
    { row: 1, column: 1, width: 4, height: 3 },
    { offsetRow: 1, offsetColumn: 0, contentRows: 8, contentColumns: 4 },
    { axis: 'vertical', visualState: 'hover' }
  );
  const activeBuffer = createFrameBuffer(4, 3);
  const hoverBuffer = createFrameBuffer(4, 3);

  renderScrollbars(activeBuffer, activeLayout, defaultTheme);
  renderScrollbars(hoverBuffer, hoverLayout, defaultTheme);

  const activeThumb = activeBuffer.snapshot().cells.find((cell) => cell.text === defaultTheme.tokens.symbols.scrollbarVerticalThumb);
  const hoverThumb = hoverBuffer.snapshot().cells.find((cell) => cell.text === defaultTheme.tokens.symbols.scrollbarVerticalThumb);

  assert.equal(activeLayout.verticalTrack?.state, 'active');
  assert.equal(activeThumb?.style?.bold, true);
  assert.equal(activeThumb?.style?.fg?.token, 'focus.border');
  assert.equal(activeThumb?.source?.interactionState, 'active');
  assert.equal(hoverLayout.verticalTrack?.state, 'hover');
  assert.equal(hoverThumb?.style?.bold, true);
  assert.equal(hoverThumb?.style?.inverse, undefined);
  assert.equal(hoverThumb?.style?.fg?.token, 'scrollbar.thumb');
  assert.equal(hoverThumb?.source?.interactionState, 'hovered');
});

test('scrollbar interaction reducer maps pointer lifecycle to caller-controlled visual state', () => {
  let state = scrollbarInteractionReducer({}, pointerAction({
    kind: 'enter',
    targetId: 'editor:scrollbar:vertical:thumb'
  }));

  assert.equal(scrollbarVisualStateForTarget(state, 'editor:scrollbar:vertical:thumb'), 'hover');
  assert.equal(scrollbarVisualStateForTarget(state, 'editor:scrollbar:vertical:track'), undefined);

  state = scrollbarInteractionReducer(state, pointerAction({
    kind: 'pointerDown',
    targetId: 'editor:scrollbar:vertical:thumb',
    capturedTargetId: 'editor:scrollbar:vertical:thumb'
  }));
  assert.equal(scrollbarVisualStateForTarget(state, 'editor:scrollbar:vertical:thumb'), 'active');

  state = scrollbarInteractionReducer(state, pointerAction({
    kind: 'dragEnd',
    targetId: 'editor:scrollbar:vertical:thumb',
    capturedTargetId: 'editor:scrollbar:vertical:thumb'
  }));
  assert.equal(scrollbarVisualStateForTarget(state, 'editor:scrollbar:vertical:thumb'), 'hover');

  state = scrollbarInteractionReducer(state, pointerAction({
    kind: 'leave',
    targetId: 'editor:scrollbar:vertical:thumb'
  }));
  assert.equal(scrollbarVisualStateForTarget(state, 'editor:scrollbar:vertical:thumb'), undefined);
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

function pointerAction(event) {
  return {
    kind: 'pointer',
    event: {
      source: 'mouse',
      row: 1,
      column: 1,
      button: 'left',
      modifiers: { shift: false, alt: false, ctrl: false },
      deltaRows: 0,
      deltaColumns: 0,
      raw: {
        kind: 'mouse',
        sequence: '',
        encoding: 'sgr',
        action: event.kind === 'leave' ? 'move' : 'press',
        button: 'left',
        row: 1,
        column: 1,
        rawCode: 0,
        modifiers: { shift: false, alt: false, ctrl: false }
      },
      ...event
    }
  };
}

test('scrollbars render ASCII and Unicode symbol sets through theme data', () => {
  const layout = scrollbarLayout(
    { row: 1, column: 1, width: 5, height: 3 },
    { offsetRow: 1, offsetColumn: 2, contentRows: 9, contentColumns: 9 },
    { axis: 'both', visible: 'always' }
  );
  const asciiTheme = defineTheme({ name: 'ascii-scrollbars', tokens: { symbols: asciiSymbols } });
  const unicodeTheme = defineTheme({ name: 'unicode-scrollbars', tokens: { symbols: unicodeSymbols } });
  const ascii = createFrameBuffer(5, 3);
  const unicode = createFrameBuffer(5, 3);

  renderScrollbars(ascii, layout, asciiTheme);
  renderScrollbars(unicode, layout, unicodeTheme);

  assert.match(renderFramePlain(ascii.snapshot()), /[#|-]/u);
  assert.match(renderFramePlain(unicode.snapshot()), /[█│─]/u);
});

test('log viewer scrollbar is opt-in and preserves scoped visible-window accessibility', () => {
  const items = Array.from({ length: 8 }, (_value, index) => ({ id: `row-${index}`, text: `Row ${index}` }));
  const frame = renderElementFrame(logViewer({
    id: 'log',
    history: prepareLogHistory(items),
    scroll: createScrollState({ offsetRow: 0, contentRows: 8, viewportRows: 3 }),
    scrollbar: {}
  }), { columns: 12, rows: 3 });

  assert.equal(frame.cells.filter((cell) => cell.column === 12).length, 3);
  assert.match(renderFramePlain(frame), /Row 0/u);
  assert.equal(frame.accessibility.root.description, 'Showing 1-3 of 8 log rows. Omitted before: 0. Omitted after: 5. Follow tail: false.');
});

test('textArea scrollbar follows explicit text scroll state', () => {
  const frame = renderElementFrame(textArea({
    id: 'body',
    presentation: { document: prepareTextDocument('alpha\nbravo\ncharlie'), caret: textCaretAt(0), scroll: createScrollState({ offsetRow: 1, contentRows: 3, viewportRows: 2 }) },
    scrollbar: {}
  }), { columns: 10, rows: 2 });

  const output = renderFramePlain(frame);
  assert.doesNotMatch(output, /alpha/u);
  assert.match(output, /bravo/u);
  assert.match(output, /charlie/u);
  assert.equal(frame.cells.filter((cell) => cell.column === 10).length, 2);
});

test('component scrollbars expose producing-element metadata and visual state', () => {
  const frame = renderElementFrame(textArea({
    id: 'body',
    presentation: { document: prepareTextDocument('alpha\nbravo\ncharlie'), caret: textCaretAt(0), scroll: createScrollState({ offsetRow: 1, contentRows: 3, viewportRows: 2 }) },
    scrollbar: { visible: 'always', visualState: 'hover' }
  }), { columns: 10, rows: 2 });

  const thumbCell = frame.cells.find((cell) => cell.text === defaultTheme.tokens.symbols.scrollbarVerticalThumb);

  assert.equal(thumbCell?.source?.elementId, 'body');
  assert.equal(thumbCell?.source?.elementKind, 'textArea');
  assert.equal(thumbCell?.source?.rendererFamily, 'scroll');
  assert.equal(thumbCell?.source?.cellRole, 'scrollbar');
  assert.equal(thumbCell?.source?.partType, 'thumb');
  assert.equal(thumbCell?.source?.interactionState, 'hovered');
  assert.equal(thumbCell?.style?.inverse, undefined);
  assert.equal(thumbCell?.style?.bold, true);
});

test('table scrollbar can expose vertical and horizontal scroll scope together', () => {
  const frame = renderElementFrame(table({
    getRowId: (_row, index) => String(index),
    id: 'wide',
    rows: [
      ['alpha-column', 'one'],
      ['bravo-column', 'two'],
      ['charlie-column', 'three']
    ],
    columns: [
      {
        id: 'name-0', value: (row) => Array.isArray(row) ? row[0] : row, header: 'Name', width: { kind: 'fixed', cells: 14 } },
      {
        id: 'value-1', value: (row) => Array.isArray(row) ? row[1] : undefined, header: 'Value', width: { kind: 'fixed', cells: 10 } }
    ],
    presentation: {
      scroll: createScrollState({
        offsetRow: 1,
        offsetColumn: 8,
        contentRows: 3,
        contentColumns: 30,
        viewportRows: 3,
        viewportColumns: 14
      })
    },
    scrollbar: { axis: 'both' },
    onAction: (action) => action
  }), { columns: 14, rows: 3 });

  assert.ok(frame.cells.some((cell) => cell.column === 14 && cell.style?.fg?.token === 'scrollbar.track'));
  assert.ok(frame.cells.some((cell) => cell.row === 3 && cell.style?.fg?.token === 'scrollbar.track'));
});

test('menu scrollbar windows menu rows instead of drawing a fixed decoration only', () => {
  const frame = renderElementFrame(menu({
    id: 'menu',
    presentation: {
      activePath: ['save'],
      items: [
        { kind: 'action', id: 'new', label: 'New' },
        { kind: 'action', id: 'open', label: 'Open' },
        { kind: 'action', id: 'save', label: 'Save' },
        { kind: 'action', id: 'quit', label: 'Quit' }
      ],
      scroll: createScrollState({ offsetRow: 2, contentRows: 4, viewportRows: 2 })
    },
    scrollbar: {}
  }), { columns: 14, rows: 2 });

  const output = renderFramePlain(frame);
  assert.doesNotMatch(output, /New/u);
  assert.match(output, /Save/u);
  assert.match(output, /Quit/u);
  assert.equal(frame.cells.filter((cell) => cell.column === 14).length, 2);
});

test('tree scrollbar follows explicit tree scroll state', () => {
  const frame = renderElementFrame(tree({
    id: 'tree',
    nodes: [
      { id: 'a', label: 'Alpha', kind: 'leaf' },
      { id: 'b', label: 'Bravo', kind: 'leaf' },
      { id: 'c', label: 'Charlie', kind: 'leaf' },
      { id: 'd', label: 'Delta', kind: 'leaf' }
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

test('searchPicker scrollbar renders beside the filtered result window', () => {
  const frame = renderElementFrame(searchPicker({
    id: 'searchPicker',
    title: 'Actions',
    searchPickerIndex: prepareSearchPickerIndex([
      { id: 'one', label: 'One', value: 'one' },
      { id: 'two', label: 'Two', value: 'two' },
      { id: 'three', label: 'Three', value: 'three' },
      { id: 'four', label: 'Four', value: 'four' }
    ]),
    scroll: createScrollState({ offsetRow: 1, contentRows: 4, viewportRows: 4 }),
    scrollbar: { visible: 'always' }
  }), { columns: 18, rows: 4 });

  assert.match(renderFramePlain(frame), /Actions/u);
  assert.equal(frame.cells.filter((cell) => cell.column === 18).length, 4);
});

test('viewport scrollbar clips child rendering to content bounds', () => {
  const frame = renderElementFrame(viewport(text('abcdef'), {
    id: 'clipped-viewport',
    contentColumns: 6,
    scrollbar: { axis: 'horizontal' }
  }), { columns: 4, rows: 2 });

  const output = renderFramePlain(frame);
  assert.match(output, /abcd/u);
  const thumb = frame.cells.find((cell) => cell.row === 2 && cell.text === defaultTheme.tokens.symbols.scrollbarHorizontalThumb);
  const track = frame.cells.find((cell) => cell.row === 2 && cell.text === defaultTheme.tokens.symbols.scrollbarHorizontalTrack);

  assert.ok(thumb);
  assert.ok(track);
  assert.equal(thumb.source?.elementKind, 'viewport');
  assert.equal(thumb.source?.partType, 'thumb');
  assert.equal(thumb.style?.fg?.token, 'scrollbar.thumb');
  assert.equal(track.source?.elementKind, 'viewport');
  assert.equal(track.source?.partType, 'track');
  assert.equal(track.style?.fg?.token, 'scrollbar.track');
  assert.equal(track.style?.dim, true);
});

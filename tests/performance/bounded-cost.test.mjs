import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import test from 'node:test';

import { createTuiRuntime, defineTui } from '../../dist/tui/index.js';
import {
  createMemoryTerminalHost } from '../../dist/host/index.js';
import { createInputDecoder } from '../../dist/input/index.js';
import { createTerminalHarness } from '../../dist/testing/index.js';
import {
  diffFrames,
  layoutElement,
  renderDiffAnsi,
  renderFramePlain,
  renderElementFrame
} from '../../dist/renderer/index.js';
import { createCommandSuggestions } from '../../dist/behavior/index.js';
import { dirtyRegionsForRegionChanges } from '../../dist/renderer/internal/dirty-regions.js';
import { renderElementRegions } from '../../dist/renderer/internal/render-element.js';
import { createTextAreaProjection } from '../../dist/components/internal/text-area-projection.js';
import {
  button,
  canvas,
  commandInput,
  createTextAreaDecorations,
  form,
  textInput,
  listbox,
  listView,
  searchPicker,
  richText,
  logViewer,
  dataGrid,
  dialog,
  table,
  text,
  textArea,
  tree
} from '../../dist/components/index.js';
import { column, overlay } from '../../dist/layout/index.js';
import { ignoreMessage } from '../../dist/component/index.js';
import {
  defaultTextWidthProfile,
  createTextDocument,
  textCaretAt,
  textDocumentEdit,
} from '../../dist/text/index.js';
import {
  appendLogHistory,
  createScrollState,
  listboxReducer,
  createSearchPickerIndex,
  createLogHistory,
  createListboxCollection,
  createTableCollection,
  createTreeSource,
  createTreeView,
  dataGridReducer,
  treeReducer
} from '../../dist/behavior/index.js';
import {
  appendMeasuredItems,
  createMeasuredCollection,
  measuredWindow,
  replaceMeasuredItem,
} from '../../dist/collection/index.js';
import {
  createTerminalTextIndex,
  editTextBuffer
} from '../../dist/text/index.js';
import { waitUntil } from '../helpers/async.ts';

const outputCapabilities = await createMemoryTerminalHost().getCapabilities();

test('retained measured collection work is bounded by changes and the visible window', { timeout: 10_000 }, () => {
  const itemCount = 100_000;
  let collection = createMeasuredCollection(Array.from({ length: itemCount }, (_value, index) => ({
    id: `measured-${String(index)}`,
    value: index,
    rows: (index % 5) + 1
  })));

  let visibleEntries = 0;
  for (let query = 0; query < 5_000; query += 1) {
    visibleEntries += measuredWindow(collection, {
      viewportRows: 24,
      offsetRow: (query * 53) % (collection.totalRows - 24)
    }).entries.length;
  }
  for (let update = 0; update < 1_000; update += 1) {
    const itemIndex = (update * 97) % itemCount;
    collection = replaceMeasuredItem(collection, {
      id: `measured-${String(itemIndex)}`,
      value: -update,
      rows: (update % 7) + 1
    });
  }
  collection = appendMeasuredItems(collection, [{ id: 'measured-tail', value: -1, rows: 2 }]);

  assert.ok(visibleEntries > 5_000);
  assert.equal(collection.itemCount, itemCount + 1);
});

test('listView renders only its clipped measured window', () => {
  const collection = createMeasuredCollection(Array.from({ length: 100_000 }, (_value, index) => ({
    id: `row-${String(index)}`,
    value: `Row ${String(index)}`,
    rows: 3
  })));
  const window = measuredWindow(collection, { viewportRows: 12, offsetRow: 150_001 });
  let renderedItems = 0;
  const frame = renderElementFrame(listView({
    id: 'large-measured-list',
    window,
    renderItem: (item) => {
      renderedItems += 1;
      return { content: text({ content: `${item.value}\n${item.value}\n${item.value}` }) };
    },
    state: {
      selection: { mode: 'none' },
      scroll: createScrollState({ offsetRow: window.offsetRow })
    },
    onTransition: () => ignoreMessage()
  }), { columns: 32, rows: 12 });

  assert.equal(renderedItems, window.entries.length);
  assert.equal(renderedItems <= 5, true);
  assert.equal(frame.accessibility.root.children?.length, renderedItems);
  assert.ok(frame.cells.length <= frame.width * frame.height);
});

test('retained word-boundary index keep large multilingual lookups bounded', { timeout: 10_000 }, () => {
  const manyShortWords = `${'a '.repeat(50_000)}終`;
  const cjk = '你好世界'.repeat(25_000);
  const combining = 'e\u0301lan '.repeat(16_667);

  for (const value of [manyShortWords, cjk, combining]) {
    const index = createTerminalTextIndex(value);
    for (let lookup = 0; lookup < 1_000; lookup += 1) {
      const offset = Math.floor((lookup / 1_000) * value.length);
      const selection = index.wordSelectionAt(offset);
      assert.ok(selection.startOffset >= 0);
      assert.ok(selection.endOffsetExclusive <= value.length);
      assert.ok(selection.endOffsetExclusive >= selection.startOffset);
    }
  }
});

test('repeated word editing remains bounded on a ten-thousand-unit buffer', { timeout: 10_000 }, () => {
  const text = `${'alpha,世界 '.repeat(800)}ending`;
  let buffer = { text, cursor: text.length };
  for (let operation = 0; operation < 100; operation += 1) {
    buffer = editTextBuffer(buffer, { kind: 'moveWordLeft' });
  }
  for (let operation = 0; operation < 20; operation += 1) {
    buffer = editTextBuffer(buffer, { kind: 'deleteWordBackward' });
  }
  assert.ok(buffer.cursor >= 0);
  assert.ok(buffer.cursor <= buffer.text.length);
});

test('paste bursts decode as one paste event instead of per-character key churn', () => {
  const decoder = createInputDecoder({ bracketedPaste: true });
  const payload = `${'\u001B[200~'}${'x'.repeat(10_000)}${'\u001B[201~'}`;
  const { events } = decoder.decode({ data: payload });

  assert.equal(events.length, 1);
  assert.equal(events[0]?.kind, 'paste');
  assert.equal(events[0]?.text.length, 10_000);
});

test('large listbox rendering is bounded by terminal size, not collection size', () => {
  const items = Array.from({ length: 50_000 }, (_value, index) => `Item ${index}`);
  const frame = renderElementFrame(listbox({
    id: 'large-listbox',
    meta: { accessibleName: 'Large list' },
    items,
    toOption: (item) => ({ id: item, label: item }),
    state: {
      activeId: 'Item 40000',
      selection: { mode: 'single', selectedId: 'Item 40000' }
    },
    onTransition: () => ignoreMessage()
  }), { columns: 32, rows: 10 });
  const output = renderFramePlain(frame);

  assert.match(output, /Item 40000/u);
  assert.doesNotMatch(output, /Item 0/u);
  assert.ok(frame.cells.length <= frame.width * frame.height);
  assert.equal(frame.accessibility.root.children?.length, 10);
  assert.equal(frame.accessibility.root.description, 'Showing 39996-40005 of 50000 items.');
});

test('retained listbox collections retain item decoding across renders and actions', () => {
  let mapperCalls = 0;
  const values = Array.from({ length: 50_000 }, (_value, index) => `Item ${String(index)}`);
  const collection = createListboxCollection(values, (value, index) => {
    mapperCalls += 1;
    return { id: String(index), label: value };
  });

  assert.equal(mapperCalls, values.length);
  mapperCalls = 0;
  renderElementFrame(listbox({
    id: 'retained-listbox',
    meta: { accessibleName: 'Retained list' },
    collection,
    state: { activeId: '25000', selection: { mode: 'single', selectedId: '25000' } },
    onTransition: () => ignoreMessage()
  }), { columns: 32, rows: 10 });
  renderElementFrame(listbox({
    id: 'retained-listbox',
    meta: { accessibleName: 'Retained list' },
    collection,
    state: { activeId: '25001', selection: { mode: 'single', selectedId: '25001' } },
    onTransition: () => ignoreMessage()
  }), { columns: 40, rows: 12 });
  const state = listboxReducer(
    { activeId: '25000', selection: { mode: 'single', selectedId: '25000' } },
    { kind: 'moveActive', delta: 1 },
    { collection }
  );

  assert.equal(state.activeId, '25001');
  assert.equal(mapperCalls, 0);
});

test('windowed listbox collections map only supplied rows while preserving global scope', () => {
  let mapperCalls = 0;
  const start = 40_000;
  const values = Array.from({ length: 10 }, (_value, offset) => `Item ${String(start + offset)}`);
  const collection = createListboxCollection(values, (value, index) => {
    mapperCalls += 1;
    return { id: String(index), label: value };
  }, { startIndex: start, totalCount: 50_000, scope: { kind: 'source' } });
  const frame = renderElementFrame(listbox({
    id: 'windowed-listbox',
    meta: { accessibleName: 'Windowed list' },
    collection,
    state: {
      activeId: '40004',
      selection: { mode: 'single', selectedId: '40004' }
    },
    onTransition: () => ignoreMessage()
  }), { columns: 32, rows: 5 });

  assert.equal(mapperCalls, 10);
  assert.match(renderFramePlain(frame), /Item 40004/u);
  assert.equal(frame.accessibility.root.description, 'Showing 40003-40007 of 50000 items.');
});

test('command suggestions retain only a supplied window while preserving global accessibility', () => {
  const start = 40_000;
  const suggestions = createCommandSuggestions(
    Array.from({ length: 8 }, (_value, offset) => ({
      id: `command-${String(start + offset)}`,
      label: `Command ${String(start + offset)}`,
      completion: {
        range: { startOffset: 0, endOffsetExclusive: 0 },
        text: `command-${String(start + offset)}`
      },
    })),
    { startIndex: start, totalCount: 100_000, scope: { kind: 'source' } },
  );
  const frame = renderElementFrame(commandInput({
    id: 'windowed-command',
    meta: { accessibleName: 'Command' },
    display: 'expanded',
    maxVisibleSuggestions: 8,
    view: {
      input: { text: '', cursor: 0 },
      open: true,
      suggestions,
      activeSuggestionId: 'command-40003',
    },
    onTransition: () => ignoreMessage(),
  }), { columns: 40, rows: 9 });
  const listbox = frame.accessibility.root.children?.find((node) => node.role === 'listbox');

  assert.match(renderFramePlain(frame), /Command 40003/u);
  assert.equal(listbox?.children?.length, 8);
  assert.deepEqual(listbox?.window, {
    startIndex: 40_000,
    endIndexExclusive: 40_008,
    totalCount: 100_000,
    omittedBefore: 40_000,
    omittedAfter: 59_992,
  });
});

test('large log viewer rendering is bounded by terminal size, not collection size', () => {
  const items = Array.from({ length: 100_000 }, (_value, index) => ({ id: `line-${index}`, text: `Line ${index}` }));
  const history = createLogHistory(items);
  const frame = renderElementFrame(logViewer({ id: 'large-log-viewer', history }), { columns: 48, rows: 12 });
  const output = renderFramePlain(frame);

  assert.match(output, /Line 99999/u);
  assert.doesNotMatch(output, /Line 0/u);
  assert.ok(frame.cells.length <= frame.width * frame.height);
  assert.equal(frame.accessibility.root.children?.length, 12);
  assert.equal(frame.accessibility.root.description, 'Showing 99989-100000 of 100000 log rows. Omitted before: 99988. Omitted after: 0. Follow tail: true.');
});

test('retained log history pays source normalization once and rendering does not reread entries', () => {
  let textReads = 0;
  const items = Array.from({ length: 20_000 }, (_value, index) => ({
    id: `line-${String(index)}`,
    get text() {
      textReads += 1;
      return `Line ${String(index)}`;
    }
  }));

  const history = createLogHistory(items);
  assert.equal(textReads, items.length);
  textReads = 0;
  renderElementFrame(logViewer({ id: 'bounded-history', history }), { columns: 48, rows: 12 });
  renderElementFrame(logViewer({ id: 'bounded-history', history }), { columns: 64, rows: 16 });

  assert.equal(textReads, 0);
});

test('small local frame updates produce bounded render diffs', () => {
  const previous = renderElementFrame(textInput({
    id: 'field',
    meta: { accessibleName: 'Field' },
    state: { value: 'alpha', cursor: 0 },
    onTransition: () => ignoreMessage()
  }), { columns: 24, rows: 3 });
  const next = renderElementFrame(textInput({
    id: 'field',
    meta: { accessibleName: 'Field' },
    state: { value: 'alpha!', cursor: 0 },
    onTransition: () => ignoreMessage()
  }), { columns: 24, rows: 3 });
  const diff = diffFrames(previous, next);

  assert.equal(diff.fullRewrite, false);
  assert.ok(diff.operations.length > 0);
  assert.ok(diff.operations.length < previous.width * previous.height);
});

test('terminal output planning does not exceed absolute-addressed literal-clear output', () => {
  const diff = {
    width: 120,
    height: 30,
    fullRewrite: false,
    operations: [
      { kind: 'write', row: 3, column: 4, spans: [{ text: 'status' }] },
      { kind: 'write', row: 3, column: 12, spans: [{ text: 'ready' }] },
      { kind: 'clearRect', bounds: { row: 8, column: 90, width: 31, height: 3 } }
    ],
    cursor: { row: 20, column: 1 }
  };
  const output = renderDiffAnsi(diff, { capabilities: outputCapabilities });
  const baseline = [
    '\u001B[3;4Hstatus',
    '\u001B[3;12Hready',
    ...[8, 9, 10].map((row) => `\u001B[${String(row)};90H${' '.repeat(31)}`),
    '\u001B[20;1H'
  ].join('');

  assert.ok(byteLength(output) <= byteLength(baseline));
});

function byteLength(value) {
  return new TextEncoder().encode(value).byteLength;
}

test('full frame render stays bounded by terminal size for mixed element trees', () => {
  const frame = renderElementFrame(column([
    commandInput({
      id: 'search',
      meta: { accessibleName: 'Search' },
      prompt: '?',
      view: { input: { text: 'fil', cursor: 0 }, open: true, suggestions: createCommandSuggestions([
        { id: 'file', completion: { range: { startOffset: 0, endOffsetExclusive: 3 }, text: 'file' }, label: 'file' },
        { id: 'filter', completion: { range: { startOffset: 0, endOffsetExclusive: 3 }, text: 'filter' }, label: 'filter' }
      ]), activeSuggestionId: 'file' },
      onTransition: (transition) => transition
    }),
    table({
    getRowId: (_row, index) => String(index),
    id: 'summary',
      meta: { accessibleName: 'Summary' },
      columns: [
        {
          id: 'name-0', value: (row) => Array.isArray(row) ? row[0] : row, header: 'Name', width: { kind: 'fixed', cells: 12 } },
        {
          id: 'value-1', value: (row) => Array.isArray(row) ? row[1] : undefined, header: 'Value', width: { kind: 'fill' } }
      ],
      rows: Array.from({ length: 1_000 }, (_value, index) => [`Item ${index}`, index])
    }),
    logViewer({
      id: 'events',
      history: createLogHistory(Array.from({ length: 1_000 }, (_value, index) => ({ id: `event-${index}`, text: `Event ${index}` })))
    })
  ]), { columns: 60, rows: 16 });

  assert.ok(frame.cells.length <= frame.width * frame.height);
  assert.equal(renderFramePlain(frame).split('\n').length <= 16, true);
  assert.equal(frame.accessibility.root.children?.length, 3);
});

test('style-only diffs are incremental and preserve visual dimensions', () => {
  const previous = renderElementFrame(richText({
    id: 'status',
    segments: [{ kind: 'text', text: 'same text', style: { fg: { kind: 'theme', token: 'status.info' } } }]
  }), { columns: 24, rows: 2 });
  const next = renderElementFrame(richText({
    id: 'status',
    segments: [{ kind: 'text', text: 'same text', style: { fg: { kind: 'theme', token: 'status.error' } } }]
  }), { columns: 24, rows: 2 });
  const diff = diffFrames(previous, next);

  assert.equal(diff.fullRewrite, false);
  assert.ok(diff.operations.length > 0);
  assert.ok(diff.operations.length <= 2);
});

test('append-heavy log viewer diffs stay bounded by visible rows', () => {
  const beforeItems = Array.from({ length: 100_000 }, (_value, index) => ({ id: `line-${index}`, text: `Line ${index}` }));
  const beforeHistory = createLogHistory(beforeItems);
  const afterHistory = appendLogHistory(beforeHistory, [{ id: 'line-100000', text: 'Line 100000' }]);
  const previous = renderElementFrame(logViewer({ id: 'append-log', history: beforeHistory }), { columns: 48, rows: 8 });
  const next = renderElementFrame(logViewer({ id: 'append-log', history: afterHistory }), { columns: 48, rows: 8 });
  const diff = diffFrames(previous, next);

  assert.match(renderFramePlain(next), /Line 100000/u);
  assert.doesNotMatch(renderFramePlain(next), /Line 0/u);
  assert.equal(next.accessibility.root.children?.length, 8);
  assert.ok(diff.operations.length <= 16);
});

test('large dataGrid rendering is bounded by terminal size independently from row count', () => {
  const frame = renderElementFrame(dataGrid({
    getRowId: (_row, index) => String(index),
    id: 'large-dataGrid',
    meta: { accessibleName: 'Large data grid' },
    state: {
      interaction: {
        kind: 'cell',
        activeCell: { rowId: '42000', columnId: 'score-1' },
        selection: {
          mode: 'single', selectedCell: { rowId: '42000', columnId: 'score-1' },
        },
      }
    },
    onTransition: () => ignoreMessage(),
    columns: [
      {
        id: 'name-0', value: (row) => Array.isArray(row) ? row[0] : row, header: 'Name', width: { kind: 'fixed', cells: 16 } },
      {
        id: 'score-1', value: (row) => Array.isArray(row) ? row[1] : undefined, header: 'Score', width: { kind: 'fixed', cells: 8 }, align: 'end' },
      {
        id: 'notes-2', value: (row) => Array.isArray(row) ? row[2] : undefined, header: 'Notes', width: { kind: 'fill' } }
    ],
    rows: Array.from({ length: 50_000 }, (_value, index) => [`Row ${index}`, index, `metadata ${index}`])
  }), { columns: 64, rows: 12 });

  assert.match(renderFramePlain(frame), /Row 42000/u);
  assert.doesNotMatch(renderFramePlain(frame), /Row 0/u);
  assert.ok(frame.cells.length <= frame.width * frame.height);
  assert.equal((frame.accessibility.root.children?.length ?? 0) <= 12, true);
});

test('retained dataGrid collections retain row identity across renders and reducer actions', () => {
  let rowIdCalls = 0;
  const rows = Array.from({ length: 100_000 }, (_value, index) => ({ name: `Row ${String(index)}` }));
  const collection = createTableCollection(rows, (_row, index) => {
    rowIdCalls += 1;
    return String(index);
  });

  assert.equal(rowIdCalls, rows.length);
  rowIdCalls = 0;
  const columns = [{ id: 'name', value: (row) => row.name, width: { kind: 'fill' } }];
  renderElementFrame(dataGrid({
    id: 'retained-dataGrid',
    meta: { accessibleName: 'Retained data grid' },
    collection,
    columns,
    state: {
      interaction: {
        kind: 'row', activeRowId: '50000', selection: { mode: 'single', selectedRowId: '50000' },
      }
    },
    onTransition: () => ignoreMessage()
  }), { columns: 48, rows: 12 });
  renderElementFrame(dataGrid({
    id: 'retained-dataGrid',
    meta: { accessibleName: 'Retained data grid' },
    collection,
    columns,
    state: {
      interaction: {
        kind: 'row', activeRowId: '50001', selection: { mode: 'single', selectedRowId: '50001' },
      }
    },
    onTransition: () => ignoreMessage()
  }), { columns: 64, rows: 16 });
  const state = dataGridReducer(
    { interaction: {
      kind: 'row', activeRowId: '50000', selection: { mode: 'single', selectedRowId: '50000' },
    } },
    { kind: 'moveRow', delta: 1 },
    { collection, columnIds: ['name'] }
  );

  assert.equal(state.interaction.kind === 'row' ? state.interaction.activeRowId : undefined, '50001');
  assert.equal(rowIdCalls, 0);
});

test('windowed dataGrid collections identify only supplied items and keep global row positions', () => {
  let rowIdCalls = 0;
  const start = 70_000;
  const rows = Array.from({ length: 12 }, (_value, offset) => ({ name: `Row ${String(start + offset)}` }));
  const collection = createTableCollection(rows, (_row, index) => {
    rowIdCalls += 1;
    return String(index);
  }, { startIndex: start, totalCount: 100_000, scope: { kind: 'source' } });
  const frame = renderElementFrame(dataGrid({
    id: 'windowed-dataGrid',
    meta: { accessibleName: 'Windowed data grid' },
    collection,
    columns: [{ id: 'name', header: 'Name', value: (row) => row.name, width: { kind: 'fill' } }],
    state: {
      interaction: {
        kind: 'row', activeRowId: '70005', selection: { mode: 'single', selectedRowId: '70005' },
      }
    },
    onTransition: () => ignoreMessage()
  }), { columns: 40, rows: 7 });

  assert.equal(rowIdCalls, 12);
  assert.match(renderFramePlain(frame), /Row 70005/u);
  assert.equal(frame.accessibility.root.window?.totalCount, 100_000);
  assert.equal(frame.accessibility.root.children?.[1]?.position?.rowIndex, 70_004);
});

test('fill-width tables evaluate each visible row once without scanning offscreen values', () => {
  let valueReads = 0;
  const rows = Array.from({ length: 20_000 }, (_value, index) => ({ name: `Row ${String(index)}` }));
  const frame = renderElementFrame(dataGrid({
    getRowId: (_row, index) => String(index),
    id: 'fill-dataGrid-cost',
    meta: { accessibleName: 'Fill data grid' },
    rows,
    columns: [{
      id: 'name',
      width: { kind: 'fill' },
      value(row) {
        valueReads += 1;
        return row.name;
      }
    }],
    state: {
      interaction: {
        kind: 'row', activeRowId: '10000', selection: { mode: 'single', selectedRowId: '10000' },
      }
    },
    onTransition: () => ignoreMessage()
  }), { columns: 80, rows: 20 });

  assert.match(renderFramePlain(frame), /Row 10000/u);
  assert.equal(valueReads, 20);
});

test('large dataGrid retained damage is narrowed to changed visible rows', () => {
  const terminalSize = { columns: 64, rows: 12 };
  const rows = Array.from({ length: 20_000 }, (_value, index) => [`Row ${index}`, index, `metadata ${index}`]);
  const previousElement = dataGrid({
    getRowId: (_row, index) => String(index),
    id: 'large-dataGrid-damage',
    meta: { accessibleName: 'Damage data grid' },
    state: {
      interaction: {
        kind: 'cell',
        activeCell: { rowId: '12000', columnId: 'score-1' },
        selection: {
          mode: 'single', selectedCell: { rowId: '12000', columnId: 'score-1' },
        },
      }
    },
    onTransition: () => ignoreMessage(),
    columns: [
      {
        id: 'name-0', value: (row) => Array.isArray(row) ? row[0] : row, header: 'Name', width: { kind: 'fixed', cells: 16 } },
      {
        id: 'score-1', value: (row) => Array.isArray(row) ? row[1] : undefined, header: 'Score', width: { kind: 'fixed', cells: 8 }, align: 'end' },
      {
        id: 'notes-2', value: (row) => Array.isArray(row) ? row[2] : undefined, header: 'Notes', width: { kind: 'fill' } }
    ],
    rows
  });
  const nextElement = dataGrid({
    getRowId: (_row, index) => String(index),
    id: 'large-dataGrid-damage',
    meta: { accessibleName: 'Damage data grid' },
    state: {
      interaction: {
        kind: 'cell',
        activeCell: { rowId: '12000', columnId: 'notes-2' },
        selection: {
          mode: 'single', selectedCell: { rowId: '12000', columnId: 'notes-2' },
        },
      }
    },
    onTransition: () => ignoreMessage(),
    columns: [
      {
        id: 'name-0', value: (row) => Array.isArray(row) ? row[0] : row, header: 'Name', width: { kind: 'fixed', cells: 16 } },
      {
        id: 'score-1', value: (row) => Array.isArray(row) ? row[1] : undefined, header: 'Score', width: { kind: 'fixed', cells: 8 }, align: 'end' },
      {
        id: 'notes-2', value: (row) => Array.isArray(row) ? row[2] : undefined, header: 'Notes', width: { kind: 'fill' } }
    ],
    rows
  });
  const dirty = dirtyRegionsForRegionChanges(
    renderElementRegions(previousElement, terminalSize),
    renderElementRegions(nextElement, terminalSize)
  );

  assert.deepEqual(dirty?.rects, [
    { row: 7, column: 1, width: 64, height: 1 }
  ]);
  assert.equal(dirty?.rects.some((rect) => rect.width === terminalSize.columns && rect.height === terminalSize.rows), false);
});

test('large sparse canvas retained damage is narrowed to touched cells', () => {
  const terminalSize = { columns: 120, rows: 40 };
  const previousElement = canvas({
    id: 'sparse-canvas-damage',
    label: 'Sparse canvas',
    measurement: {
      minWidth: 0,
      minHeight: 0,
      preferredWidth: terminalSize.columns,
      preferredHeight: terminalSize.rows
    },
    painter({ canvas }) {
      canvas.text(59, 19, [{ text: 'A' }]);
    }
  });
  const nextElement = canvas({
    id: 'sparse-canvas-damage',
    label: 'Sparse canvas',
    measurement: {
      minWidth: 0,
      minHeight: 0,
      preferredWidth: terminalSize.columns,
      preferredHeight: terminalSize.rows
    },
    painter({ canvas }) {
      canvas.text(59, 19, [{ text: 'B' }]);
    }
  });
  const dirty = dirtyRegionsForRegionChanges(
    renderElementRegions(previousElement, terminalSize),
    renderElementRegions(nextElement, terminalSize)
  );

  assert.deepEqual(dirty?.rects, [
    { row: 20, column: 60, width: 1, height: 1 }
  ]);
});

test('sparse frame snapshots retain occupied cells instead of terminal-area storage', () => {
  const measurements = [];
  const frame = renderElementFrame(canvas({
    id: 'sparse-storage',
    label: 'Sparse storage',
    measurement: {
      minWidth: 0,
      minHeight: 0,
      preferredWidth: 400,
      preferredHeight: 200,
    },
    painter({ canvas }) {
      canvas.text(199, 99, [{ text: 'x' }]);
    },
  }), { columns: 400, rows: 200 }, {
    instrumentation: {
      now: () => 0,
      record: () => {},
      recordWork: (measurement) => measurements.push(measurement),
    },
  });

  assert.equal(frame.cells.length, 1);
  assert.equal(
    measurements.find((measurement) => measurement.kind === 'snapshot_cells')?.count,
    1,
  );
});

test('modal viewport backdrops transform occupied cells without materializing empty space', () => {
  const frame = renderElementFrame(overlay([
    canvas({
      id: 'modal-background',
      label: 'Background',
      measurement: { minWidth: 0, minHeight: 0, preferredWidth: 400, preferredHeight: 200 },
      painter({ canvas }) {
        canvas.text(0, 0, [{ text: 'background' }]);
      },
    }),
    dialog({
      id: 'sparse-modal',
      title: 'Modal',
      modal: true,
      focusPolicy: { returnFocus: 'restore' },
      width: 40,
      height: 10,
      slots: { content: text({ content: 'front' }) },
    }),
  ]), { columns: 400, rows: 200 });

  assert.equal(frame.canvasStyle?.bg?.token, 'surface.backdrop');
  assert.ok(frame.cells.length < 2_000, `expected sparse modal frame, received ${String(frame.cells.length)} cells`);
});

test('large tree rendering is bounded by terminal size independently from node count', () => {
  const nodes = [{
    id: 'root',
    label: 'Root',
    kind: 'branch',
    children: Array.from({ length: 50_000 }, (_value, index) => ({ id: `node-${index}`, label: `Node ${index}`, kind: 'leaf' }))
  }];
  const treeState = {
    activeId: 'node-40000',
    selection: { mode: 'single', selectedId: 'node-40000' },
    expandedIds: ['root']
  };
  const source = createTreeSource(nodes);
  const frame = renderElementFrame(tree({
    id: 'large-tree',
    meta: { accessibleName: 'Large tree' },
    view: createTreeView(source, treeState),
    state: treeState,
    onTransition: () => ignoreMessage()
  }), { columns: 40, rows: 10 });

  assert.match(renderFramePlain(frame), /Node 40000/u);
  assert.doesNotMatch(renderFramePlain(frame), /Node 0/u);
  assert.ok(frame.cells.length <= frame.width * frame.height);
  assert.equal((frame.accessibility.root.children?.length ?? 0) <= 10, true);
});

test('retained tree collections avoid recursive flattening on rerender and movement', () => {
  let nodeIdReads = 0;
  const children = Array.from({ length: 50_000 }, (_value, index) => {
    const id = `node-${String(index)}`;
    return {
      get id() {
        nodeIdReads += 1;
        return id;
      },
      label: `Node ${String(index)}`,
      kind: 'leaf'
    };
  });
  const nodes = [{ id: 'root', label: 'Root', kind: 'branch', children }];
  const initial = {
    activeId: 'node-25000',
    selection: { mode: 'single', selectedId: 'node-25000' },
    expandedIds: ['root']
  };
  const source = createTreeSource(nodes);
  const view = createTreeView(source, initial);

  assert.ok(nodeIdReads >= children.length);
  nodeIdReads = 0;
  renderElementFrame(tree({
    id: 'retained-tree',
    meta: { accessibleName: 'Retained tree' },
    view,
    state: initial,
    onTransition: () => ignoreMessage()
  }), { columns: 40, rows: 10 });
  renderElementFrame(tree({
    id: 'retained-tree',
    meta: { accessibleName: 'Retained tree' },
    view,
    state: {
      activeId: 'node-25001',
      selection: { mode: 'single', selectedId: 'node-25001' },
      expandedIds: ['root']
    },
    onTransition: () => ignoreMessage()
  }), { columns: 48, rows: 12 });
  const state = treeReducer(initial, { kind: 'moveActive', delta: 1 }, {
    view,
  });

  assert.equal(state.activeId, 'node-25001');
  assert.ok(nodeIdReads < 500, `expected terminal-size-bounded node reads, received ${String(nodeIdReads)}`);
});

test('collection snapshots copy source membership instead of retaining mutable arrays', () => {
  const values = ['alpha', 'bravo'];
  const rows = [{ name: 'alpha' }, { name: 'bravo' }];
  const listCollection = createListboxCollection(values, (value) => ({ id: value, label: value }));
  const tableCollection = createTableCollection(rows, (row) => row.name);

  values.splice(0, values.length, 'changed');
  rows.splice(0, rows.length, { name: 'changed' });

  assert.deepEqual(listCollection.items.map((item) => item.id), ['alpha', 'bravo']);
  assert.deepEqual(tableCollection.items.map((item) => item.id), ['alpha', 'bravo']);
});

test('searchPicker filtering returns bounded windows for large entry sets', () => {
  const entries = Array.from({ length: 20_000 }, (_value, index) => ({
    id: `entry-${index}`,
    label: `Entry ${index}`,
    value: index,
    keywords: [`tag-${index % 25}`]
  }));
  const frame = renderElementFrame(searchPicker({
    id: 'large-searchPicker',
    meta: { accessibleName: 'Large search' },
    view: {
      input: { text: '19999', cursor: 5 },
      query: { mode: 'fuzzy' },
      activeId: 'entry-19999'
    },
    maxVisible: 5,
    searchPickerIndex: createSearchPickerIndex(entries),
    onTransition: (transition) => transition
  }), { columns: 48, rows: 8 });

  assert.match(renderFramePlain(frame), /Entry 19999/u);
  assert.ok(frame.cells.length <= frame.width * frame.height);
  assert.equal((frame.accessibility.root.children?.length ?? 0) <= 5, true);
});

test('form navigation over many controls items one bounded frame per input', async () => {
  const app = defineTui({
    id: 'large-form-navigation',
    init: () => ({ state: ({ active: 'editing' }) }),
    update: (state, message) => ({ state: { ...state, active: message.kind } }),
    view: (state) => form({ slots: { content: [
      ...Array.from({ length: 25 }, (_value, index) => textInput({
        id: `field-${index}`,
        meta: { accessibleName: `Field ${String(index + 1)}` },
        state: { value: state.active, cursor: 0 },
        onTransition: () => ignoreMessage(),
        onSubmit: () => ({ kind: `field-${index}` })
      })),
      button({ id: 'done', label: 'Done', onPress: () => ({ kind: 'done' }) })
    ] }, id: 'many-fields', title: 'Many fields' })
  });
  const host = createMemoryTerminalHost({ terminalSize: { columns: 32, rows: 12 } });
  const runtime = createTuiRuntime({ app, host });

  await runtime.start();
  for (let index = 0; index < 20; index += 1) {
    await runtime.handleInput({ kind: 'key', key: 'tab', modifiers: { ctrl: false, alt: false, shift: false, meta: false }, eventType: 'press', location: 'standard' });
  }

  assert.equal(host.frames().length, 21);
  assert.ok(host.frames().every((frame) => frame.cells.length <= frame.width * frame.height));
});

test('mixed subscription bursts remain source-bounded and input costs one immediate commit', async () => {
  const sourceCount = 4;
  const emissionsPerSource = 100;
  const app = defineTui({
    id: 'mixed-source-workspace',
    init: () => ({ state: ({ latest: {}, inputCount: 0 }) }),
    update: (state, message) => message.kind === 'input'
      ? { state: { ...state, inputCount: state.inputCount + 1 } }
      : { state: { ...state, latest: { ...state.latest, [message.source]: message.value } } },
    subscriptions: () => Array.from({ length: sourceCount }, (_value, source) => ({
      id: `source-${String(source)}`,
      generation: 0,
      channel: { capacity: 8, cadenceMs: 10 },
      async run(_context, sink) {
        for (let value = 0; value < emissionsPerSource; value += 1) {
          await sink.emit({
            kind: 'replaceable',
            key: 'latest',
            message: { kind: 'source', source, value }
          });
        }
      }
    })),
    view: (state) => text({
      id: 'mixed-source-state',
      content: `${Object.values(state.latest).join(',')}|${String(state.inputCount)}`
    })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 40, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  await waitUntil(() => Object.keys(runtime.state().latest).length === sourceCount);
  const beforeInput = runtime.metrics();
  await runtime.dispatch({ kind: 'input' });
  const afterInput = runtime.metrics();

  assert.equal(runtime.state().inputCount, 1);
  assert.equal(afterInput.sources.replaceableAdmissions, sourceCount * emissionsPerSource);
  assert.equal(afterInput.sources.replacements, sourceCount * (emissionsPerSource - 1));
  assert.equal(afterInput.sources.dispatchedMessages, sourceCount);
  assert.equal(afterInput.frameCommits <= sourceCount + 2, true);
  assert.equal(afterInput.frameCommits, beforeInput.frameCommits + 1);
  await runtime.dispose();
});

test('custom canvas render stays bounded even when painters write outside the terminal size', () => {
  const frame = renderElementFrame(canvas({
    id: 'stress-canvas',
    measurement: {
      minWidth: 0,
      minHeight: 0,
      preferredWidth: 32,
      preferredHeight: 8
    },
    decorative: true,
    painter({ canvas, bounds }) {
      for (let row = -20; row < bounds.height + 20; row += 1) {
        canvas.line(-20, row, bounds.width + 180, row, { text: 'x' });
      }
    }
  }), { columns: 32, rows: 8 });

  assert.ok(frame.cells.length <= frame.width * frame.height);
  assert.equal(renderFramePlain(frame).split('\n').length, 8);
});

test('text area projection cost remains subquadratic for large decoration sets', () => {
  const count = 8_000;
  const source = 'x'.repeat(count);
  const decorations = Array.from({ length: count }, (_value, index) => ({
    kind: 'style',
    startOffset: index,
    endOffsetExclusive: index + 1,
    order: index,
    label: `decoration.${String(index)}`,
    style: { bold: index % 2 === 0 },
  }));
  const started = performance.now();
  const projection = createTextAreaProjection(
    createTextDocument(source),
    decorations,
    defaultTextWidthProfile,
  );
  const durationMs = performance.now() - started;

  assert.equal(projection.accessibilityText(), source);
  assert.equal(projection.styleRanges.length, count);
  assert.ok(durationMs < 4_000, `projection took ${durationMs.toFixed(1)}ms`);

  const graphemeCount = 4_000;
  const complexSource = 'e\u0301'.repeat(graphemeCount);
  const complexDocument = createTextDocument(complexSource);
  const complexDecorations = Array.from({ length: graphemeCount }, (_value, index) => ({
    kind: 'style',
    startOffset: index * 2,
    endOffsetExclusive: index * 2 + 2,
    label: `complex.${String(index)}`,
    style: { italic: index % 2 === 0 },
  }));
  const componentStarted = performance.now();
  renderElementFrame(textArea({
    id: 'decorated-performance-editor',
    meta: { accessibleName: 'Decorated performance editor' },
    state: { document: complexDocument, caret: textCaretAt(0) },
    decorations: createTextAreaDecorations({
      document: complexDocument,
      decorations: complexDecorations,
    }),
    onTransition: ignoreMessage,
  }), { columns: 80, rows: 2 });
  const componentDurationMs = performance.now() - componentStarted;
  assert.ok(componentDurationMs < 4_000, `component projection took ${componentDurationMs.toFixed(1)}ms`);
});

test('large text area edits retain line geometry instead of rebuilding the document', { timeout: 10_000 }, () => {
  const source = Array.from(
    { length: 20_000 },
    (_value, index) => `line ${String(index).padStart(5, '0')} ${'x'.repeat(25)}`,
  ).join('\n');
  let document = createTextDocument(source);
  const element = () => textArea({
    id: 'incremental-large-editor',
    meta: { accessibleName: 'Incremental large editor' },
    state: { document, caret: textCaretAt(0) },
    onTransition: ignoreMessage,
  });

  renderElementFrame(element(), { columns: 80, rows: 20 });
  document = textDocumentEdit(document, {
    startOffset: 10,
    endOffsetExclusive: 10,
  }, 'z').document;
  const started = performance.now();
  layoutElement(element(), { columns: 80, rows: 20 });
  const durationMs = performance.now() - started;

  assert.ok(durationMs < 750, `incremental text area layout took ${durationMs.toFixed(1)}ms`);
});

test('resize storms skip unchanged terminal sizes and commit each distinct sequential resize', async () => {
  const app = defineTui({
    id: 'resize-bounds',
    init: () => ({ state: ({ label: 'ready' }) }),
    update: (state) => ({ state }),
    view: (state) => text({ content: state.label, id: 'status' })
  });
  const host = createMemoryTerminalHost({ terminalSize: { columns: 20, rows: 4 } });
  const runtime = createTuiRuntime({ app, host });

  await runtime.start();
  for (let index = 0; index < 50; index += 1) {
    await runtime.resize({ columns: 20 + (index % 5), rows: 4 + (index % 3) });
  }

  assert.equal(host.frames().length, 50);
  assert.equal(host.diffs().length, 50);
});

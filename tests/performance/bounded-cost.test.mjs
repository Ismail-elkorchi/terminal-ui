import assert from 'node:assert/strict';
import test from 'node:test';

import { createTuiRuntime, defineTui } from '../../dist/tui/index.js';
import {
  createMemoryTerminalHost } from '../../dist/host/index.js';
import { createInputDecoder } from '../../dist/input/index.js';
import {
  diffFrames,
  renderDiffAnsi,
  renderFramePlain,
  renderElementFrame
} from '../../dist/renderer/index.js';
import { prepareCommandSuggestions } from '../../dist/behavior/index.js';
import { dirtyRegionsForRegionChanges } from '../../dist/renderer/internal/dirty-regions.js';
import { renderElementRegions } from '../../dist/renderer/internal/render.js';
import {
  button,
  canvas,
  commandInput,
  form,
  textInput,
  listbox,
  searchPicker,
  richText,
  logViewer,
  dataGrid,
  dialog,
  table,
  text,
  tree
} from '../../dist/components/index.js';
import { column, overlay } from '../../dist/layout/index.js';
import { ignoreMessage } from '../../dist/component/index.js';
import {
  appendLogHistory,
  appendMeasuredItems,
  listboxReducer,
  measuredWindow,
  prepareSearchPickerIndex,
  prepareLogHistory,
  prepareListboxCollection,
  prepareMeasuredCollection,
  prepareTableCollection,
  prepareTreeSource,
  prepareTreeView,
  replaceMeasuredItem,
  dataGridReducer,
  treeReducer
} from '../../dist/behavior/index.js';
import {
  createTerminalTextIndex,
  editTextBuffer
} from '../../dist/text/index.js';

const outputCapabilities = await createMemoryTerminalHost().getCapabilities();

test('prepared measured collection work is bounded by changes and the visible window', { timeout: 10_000 }, () => {
  const itemCount = 100_000;
  let collection = prepareMeasuredCollection(Array.from({ length: itemCount }, (_value, index) => ({
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

test('prepared word boundaries keep large multilingual lookups bounded', { timeout: 10_000 }, () => {
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
    items,
    projectItem: (item) => ({ id: item, label: item }),
    presentation: {
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

test('prepared listbox collections retain item preparation across renders and actions', () => {
  let projectorCalls = 0;
  const values = Array.from({ length: 50_000 }, (_value, index) => `Item ${String(index)}`);
  const collection = prepareListboxCollection(values, (value, index) => {
    projectorCalls += 1;
    return { id: String(index), label: value };
  });

  assert.equal(projectorCalls, values.length);
  projectorCalls = 0;
  renderElementFrame(listbox({
    id: 'retained-listbox',
    collection,
    presentation: { activeId: '25000', selection: { mode: 'single', selectedId: '25000' } },
    onTransition: () => ignoreMessage()
  }), { columns: 32, rows: 10 });
  renderElementFrame(listbox({
    id: 'retained-listbox',
    collection,
    presentation: { activeId: '25001', selection: { mode: 'single', selectedId: '25001' } },
    onTransition: () => ignoreMessage()
  }), { columns: 40, rows: 12 });
  const state = listboxReducer(
    { activeId: '25000', selection: { mode: 'single', selectedId: '25000' } },
    { kind: 'moveActive', delta: 1 },
    { collection }
  );

  assert.equal(state.activeId, '25001');
  assert.equal(projectorCalls, 0);
});

test('windowed listbox collections project only supplied rows while preserving global scope', () => {
  let projectorCalls = 0;
  const start = 40_000;
  const values = Array.from({ length: 10 }, (_value, offset) => `Item ${String(start + offset)}`);
  const collection = prepareListboxCollection(values, (value, index) => {
    projectorCalls += 1;
    return { id: String(index), label: value };
  }, { startIndex: start, totalCount: 50_000, domain: { kind: 'source' } });
  const frame = renderElementFrame(listbox({
    id: 'windowed-listbox',
    collection,
    presentation: {
      activeId: '40004',
      selection: { mode: 'single', selectedId: '40004' }
    },
    onTransition: () => ignoreMessage()
  }), { columns: 32, rows: 5 });

  assert.equal(projectorCalls, 10);
  assert.match(renderFramePlain(frame), /Item 40004/u);
  assert.equal(frame.accessibility.root.description, 'Showing 40003-40007 of 50000 items.');
});

test('command suggestions retain only a supplied window while preserving global accessibility', () => {
  const start = 40_000;
  const suggestions = prepareCommandSuggestions(
    Array.from({ length: 8 }, (_value, offset) => ({
      id: `command-${String(start + offset)}`,
      label: `Command ${String(start + offset)}`,
      completion: {
        range: { startOffset: 0, endOffsetExclusive: 0 },
        text: `command-${String(start + offset)}`
      },
    })),
    { startIndex: start, totalCount: 100_000, domain: { kind: 'source' } },
  );
  const frame = renderElementFrame(commandInput({
    id: 'windowed-command',
    display: 'expanded',
    maxVisibleSuggestions: 8,
    presentation: {
      value: '',
      cursor: 0,
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
  const history = prepareLogHistory(items);
  const frame = renderElementFrame(logViewer({ id: 'large-log-viewer', history }), { columns: 48, rows: 12 });
  const output = renderFramePlain(frame);

  assert.match(output, /Line 99999/u);
  assert.doesNotMatch(output, /Line 0/u);
  assert.ok(frame.cells.length <= frame.width * frame.height);
  assert.equal(frame.accessibility.root.children?.length, 12);
  assert.equal(frame.accessibility.root.description, 'Showing 99989-100000 of 100000 log rows. Omitted before: 99988. Omitted after: 0. Follow tail: true.');
});

test('prepared log history pays source normalization once and rendering does not reread entries', () => {
  let textReads = 0;
  const items = Array.from({ length: 20_000 }, (_value, index) => ({
    id: `line-${String(index)}`,
    get text() {
      textReads += 1;
      return `Line ${String(index)}`;
    }
  }));

  const history = prepareLogHistory(items);
  assert.equal(textReads, items.length);
  textReads = 0;
  renderElementFrame(logViewer({ id: 'bounded-history', history }), { columns: 48, rows: 12 });
  renderElementFrame(logViewer({ id: 'bounded-history', history }), { columns: 64, rows: 16 });

  assert.equal(textReads, 0);
});

test('small local frame updates produce bounded render diffs', () => {
  const previous = renderElementFrame(textInput({
    id: 'field',
    presentation: { value: 'alpha', cursor: 0 },
    onAction: () => ignoreMessage()
  }), { columns: 24, rows: 3 });
  const next = renderElementFrame(textInput({
    id: 'field',
    presentation: { value: 'alpha!', cursor: 0 },
    onAction: () => ignoreMessage()
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
      prompt: '?',
      presentation: { value: 'fil', cursor: 0, open: true, suggestions: prepareCommandSuggestions([
        { id: 'file', completion: { range: { startOffset: 0, endOffsetExclusive: 3 }, text: 'file' }, label: 'file' },
        { id: 'filter', completion: { range: { startOffset: 0, endOffsetExclusive: 3 }, text: 'filter' }, label: 'filter' }
      ]), activeSuggestionId: 'file' },
      onTransition: (transition) => transition
    }),
    table({
    getRowId: (_row, index) => String(index),
    id: 'summary',
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
      history: prepareLogHistory(Array.from({ length: 1_000 }, (_value, index) => ({ id: `event-${index}`, text: `Event ${index}` })))
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
  const beforeHistory = prepareLogHistory(beforeItems);
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
    presentation: {
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

test('prepared dataGrid collections retain row identity across renders and reducer actions', () => {
  let rowIdCalls = 0;
  const rows = Array.from({ length: 100_000 }, (_value, index) => ({ name: `Row ${String(index)}` }));
  const collection = prepareTableCollection(rows, (_row, index) => {
    rowIdCalls += 1;
    return String(index);
  });

  assert.equal(rowIdCalls, rows.length);
  rowIdCalls = 0;
  const columns = [{ id: 'name', value: (row) => row.name, width: { kind: 'fill' } }];
  renderElementFrame(dataGrid({
    id: 'retained-dataGrid',
    collection,
    columns,
    presentation: {
      interaction: {
        kind: 'row', activeRowId: '50000', selection: { mode: 'single', selectedRowId: '50000' },
      }
    },
    onTransition: () => ignoreMessage()
  }), { columns: 48, rows: 12 });
  renderElementFrame(dataGrid({
    id: 'retained-dataGrid',
    collection,
    columns,
    presentation: {
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

test('windowed dataGrid collections identify only supplied records and keep global row positions', () => {
  let rowIdCalls = 0;
  const start = 70_000;
  const rows = Array.from({ length: 12 }, (_value, offset) => ({ name: `Row ${String(start + offset)}` }));
  const collection = prepareTableCollection(rows, (_row, index) => {
    rowIdCalls += 1;
    return String(index);
  }, { startIndex: start, totalCount: 100_000, domain: { kind: 'source' } });
  const frame = renderElementFrame(dataGrid({
    id: 'windowed-dataGrid',
    collection,
    columns: [{ id: 'name', header: 'Name', value: (row) => row.name, width: { kind: 'fill' } }],
    presentation: {
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
    rows,
    columns: [{
      id: 'name',
      width: { kind: 'fill' },
      value(row) {
        valueReads += 1;
        return row.name;
      }
    }],
    presentation: {
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
    presentation: {
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
    presentation: {
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
  const presentation = {
    activeId: 'node-40000',
    selection: { mode: 'single', selectedId: 'node-40000' },
    expandedIds: ['root']
  };
  const source = prepareTreeSource(nodes);
  const frame = renderElementFrame(tree({
    id: 'large-tree',
    view: prepareTreeView(source, presentation),
    presentation,
    onTransition: () => ignoreMessage()
  }), { columns: 40, rows: 10 });

  assert.match(renderFramePlain(frame), /Node 40000/u);
  assert.doesNotMatch(renderFramePlain(frame), /Node 0/u);
  assert.ok(frame.cells.length <= frame.width * frame.height);
  assert.equal((frame.accessibility.root.children?.length ?? 0) <= 10, true);
});

test('prepared tree collections avoid recursive flattening on rerender and movement', () => {
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
  const source = prepareTreeSource(nodes);
  const view = prepareTreeView(source, initial);

  assert.ok(nodeIdReads >= children.length);
  nodeIdReads = 0;
  renderElementFrame(tree({
    id: 'retained-tree',
    view,
    presentation: initial,
    onTransition: () => ignoreMessage()
  }), { columns: 40, rows: 10 });
  renderElementFrame(tree({
    id: 'retained-tree',
    view,
    presentation: {
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

test('prepared collections snapshot source membership instead of retaining mutable arrays', () => {
  const values = ['alpha', 'bravo'];
  const rows = [{ name: 'alpha' }, { name: 'bravo' }];
  const listCollection = prepareListboxCollection(values, (value) => ({ id: value, label: value }));
  const tableCollection = prepareTableCollection(rows, (row) => row.name);

  values.splice(0, values.length, 'changed');
  rows.splice(0, rows.length, { name: 'changed' });

  assert.deepEqual(listCollection.records.map((record) => record.id), ['alpha', 'bravo']);
  assert.deepEqual(tableCollection.records.map((record) => record.id), ['alpha', 'bravo']);
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
    presentation: {
      query: { text: '19999', mode: 'fuzzy' },
      activeId: 'entry-19999'
    },
    maxVisible: 5,
    searchPickerIndex: prepareSearchPickerIndex(entries),
    onTransition: (transition) => transition
  }), { columns: 48, rows: 8 });

  assert.match(renderFramePlain(frame), /Entry 19999/u);
  assert.ok(frame.cells.length <= frame.width * frame.height);
  assert.equal((frame.accessibility.root.children?.length ?? 0) <= 5, true);
});

test('form navigation over many controls records one bounded frame per input', async () => {
  const app = defineTui({
    id: 'large-form-navigation',
    init: () => ({ active: 'editing' }),
    update: (state, message) => ({ state: { ...state, active: message.kind } }),
    view: (state) => form({ slots: { content: [
      ...Array.from({ length: 25 }, (_value, index) => textInput({
        id: `field-${index}`,
        presentation: { value: state.active, cursor: 0 },
        onAction: (action) => action.kind === 'submit'
          ? { kind: `field-${index}` }
          : ignoreMessage()
      })),
      button({ id: 'done', label: 'Done', onAction: () => ({ kind: 'done' }) })
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

test('resize storms skip unchanged terminal sizes and commit each distinct sequential resize', async () => {
  const app = defineTui({
    id: 'resize-bounds',
    init: () => ({ label: 'ready' }),
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

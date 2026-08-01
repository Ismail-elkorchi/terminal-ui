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
import { dirtyRegionsForRegionChanges } from '../../dist/renderer/internal/dirty-regions.js';
import { renderElementRegions } from '../../dist/renderer/internal/render.js';
import {
  button,
  canvas,
  commandInput,
  form,
  textInput,
  list,
  searchPicker,
  richText,
  logViewer,
  table,
  text,
  tree
} from '../../dist/components/index.js';
import { column } from '../../dist/layout/index.js';
import {
  appendLogHistory,
  listReducer,
  prepareSearchPickerIndex,
  prepareLogHistory,
  prepareListCollection,
  prepareTableCollection,
  prepareTreeCollection,
  tableReducer,
  treeReducer
} from '../../dist/behavior/index.js';
import {
  createTerminalTextIndex,
  editTextBuffer
} from '../../dist/text/index.js';

const outputCapabilities = await createMemoryTerminalHost().getCapabilities();

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
  const decoder = createInputDecoder();
  const payload = `${'\u001B[200~'}${'x'.repeat(10_000)}${'\u001B[201~'}`;
  const { events } = decoder.decode({ data: payload });

  assert.equal(events.length, 1);
  assert.equal(events[0]?.kind, 'paste');
  assert.equal(events[0]?.text.length, 10_000);
});

test('large list rendering is bounded by terminal size, not collection size', () => {
  const items = Array.from({ length: 50_000 }, (_value, index) => `Item ${index}`);
  const frame = renderElementFrame(list({
    id: 'large-list',
    items,
    projectItem: (item) => ({ id: item, label: item }),
    selectedId: 'Item 40000'
  }), { columns: 32, rows: 10 });
  const output = renderFramePlain(frame);

  assert.match(output, /Item 40000/u);
  assert.doesNotMatch(output, /Item 0/u);
  assert.ok(frame.cells.length <= frame.width * frame.height);
  assert.equal(frame.accessibility.root.children?.length, 10);
  assert.equal(frame.accessibility.root.description, 'Showing 39996-40005 of 50000 items.');
});

test('prepared list collections retain item preparation across renders and actions', () => {
  let projectorCalls = 0;
  const values = Array.from({ length: 50_000 }, (_value, index) => `Item ${String(index)}`);
  const collection = prepareListCollection(values, (value, index) => {
    projectorCalls += 1;
    return { id: String(index), label: value };
  });

  assert.equal(projectorCalls, values.length);
  projectorCalls = 0;
  renderElementFrame(list({ id: 'retained-list', collection, selectedId: '25000' }), { columns: 32, rows: 10 });
  renderElementFrame(list({ id: 'retained-list', collection, selectedId: '25001' }), { columns: 40, rows: 12 });
  const state = listReducer({ selectedId: '25000' }, { kind: 'move', delta: 1 }, { collection });

  assert.equal(state.selectedId, '25001');
  assert.equal(projectorCalls, 0);
});

test('windowed list collections project only supplied rows while preserving global scope', () => {
  let projectorCalls = 0;
  const start = 40_000;
  const values = Array.from({ length: 10 }, (_value, offset) => `Item ${String(start + offset)}`);
  const collection = prepareListCollection(values, (value, index) => {
    projectorCalls += 1;
    return { id: String(index), label: value };
  }, { startIndex: start, totalCount: 50_000, domain: { kind: 'source' } });
  const frame = renderElementFrame(list({
    id: 'windowed-list',
    collection,
    selectedId: '40004'
  }), { columns: 32, rows: 5 });

  assert.equal(projectorCalls, 10);
  assert.match(renderFramePlain(frame), /Item 40004/u);
  assert.equal(frame.accessibility.root.description, 'Showing 40003-40007 of 50000 items.');
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
    onSubmit: () => undefined
  }), { columns: 24, rows: 3 });
  const next = renderElementFrame(textInput({
    id: 'field',
    presentation: { value: 'alpha!', cursor: 0 },
    onSubmit: () => undefined
  }), { columns: 24, rows: 3 });
  const diff = diffFrames(previous, next);

  assert.equal(diff.fullRewrite, false);
  assert.ok(diff.operations.length > 0);
  assert.ok(diff.operations.length < previous.width * previous.height);
});

test('terminal output planning does not exceed absolute-addressed literal-clear output', () => {
  const diff = {
    schemaVersion: 'terminal-ui.render-diff.v3',
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
      presentation: { value: 'fil', cursor: 0, suggestions: [
        { value: 'file', label: 'file' },
        { value: 'filter', label: 'filter' }
      ], selectedSuggestionIndex: 0 },
      onAction: (action) => action,
      onSubmit: (value) => value
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

test('large table rendering is bounded by terminal size independently from row count', () => {
  const frame = renderElementFrame(table({
    getRowId: (_row, index) => String(index),
    id: 'large-table',
    presentation: { selectedCell: { rowId: '42000', columnIndex: 1 } },
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

test('prepared table collections retain row identity across renders and reducer actions', () => {
  let rowIdCalls = 0;
  const rows = Array.from({ length: 100_000 }, (_value, index) => ({ name: `Row ${String(index)}` }));
  const collection = prepareTableCollection(rows, (_row, index) => {
    rowIdCalls += 1;
    return String(index);
  });

  assert.equal(rowIdCalls, rows.length);
  rowIdCalls = 0;
  const columns = [{ id: 'name', value: (row) => row.name, width: { kind: 'fill' } }];
  renderElementFrame(table({ id: 'retained-table', collection, columns, presentation: { selectedRowId: '50000' } }), { columns: 48, rows: 12 });
  renderElementFrame(table({ id: 'retained-table', collection, columns, presentation: { selectedRowId: '50001' } }), { columns: 64, rows: 16 });
  const state = tableReducer({ selectedRowId: '50000' }, { kind: 'moveRow', delta: 1 }, { collection, columnCount: 1 });

  assert.equal(state.selectedRowId, '50001');
  assert.equal(rowIdCalls, 0);
});

test('windowed table collections identify only supplied records and keep global row positions', () => {
  let rowIdCalls = 0;
  const start = 70_000;
  const rows = Array.from({ length: 12 }, (_value, offset) => ({ name: `Row ${String(start + offset)}` }));
  const collection = prepareTableCollection(rows, (_row, index) => {
    rowIdCalls += 1;
    return String(index);
  }, { startIndex: start, totalCount: 100_000, domain: { kind: 'source' } });
  const frame = renderElementFrame(table({
    id: 'windowed-table',
    collection,
    columns: [{ id: 'name', header: 'Name', value: (row) => row.name, width: { kind: 'fill' } }],
    presentation: { selectedRowId: '70005' }
  }), { columns: 40, rows: 7 });

  assert.equal(rowIdCalls, 12);
  assert.match(renderFramePlain(frame), /Row 70005/u);
  assert.equal(frame.accessibility.root.window?.totalCount, 100_000);
  assert.equal(frame.accessibility.root.children?.[1]?.position?.rowIndex, 70_004);
});

test('fill-width tables do not scan offscreen row values for intrinsic measurement', () => {
  let valueReads = 0;
  const rows = Array.from({ length: 20_000 }, (_value, index) => ({ name: `Row ${String(index)}` }));
  const frame = renderElementFrame(table({
    getRowId: (_row, index) => String(index),
    id: 'fill-table-cost',
    rows,
    columns: [{
      id: 'name',
      width: { kind: 'fill' },
      value(row) {
        valueReads += 1;
        return row.name;
      }
    }],
    presentation: { selectedRowId: '10000' }
  }), { columns: 80, rows: 20 });

  assert.match(renderFramePlain(frame), /Row 10000/u);
  assert.ok(valueReads <= 40, `expected terminal-size-bounded value reads, received ${String(valueReads)}`);
});

test('large table retained damage is narrowed to changed visible rows', () => {
  const terminalSize = { columns: 64, rows: 12 };
  const rows = Array.from({ length: 20_000 }, (_value, index) => [`Row ${index}`, index, `metadata ${index}`]);
  const previousElement = table({
    getRowId: (_row, index) => String(index),
    id: 'large-table-damage',
    presentation: { selectedCell: { rowId: '12000', columnIndex: 1 } },
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
  const nextElement = table({
    getRowId: (_row, index) => String(index),
    id: 'large-table-damage',
    presentation: { selectedCell: { rowId: '12000', columnIndex: 2 } },
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

test('large tree rendering is bounded by terminal size independently from node count', () => {
  const frame = renderElementFrame(tree({
    id: 'large-tree',
    selected: 'node-40000',
    nodes: [{
      id: 'root',
      label: 'Root',
      kind: 'branch',
      expanded: true,
      children: Array.from({ length: 50_000 }, (_value, index) => ({ id: `node-${index}`, label: `Node ${index}`, kind: 'leaf' }))
    }]
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
  const nodes = [{ id: 'root', label: 'Root', kind: 'branch', expanded: true, children }];
  const collection = prepareTreeCollection(nodes);

  assert.ok(nodeIdReads >= children.length);
  nodeIdReads = 0;
  renderElementFrame(tree({ id: 'retained-tree', collection, selected: 'node-25000' }), { columns: 40, rows: 10 });
  renderElementFrame(tree({ id: 'retained-tree', collection, selected: 'node-25001' }), { columns: 48, rows: 12 });
  const state = treeReducer({ nodes, selected: 'node-25000' }, { kind: 'move', delta: 1 }, { collection });

  assert.equal(state.selected, 'node-25001');
  assert.ok(nodeIdReads < 500, `expected terminal-size-bounded node reads, received ${String(nodeIdReads)}`);
});

test('prepared collections snapshot source membership instead of retaining mutable arrays', () => {
  const values = ['alpha', 'bravo'];
  const rows = [{ name: 'alpha' }, { name: 'bravo' }];
  const listCollection = prepareListCollection(values, (value) => ({ id: value, label: value }));
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
    query: '19999',
    selectedId: 'entry-19999',
    maxVisible: 5,
    searchPickerIndex: prepareSearchPickerIndex(entries),
    onAction: (action) => action
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
    view: (state) => form([
      ...Array.from({ length: 25 }, (_value, index) => textInput({
        id: `field-${index}`,
        presentation: { value: state.active, cursor: 0 },
        onSubmit: () => ({ kind: `field-${index}` })
      })),
      button({ id: 'done', label: 'Done', onPress: () => ({ kind: 'done' }) })
    ], { id: 'many-fields', title: 'Many fields' })
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
    meta: { accessibility: { decorative: true } },
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
    view: (state) => text(state.label, { id: 'status' })
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

import assert from 'node:assert/strict';
import test from 'node:test';

import { createMemoryTerminalHost } from '../../dist/host/index.js';
import { createInputDecoder } from '../../dist/input/index.js';
import { createTuiRuntime, defineTui, diffFrames, renderFrame, renderWidgetFrame } from '../../dist/tui/index.js';
import {
  button,
  canvas,
  commandBar,
  form,
  inputField,
  list,
  palette,
  richText,
  scrollback,
  stack,
  table,
  text,
  textInput,
  tree
} from '../../dist/widgets/index.js';

test('paste bursts decode as one paste event instead of per-character key churn', () => {
  const decoder = createInputDecoder();
  const payload = `${'\u001B[200~'}${'x'.repeat(10_000)}${'\u001B[201~'}`;
  const events = decoder.decode({ data: payload });

  assert.equal(events.length, 1);
  assert.equal(events[0]?.kind, 'paste');
  assert.equal(events[0]?.text.length, 10_000);
});

test('large list rendering is bounded by viewport size, not collection size', () => {
  const items = Array.from({ length: 50_000 }, (_value, index) => `Item ${index}`);
  const frame = renderWidgetFrame(list({ id: 'large-list', items, selected: 40_000 }), { columns: 32, rows: 10 });
  const output = renderFrame(frame);

  assert.match(output, /Item 40000/u);
  assert.doesNotMatch(output, /Item 0/u);
  assert.ok(frame.cells.length <= frame.width * frame.height);
  assert.equal(frame.accessibility.root.children?.length, 10);
  assert.equal(frame.accessibility.root.description, 'Showing 39996-40005 of 50000 items.');
});

test('large scrollback rendering is bounded by viewport size, not collection size', () => {
  const items = Array.from({ length: 100_000 }, (_value, index) => ({ id: `line-${index}`, text: `Line ${index}` }));
  const frame = renderWidgetFrame(scrollback({ id: 'large-scrollback', items }), { columns: 48, rows: 12 });
  const output = renderFrame(frame);

  assert.match(output, /Line 99999/u);
  assert.doesNotMatch(output, /Line 0/u);
  assert.ok(frame.cells.length <= frame.width * frame.height);
  assert.equal(frame.accessibility.root.children?.length, 12);
  assert.equal(frame.accessibility.root.description, 'Showing 99989-100000 of 100000 scrollback rows. Omitted before: 99988. Omitted after: 0.');
});

test('small local frame updates produce bounded render diffs', () => {
  const previous = renderWidgetFrame(inputField({ id: 'field', value: 'alpha' }), { columns: 24, rows: 3 });
  const next = renderWidgetFrame(inputField({ id: 'field', value: 'alpha!' }), { columns: 24, rows: 3 });
  const diff = diffFrames(previous, next);

  assert.equal(diff.fullRewrite, false);
  assert.ok(diff.operations.length > 0);
  assert.ok(diff.operations.length < previous.width * previous.height);
});

test('full frame render stays bounded by viewport for mixed widget trees', () => {
  const frame = renderWidgetFrame(stack([
    commandBar({
      id: 'search',
      prompt: '?',
      value: 'fil',
      suggestions: [
        { value: 'file', label: 'file' },
        { value: 'filter', label: 'filter' }
      ],
      selectedSuggestion: 0
    }),
    table({
      id: 'summary',
      columns: [
        { header: 'Name', width: { kind: 'fixed', cells: 12 } },
        { header: 'Value', width: { kind: 'fill' } }
      ],
      rows: Array.from({ length: 1_000 }, (_value, index) => [`Item ${index}`, index])
    }),
    scrollback({
      id: 'events',
      items: Array.from({ length: 1_000 }, (_value, index) => ({ id: `event-${index}`, text: `Event ${index}` }))
    })
  ]), { columns: 60, rows: 16 });

  assert.ok(frame.cells.length <= frame.width * frame.height);
  assert.equal(renderFrame(frame).split('\n').length <= 16, true);
  assert.equal(frame.accessibility.root.children?.length, 3);
});

test('style-only diffs are incremental and preserve visual dimensions', () => {
  const previous = renderWidgetFrame(richText({
    id: 'status',
    segments: [{ text: 'same text', style: { fg: { kind: 'theme', token: 'status.info' } } }]
  }), { columns: 24, rows: 2 });
  const next = renderWidgetFrame(richText({
    id: 'status',
    segments: [{ text: 'same text', style: { fg: { kind: 'theme', token: 'status.error' } } }]
  }), { columns: 24, rows: 2 });
  const diff = diffFrames(previous, next);

  assert.equal(diff.fullRewrite, false);
  assert.ok(diff.operations.length > 0);
  assert.ok(diff.operations.length <= 2);
});

test('append-heavy scrollback diffs stay bounded by visible rows', () => {
  const beforeItems = Array.from({ length: 100_000 }, (_value, index) => ({ id: `line-${index}`, text: `Line ${index}` }));
  const afterItems = [...beforeItems, { id: 'line-100000', text: 'Line 100000' }];
  const previous = renderWidgetFrame(scrollback({ id: 'append-log', items: beforeItems }), { columns: 48, rows: 8 });
  const next = renderWidgetFrame(scrollback({ id: 'append-log', items: afterItems }), { columns: 48, rows: 8 });
  const diff = diffFrames(previous, next);

  assert.match(renderFrame(next), /Line 100000/u);
  assert.doesNotMatch(renderFrame(next), /Line 0/u);
  assert.equal(next.accessibility.root.children?.length, 8);
  assert.ok(diff.operations.length <= 16);
});

test('large table viewport is bounded independently from row count', () => {
  const frame = renderWidgetFrame(table({
    id: 'large-table',
    selectedCell: { row: 42_000, column: 1 },
    columns: [
      { header: 'Name', width: { kind: 'fixed', cells: 16 } },
      { header: 'Score', width: { kind: 'fixed', cells: 8 }, align: 'end' },
      { header: 'Notes', width: { kind: 'fill' } }
    ],
    rows: Array.from({ length: 50_000 }, (_value, index) => [`Row ${index}`, index, `metadata ${index}`])
  }), { columns: 64, rows: 12 });

  assert.match(renderFrame(frame), /Row 42000/u);
  assert.doesNotMatch(renderFrame(frame), /Row 0/u);
  assert.ok(frame.cells.length <= frame.width * frame.height);
  assert.equal((frame.accessibility.root.children?.length ?? 0) <= 12, true);
});

test('large tree viewport is bounded independently from node count', () => {
  const frame = renderWidgetFrame(tree({
    id: 'large-tree',
    selected: 'node-40000',
    nodes: [{
      id: 'root',
      label: 'Root',
      expanded: true,
      children: Array.from({ length: 50_000 }, (_value, index) => ({ id: `node-${index}`, label: `Node ${index}` }))
    }]
  }), { columns: 40, rows: 10 });

  assert.match(renderFrame(frame), /Node 40000/u);
  assert.doesNotMatch(renderFrame(frame), /Node 0/u);
  assert.ok(frame.cells.length <= frame.width * frame.height);
  assert.equal((frame.accessibility.root.children?.length ?? 0) <= 10, true);
});

test('palette filtering returns bounded windows for large entry sets', () => {
  const entries = Array.from({ length: 20_000 }, (_value, index) => ({
    id: `entry-${index}`,
    label: `Entry ${index}`,
    value: index,
    keywords: [`tag-${index % 25}`]
  }));
  const frame = renderWidgetFrame(palette({
    id: 'large-palette',
    query: '19999',
    selectedId: 'entry-19999',
    maxVisible: 5,
    entries
  }), { columns: 48, rows: 8 });

  assert.match(renderFrame(frame), /Entry 19999/u);
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
        value: state.active,
        keyMap: { enter: { kind: `field-${index}` } }
      })),
      button({ id: 'done', label: 'Done', message: { kind: 'done' } })
    ], { id: 'many-fields', title: 'Many fields' })
  });
  const host = createMemoryTerminalHost({ viewport: { columns: 32, rows: 12 } });
  const runtime = createTuiRuntime({ app, host });

  await runtime.start();
  for (let index = 0; index < 20; index += 1) {
    await runtime.handleInput({ kind: 'key', key: 'tab', ctrl: false, alt: false, shift: false, meta: false });
  }

  assert.equal(host.frames().length, 21);
  assert.ok(host.frames().every((frame) => frame.cells.length <= frame.width * frame.height));
});

test('custom canvas render stays bounded even when painters write outside the viewport', () => {
  const frame = renderWidgetFrame(canvas({
    id: 'stress-canvas',
    painter({ buffer, bounds }) {
      for (let row = bounds.row - 20; row < bounds.row + bounds.height + 20; row += 1) {
        buffer.write(row, bounds.column - 20, [{ text: `${'x'.repeat(200)}🙂` }]);
      }
    }
  }), { columns: 32, rows: 8 });

  assert.ok(frame.cells.length <= frame.width * frame.height);
  assert.equal(renderFrame(frame).split('\n').length, 8);
});

test('resize storms commit one frame per resize without hidden unbounded loops', async () => {
  const app = defineTui({
    id: 'resize-bounds',
    init: () => ({ label: 'ready' }),
    update: (state) => ({ state }),
    view: (state) => text(state.label, { id: 'status' })
  });
  const host = createMemoryTerminalHost({ viewport: { columns: 20, rows: 4 } });
  const runtime = createTuiRuntime({ app, host });

  await runtime.start();
  for (let index = 0; index < 50; index += 1) {
    await runtime.resize({ columns: 20 + (index % 5), rows: 4 + (index % 3) });
  }

  assert.equal(host.frames().length, 51);
  assert.equal(host.diffs().length, 51);
});

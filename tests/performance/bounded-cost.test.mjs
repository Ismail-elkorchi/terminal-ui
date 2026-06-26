import assert from 'node:assert/strict';
import test from 'node:test';

import { createMemoryTerminalHost } from '../../dist/host/index.js';
import { createInputDecoder } from '../../dist/input/index.js';
import { createTuiRuntime, defineTui, diffFrames, renderFrame, renderWidgetFrame } from '../../dist/tui/index.js';
import { inputField, list, scrollback, text } from '../../dist/widgets/index.js';

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

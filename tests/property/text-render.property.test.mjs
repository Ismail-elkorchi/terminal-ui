import assert from 'node:assert/strict';
import test from 'node:test';

import { clipTextCells, measureTextCells, sanitizeTerminalText, segmentGraphemes, wrapTextCells } from '../../dist/text/index.js';
import {
  createFrameBuffer,
  createScrollState,
  createTuiRuntime,
  defineTui,
  diffFrames,
  layoutWidget,
  renderDiffWithOptions,
  renderFrame,
  renderWidgetFrame,
  scrollReducer,
  visibleWindowFromScroll
} from '../../dist/tui/index.js';
import { createMemoryTerminalHost } from '../../dist/host/index.js';
import { inputField, row, stack, text } from '../../dist/widgets/index.js';
import { terminalFixtures } from '../fixtures/catalog.mjs';

const textFixtures = terminalFixtures
  .map((fixture) => fixture.data.text)
  .filter((value) => typeof value === 'string');

test('text property checks keep sanitization, segmentation, clipping, and wrapping bounded', () => {
  for (const value of textFixtures) {
    const sanitized = sanitizeTerminalText(value);
    const metrics = measureTextCells(value);
    const clipped = clipTextCells(value, 6, { ellipsis: '…' });
    const wrapped = wrapTextCells(value.length === 0 ? 'x' : value, 8);

    assert.equal(metrics.text, sanitized.text);
    assert.equal(metrics.cells, metrics.graphemes.reduce((sum, segment) => sum + segment.cells, 0));
    assert.equal(segmentGraphemes(sanitized.text).map((segment) => segment.text).join(''), sanitized.text);
    assert.ok(clipped.cells <= 6);
    assert.ok(wrapped.every((line) => line.cells <= 8));
    assert.doesNotMatch(sanitized.text, /\u001B\[/u);
  }
});

test('render diff property checks keep unchanged frames empty and local changes incremental', () => {
  for (const value of textFixtures) {
    const before = renderWidgetFrame(text(value), { columns: 20, rows: 3 });
    const same = diffFrames(before, before);
    const after = renderWidgetFrame(text(`${value} changed`), { columns: 20, rows: 3 });
    const changed = diffFrames(before, after);

    assert.equal(renderFrame(before).includes('\u001B'), false);
    assert.equal(same.fullRewrite, false);
    assert.equal(same.operations.length, 0);
    assert.equal(changed.fullRewrite, false);
    assert.ok(changed.operations.length > 0);
  }
});

test('layout and clipping properties keep rendered cells inside the viewport', () => {
  for (const value of generatedTexts(64)) {
    const viewport = viewportFor(value);
    const widget = stack([
      text(value, { id: 'top' }),
      row([
        text(`${value} left`, { id: 'left' }),
        text(`${value} right`, { id: 'right' })
      ], { id: 'row', gap: 1 })
    ], {
      id: 'root',
      gap: 1,
      padding: { top: 1, right: 1, bottom: 1, left: 1 }
    });
    const layout = layoutWidget(widget, viewport);
    const frame = renderWidgetFrame(widget, viewport);

    assertBoundsInsideViewport(layout.bounds, viewport);
    for (const child of layout.children) assertBoundsInsideViewport(child.bounds, viewport);
    for (const cell of frame.cells) {
      assert.equal(cell.row >= 1 && cell.row <= frame.height, true);
      assert.equal(cell.column >= 1 && cell.column <= frame.width, true);
      assert.equal(cell.column + Math.max(1, cell.width) - 1 <= frame.width, true);
    }
  }
});

test('frame buffer overwrite and Unicode properties preserve valid cell topology', () => {
  for (const value of generatedTexts(64)) {
    const buffer = createFrameBuffer(12, 4);
    buffer.write(1, 1, [{ text: `A${value}界` }]);
    buffer.write(1, 2, [{ text: '🙂B' }]);
    buffer.write(2, -3, [{ text: `${value}\u001B[31mred` }]);
    buffer.clear({ row: 3, column: 5, width: 100, height: 1 });
    const frame = buffer.snapshot();

    assertFrameTopology(frame);
    assert.equal(renderFrame(frame).includes('\u001B'), false);
  }
});

test('diff round-trips reproduce the next frame text and keep ANSI serialization safe', () => {
  for (const [index, value] of generatedTexts(32).entries()) {
    const before = renderWidgetFrame(text(value), { columns: 18, rows: 4 });
    const next = renderWidgetFrame(text(`unsafe ${index} ${value} \u001B[31mred`), { columns: 18, rows: 4 });
    const diff = diffFrames(before, next);
    const applied = applyDiffToFrame(before, diff);
    const serialized = renderDiffWithOptions(diff, { capabilities: { colorDepth: 'truecolor', hyperlinks: false } });

    assert.equal(renderFrame(applied), renderFrame(next));
    assert.equal(serialized.includes('unsafe'), true);
    assert.equal(serialized.includes('\u001B[31munsafe'), false);
  }
});

test('scroll window properties keep normalized windows within content bounds', () => {
  for (let index = 0; index < 128; index += 1) {
    const contentRows = (index * 37) % 500;
    const viewportRows = index % 23;
    const state = createScrollState({
      offsetRow: (index * 19) - 50,
      offsetColumn: (index * 11) - 20,
      contentRows,
      contentColumns: (index * 13) % 200,
      viewportRows,
      viewportColumns: index % 17,
      followTail: index % 5 === 0
    });
    const scrolled = scrollReducer(state, { kind: 'scrollPages', rows: index % 7 - 3, columns: index % 5 - 2 });
    const window = visibleWindowFromScroll(scrolled);

    assert.equal(window.start >= 0, true);
    assert.equal(window.end >= window.start, true);
    assert.equal(window.end <= scrolled.contentRows, true);
    assert.equal(window.end - window.start <= Math.max(0, scrolled.viewportRows), true);
  }
});

test('focus traversal properties avoid disabled targets and remain restorable', async () => {
  const app = defineTui({
    id: 'focus-properties',
    init: () => ({ active: 'initial' }),
    update: (state, message) => ({ state: { ...state, active: message.kind } }),
    view: (state) => stack([
      inputField({
        id: 'first',
        value: state.active,
        keyMap: { enter: { kind: 'first' } }
      }),
      inputField({
        id: 'disabled',
        value: state.active,
        focus: { disabled: true },
        keyMap: { enter: { kind: 'disabled' } }
      }),
      inputField({
        id: 'second',
        value: state.active,
        keyMap: { enter: { kind: 'second' } }
      })
    ], { id: 'focus-root' })
  });
  const host = createMemoryTerminalHost({ viewport: { columns: 24, rows: 5 } });
  const runtime = createTuiRuntime({ app, host });

  await runtime.start();
  const next = await runtime.handleInput({ kind: 'key', key: 'tab', ctrl: false, alt: false, shift: false, meta: false });
  const previous = await runtime.handleInput({ kind: 'key', key: 'tab', ctrl: false, alt: false, shift: true, meta: false });

  assert.deepEqual(next.frame.focusPath, ['focus-root', 'second']);
  assert.deepEqual(previous.frame.focusPath, ['focus-root', 'first']);
});

function generatedTexts(count) {
  const seeds = [...textFixtures, '', 'plain', 'wide界text', 'emoji🙂text', 'combining e\u0301', '\u001B[31mred'];
  const output = [];
  let state = 0x12345678;
  while (output.length < count) {
    state = (state * 1664525 + 1013904223) >>> 0;
    const base = seeds[state % seeds.length] ?? '';
    output.push(`${base}${String(state % 997)}`);
  }
  return output;
}

function viewportFor(value) {
  const width = 4 + (value.length % 24);
  const height = 2 + (value.length % 7);
  return { columns: width, rows: height };
}

function assertBoundsInsideViewport(bounds, viewport) {
  assert.equal(bounds.row >= 1, true);
  assert.equal(bounds.column >= 1, true);
  assert.equal(bounds.width >= 0, true);
  assert.equal(bounds.height >= 0, true);
  assert.equal(bounds.column + bounds.width - 1 <= viewport.columns || bounds.width === 0, true);
  assert.equal(bounds.row + bounds.height - 1 <= viewport.rows || bounds.height === 0, true);
}

function assertFrameTopology(frame) {
  const cellsByPosition = new Map(frame.cells.map((cell) => [`${cell.row}:${cell.column}`, cell]));
  for (const cell of frame.cells) {
    assert.equal(cell.row >= 1 && cell.row <= frame.height, true);
    assert.equal(cell.column >= 1 && cell.column <= frame.width, true);
    assert.equal(cell.width >= 0, true);
    if (cell.continuation === true) {
      const previous = cellsByPosition.get(`${cell.row}:${cell.column - 1}`);
      assert.notEqual(previous, undefined);
    }
  }
}

function applyDiffToFrame(frame, diff) {
  const buffer = createFrameBuffer(diff.width, diff.height);
  for (const cell of frame.cells) {
    if (cell.continuation !== true) buffer.writeCell(cell);
  }
  for (const operation of diff.operations) {
    switch (operation.kind) {
      case 'write':
        buffer.write(operation.row, operation.column, operation.spans);
        break;
      case 'clearRect':
        buffer.clear(operation.bounds);
        break;
      case 'clearLine':
        buffer.clear({
          row: operation.row,
          column: operation.fromColumn ?? 1,
          width: diff.width - (operation.fromColumn ?? 1) + 1,
          height: 1
        });
        break;
      case 'moveCursor':
      case 'showCursor':
        break;
    }
  }
  return buffer.snapshot({ accessibility: frame.accessibility });
}

import assert from 'node:assert/strict';
import test from 'node:test';

import { createFrameBuffer, layoutWidget, renderFramePlain, renderWidgetFrame } from '../../dist/tui/index.js';
import { row, stack, text } from '../../dist/widgets/index.js';
import { terminalFixtures } from '../fixtures/catalog.mjs';

const textFixtures = terminalFixtures
  .map((fixture) => fixture.data.text)
  .filter((value) => typeof value === 'string');

test('layout and clipping properties keep rendered cells inside the viewport', () => {
  for (const { index, seed, value } of generatedTexts(64)) {
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
    const detail = `index=${String(index)} seed=${String(seed)} viewport=${JSON.stringify(viewport)} value=${JSON.stringify(value)}`;

    assertBoundsInsideViewport(layout.bounds, viewport, `${detail}: root layout`);
    for (const child of layout.children) assertBoundsInsideViewport(child.bounds, viewport, `${detail}: child layout`);
    for (const cell of frame.cells) assertCellInsideFrame(cell, frame, detail);
  }
});

test('frame buffer overwrite and Unicode properties preserve valid cell topology', () => {
  for (const { index, seed, value } of generatedTexts(64)) {
    const buffer = createFrameBuffer(12, 4);
    buffer.write(1, 1, [{ text: `A${value}界` }]);
    buffer.write(1, 2, [{ text: '🙂B' }]);
    buffer.write(2, -3, [{ text: `${value}\u001B[31mred` }]);
    buffer.clear({ row: 3, column: 5, width: 100, height: 1 });
    const frame = buffer.snapshot();
    const detail = `index=${String(index)} seed=${String(seed)} value=${JSON.stringify(value)}`;

    assertFrameTopology(frame, detail);
    assert.equal(renderFramePlain(frame).includes('\u001B'), false, `${detail}: plain frame leaked ANSI`);
  }
});

function generatedTexts(count) {
  const seeds = [...textFixtures, '', 'plain', 'wide界text', 'emoji🙂text', 'combining e\u0301', '\u001B[31mred'];
  const output = [];
  let state = 0x12345678;
  while (output.length < count) {
    state = (state * 1664525 + 1013904223) >>> 0;
    const base = seeds[state % seeds.length] ?? '';
    output.push({ index: output.length, seed: state, value: `${base}${String(state % 997)}` });
  }
  return output;
}

function viewportFor(value) {
  const width = 4 + (value.length % 24);
  const height = 2 + (value.length % 7);
  return { columns: width, rows: height };
}

function assertBoundsInsideViewport(bounds, viewport, detail) {
  assert.equal(bounds.row >= 1, true, `${detail}: row before viewport`);
  assert.equal(bounds.column >= 1, true, `${detail}: column before viewport`);
  assert.equal(bounds.width >= 0, true, `${detail}: negative width`);
  assert.equal(bounds.height >= 0, true, `${detail}: negative height`);
  assert.equal(bounds.column + bounds.width - 1 <= viewport.columns || bounds.width === 0, true, `${detail}: width exceeds viewport`);
  assert.equal(bounds.row + bounds.height - 1 <= viewport.rows || bounds.height === 0, true, `${detail}: height exceeds viewport`);
}

function assertCellInsideFrame(cell, frame, detail) {
  assert.equal(cell.row >= 1 && cell.row <= frame.height, true, `${detail}: cell row outside frame`);
  assert.equal(cell.column >= 1 && cell.column <= frame.width, true, `${detail}: cell column outside frame`);
  assert.equal(cell.column + Math.max(1, cell.width) - 1 <= frame.width, true, `${detail}: cell width outside frame`);
}

function assertFrameTopology(frame, detail) {
  const cellsByPosition = new Map(frame.cells.map((cell) => [`${cell.row}:${cell.column}`, cell]));
  for (const cell of frame.cells) {
    assertCellInsideFrame(cell, frame, detail);
    assert.equal(cell.width >= 0, true, `${detail}: negative cell width`);
    if (cell.continuation === true) {
      const owner = continuationOwner(cell, cellsByPosition);
      assert.notEqual(owner, undefined, `${detail}: continuation cell without a wide owner`);
      assert.equal(
        cell.column < owner.column + owner.width,
        true,
        `${detail}: continuation cell outside owner width`
      );
    } else if (cell.width > 1) {
      for (let offset = 1; offset < cell.width; offset += 1) {
        const continuation = cellsByPosition.get(`${cell.row}:${cell.column + offset}`);
        assert.equal(
          continuation?.continuation,
          true,
          `${detail}: wide cell missing continuation at offset ${String(offset)}`
        );
      }
    }
  }
}

function continuationOwner(cell, cellsByPosition) {
  for (let column = cell.column - 1; column >= 1; column -= 1) {
    const candidate = cellsByPosition.get(`${cell.row}:${column}`);
    if (candidate === undefined) return undefined;
    if (candidate.continuation !== true) return candidate.width > cell.column - candidate.column ? candidate : undefined;
  }
  return undefined;
}

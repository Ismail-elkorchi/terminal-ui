import assert from 'node:assert/strict';
import test from 'node:test';

import { defaultTerminalOutputCapabilities } from '../../protocol/index.ts';
import { span } from '../../visual/render.ts';
import { applyRenderDiff, renderDiffProjectionMatchesFrame } from './diff-interpreter.ts';
import { createFrameBuffer } from './frame-buffer.ts';
import { diffFrames } from './frame.ts';
import {
  applyTerminalRowMovement,
  planTerminalFrameOutput
} from './terminal-frame-planner.ts';
import type { Frame } from '../contracts.ts';

void test('terminal frame planning uses an explicitly supported scrolling region when it wins', () => {
  const previous = rowsFrame(['header', 'alpha', 'bravo', 'charlie', 'delta']);
  const next = rowsFrame(['header', 'bravo', 'charlie', 'delta', 'echo']);
  const diff = diffFrames(previous, next);

  const plan = planTerminalFrameOutput(previous, next, diff, {
    capabilities: defaultTerminalOutputCapabilities,
    scrollRegion: true
  });

  assert.equal(plan.strategy, 'scroll_rows');
  assert.deepEqual(plan.rowMovement, { top: 2, bottom: 5, rows: 1 });
  assert.ok(plan.payloadBytes < plan.baselinePayloadBytes);
  assert.match(plan.text, /\u001B\[2;5r\u001B\[2H\u001B\[S\u001B\[r/u);
});

void test('terminal frame planning keeps canonical writes without scrolling-region authorization', () => {
  const previous = rowsFrame(['alpha', 'bravo', 'charlie', 'delta']);
  const next = rowsFrame(['bravo', 'charlie', 'delta', 'echo']);

  const plan = planTerminalFrameOutput(previous, next, diffFrames(previous, next), {
    capabilities: defaultTerminalOutputCapabilities,
    scrollRegion: false
  });

  assert.equal(plan.strategy, 'diff');
  assert.equal(plan.rowMovement, undefined);
});

void test('row movement plus its canonical repair reproduces each deterministic shifted frame', () => {
  for (const rows of [-3, -2, -1, 1, 2, 3]) {
    const previousLines = Array.from({ length: 12 }, (_value, index) => `row-${String(index)}`);
    const movement = { top: 2, bottom: 11, rows } as const;
    const previous = rowsFrame(previousLines);
    const projected = applyTerminalRowMovement(previous, movement);
    const nextLines = previousLines.map((value, index) => {
      const row = index + 1;
      if (row < movement.top || row > movement.bottom) return value;
      const source = row + rows;
      return source < movement.top || source > movement.bottom
        ? `new-${String(row)}`
        : previousLines[source - 1] ?? '';
    });
    const next = rowsFrame(nextLines);
    const repaired = applyRenderDiff(projected, diffFrames(projected, next));
    assert.equal(renderDiffProjectionMatchesFrame(repaired, next), true, `rows=${String(rows)}`);
  }
});

function rowsFrame(lines: readonly string[]): Frame {
  const width = Math.max(1, ...lines.map((line) => line.length));
  const buffer = createFrameBuffer(width, lines.length);
  lines.forEach((line, index) => {
    buffer.write(index + 1, 1, [span(line)]);
  });
  return buffer.snapshot();
}

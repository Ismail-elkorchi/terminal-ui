import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveTerminalCapabilities } from '../../dist/host/index.js';
import { createFrameBuffer,
  diffFrames,
  renderDiffAnsi,
  renderFramePlain,
  renderElementFrame
} from '../../dist/renderer/index.js';
import {
  richText,
  text
} from '../../dist/components/index.js';
import { textSamples } from '../support/text-samples.mjs';

const colorCapabilities = resolveTerminalCapabilities({
  host: {
    runtime: 'memory',
    inputIsTty: true,
    outputIsTty: true,
    rawInput: true
  },
  environment: {
    variables: {
      COLORTERM: 'truecolor',
      TERM: 'xterm-256color'
    }
  }
});

test('render diff property checks keep unchanged frames empty and local changes incremental', () => {
  for (const value of textSamples) {
    const before = renderElementFrame(text(value), { columns: 20, rows: 3 });
    const same = diffFrames(before, before);
    const after = renderElementFrame(text(`${value} changed`), { columns: 20, rows: 3 });
    const changed = diffFrames(before, after);
    const detail = `value=${JSON.stringify(value)}`;

    assert.equal(renderFramePlain(before).includes('\u001B'), false, `${detail}: plain frame leaked ANSI`);
    assert.equal(same.fullRewrite, false, `${detail}: unchanged frame requested rewrite`);
    assert.equal(same.operations.length, 0, `${detail}: unchanged frame emitted operations`);
    assert.equal(changed.fullRewrite, false, `${detail}: local text change requested rewrite`);
    assert.ok(changed.operations.length > 0, `${detail}: local text change emitted no operations`);
  }
});

test('diff round-trips reproduce the next frame text and keep ANSI serialization safe', () => {
  for (const { index, seed, value } of generatedTexts(32)) {
    const before = renderElementFrame(text(value), { columns: 18, rows: 4 });
    const next = renderElementFrame(text(`unsafe ${index} ${value} \u001B[31mred`), { columns: 18, rows: 4 });
    const diff = diffFrames(before, next);
    const applied = applyDiffToFrame(before, diff);
    const serialized = renderDiffAnsi(diff, { capabilities: colorCapabilities });
    const detail = `index=${String(index)} seed=${String(seed)} value=${JSON.stringify(value)}`;

    assert.equal(renderFramePlain(applied), renderFramePlain(next), `${detail}: diff round-trip changed visible text`);
    assert.equal(serialized.includes('unsafe'), true, `${detail}: diff serialization dropped visible text`);
    assert.equal(serialized.includes('\u001B[31munsafe'), false, `${detail}: diff serialization leaked raw user ANSI`);
  }
});

test('style-only diffs are incremental and preserve visual dimensions', () => {
  const previous = renderElementFrame(richText({
    id: 'status',
    segments: [{ text: 'same text', style: { fg: { kind: 'theme', token: 'status.info' } } }]
  }), { columns: 24, rows: 2 });
  const next = renderElementFrame(richText({
    id: 'status',
    segments: [{ text: 'same text', style: { fg: { kind: 'theme', token: 'status.error' } } }]
  }), { columns: 24, rows: 2 });
  const diff = diffFrames(previous, next);

  assert.equal(diff.fullRewrite, false);
  assert.ok(diff.operations.length > 0);
  assert.ok(diff.operations.length <= 2);
  assert.equal(diff.width, previous.width);
  assert.equal(diff.height, previous.height);
});

function generatedTexts(count) {
  const seeds = [...textSamples, '', 'plain', 'wide界text', 'emoji🙂text', 'combining e\u0301', '\u001B[31mred'];
  const output = [];
  let state = 0x12345678;
  while (output.length < count) {
    state = (state * 1664525 + 1013904223) >>> 0;
    const base = seeds[state % seeds.length] ?? '';
    output.push({ index: output.length, seed: state, value: `${base}${String(state % 997)}` });
  }
  return output;
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

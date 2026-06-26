import assert from 'node:assert/strict';
import test from 'node:test';

import { clipTextCells, measureTextCells, sanitizeTerminalText, segmentGraphemes, wrapTextCells } from '../../dist/text/index.js';
import { diffFrames, renderFrame, renderWidgetFrame } from '../../dist/tui/index.js';
import { text } from '../../dist/widgets/index.js';
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

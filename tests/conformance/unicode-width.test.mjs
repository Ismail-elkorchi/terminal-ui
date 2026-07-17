import assert from 'node:assert/strict';
import test from 'node:test';

import {
  clipTextCells,
  createTerminalTextIndex,
  defaultTextWidthProfile,
  measureTextCells,
  wrapTextCells
} from '../../dist/text/index.js';
import { createFrameBuffer } from '../../dist/renderer/index.js';

const narrow = { emoji: 'wide', ambiguous: 'narrow' };
const wideAmbiguous = { emoji: 'wide', ambiguous: 'wide' };

test('Unicode width profile covers grapheme, emoji, East Asian, and mark classes', () => {
  const cases = [
    ['e\u0301', 1],
    ['a\u1AB0', 1],
    ['\u1AB0', 0],
    ['©', 1],
    ['©️', 2],
    ['👩🏽', 2],
    ['👩‍💻', 2],
    ['🇲🇦', 2],
    ['界', 2],
    ['𠀀', 2]
  ];
  for (const [value, cells] of cases) {
    assert.equal(measureTextCells(value).cells, cells, JSON.stringify(value));
  }
  assert.deepEqual(defaultTextWidthProfile, narrow);
});

test('East Asian ambiguous and emoji policy are independent and cache-safe', () => {
  assert.equal(measureTextCells('·', { widthProfile: narrow }).cells, 1);
  assert.equal(measureTextCells('·', { widthProfile: wideAmbiguous }).cells, 2);
  assert.equal(measureTextCells('🙂', { widthProfile: narrow }).cells, 2);
  assert.equal(measureTextCells('🙂', {
    widthProfile: { emoji: 'narrow', ambiguous: 'wide' }
  }).cells, 1);
  assert.equal(measureTextCells('·', { widthProfile: narrow }).cells, 1);
});

test('measurement clipping wrapping indexing and frame writes share one width profile', () => {
  const value = 'A·👩‍💻𠀀e\u1AB0';
  const options = { widthProfile: wideAmbiguous };
  const measured = measureTextCells(value, options);
  const index = createTerminalTextIndex(value, options);
  const clipped = clipTextCells(value, 5, options);
  const wrapped = wrapTextCells(value, 5, options);
  const buffer = createFrameBuffer(12, 1, options);
  buffer.write(1, 1, [{ text: value }]);
  const frame = buffer.snapshot();

  assert.equal(measured.cells, 8);
  assert.equal(index.cells, measured.cells);
  assert.equal(clipped.cells, 5);
  assert.equal(wrapped.reduce((sum, line) => sum + line.cells, 0), measured.cells);
  assert.equal(frame.cells.filter((cell) => cell.continuation !== true).at(-1)?.column, 8);
  assert.equal(frame.cells.at(-1)?.column, 8);
});

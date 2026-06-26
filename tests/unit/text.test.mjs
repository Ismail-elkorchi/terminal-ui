import assert from 'node:assert/strict';
import test from 'node:test';

import {
  clipTextCells,
  editTextBuffer,
  measureTextCells,
  sanitizeTerminalText,
  segmentGraphemes,
  wrapTextCells
} from '../../dist/text/index.js';
import { renderFrame, renderWidgetFrame } from '../../dist/tui/index.js';
import { text } from '../../dist/widgets/index.js';

test('text measurement sanitizes control sequences and measures visible cells', () => {
  const sanitized = sanitizeTerminalText('\u001B[31mred');

  assert.equal(sanitized.text, 'red');
  assert.equal(sanitized.changed, true);
  assert.deepEqual(sanitized.removedControlSequences, [{
    sequence: '\u001B[31m',
    index: 0,
    kind: 'escape'
  }]);
  assert.equal(measureTextCells('a🙂').cells, 3);
});

test('text measurement exposes grapheme segments and respects emoji width options', () => {
  assert.deepEqual(segmentGraphemes('e\u0301🙂').map((segment) => ({
    text: segment.text,
    cells: segment.cells
  })), [
    { text: 'e\u0301', cells: 1 },
    { text: '🙂', cells: 2 }
  ]);
  assert.equal(measureTextCells('a🙂', { emojiWidth: 'narrow' }).cells, 2);
  assert.equal(measureTextCells('界').cells, 2);
});

test('text rendering keeps bidirectional content in stable logical order', () => {
  const content = 'abc אבג 123';
  const frame = renderWidgetFrame(text(content, { id: 'bidi-fallback' }), { columns: 20, rows: 2 });

  assert.equal(renderFrame(frame), content);
  assert.equal(frame.cells.map((cell) => cell.text).join(''), content);
});

test('text clipping preserves graphemes, sanitizes controls, and stays within the cell budget', () => {
  assert.deepEqual(clipTextCells('ab🙂cd', 4, { ellipsis: '…' }), {
    text: 'ab…',
    cells: 3,
    clipped: true
  });
  assert.deepEqual(clipTextCells('abcdef', 2, { ellipsis: '...' }), {
    text: '..',
    cells: 2,
    clipped: true
  });
  assert.deepEqual(clipTextCells('\u001B[31mabc', 3), {
    text: 'abc',
    cells: 3,
    clipped: false
  });
  assert.deepEqual(clipTextCells('a🙂b', 3, { emojiWidth: 'narrow' }), {
    text: 'a🙂b',
    cells: 3,
    clipped: false
  });
});

test('text editing respects grapheme boundaries', () => {
  const emoji = editTextBuffer({ text: 'a🙂b', cursor: 'a🙂'.length }, { kind: 'deleteBackward' });
  const moved = editTextBuffer({ text: 'a🙂b', cursor: 1 }, { kind: 'moveRight' });
  const combining = 'e\u0301x';
  const deleted = editTextBuffer({ text: combining, cursor: 'e\u0301'.length }, { kind: 'deleteBackward' });

  assert.deepEqual(emoji, { text: 'ab', cursor: 1 });
  assert.equal(moved.cursor, 'a🙂'.length);
  assert.deepEqual(deleted, { text: 'x', cursor: 0 });
});

test('text editing replaces selections and uses spec-shaped home/end operations', () => {
  assert.deepEqual(
    editTextBuffer({ text: 'hello world', cursor: 11, selection: { start: 6, end: 11 } }, { kind: 'insert', text: 'terminal' }),
    { text: 'hello terminal', cursor: 14 }
  );
  assert.deepEqual(
    editTextBuffer({ text: 'abc🙂def', cursor: 0, selection: { start: 3, end: 'abc🙂'.length } }, { kind: 'deleteForward' }),
    { text: 'abcdef', cursor: 3 }
  );
  assert.deepEqual(
    editTextBuffer({ text: 'abc', cursor: 2 }, { kind: 'replaceSelection', text: 'Z' }),
    { text: 'abZc', cursor: 3 }
  );
  assert.deepEqual(
    editTextBuffer({ text: 'abc', cursor: 2, selection: { start: 0, end: 2 } }, { kind: 'moveHome' }),
    { text: 'abc', cursor: 0 }
  );
});

test('text wrapping can preserve word boundaries within cell width', () => {
  assert.deepEqual(wrapTextCells('hello terminal ui', 8, { preserveWords: true }), [
    { text: 'hello', cells: 5, hardBreak: false },
    { text: 'terminal', cells: 8, hardBreak: false },
    { text: 'ui', cells: 2, hardBreak: true }
  ]);
  assert.deepEqual(wrapTextCells('a🙂b', 3), [
    { text: 'a🙂', cells: 3, hardBreak: false },
    { text: 'b', cells: 1, hardBreak: true }
  ]);
  assert.deepEqual(wrapTextCells('a🙂b', 3, { emojiWidth: 'narrow' }), [
    { text: 'a🙂b', cells: 3, hardBreak: true }
  ]);
});

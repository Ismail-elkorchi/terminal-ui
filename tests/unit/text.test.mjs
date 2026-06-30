import assert from 'node:assert/strict';
import test from 'node:test';

import {
	  clipTextCells,
	  createTerminalTextIndex,
	  editTextAreaBuffer,
	  editTextBuffer,
	  lineSelectionAt,
	  measureTextCells,
	  sanitizeTerminalText,
	  segmentGraphemes,
	  selectedText,
	  terminalTextWidth,
	  wordSelectionAt,
	  wrapTextCells
	} from '../../dist/text/index.js';
import { renderFramePlain, renderWidgetFrame } from '../../dist/tui/index.js';
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

  assert.equal(renderFramePlain(frame), content);
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

test('terminal text index maps grapheme, visual, and byte offsets', () => {
  const textValue = 'A👩‍💻e\u0301界\tمرحبا';
  const index = createTerminalTextIndex(textValue);
  const afterEmoji = 'A👩‍💻'.length;
  const encoder = new TextEncoder();

  assert.equal(index.codeUnits, textValue.length);
  assert.equal(index.bytes, encoder.encode(textValue).byteLength);
  assert.equal(index.codeUnitOffsetToGraphemeIndex(2), 1);
  assert.equal(index.codeUnitOffsetToGraphemeIndex(textValue.length), index.graphemes.length);
  assert.equal(index.graphemeIndexToCodeUnitOffset(2), afterEmoji);
  assert.equal(index.graphemeIndexToVisualColumn(2), 3);
  assert.equal(index.byteOffsetToGraphemeIndex(encoder.encode('A👩').byteLength), 1);
  assert.equal(index.graphemeIndexToByteOffset(2), encoder.encode('A👩‍💻').byteLength);
  assert.equal(index.selectedText(index.wordSelectionAt(textValue.indexOf('م'))), 'مرحبا');
});

test('terminal text index handles wide cells, lines, tabs, and standalone helpers', () => {
  const wide = createTerminalTextIndex('a界b');
  const multiline = 'alpha\nβeta🙂\nمرحبا';
  const line = lineSelectionAt(multiline, multiline.indexOf('🙂'));

  assert.equal(wide.cells, 4);
  assert.equal(wide.graphemeIndexToVisualColumn(2), 3);
  assert.equal(wide.visualColumnToGraphemeIndex(2), 1);
  assert.equal(terminalTextWidth('界🙂'), 4);
  assert.equal(selectedText(multiline, line), 'βeta🙂');
  assert.equal(selectedText('one\tأربعة two', wordSelectionAt('one\tأربعة two', 5)), 'أربعة');
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

test('text editing supports word operations and selection movement', () => {
  assert.deepEqual(
    editTextBuffer({ text: 'alpha bravo charlie', cursor: 'alpha bravo'.length }, { kind: 'deleteWordBackward' }),
    { text: 'alpha  charlie', cursor: 'alpha '.length }
  );
  assert.deepEqual(
    editTextBuffer({ text: 'alpha bravo charlie', cursor: 'alpha '.length }, { kind: 'deleteWordForward' }),
    { text: 'alpha  charlie', cursor: 'alpha '.length }
  );
  assert.deepEqual(
    editTextBuffer({ text: 'alpha bravo', cursor: 'alpha bravo'.length }, { kind: 'moveWordLeft' }),
    { text: 'alpha bravo', cursor: 'alpha '.length }
  );
  assert.deepEqual(
    editTextBuffer({ text: 'alpha bravo', cursor: 0 }, { kind: 'moveWordRight', select: true }),
    { text: 'alpha bravo', cursor: 'alpha'.length, selection: { start: 0, end: 'alpha'.length } }
  );
  assert.deepEqual(
    editTextBuffer({ text: 'alpha bravo', cursor: 0 }, { kind: 'selectAll' }),
    { text: 'alpha bravo', cursor: 'alpha bravo'.length, selection: { start: 0, end: 'alpha bravo'.length } }
  );
});

test('text area editing handles multiline inserts and line/page movement', () => {
  const pasted = editTextAreaBuffer({ text: 'alpha', cursor: 5 }, { kind: 'insert', text: '\nbravo\ncharlie' });
  assert.deepEqual(pasted, { text: 'alpha\nbravo\ncharlie', cursor: 'alpha\nbravo\ncharlie'.length });
  assert.deepEqual(
    editTextAreaBuffer({ text: pasted.text, cursor: 'alpha\nbr'.length }, { kind: 'moveHome' }),
    { text: pasted.text, cursor: 'alpha\n'.length }
  );
  assert.deepEqual(
    editTextAreaBuffer({ text: pasted.text, cursor: 'alpha\nbr'.length }, { kind: 'moveEnd' }),
    { text: pasted.text, cursor: 'alpha\nbravo'.length }
  );
  assert.deepEqual(
    editTextAreaBuffer({ text: pasted.text, cursor: 'alpha\nbra'.length }, { kind: 'moveLineDown', select: true }),
    {
      text: pasted.text,
      cursor: 'alpha\nbravo\ncha'.length,
      selection: { start: 'alpha\nbra'.length, end: 'alpha\nbravo\ncha'.length }
    }
  );
  const twelveLines = Array.from({ length: 12 }, (_, index) => `line${String(index)}`).join('\n');
  assert.deepEqual(
    editTextBuffer({ text: twelveLines, cursor: 'line0'.length }, { kind: 'movePageDown' }),
    { text: twelveLines, cursor: twelveLines.indexOf('line10') + 'line1'.length }
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

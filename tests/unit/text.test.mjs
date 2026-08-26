import assert from 'node:assert/strict';
import test from 'node:test';
import { stripVTControlCharacters } from 'node:util';

import {
  clipTextCells,
  createTerminalTextIndex,
  editTextDocument,
  editTextBuffer,
  fillTextCells,
  lineSelectionAt,
  measureTextCells,
  oneCellGlyph,
  padTextCells,
  createTextDocument,
  sanitizeTerminalCellText,
  sanitizeTerminalText,
  segmentGraphemes,
  selectedText,
  textCaretAt,
  textDocumentText,
  terminalTextWidth,
  wordSelectionAt,
  wrapTextCells
	} from '../../dist/text/index.js';
import { renderFramePlain,
  renderElementFrame
} from '../../dist/renderer/index.js';
import { text } from '../../dist/components/index.js';

test('text measurement sanitizes control sequences and measures visible cells', () => {
  const sanitized = sanitizeTerminalText('\u001B[31mred');

  assert.equal(sanitized.text, 'red');
  assert.equal(sanitized.changed, true);
  assert.deepEqual(sanitized.removedControlSequences, [{
    sequence: '\u001B[31m',
    codeUnitOffset: 0,
    kind: 'escape'
  }]);
  assert.equal(Object.isFrozen(sanitized), true);
  assert.equal(Object.isFrozen(sanitized.removedControlSequences), true);
  assert.equal(measureTextCells('a🙂').cells, 3);
});

test('terminal text canonicalizes structural whitespace before measurement and cell rendering', () => {
  const value = 'a\tb\nc\rd';

  assert.equal(sanitizeTerminalText(value).text, 'a   b\nc\nd');
  assert.equal(sanitizeTerminalCellText(value).text, 'a   bcd');
  assert.throws(
    () => sanitizeTerminalCellText('safe', { replacement: '\n' }),
    /replacement must not contain control characters or terminal sequences/u
  );
});

test('oneCellGlyph preserves fixed-cell geometry across width profiles', () => {
  const wideAmbiguous = { emoji: 'wide', ambiguous: 'wide' };

  assert.equal(oneCellGlyph('─', '-', { widthProfile: wideAmbiguous }), '-');
  assert.equal(oneCellGlyph('🙂', '*', { widthProfile: wideAmbiguous }), '*');
  assert.equal(oneCellGlyph('x', '*', { widthProfile: wideAmbiguous }), 'x');
  assert.equal(oneCellGlyph('xy', '界', { widthProfile: wideAmbiguous }), ' ');
});

test('text sanitization cache separates text and replacement tuples unambiguously', () => {
  const unsafe = sanitizeTerminalText('b\u0000c', { replacement: 'a' });
  const safe = sanitizeTerminalText('c', { replacement: 'ab' });

  assert.equal(unsafe.text, 'bac');
  assert.equal(safe.text, 'c');
  assert.equal(safe.changed, false);
  assert.throws(
    () => sanitizeTerminalText('safe', { replacement: 'a\u001B[31mb' }),
    /replacement must not contain control characters or terminal sequences/u
  );
});

test('terminal sanitization agrees with the native VT stripper on complete common sequences', () => {
  const cases = [
    'a\u001B[31mred\u001B[0mz',
    'a\u001B]0;title\u0007z',
    'a\u001B]0;title\u001B\\z',
    'a\u009B31mred\u009B0mz',
    'a\u001B7z'
  ];

  for (const value of cases) {
    assert.equal(sanitizeTerminalText(value).text, stripVTControlCharacters(value));
  }
});

test('terminal sanitization retains richer DCS, control, terminator, and malformed-input semantics', () => {
  const dcs = 'a\u001BP1;2|payload\u001B\\z';
  const control = 'a\u0001z';
  const terminator = 'a\u001B\\z';
  const incompleteCsi = 'a\u001B[31';
  const incompleteOsc = 'a\u001B]0;title';

  assert.equal(sanitizeTerminalText(dcs).text, 'az');
  assert.equal(stripVTControlCharacters(dcs), 'a1;2|payload\u001B\\z');
  assert.equal(sanitizeTerminalText(control).text, 'az');
  assert.equal(stripVTControlCharacters(control), control);
  assert.equal(sanitizeTerminalText(terminator).text, 'az');
  assert.equal(stripVTControlCharacters(terminator), terminator);
  assert.equal(sanitizeTerminalText(incompleteCsi).text, 'a31');
  assert.equal(stripVTControlCharacters(incompleteCsi), 'a');
  assert.equal(sanitizeTerminalText(incompleteOsc).text, 'a0;title');
  assert.equal(stripVTControlCharacters(incompleteOsc), 'aitle');
});

test('terminal sanitization reports original code-unit offsets while applying replacements', () => {
  const sanitized = sanitizeTerminalText('a\u001B[31mred\u0007z', { replacement: '?' });

  assert.equal(sanitized.text, 'a?red?z');
  assert.deepEqual(sanitized.removedControlSequences, [
    { sequence: '\u001B[31m', codeUnitOffset: 1, kind: 'escape' },
    { sequence: '\u0007', codeUnitOffset: 9, kind: 'control' }
  ]);
});

test('text measurement exposes grapheme segments and respects emoji width options', () => {
  assert.deepEqual(segmentGraphemes('e\u0301🙂').map((segment) => ({
    text: segment.text,
    cells: segment.cells
  })), [
    { text: 'e\u0301', cells: 1 },
    { text: '🙂', cells: 2 }
  ]);
  assert.equal(measureTextCells('a🙂', { widthProfile: { emoji: 'narrow', ambiguous: 'narrow' } }).cells, 2);
  assert.equal(measureTextCells('界').cells, 2);
});

test('cell padding and fill honor the active terminal width profile', () => {
  const widthProfile = { emoji: 'wide', ambiguous: 'wide' };

  assert.equal(padTextCells('界', 2, { widthProfile }), '界');
  assert.equal(padTextCells('·', 4, { widthProfile }), '·  ');
  assert.equal(padTextCells('·', 4, { align: 'end', widthProfile }), '  ·');
  assert.equal(fillTextCells('█', 5, { widthProfile }), '██ ');
  assert.equal(measureTextCells(fillTextCells('█', 5, { widthProfile }), { widthProfile }).cells, 5);
  assert.throws(() => padTextCells('x', -1), /non-negative integer/u);
  assert.throws(() => fillTextCells('x', 1.5), /non-negative integer/u);
});

test('text measurement returns stable immutable metrics for repeated labels', () => {
  const first = measureTextCells('Status: running');
  const second = measureTextCells('Status: running');

  assert.deepEqual(second, first);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.graphemes), true);
  assert.equal(Object.isFrozen(first.graphemes[0]), true);
});

test('text rendering keeps bidirectional content in stable logical order', () => {
  const content = 'abc אבג 123';
  const frame = renderElementFrame(text({ content: content, id: 'bidi-fallback' }), { columns: 20, rows: 2 });

  assert.equal(renderFramePlain(frame).trimEnd(), content);
  assert.equal(
    frame.cells
      .filter((cell) => cell.source?.elementId === 'bidi-fallback')
      .map((cell) => cell.text)
      .join(''),
    content
  );
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
  assert.deepEqual(clipTextCells('a🙂b', 3, { widthProfile: { emoji: 'narrow', ambiguous: 'narrow' } }), {
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

test('text editing sanitizes inserted text before deriving cursor offsets', () => {
  const escape = '\u001B[31m';

  assert.deepEqual(
    editTextBuffer({ text: 'ab', cursor: 1 }, { kind: 'insert', text: `${escape}X\u001B[0m` }),
    { text: 'aXb', cursor: 2 }
  );
  assert.deepEqual(
    editTextBuffer(
      { text: 'abcd', cursor: 3, selection: { startOffset: 1, endOffsetExclusive: 3 } },
      { kind: 'replaceSelection', text: `Y\u0007Z` }
    ),
    { text: 'aYZd', cursor: 3 }
  );
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
  const wordIndex = createTerminalTextIndex('🙂你好，مرحبا');
  const chineseWord = wordIndex.wordSelectionAt('🙂'.length);
  const multiline = 'alpha\nβeta🙂\nمرحبا';
  const line = lineSelectionAt(multiline, multiline.indexOf('🙂'));

  assert.equal(wide.cells, 4);
  assert.equal(wide.graphemeIndexToVisualColumn(2), 3);
  assert.equal(wide.visualColumnToGraphemeIndex(2), 1);
  assert.equal(terminalTextWidth('界🙂'), 4);
  assert.equal(
    wordIndex.graphemeIndexToVisualColumn(wordIndex.codeUnitOffsetToGraphemeIndex(chineseWord.startOffset)),
    2
  );
  assert.equal(
    wordIndex.graphemeIndexToVisualColumn(wordIndex.codeUnitOffsetToGraphemeIndex(chineseWord.endOffsetExclusive)),
    6
  );
  assert.equal(selectedText(multiline, line), 'βeta🙂');
  assert.equal(selectedText('one\tأربعة two', wordSelectionAt('one\tأربعة two', 5)), 'أربعة');
});

test('terminal text index retains word segmentation for repeated lookups', () => {
  const original = Intl.Segmenter.prototype.segment;
  let wordSegmentations = 0;
  Intl.Segmenter.prototype.segment = function segment(value) {
    if (this.resolvedOptions().granularity === 'word') wordSegmentations += 1;
    return original.call(this, value);
  };
  try {
    const index = createTerminalTextIndex('alpha bravo 世界 مرحبا');
    assert.equal(wordSegmentations, 0);
    for (let lookup = 0; lookup < 100; lookup += 1) {
      index.wordSelectionAt(lookup % index.codeUnits);
      index.previousWordBoundary(lookup % index.codeUnits);
      index.nextWordBoundary(lookup % index.codeUnits);
    }
    assert.equal(wordSegmentations, 1);
  } finally {
    Intl.Segmenter.prototype.segment = original;
  }
});

test('text editing replaces selections and uses spec-shaped home/end operations', () => {
  assert.deepEqual(
    editTextBuffer({ text: 'hello world', cursor: 11, selection: { startOffset: 6, endOffsetExclusive: 11 } }, { kind: 'insert', text: 'terminal' }),
    { text: 'hello terminal', cursor: 14 }
  );
  assert.deepEqual(
    editTextBuffer({ text: 'abc🙂def', cursor: 0, selection: { startOffset: 3, endOffsetExclusive: 'abc🙂'.length } }, { kind: 'deleteForward' }),
    { text: 'abcdef', cursor: 3 }
  );
  assert.deepEqual(
    editTextBuffer({ text: 'abc', cursor: 2 }, { kind: 'replaceSelection', text: 'Z' }),
    { text: 'abZc', cursor: 3 }
  );
  assert.deepEqual(
    editTextBuffer({ text: 'abc', cursor: 2, selection: { startOffset: 0, endOffsetExclusive: 2 } }, { kind: 'moveHome' }),
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
    editTextBuffer({ text: 'alpha bravo', cursor: 0 }, { kind: 'moveWordRight', extendSelection: true }),
    { text: 'alpha bravo', cursor: 'alpha'.length, selection: { startOffset: 0, endOffsetExclusive: 'alpha'.length } }
  );
  assert.deepEqual(
    editTextBuffer({ text: 'alpha bravo', cursor: 0 }, { kind: 'selectAll' }),
    { text: 'alpha bravo', cursor: 'alpha bravo'.length, selection: { startOffset: 0, endOffsetExclusive: 'alpha bravo'.length } }
  );
});

test('word editing uses Unicode word boundaries for punctuation and multilingual text', () => {
  assert.equal(selectedText('hello,world', wordSelectionAt('hello,world', 6)), 'world');
  assert.deepEqual(wordSelectionAt('hello,world', 5), {
    startOffset: 5,
    endOffsetExclusive: 5
  });
  assert.equal(selectedText('مرحبا،العالم', wordSelectionAt('مرحبا،العالم', 7)), 'العالم');
  assert.equal(selectedText('你好世界', wordSelectionAt('你好世界', 2)), '世界');
  assert.equal(selectedText('e\u0301lan', wordSelectionAt('e\u0301lan', 1)), 'e\u0301lan');
  assert.deepEqual(wordSelectionAt('go👩‍💻now', 3), {
    startOffset: 2,
    endOffsetExclusive: 2
  });
  assert.deepEqual(
    editTextBuffer({ text: 'hello, world', cursor: 'hello'.length }, { kind: 'deleteWordForward' }),
    { text: 'hello', cursor: 'hello'.length }
  );
  assert.deepEqual(
    editTextBuffer({ text: 'مرحبا،العالم', cursor: 'مرحبا،'.length }, { kind: 'moveWordRight' }),
    { text: 'مرحبا،العالم', cursor: 'مرحبا،العالم'.length }
  );
});

test('text document editing handles multiline inserts and line/page movement', () => {
  const pasted = editTextDocument({
    document: createTextDocument('alpha'),
    caret: textCaretAt(5)
  }, { kind: 'insert', text: '\nbravo\ncharlie' });
  assert.equal(textDocumentText(pasted.document), 'alpha\nbravo\ncharlie');
  assert.equal(pasted.caret.position.offset, 'alpha\nbravo\ncharlie'.length);
  const home = editTextDocument(
    { document: pasted.document, caret: textCaretAt('alpha\nbr'.length) },
    { kind: 'moveHome' }
  );
  assert.equal(home.caret.position.offset, 'alpha\n'.length);
  const end = editTextDocument(
    { document: pasted.document, caret: textCaretAt('alpha\nbr'.length) },
    { kind: 'moveEnd' }
  );
  assert.equal(end.caret.position.offset, 'alpha\nbravo'.length);
  const down = editTextDocument(
    { document: pasted.document, caret: textCaretAt('alpha\nbra'.length) },
    { kind: 'moveLineDown', extendSelection: true }
  );
  assert.equal(down.caret.position.offset, 'alpha\nbravo\ncha'.length);
  assert.deepEqual(down.selection, {
    anchor: { offset: 'alpha\nbra'.length, affinity: 'downstream' },
    focus: { offset: 'alpha\nbravo\ncha'.length, affinity: 'downstream' }
  });
  const twelveLines = Array.from({ length: 12 }, (_, index) => `line${String(index)}`).join('\n');
  const page = editTextDocument({
    document: createTextDocument(twelveLines),
    caret: textCaretAt('line0'.length)
  }, { kind: 'movePageDown' });
  assert.equal(page.caret.position.offset, twelveLines.indexOf('line10') + 'line1'.length);
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
  assert.deepEqual(wrapTextCells('a🙂b', 3, { widthProfile: { emoji: 'narrow', ambiguous: 'narrow' } }), [
    { text: 'a🙂b', cells: 3, hardBreak: true }
  ]);
});

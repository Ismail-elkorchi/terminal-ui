import assert from 'node:assert/strict';
import test from 'node:test';
import { createMemoryTerminalHost } from '../../../dist/host/index.js';
import { createTuiRuntime, defineTui } from '../../../dist/tui/index.js';
import { textInputReducer } from '../../../dist/behavior/index.js';
import {
  measureTextCells,
  measureTextWidth,
  terminalCellGraphemes,
} from '../../../dist/text/measure.js';
import {
  sanitizeTerminalText,
  sanitizeTerminalCellText,
  projectTerminalSingleLineText,
} from '../../../dist/text/sanitize.js';
import { clipTextCells } from '../../../dist/text/clip.js';
import { countWrappedTextRows, wrapTextCells } from '../../../dist/text/wrap.js';
import { createTextDocument, textDocumentText } from '../../../dist/text/document.js';
import { createTextAreaProjection } from '../../../dist/components/text-area/projection.js';
import { text, textInput, richText, passwordInput } from '../../../dist/components/index.js';
import { renderElementFrame, renderFramePlain } from '../../../dist/renderer/index.js';

for (const ambiguous of ['narrow', 'wide']) {
  const widthProfile = { ambiguous, emoji: 'wide' };
  const options = { widthProfile };
  const expected = ambiguous === 'wide' ? '·  X' : '·   X';
  test(`tab geometry agrees across text and editor paths with ${ambiguous} ambiguous characters`, () => {
    assert.equal(sanitizeTerminalText('·\tX', options).text, expected);
    assert.equal(sanitizeTerminalCellText('·\tX', options).text, expected);
    assert.equal(measureTextCells('·\tX', options).text, expected);
    assert.equal(measureTextCells('·\tX', options).cells, 5);
    assert.equal(measureTextWidth('·\tX', options), 5);
    assert.deepEqual(clipTextCells('·\tX', 5, options), {
      text: expected,
      cells: 5,
      clipped: false,
    });
    assert.deepEqual(wrapTextCells('·\tX', 5, options), [
      { text: expected, cells: 5, hardBreak: true },
    ]);
    assert.equal(countWrappedTextRows('·\tX', 5, options), 1);
    const projection = createTextAreaProjection(createTextDocument('·\tX'), [], widthProfile);
    assert.equal(textDocumentText(projection.document), expected);
    const single = projectTerminalSingleLineText('·\tX', options);
    assert.equal(single.text, expected);
    assert.equal(single.sourceOffsetToDisplay(2), expected.indexOf('X'));
    assert.equal(single.displayOffsetToSource(expected.indexOf('X')), 2);
    assert.equal(single.displayOffsetToSource(2), 1);
  });
  test(`tab geometry uses ${ambiguous} profile after control stripping and line reset`, () => {
    const source = '\u001b[31m·\tX\r\n·\tY';
    const sanitized = sanitizeTerminalText(source, options);
    assert.equal(sanitized.text, `${expected}\n${expected.replace('X', 'Y')}`);
    assert.deepEqual(sanitized.removedControlSequences, [
      { sequence: '\u001b[31m', codeUnitOffset: 0, kind: 'escape' },
    ]);
    assert.equal(sanitizeTerminalText('\0\tX', { ...options, replacement: '·' }).text, expected);
    const projection = projectTerminalSingleLineText(source, options);
    assert.equal(projection.text, `${expected} ${expected.replace('X', 'Y')}`);
    assert.equal(projection.sourceOffsetToDisplay(7), expected.indexOf('X'));
  });
  test(`rendered text, rich text and editable text use ${ambiguous} tab geometry`, () => {
    for (const element of [
      text({ content: '·\tX' }),
      richText({ segments: [{ kind: 'text', text: '·\tX' }] }),
    ]) {
      const frame = renderElementFrame(element, { columns: 5, rows: 1 }, options);
      assert.equal(renderFramePlain(frame), expected);
    }
    const input = textInput({
      id: 'tab-input',
      meta: { accessibleName: 'Input' },
      state: { text: '·\tX', cursor: 3 },
      disabled: true,
    });
    const frame = renderElementFrame(input, { columns: 12, rows: 1 }, options);
    assert.ok(renderFramePlain(frame).includes(expected));
    assert.equal(frame.accessibility.root.value, expected);
    assert.equal(frame.accessibility.root.textPosition.caretOffset, expected.length);
    assert.equal(frame.cells.find((cell) => cell.text === 'X').column, 7);
  });
}

test('tab caches separate profiles and all four-cell stop contexts', () => {
  for (const emoji of ['wide', 'narrow', 'wide']) {
    const options = { widthProfile: { emoji, ambiguous: 'wide' } };
    const expected = `🙂${' '.repeat(emoji === 'wide' ? 2 : 3)}X`;
    assert.equal(measureTextCells('🙂\tX', options).text, expected);
    assert.equal(measureTextCells('🙂\tX', options).cells, 5);
  }
  assert.equal(sanitizeTerminalText('abcd\tX').text, 'abcd    X');
  const source = `${'a'.repeat(256)}·\tX`;
  const options = { widthProfile: { emoji: 'wide', ambiguous: 'wide' } };
  assert.equal(
    [...terminalCellGraphemes(source, options)].map((x) => x.text).join(''),
    `${'a'.repeat(256)}·  X`
  );
  assert.equal(measureTextWidth(source, options), 261);
});

test('materialized editor projection keeps replacement tabs at the surrounding profile-aware column', () => {
  for (const ambiguous of ['wide', 'narrow']) {
    const widthProfile = { emoji: 'wide', ambiguous };
    const document = createTextDocument('·z');
    const projection = createTextAreaProjection(
      document,
      [
        {
          kind: 'replace',
          startOffset: 1,
          endOffsetExclusive: 2,
          order: 0,
          label: 'replacement',
          replacementText: '\u001b[31m\tX',
        },
      ],
      widthProfile
    );
    const expected = ambiguous === 'wide' ? '·  X' : '·   X';
    assert.equal(textDocumentText(projection.document), expected);
    assert.equal(projection.accessibilityWindow(0, 100).text, expected);
    assert.equal(projection.displayOffsetAtSourceOffset(2), expected.length);
    const unsafe = createTextAreaProjection(createTextDocument('\u001b[31m·\tX'), [], widthProfile);
    assert.equal(textDocumentText(unsafe.document), expected);
  }
});

test('one retained text input recomputes display offsets when width profiles change', () => {
  const element = textInput({
    id: 'profile-switch',
    meta: { accessibleName: 'Input' },
    state: { text: '·\tX', cursor: 2, selection: { startOffset: 2, endOffsetExclusive: 3 } },
    disabled: true,
  });
  for (const ambiguous of ['narrow', 'wide', 'narrow', 'wide']) {
    const expected = ambiguous === 'wide' ? '·  X' : '·   X';
    const frame = renderElementFrame(
      element,
      { columns: 12, rows: 1 },
      {
        widthProfile: { ambiguous, emoji: 'wide' },
      }
    );
    assert.equal(frame.accessibility.root.value, expected);
    assert.deepEqual(frame.accessibility.root.textPosition, {
      caretOffset: expected.indexOf('X'),
      selection: { startOffset: expected.indexOf('X'), endOffsetExclusive: expected.length },
    });
    assert.equal(frame.cells.find((cell) => cell.text === 'X').column, 7);
  }
});


test('single-line edit reducers preserve tabs until profile-aware display after paste and replacement', () => {
  for (const operation of [
    { kind: 'insert', text: '\u001b[31m\tX\r\nY\u0007' },
    { kind: 'replaceSelection', text: '\u001b[31m\tX\r\nY\u0007' },
    { kind: 'replaceRange', range: { startOffset: 1, endOffsetExclusive: 2 }, text: '\u001b[31m\tX\r\nY\u0007' },
  ]) {
    const state = textInputReducer(
      { text: '·z', cursor: 2, selection: { startOffset: 1, endOffsetExclusive: 2 } },
      { kind: 'edit', operation }
    );
    assert.deepEqual(state, { text: '·\tX Y', cursor: 5, affinity: 'upstream' });
    for (const ambiguous of ['narrow', 'wide']) {
      const widthProfile = { emoji: 'wide', ambiguous };
      const options = { widthProfile };
      const expected = ambiguous === 'wide' ? '·  X Y' : '·   X Y';
      const input = textInput({ id: 'pasted-tab', meta: { accessibleName: 'Input' }, state, disabled: true });
      const frame = renderElementFrame(input, { columns: 16, rows: 1 }, options);
      assert.equal(frame.accessibility.root.value, expected);
      assert.equal(frame.accessibility.root.textPosition.caretOffset, expected.length);
      assert.equal(frame.cells.find((cell) => cell.text === 'X').column, 7);
      assert.equal(textDocumentText(createTextAreaProjection(createTextDocument(state.text), [], widthProfile).document), expected);
    }
  }
  assert.deepEqual(
    textInputReducer({ text: '', cursor: 0 }, { kind: 'edit', operation: { kind: 'insert', text: '·\tX' } }),
    { text: '·\tX', cursor: 3, affinity: 'upstream' }
  );
});


test('actual pasted tabs retain source offsets in text and password inputs', async () => {
  for (const component of [textInput, passwordInput]) {
    const app = defineTui({
      id: 'pasted-tabs',
      init: () => ({ state: { text: '·', cursor: 1 } }),
      update: (state, message) => ({ state: textInputReducer(state, message.transition) }),
      view: (state) => component({
        id: 'input', meta: { accessibleName: 'Input' }, state,
        onTransition: (transition) => ({ kind: 'edit', transition }),
      }),
    });
    const runtime = createTuiRuntime({
      app,
      host: createMemoryTerminalHost({ capabilities: { widthProfile: { emoji: 'wide', ambiguous: 'wide' } } }),
    });
    await runtime.start();
    try {
      await runtime.handleInput({ kind: 'paste', text: '\tX', bracketed: true });
      assert.deepEqual(runtime.state(), { text: '·\tX', cursor: 3, affinity: 'upstream' });
      if (component === textInput) {
        assert.equal(runtime.frame().accessibility.root.value, '·  X');
        assert.equal(runtime.frame().accessibility.root.textPosition.caretOffset, 4);
        assert.equal(runtime.frame().cells.find((cell) => cell.text === 'X').column, 7);
      } else {
        assert.doesNotMatch(renderFramePlain(runtime.frame()), /[·X]/u);
      }
    } finally {
      await runtime.dispose();
    }
  }
});

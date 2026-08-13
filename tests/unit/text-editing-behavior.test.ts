import assert from 'node:assert/strict';
import test from 'node:test';

import {
  textAreaReducer,
  createTextAreaState,
  textInputPresentation,
  textInputReducer
} from '../../dist/behavior/index.js';
import { createScrollState } from '../../dist/behavior/index.js';
import { textDocumentText } from '../../dist/text/index.js';

void test('textInputReducer applies edits and grapheme-aware pointer selections', () => {
  const initial = { text: 'a🙂bc', cursor: 0 };
  const placed = textInputReducer(initial, {
    kind: 'pointer',
    action: { kind: 'placeCaret', offset: 2 }
  });
  const selected = textInputReducer(placed, {
    kind: 'pointer',
    action: { kind: 'extendSelection', anchor: 1, offset: 4 }
  });
  const replaced = textInputReducer(selected, {
    kind: 'edit',
    operation: { kind: 'insert', text: 'X' }
  });

  assert.deepEqual(placed, { text: 'a🙂bc', cursor: 1 });
  assert.deepEqual(textInputPresentation(selected), {
    value: 'a🙂bc',
    cursor: 4,
    selection: { startOffset: 1, endOffsetExclusive: 4 }
  });
  assert.deepEqual(replaced, { text: 'aXc', cursor: 2 });
});

void test('textAreaReducer owns editing selection and normalized scroll in one action channel', () => {
  const initial = createTextAreaState({
    value: 'alpha\nbeta',
    caret: { position: { offset: 0, affinity: 'downstream' } },
    scroll: createScrollState()
  });
  const selected = textAreaReducer(initial, {
    kind: 'pointer',
    action: { kind: 'endSelection', anchor: 6, offset: 10 }
  });
  const scrolled = textAreaReducer(selected, {
    kind: 'scroll',
    event: {
      nextState: createScrollState({ offsetRow: 3 }),
      source: 'wheel',
      target: 'content'
    }
  });

  assert.equal(textDocumentText(selected.document), 'alpha\nbeta');
  assert.deepEqual({
    caret: selected.caret,
    selection: selected.selection
  }, {
    caret: { position: { offset: 10, affinity: 'downstream' } },
    selection: {
      anchor: { offset: 6, affinity: 'downstream' },
      focus: { offset: 10, affinity: 'downstream' }
    }
  });
  assert.equal(scrolled.scroll.offsetRow, 3);
  assert.deepEqual(scrolled, {
    document: selected.document,
    caret: { position: { offset: 10, affinity: 'downstream' } },
    selection: {
      anchor: { offset: 6, affinity: 'downstream' },
      focus: { offset: 10, affinity: 'downstream' }
    },
    scroll: scrolled.scroll,
    revealCaret: false
  });
});

void test('textAreaReducer derives its cursor from sanitized inserted text', () => {
  const initial = createTextAreaState({
    value: 'ab',
    caret: { position: { offset: 1, affinity: 'downstream' } },
    scroll: createScrollState()
  });
  const edited = textAreaReducer(initial, {
    kind: 'edit',
    operation: { kind: 'insert', text: '\u001B[31mX\u001B[0m' }
  });

  assert.equal(textDocumentText(edited.document), 'aXb');
  assert.equal(edited.caret.position.offset, 2);
});

void test('textAreaReducer preserves identity for no-op pointer and scroll actions', () => {
  const initial = createTextAreaState({
    value: 'alpha',
    caret: { position: { offset: 0, affinity: 'downstream' } },
    scroll: createScrollState()
  });
  const revealed = textAreaReducer(initial, {
    kind: 'pointer',
    action: { kind: 'placeCaret', offset: 0 }
  });
  const scrolled = textAreaReducer({ ...initial, revealCaret: false }, {
    kind: 'scroll',
    event: {
      nextState: initial.scroll,
      source: 'wheel',
      target: 'content'
    }
  });

  assert.equal(revealed, initial);
  assert.equal(scrolled.revealCaret, false);
  assert.equal(scrolled.scroll, initial.scroll);
});

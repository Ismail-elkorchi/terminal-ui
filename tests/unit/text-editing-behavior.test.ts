import assert from 'node:assert/strict';
import test from 'node:test';

import {
  textAreaReducer,
  createTextAreaState,
  textInputState,
  textInputReducer
} from '../../dist/behavior/index.js';
import { createScrollState } from '../../dist/behavior/index.js';
import { textDocumentText } from '../../dist/text/index.js';

void test('textInputReducer applies edits and grapheme-aware pointer selections', () => {
  const initial = { text: 'a🙂bc', cursor: 0 };
  const placed = textInputReducer(initial, {
    kind: 'pointer',
    transition: { kind: 'placeCaret', offset: 2 }
  });
  const selected = textInputReducer(placed, {
    kind: 'pointer',
    transition: { kind: 'extendSelection', anchor: 1, offset: 4 }
  });
  const replaced = textInputReducer(selected, {
    kind: 'edit',
    operation: { kind: 'insert', text: 'X' }
  });

  assert.deepEqual(placed, { text: 'a🙂bc', cursor: 1 });
  assert.deepEqual(textInputState(selected), {
    value: 'a🙂bc',
    cursor: 4,
    selection: { startOffset: 1, endOffsetExclusive: 4 }
  });
  assert.deepEqual(replaced, { text: 'aXc', cursor: 2 });
});

void test('textAreaReducer preserves exact boundaries in long ASCII lines and complex graphemes', () => {
  const source = 'a'.repeat(250_000);
  const midpoint = source.length / 2;
  const placed = textAreaReducer(createTextAreaState({ value: source }), {
    kind: 'pointer', transition: { kind: 'placeCaret', offset: midpoint }
  }).state;
  const inserted = textAreaReducer(placed, { kind: 'edit', operation: { kind: 'insert', text: 'x' } });
  assert.deepEqual(inserted.changeSet.changes, [{
    startOffset: midpoint,
    endOffsetExclusive: midpoint,
    insertedText: 'x'
  }]);
  assert.equal(inserted.state.caret.position.offset, midpoint + 1);

  const combining = textAreaReducer(createTextAreaState({ value: 'e\u0301' }), {
    kind: 'pointer', transition: { kind: 'placeCaret', offset: 1 }
  });
  const crlf = textAreaReducer(createTextAreaState({ value: 'a\r\nb' }), {
    kind: 'pointer', transition: { kind: 'placeCaret', offset: 2 }
  });
  assert.equal(combining.state.caret.position.offset, 0);
  assert.equal(crlf.state.caret.position.offset, 1);
});

void test('textAreaReducer owns editing selection and normalized scroll in one action channel', () => {
  const initial = createTextAreaState({
    value: 'alpha\nbeta',
    caret: { position: { offset: 0, affinity: 'downstream' } },
    scroll: createScrollState()
  });
  const selectedTransition = textAreaReducer(initial, {
    kind: 'pointer',
    transition: { kind: 'endSelection', anchor: 6, offset: 10 }
  });
  const selected = selectedTransition.state;
  const scrolledTransition = textAreaReducer(selected, {
    kind: 'scroll',
    request: {
      nextState: createScrollState({ offsetRow: 3 }),
      source: 'wheel',
      target: 'content'
    }
  });
  const scrolled = scrolledTransition.state;

  assert.deepEqual(selectedTransition.changeSet.changes, []);
  assert.deepEqual(scrolledTransition.changeSet.changes, []);
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
    revealCaret: false,
    history: scrolled.history
  });
});

void test('textAreaReducer shares bounded multiline undo and preserves controlled scroll', () => {
  const initial = createTextAreaState({
    value: 'alpha\nbeta',
    caret: { position: { offset: 5, affinity: 'downstream' } },
    scroll: createScrollState({ offsetRow: 4 }),
    historyPolicy: { maxEntries: 2, maxRetainedBytes: 1_000 }
  });
  const editedTransition = textAreaReducer(initial, {
    kind: 'edit',
    operation: {
      kind: 'replaceRange',
      range: { startOffset: 0, endOffsetExclusive: 5 },
      text: '🙂'
    }
  });
  const edited = editedTransition.state;
  const undoneTransition = textAreaReducer(edited, { kind: 'undo' });
  const undone = undoneTransition.state;
  const redoneTransition = textAreaReducer(undone, { kind: 'redo' });
  const redone = redoneTransition.state;

  assert.deepEqual(editedTransition.changeSet.changes, [{
    startOffset: 0,
    endOffsetExclusive: 5,
    insertedText: '🙂'
  }]);
  assert.deepEqual(undoneTransition.changeSet.changes, [{
    startOffset: 0,
    endOffsetExclusive: 2,
    insertedText: 'alpha'
  }]);
  assert.deepEqual(redoneTransition.changeSet, editedTransition.changeSet);
  assert.equal(textDocumentText(edited.document), '🙂\nbeta');
  assert.equal(edited.caret.position.offset, 2);
  assert.equal(textDocumentText(undone.document), 'alpha\nbeta');
  assert.equal(undone.scroll, initial.scroll);
  assert.equal(textDocumentText(redone.document), '🙂\nbeta');
  assert.equal(redone.scroll, initial.scroll);
  assert.ok(redone.history.retainedBytes <= redone.history.policy.maxRetainedBytes);
});

void test('textArea history accounts for retained changes instead of complete documents', () => {
  const value = 'x'.repeat(1_200_000);
  const initial = createTextAreaState({
    value,
    caret: { position: { offset: value.length, affinity: 'downstream' } },
  });
  const edited = textAreaReducer(initial, {
    kind: 'edit',
    operation: { kind: 'insert', text: 'y' },
  });

  assert.equal(edited.state.history.undo.length, 1);
  assert.ok(edited.state.history.retainedBytes < 256);
  assert.equal(edited.historyRejection, undefined);
  const undone = textAreaReducer(edited.state, { kind: 'undo' });
  assert.equal(textDocumentText(undone.state.document), value);
});

void test('textArea history reports a rejected edit record without rejecting the edit', () => {
  const initial = createTextAreaState({
    value: 'abcdef',
    historyPolicy: { maxEntries: 10, maxRetainedBytes: 100 },
  });
  const edited = textAreaReducer(initial, {
    kind: 'edit',
    operation: {
      kind: 'replaceRange',
      range: { startOffset: 0, endOffsetExclusive: 6 },
      text: '',
    },
  });

  assert.equal(textDocumentText(edited.state.document), '');
  assert.equal(edited.state.history.undo.length, 0);
  assert.deepEqual(edited.historyRejection, {
    reason: 'retained-byte-limit',
    entryRetainedBytes: 118,
    limit: 100,
  });
});

void test('textAreaReducer groups consecutive insertions into one exact undo step', () => {
  let state = createTextAreaState({ value: '' });
  for (const text of ['h', 'e', 'l', 'l', 'o']) {
    state = textAreaReducer(state, {
      kind: 'edit',
      operation: { kind: 'insert', text }
    }).state;
  }

  assert.equal(textDocumentText(state.document), 'hello');
  assert.equal(state.history.undo.length, 1);
  const undone = textAreaReducer(state, { kind: 'undo' });
  assert.equal(textDocumentText(undone.state.document), '');
  assert.deepEqual(undone.changeSet.changes, [{
    startOffset: 0,
    endOffsetExclusive: 5,
    insertedText: ''
  }]);
});

void test('textAreaReducer does not retain history for semantically empty change sets', () => {
  const initial = createTextAreaState({ value: 'same' });
  const empty = textAreaReducer(initial, {
    kind: 'applyChanges',
    changeSet: { changes: [{ startOffset: 2, endOffsetExclusive: 2, insertedText: '' }] }
  });
  const equal = textAreaReducer(initial, {
    kind: 'applyChanges',
    changeSet: { changes: [{ startOffset: 0, endOffsetExclusive: 4, insertedText: 'same' }] }
  });

  assert.equal(empty.state, initial);
  assert.equal(equal.state, initial);
  assert.equal(initial.history.undo.length, 0);
});

void test('textAreaReducer preserves source text and reports the exact inserted text', () => {
  const initial = createTextAreaState({
    value: 'ab',
    caret: { position: { offset: 1, affinity: 'downstream' } },
    scroll: createScrollState()
  });
  const editedTransition = textAreaReducer(initial, {
    kind: 'edit',
    operation: { kind: 'insert', text: '\u001B[31mX\u001B[0m' }
  });
  const edited = editedTransition.state;

  assert.equal(textDocumentText(edited.document), 'a\u001B[31mX\u001B[0mb');
  assert.equal(edited.caret.position.offset, 11);
  assert.deepEqual(editedTransition.changeSet.changes, [{
    startOffset: 1,
    endOffsetExclusive: 1,
    insertedText: '\u001B[31mX\u001B[0m'
  }]);
});

void test('textAreaReducer reports exact grapheme deletion and selected paste changes', () => {
  const initial = createTextAreaState({
    value: 'a🙂b',
    caret: { position: { offset: 3, affinity: 'downstream' } }
  });
  const deleted = textAreaReducer(initial, {
    kind: 'edit',
    operation: { kind: 'deleteBackward' }
  });
  const selected = textAreaReducer(deleted.state, {
    kind: 'pointer',
    transition: { kind: 'endSelection', anchor: 0, offset: 2 }
  });
  const pasted = textAreaReducer(selected.state, {
    kind: 'edit',
    operation: { kind: 'replaceSelection', text: '\tline\r\n' }
  });

  assert.deepEqual(deleted.changeSet.changes, [{
    startOffset: 1,
    endOffsetExclusive: 3,
    insertedText: ''
  }]);
  assert.deepEqual(pasted.changeSet.changes, [{
    startOffset: 0,
    endOffsetExclusive: 2,
    insertedText: '\tline\r\n'
  }]);
  assert.equal(textDocumentText(pasted.state.document), '\tline\r\n');
});

void test('textAreaReducer preserves identity for no-op pointer and scroll actions', () => {
  const initial = createTextAreaState({
    value: 'alpha',
    caret: { position: { offset: 0, affinity: 'downstream' } },
    scroll: createScrollState()
  });
  const revealed = textAreaReducer(initial, {
    kind: 'pointer',
    transition: { kind: 'placeCaret', offset: 0 }
  });
  const scrolled = textAreaReducer({ ...initial, revealCaret: false }, {
    kind: 'scroll',
    request: {
      nextState: initial.scroll,
      source: 'wheel',
      target: 'content'
    }
  });

  assert.equal(revealed.state, initial);
  assert.equal(scrolled.state.revealCaret, false);
  assert.equal(scrolled.state.scroll, initial.scroll);
  assert.deepEqual(revealed.changeSet.changes, []);
  assert.deepEqual(scrolled.changeSet.changes, []);
});

void test('textAreaReducer applies one exact multi-range change set with one undo entry', () => {
  const initial = createTextAreaState({ value: 'one two one', scroll: createScrollState({ offsetRow: 2 }) });
  const changeSet = {
    changes: [
      { startOffset: 0, endOffsetExclusive: 3, insertedText: '1' },
      { startOffset: 8, endOffsetExclusive: 11, insertedText: '1' }
    ]
  } as const;
  const changed = textAreaReducer(initial, { kind: 'applyChanges', changeSet });

  assert.equal(textDocumentText(changed.state.document), '1 two 1');
  assert.deepEqual(changed.changeSet, changeSet);
  assert.equal(changed.state.history.undo.length, 1);
  assert.equal(changed.state.caret.position.offset, 7);
  const undone = textAreaReducer(changed.state, { kind: 'undo' });
  assert.equal(textDocumentText(undone.state.document), 'one two one');
  assert.deepEqual(undone.changeSet.changes, [
    { startOffset: 0, endOffsetExclusive: 1, insertedText: 'one' },
    { startOffset: 6, endOffsetExclusive: 7, insertedText: 'one' }
  ]);
  const redone = textAreaReducer(undone.state, { kind: 'redo' });
  assert.equal(textDocumentText(redone.state.document), '1 two 1');
  assert.deepEqual(redone.changeSet, changed.changeSet);
  assert.equal(redone.state.scroll, initial.scroll);
});

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyTextEditWithHistory,
  emptyTextEditHistory
} from '../../dist/text/index.js';

void test('text edit history undoes and redoes deterministic buffer states', () => {
  const initial = { text: 'alpha', cursor: 5 };
  const inserted = applyTextEditWithHistory(initial, emptyTextEditHistory(), { kind: 'insert', text: ' beta' });
  const deleted = applyTextEditWithHistory(inserted.buffer, inserted.history, { kind: 'deleteWordBackward' });
  const undone = applyTextEditWithHistory(deleted.buffer, deleted.history, { kind: 'undo' });
  const redone = applyTextEditWithHistory(undone.buffer, undone.history, { kind: 'redo' });

  assert.deepEqual(inserted.buffer, { text: 'alpha beta', cursor: 10 });
  assert.deepEqual(deleted.buffer, { text: 'alpha ', cursor: 6 });
  assert.deepEqual(undone.buffer, inserted.buffer);
  assert.deepEqual(redone.buffer, deleted.buffer);
});

void test('text edit history groups consecutive inserts into one undo step', () => {
  const initial = { text: '', cursor: 0 };
  const first = applyTextEditWithHistory(initial, emptyTextEditHistory(), { kind: 'insert', text: 'a' });
  const second = applyTextEditWithHistory(first.buffer, first.history, { kind: 'insert', text: 'b' });
  const third = applyTextEditWithHistory(second.buffer, second.history, { kind: 'insert', text: 'c' });
  const undone = applyTextEditWithHistory(third.buffer, third.history, { kind: 'undo' });

  assert.deepEqual(third.buffer, { text: 'abc', cursor: 3 });
  assert.equal(third.history.undo.length, 1);
  assert.deepEqual(undone.buffer, initial);
});

void test('text edit history starts a new undo group after navigation or deletion', () => {
  const initial = { text: '', cursor: 0 };
  const typed = applyTextEditWithHistory(initial, emptyTextEditHistory(), { kind: 'insert', text: 'abc' });
  const moved = applyTextEditWithHistory(typed.buffer, typed.history, { kind: 'moveLeft' });
  const deleted = applyTextEditWithHistory(moved.buffer, moved.history, { kind: 'deleteBackward' });
  const undoDelete = applyTextEditWithHistory(deleted.buffer, deleted.history, { kind: 'undo' });
  const undoTyping = applyTextEditWithHistory(undoDelete.buffer, undoDelete.history, { kind: 'undo' });

  assert.deepEqual(deleted.buffer, { text: 'ac', cursor: 1 });
  assert.deepEqual(undoDelete.buffer, moved.buffer);
  assert.deepEqual(undoTyping.buffer, initial);
});

void test('text edit history restores selection and respects grapheme-safe edits', () => {
  const initial = {
    text: 'a🙂b',
    cursor: 'a🙂'.length,
    selection: { startOffset: 1, endOffsetExclusive: 'a🙂'.length }
  };
  const replaced = applyTextEditWithHistory(initial, emptyTextEditHistory(), { kind: 'insert', text: 'é' });
  const moved = applyTextEditWithHistory(replaced.buffer, replaced.history, { kind: 'moveWordRight', extendSelection: true });
  const undoReplace = applyTextEditWithHistory(moved.buffer, moved.history, { kind: 'undo' });

  assert.deepEqual(replaced.buffer, { text: 'aéb', cursor: 2 });
  assert.deepEqual(undoReplace.buffer, initial);
});

void test('text edit history evicts by entry count and retained UTF-8 bytes', () => {
  let countResult = applyTextEditWithHistory(
    { text: '', cursor: 0 },
    emptyTextEditHistory({ maxEntries: 2, maxRetainedBytes: 1_000 }),
    { kind: 'insert', text: 'a' }
  );
  countResult = applyTextEditWithHistory(countResult.buffer, countResult.history, { kind: 'moveHome' });
  countResult = applyTextEditWithHistory(countResult.buffer, countResult.history, { kind: 'insert', text: 'b' });
  countResult = applyTextEditWithHistory(countResult.buffer, countResult.history, { kind: 'moveEnd' });
  countResult = applyTextEditWithHistory(countResult.buffer, countResult.history, { kind: 'insert', text: 'c' });
  assert.equal(countResult.history.undo.length, 2);

  const byteResult = applyTextEditWithHistory(
    { text: '🙂🙂', cursor: 4 },
    emptyTextEditHistory({ maxEntries: 10, maxRetainedBytes: 31 }),
    { kind: 'deleteBackward' }
  );
  assert.equal(byteResult.history.undo.length, 0);
  assert.equal(byteResult.history.retainedBytes, 0);
});

void test('range replacement is grapheme-safe and undo branching clears redo', () => {
  const initial = { text: 'a🙂b', cursor: 0 };
  const replaced = applyTextEditWithHistory(initial, emptyTextEditHistory(), {
    kind: 'replaceRange',
    range: { startOffset: 2, endOffsetExclusive: 3 },
    text: 'X'
  });
  assert.deepEqual(replaced.buffer, { text: 'aXb', cursor: 2 });
  const undone = applyTextEditWithHistory(replaced.buffer, replaced.history, { kind: 'undo' });
  const branched = applyTextEditWithHistory(undone.buffer, undone.history, {
    kind: 'replaceRange',
    range: { startOffset: 1, endOffsetExclusive: 3 },
    text: 'Y'
  });
  assert.equal(branched.history.redo.length, 0);
  assert.deepEqual(branched.buffer, { text: 'aYb', cursor: 2 });
});

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyTextEditWithHistory,
  emptyTextEditHistory
} from '../../dist/text/index.js';

test('text edit history undoes and redoes deterministic buffer states', () => {
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

test('text edit history groups consecutive inserts into one undo step', () => {
  const initial = { text: '', cursor: 0 };
  const first = applyTextEditWithHistory(initial, emptyTextEditHistory(), { kind: 'insert', text: 'a' });
  const second = applyTextEditWithHistory(first.buffer, first.history, { kind: 'insert', text: 'b' });
  const third = applyTextEditWithHistory(second.buffer, second.history, { kind: 'insert', text: 'c' });
  const undone = applyTextEditWithHistory(third.buffer, third.history, { kind: 'undo' });

  assert.deepEqual(third.buffer, { text: 'abc', cursor: 3 });
  assert.equal(third.history.undo.length, 1);
  assert.deepEqual(undone.buffer, initial);
});

test('text edit history starts a new undo group after navigation or deletion', () => {
  const initial = { text: '', cursor: 0 };
  const typed = applyTextEditWithHistory(initial, emptyTextEditHistory(), { kind: 'insert', text: 'abc' });
  const moved = applyTextEditWithHistory(typed.buffer, typed.history, { kind: 'moveLeft' });
  const deleted = applyTextEditWithHistory(moved.buffer, moved.history, { kind: 'deleteBackward' });
  const undoDelete = applyTextEditWithHistory(deleted.buffer, deleted.history, { kind: 'undo' });
  const undoMove = applyTextEditWithHistory(undoDelete.buffer, undoDelete.history, { kind: 'undo' });
  const undoTyping = applyTextEditWithHistory(undoMove.buffer, undoMove.history, { kind: 'undo' });

  assert.deepEqual(deleted.buffer, { text: 'ac', cursor: 1 });
  assert.deepEqual(undoDelete.buffer, moved.buffer);
  assert.deepEqual(undoMove.buffer, typed.buffer);
  assert.deepEqual(undoTyping.buffer, initial);
});

test('text edit history restores selection and respects grapheme-safe edits', () => {
  const initial = {
    text: 'a🙂b',
    cursor: 'a🙂'.length,
    selection: { start: 1, end: 'a🙂'.length }
  };
  const replaced = applyTextEditWithHistory(initial, emptyTextEditHistory(), { kind: 'insert', text: 'é' });
  const moved = applyTextEditWithHistory(replaced.buffer, replaced.history, { kind: 'moveWordRight', select: true });
  const undoMove = applyTextEditWithHistory(moved.buffer, moved.history, { kind: 'undo' });
  const undoReplace = applyTextEditWithHistory(undoMove.buffer, undoMove.history, { kind: 'undo' });

  assert.deepEqual(replaced.buffer, { text: 'aéb', cursor: 2 });
  assert.deepEqual(undoMove.buffer, replaced.buffer);
  assert.deepEqual(undoReplace.buffer, initial);
});

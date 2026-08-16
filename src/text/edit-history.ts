import { editTextBuffer } from './edit.ts';
import {
  breakEditHistoryGroup,
  createBoundedEditHistory,
  recordEditHistory,
  redoEditHistory,
  undoEditHistory
} from './bounded-history.ts';
import type { BoundedEditHistory, EditHistoryPolicy } from './bounded-history.ts';
import type { TextEditBuffer, TextEditOperation } from './types.ts';

export type TextEditHistoryGroup = 'insert';

export type TextEditHistory = BoundedEditHistory<TextEditBuffer, TextEditHistoryGroup>;

export type TextEditHistoryOperation =
  | TextEditOperation
  | { readonly kind: 'undo' }
  | { readonly kind: 'redo' };

export interface TextEditHistoryResult {
  readonly buffer: TextEditBuffer;
  readonly history: TextEditHistory;
}

export function emptyTextEditHistory(policy?: EditHistoryPolicy): TextEditHistory {
  return createBoundedEditHistory(policy);
}

export function breakTextEditHistoryGroup(history: TextEditHistory): TextEditHistory {
  return breakEditHistoryGroup(history);
}

export function applyTextEditWithHistory(
  buffer: TextEditBuffer,
  history: TextEditHistory,
  operation: TextEditHistoryOperation
): TextEditHistoryResult {
  if (operation.kind === 'undo') return undoTextEdit(buffer, history);
  if (operation.kind === 'redo') return redoTextEdit(buffer, history);

  const next = editTextBuffer(buffer, operation);
  if (sameBuffer(buffer, next)) {
    return {
      buffer: next,
      history
    };
  }

  if (buffer.text === next.text) {
    return {
      buffer: next,
      history: breakEditHistoryGroup(history)
    };
  }
  const group = historyGroupForOperation(operation, buffer);
  return {
    buffer: next,
    history: recordEditHistory(history, ownTextEditBuffer(buffer), textEditBufferBytes(buffer), group)
  };
}

function undoTextEdit(buffer: TextEditBuffer, history: TextEditHistory): TextEditHistoryResult {
  const transition = undoEditHistory(history, ownTextEditBuffer(buffer), textEditBufferBytes(buffer));
  if (transition.snapshot === undefined) return { buffer, history: transition.history };
  return {
    buffer: transition.snapshot,
    history: transition.history
  };
}

function redoTextEdit(buffer: TextEditBuffer, history: TextEditHistory): TextEditHistoryResult {
  const transition = redoEditHistory(history, ownTextEditBuffer(buffer), textEditBufferBytes(buffer));
  if (transition.snapshot === undefined) return { buffer, history: transition.history };
  return {
    buffer: transition.snapshot,
    history: transition.history
  };
}

function historyGroupForOperation(
  operation: TextEditOperation,
  buffer: TextEditBuffer
): TextEditHistoryGroup | undefined {
  return operation.kind === 'insert' && buffer.selection === undefined
    ? 'insert'
    : undefined;
}

function ownTextEditBuffer(buffer: TextEditBuffer): TextEditBuffer {
  return Object.freeze({
    text: buffer.text,
    cursor: buffer.cursor,
    ...(buffer.selection === undefined ? {} : {
      selection: Object.freeze({ ...buffer.selection })
    })
  });
}

function textEditBufferBytes(buffer: TextEditBuffer): number {
  return new TextEncoder().encode(buffer.text).byteLength + 24;
}

function sameBuffer(left: TextEditBuffer, right: TextEditBuffer): boolean {
  return left.text === right.text
    && left.cursor === right.cursor
    && sameSelection(left.selection, right.selection);
}

function sameSelection(
  left: TextEditBuffer['selection'],
  right: TextEditBuffer['selection']
): boolean {
  if (left === undefined || right === undefined) return left === right;
  return left.startOffset === right.startOffset && left.endOffsetExclusive === right.endOffsetExclusive;
}

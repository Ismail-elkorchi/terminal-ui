import { editTextBuffer } from './edit.ts';
import type { TextEditBuffer, TextEditOperation } from './types.ts';

export type TextEditHistoryGroup = 'insert';

export interface TextEditHistory {
  readonly undo: readonly TextEditBuffer[];
  readonly redo: readonly TextEditBuffer[];
  readonly currentGroup?: TextEditHistoryGroup;
}

export type TextEditHistoryOperation =
  | TextEditOperation
  | { readonly kind: 'undo' }
  | { readonly kind: 'redo' };

export interface TextEditHistoryResult {
  readonly buffer: TextEditBuffer;
  readonly history: TextEditHistory;
}

export function emptyTextEditHistory(): TextEditHistory {
  return {
    undo: [],
    redo: []
  };
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

  const group = historyGroupForOperation(operation);
  const undo = group !== undefined && history.currentGroup === group
    ? history.undo
    : [...history.undo, buffer];

  return {
    buffer: next,
    history: {
      undo,
      redo: [],
      ...(group === undefined ? {} : { currentGroup: group })
    }
  };
}

function undoTextEdit(buffer: TextEditBuffer, history: TextEditHistory): TextEditHistoryResult {
  const previous = history.undo[history.undo.length - 1];
  if (previous === undefined) {
    return {
      buffer,
      history: clearGroup(history)
    };
  }
  return {
    buffer: previous,
    history: {
      undo: history.undo.slice(0, -1),
      redo: [...history.redo, buffer]
    }
  };
}

function redoTextEdit(buffer: TextEditBuffer, history: TextEditHistory): TextEditHistoryResult {
  const next = history.redo[history.redo.length - 1];
  if (next === undefined) {
    return {
      buffer,
      history: clearGroup(history)
    };
  }
  return {
    buffer: next,
    history: {
      undo: [...history.undo, buffer],
      redo: history.redo.slice(0, -1)
    }
  };
}

function historyGroupForOperation(operation: TextEditOperation): TextEditHistoryGroup | undefined {
  return operation.kind === 'insert' ? 'insert' : undefined;
}

function clearGroup(history: TextEditHistory): TextEditHistory {
  return {
    undo: history.undo,
    redo: history.redo
  };
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
  return left.start === right.start && left.end === right.end;
}

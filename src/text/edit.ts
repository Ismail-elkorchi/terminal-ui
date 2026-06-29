import {
  nextGraphemeBoundary,
  normalizeTextCursor,
  normalizeTextSelection,
  previousGraphemeBoundary,
  replaceTextRange
} from './selection-model.ts';
import type { TextEditBuffer, TextEditOperation, TextSelection } from './types.ts';

export function editTextBuffer(buffer: TextEditBuffer, operation: TextEditOperation): TextEditBuffer {
  const cursor = normalizeTextCursor(buffer.text, buffer.cursor);
  const selection = normalizeTextSelection(buffer.text, buffer.selection);
  switch (operation.kind) {
    case 'insert': {
      return replaceTextRange(buffer.text, selectedRange(selection, cursor), operation.text);
    }
    case 'deleteBackward':
      if (selection !== undefined) return replaceTextRange(buffer.text, selection, '');
      if (cursor === 0) return { ...buffer, cursor };
      {
        const previous = previousGraphemeBoundary(buffer.text, cursor);
        return {
          text: `${buffer.text.slice(0, previous)}${buffer.text.slice(cursor)}`,
          cursor: previous
        };
      }
    case 'deleteForward': {
      if (selection !== undefined) return replaceTextRange(buffer.text, selection, '');
      if (cursor >= buffer.text.length) return { ...buffer, cursor };
      const next = nextGraphemeBoundary(buffer.text, cursor);
      return {
        text: `${buffer.text.slice(0, cursor)}${buffer.text.slice(next)}`,
        cursor
      };
    }
    case 'moveLeft':
      return { text: buffer.text, cursor: previousGraphemeBoundary(buffer.text, cursor) };
    case 'moveRight':
      return { text: buffer.text, cursor: nextGraphemeBoundary(buffer.text, cursor) };
    case 'moveHome':
      return { text: buffer.text, cursor: 0 };
    case 'moveEnd':
      return { text: buffer.text, cursor: buffer.text.length };
    case 'replaceSelection':
      return replaceTextRange(buffer.text, selectedRange(selection, cursor), operation.text);
  }
}

function selectedRange(selection: TextSelection | undefined, cursor: number): TextSelection {
  return selection ?? { start: cursor, end: cursor };
}

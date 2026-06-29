import { editTextBuffer } from './edit.ts';
import { lineEndOffset, lineStartOffset } from './word-boundaries.ts';
import type { TextAreaEditBuffer, TextAreaEditOperation } from './types.ts';

export function editTextAreaBuffer(
  buffer: TextAreaEditBuffer,
  operation: TextAreaEditOperation
): TextAreaEditBuffer {
  if (operation.kind === 'moveLineStart') {
    const cursor = lineStartOffset(buffer.text, buffer.cursor);
    return { text: buffer.text, cursor };
  }
  if (operation.kind === 'moveLineEnd') {
    const cursor = lineEndOffset(buffer.text, buffer.cursor);
    return { text: buffer.text, cursor };
  }
  return editTextBuffer(buffer, operation);
}

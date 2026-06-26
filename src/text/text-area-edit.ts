import { editTextBuffer } from './edit.ts';
import type { TextAreaEditBuffer, TextAreaEditOperation } from './types.ts';

export function editTextAreaBuffer(
  buffer: TextAreaEditBuffer,
  operation: TextAreaEditOperation
): TextAreaEditBuffer {
  if (operation.kind === 'moveLineStart') {
    const cursor = lineStart(buffer.text, buffer.cursor);
    return { text: buffer.text, cursor };
  }
  if (operation.kind === 'moveLineEnd') {
    const cursor = lineEnd(buffer.text, buffer.cursor);
    return { text: buffer.text, cursor };
  }
  return editTextBuffer(buffer, operation);
}

function lineStart(text: string, cursor: number): number {
  const bounded = Math.max(0, Math.min(text.length, cursor));
  return text.lastIndexOf('\n', Math.max(0, bounded - 1)) + 1;
}

function lineEnd(text: string, cursor: number): number {
  const bounded = Math.max(0, Math.min(text.length, cursor));
  const next = text.indexOf('\n', bounded);
  return next === -1 ? text.length : next;
}

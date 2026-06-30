import { editTextBuffer } from './edit.ts';
import type { TextEditBuffer, TextEditOperation } from './types.ts';

export function editTextAreaBuffer(
  buffer: TextEditBuffer,
  operation: TextEditOperation
): TextEditBuffer {
  return editTextBuffer(buffer, operation);
}

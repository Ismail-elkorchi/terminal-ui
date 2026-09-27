import { nonNegativeSafeInteger } from '../../foundation/validation.ts';
import type { TextSelection } from '../../text/types.ts';

export function decodeTextSelection(
  value: TextSelection | undefined, textLength: number, owner: string,
): TextSelection | undefined {
  if (value === undefined) return undefined;
  const startOffset = nonNegativeSafeInteger(value.startOffset, `${owner}.startOffset`);
  const endOffsetExclusive = nonNegativeSafeInteger(value.endOffsetExclusive, `${owner}.endOffsetExclusive`);
  if (startOffset > endOffsetExclusive || endOffsetExclusive > textLength) {
    throw new RangeError(`${owner} must be ordered and within the value.`);
  }
  return { startOffset, endOffsetExclusive };
}

import {
  textDocumentLineIndexAtOffset,
  type TextDocument,
  type TextDocumentChange,
} from '../../text/index.ts';

export interface TextDocumentChangedLineRange {
  readonly previousStart: number;
  readonly previousEndExclusive: number;
  readonly nextStart: number;
  readonly nextEndExclusive: number;
}

/** Maps exact source changes to the logical-line ranges they invalidate. */
export function textDocumentChangedLineRanges(
  previous: TextDocument,
  next: TextDocument,
  changes: readonly TextDocumentChange[],
): readonly TextDocumentChangedLineRange[] {
  const ranges: TextDocumentChangedLineRange[] = [];
  let delta = 0;
  for (const change of changes) {
    const nextStartOffset = change.startOffset + delta;
    const nextEndOffset = nextStartOffset + change.insertedText.length;
    const current = {
      previousStart: textDocumentLineIndexAtOffset(previous, change.startOffset),
      previousEndExclusive: textDocumentLineIndexAtOffset(
        previous,
        change.endOffsetExclusive,
      ) + 1,
      nextStart: textDocumentLineIndexAtOffset(next, nextStartOffset),
      nextEndExclusive: textDocumentLineIndexAtOffset(next, nextEndOffset) + 1,
    };
    delta += change.insertedText.length
      - (change.endOffsetExclusive - change.startOffset);
    const last = ranges.at(-1);
    if (
      last !== undefined
      && (current.previousStart < last.previousEndExclusive
        || current.nextStart < last.nextEndExclusive)
    ) {
      ranges[ranges.length - 1] = {
        previousStart: last.previousStart,
        previousEndExclusive: Math.max(last.previousEndExclusive, current.previousEndExclusive),
        nextStart: last.nextStart,
        nextEndExclusive: Math.max(last.nextEndExclusive, current.nextEndExclusive),
      };
    } else {
      ranges.push(current);
    }
  }
  return Object.freeze(ranges.map((range) => Object.freeze(range)));
}

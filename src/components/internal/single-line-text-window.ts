import { createTerminalTextIndex } from '../../text/terminal-text-index.ts';
import type { TextWidthProfile } from '../../text/types.ts';

export interface SingleLineTextWindow {
  readonly offsetCells: number;
  readonly cursorColumn: number;
  readonly startOffset: number;
  readonly endOffsetExclusive: number;
  readonly visibleText: string;
  readonly clippedBefore: boolean;
  readonly clippedAfter: boolean;
}

export function prepareSingleLineTextWindow(
  text: string,
  cursor: number,
  width: number,
  widthProfile: TextWidthProfile,
): SingleLineTextWindow {
  const contentWidth = Math.max(0, Math.floor(width));
  const index = createTerminalTextIndex(text, { widthProfile });
  const cursorGrapheme = index.codeUnitOffsetToGraphemeIndex(cursor);
  const cursorCells = index.graphemeIndexToVisualColumn(cursorGrapheme);
  const needsLeadingMarker = cursorCells > contentWidth;
  const textWidth = Math.max(0, contentWidth - Number(needsLeadingMarker));
  const maximumCursorDistance = textWidth;
  const targetStartColumn = Math.max(0, cursorCells - maximumCursorDistance);
  let startGrapheme = index.visualColumnToGraphemeIndex(targetStartColumn);
  if (
    index.graphemeIndexToVisualColumn(startGrapheme) < targetStartColumn
    && startGrapheme < index.graphemes.length
  ) {
    startGrapheme += 1;
  }
  const offsetCells = index.graphemeIndexToVisualColumn(startGrapheme);
  const clippedBefore = startGrapheme > 0;
  const availableTextCells = Math.max(0, contentWidth - Number(clippedBefore));
  const endColumn = offsetCells + availableTextCells;
  const endGrapheme = index.visualColumnToGraphemeIndex(endColumn);
  const startOffset = index.graphemeIndexToCodeUnitOffset(startGrapheme);
  const endOffsetExclusive = index.graphemeIndexToCodeUnitOffset(endGrapheme);
  return {
    offsetCells,
    cursorColumn: Number(clippedBefore) + cursorCells - offsetCells,
    startOffset,
    endOffsetExclusive,
    visibleText: text.slice(startOffset, endOffsetExclusive),
    clippedBefore,
    clippedAfter: endOffsetExclusive < text.length,
  };
}

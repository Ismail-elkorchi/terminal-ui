import { createTerminalTextIndex, terminalTextIndexForOwner } from '../../text/terminal-text-index.ts';
import type { TextPresentation, VisualGraphemeSegment } from '../../text/presentation.ts';
import type { TerminalTextIndex, TextAffinity, TextWidthProfile } from '../../text/types.ts';

export interface SingleLineTextWindow {
  readonly index: TerminalTextIndex;
  readonly graphemes: readonly VisualGraphemeSegment[];
  readonly offsetCells: number;
  readonly cursorColumn: number;
  readonly visibleText: string;
  readonly clippedBefore: boolean;
  readonly clippedAfter: boolean;
}

export function layoutSingleLineTextWindow(
  text: string,
  cursor: number,
  width: number,
  widthProfile: TextWidthProfile,
  textPresentation?: TextPresentation,
  affinity: TextAffinity = 'downstream',
  sourceOwner?: object,
): SingleLineTextWindow {
  const contentWidth = Math.max(0, Math.floor(width));
  const options = { widthProfile, textPresentation };
  const index = sourceOwner === undefined ? createTerminalTextIndex(text, options)
    : terminalTextIndexForOwner(sourceOwner, text, options);
  const cursorCells = index.positionToVisualColumn({ offset: cursor, affinity });
  const needsLeadingMarker = cursorCells > contentWidth;
  const textWidth = Math.max(0, contentWidth - Number(needsLeadingMarker));
  const targetStartColumn = Math.max(0, cursorCells - textWidth);
  const floor = index.visualColumnToPosition(targetStartColumn);
  const floorColumn = index.positionToVisualColumn(floor);
  const offsetCells = floorColumn < targetStartColumn
    ? index.positionToVisualColumn(index.moveVisualPosition(floor, 1)) : floorColumn;
  const clippedBefore = offsetCells > 0;
  const endColumn = offsetCells + Math.max(0, contentWidth - Number(clippedBefore));
  const graphemes = index.visualGraphemesInColumns(offsetCells, endColumn);
  return {
    index,
    graphemes,
    offsetCells,
    cursorColumn: Number(clippedBefore) + cursorCells - offsetCells,
    visibleText: graphemes.map(grapheme => grapheme.text).join(''),
    clippedBefore,
    clippedAfter: (graphemes.at(-1)?.endColumnExclusive ?? offsetCells) < index.cells,
  };
}

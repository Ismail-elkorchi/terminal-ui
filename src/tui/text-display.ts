import {
  clipTextCells,
  createTerminalTextIndex,
  lineStartOffset,
  normalizeTextCursor,
  normalizeTextSelection,
  terminalTextWidth
} from '../text/index.ts';
import type { TextSelection } from '../text/index.ts';
import type { RenderSpan, TerminalStyle } from './render-primitives.ts';

export interface TextCursorLineMetrics {
  readonly lineIndex: number;
  readonly columnCells: number;
}

export function singleLineCursorColumn(value: string, cursor: number | undefined, maxColumns?: number): number {
  const index = createTerminalTextIndex(value);
  const boundedCursor = normalizeTextCursor(value, cursor ?? value.length);
  const graphemeIndex = index.codeUnitOffsetToGraphemeIndex(boundedCursor);
  const cells = index.graphemeIndexToVisualColumn(graphemeIndex);
  return clampColumn(cells, maxColumns);
}

export function selectedTextSpans(
  value: string,
  selection: TextSelection | undefined,
  normalStyle: TerminalStyle | undefined,
  selectedStyle: TerminalStyle | undefined
): readonly RenderSpan[] {
  const normalized = normalizeTextSelection(value, selection);
  if (normalized === undefined) return [styledSpan(value, normalStyle)];
  return [
    ...(normalized.start > 0 ? [styledSpan(textRange(value, 0, normalized.start), normalStyle)] : []),
    styledSpan(textRange(value, normalized.start, normalized.end), selectedStyle),
    ...(normalized.end < value.length ? [styledSpan(textRange(value, normalized.end, value.length), normalStyle)] : [])
  ].filter((span) => span.text.length > 0);
}

export function visibleLineText(lineText: string, offsetCells: number, width: number): string {
  const start = Math.max(0, Math.floor(offsetCells));
  const index = createTerminalTextIndex(lineText);
  const startGrapheme = index.visualColumnToGraphemeIndex(start);
  const startOffset = index.graphemeIndexToCodeUnitOffset(startGrapheme);
  return clipTextCells(textRange(lineText, startOffset, lineText.length), Math.max(0, width)).text;
}

export function textCursorLineMetrics(value: string, cursor: number | undefined): TextCursorLineMetrics {
  const boundedCursor = normalizeTextCursor(value, cursor ?? value.length);
  const beforeCursor = textRange(value, 0, boundedCursor);
  const lineIndex = beforeCursor.split('\n').length - 1;
  const lineStart = lineStartOffset(value, boundedCursor);
  const currentLine = textRange(value, lineStart, boundedCursor);
  return {
    lineIndex,
    columnCells: terminalTextWidth(currentLine)
  };
}

export function textDisplayWidth(value: string): number {
  return terminalTextWidth(value);
}

function textRange(value: string, start: number, end: number): string {
  return value.slice(start, end);
}

function styledSpan(text: string, style: TerminalStyle | undefined): RenderSpan {
  return style === undefined ? { text } : { text, style };
}

function clampColumn(cells: number, maxColumns: number | undefined): number {
  const max = maxColumns === undefined ? cells : Math.max(0, Math.floor(maxColumns));
  return Math.max(0, Math.min(max, cells));
}

import {
  createTerminalTextIndex,
  textDocumentLineAt,
  textDocumentLineIndexAtOffset,
  textWidthProfileKey
} from '../../../text/index.ts';
import type { TerminalTextIndex, TextDocument, TextWidthProfile } from '../../../text/index.ts';
import type { TextAreaVisualLine } from '../input-visual.ts';
import type { ScrollState } from '../../../interaction/scroll.ts';

export interface ProjectedTextAreaLine extends TextAreaVisualLine {
  readonly index: TerminalTextIndex;
}

export interface TextAreaDocumentProjection {
  readonly document: TextDocument;
  readonly lines: readonly ProjectedTextAreaLine[];
  readonly logicalLineRowStarts: readonly number[];
  readonly contentRows: number;
  readonly intrinsicColumns: number;
  readonly contentColumns: number;
  readonly wrap: boolean;
  readonly width: number;
}

export interface TextAreaProjectedCursor {
  readonly rowIndex: number;
  readonly columnCells: number;
}

const MAX_LAYOUTS_PER_DOCUMENT = 8;
const projections = new WeakMap<TextDocument, Map<string, TextAreaDocumentProjection>>();

export function projectTextAreaDocument(
  document: TextDocument,
  width: number,
  wrap: boolean,
  widthProfile: TextWidthProfile
): TextAreaDocumentProjection {
  const normalizedWidth = Math.max(0, Math.floor(width));
  const key = `${wrap ? 'wrap' : 'single'}:${String(normalizedWidth)}:${textWidthProfileKey(widthProfile)}`;
  const cache = projectionCache(document);
  const cached = touch(cache, key);
  if (cached !== undefined) return cached;

  const lines: ProjectedTextAreaLine[] = [];
  const logicalLineRowStarts: number[] = [];
  let intrinsicColumns = 0;
  for (let lineIndex = 0; lineIndex < document.lineCount; lineIndex += 1) {
    logicalLineRowStarts.push(lines.length);
    const line = textDocumentLineAt(document, lineIndex);
    if (line === undefined) continue;
    const index = createTerminalTextIndex(line.text, { widthProfile });
    intrinsicColumns = Math.max(intrinsicColumns, index.cells);
    lines.push(...projectLine(line.text, line.start, line.index, index, normalizedWidth, wrap, widthProfile));
  }
  const projection = Object.freeze({
    document,
    lines: Object.freeze(lines),
    logicalLineRowStarts: Object.freeze(logicalLineRowStarts),
    contentRows: lines.length,
    intrinsicColumns,
    contentColumns: wrap ? Math.min(intrinsicColumns, normalizedWidth) : intrinsicColumns,
    wrap,
    width: normalizedWidth
  });
  retain(cache, key, projection);
  return projection;
}

export function textAreaCursorInProjection(
  projection: TextAreaDocumentProjection,
  rawOffset: number
): TextAreaProjectedCursor {
  const offset = Math.max(0, Math.min(projection.document.text.length, Math.floor(rawOffset)));
  const logicalLine = textDocumentLineIndexAtOffset(projection.document, offset);
  const firstRow = projection.logicalLineRowStarts[logicalLine] ?? 0;
  const nextRow = projection.logicalLineRowStarts[logicalLine + 1] ?? projection.lines.length;
  let rowIndex = firstRow;
  for (let index = firstRow; index < nextRow; index += 1) {
    const record = projection.lines[index];
    if (record === undefined) continue;
    const end = record.start + record.text.length;
    if (offset <= end || index === nextRow - 1) {
      rowIndex = index;
      break;
    }
  }
  const record = projection.lines[rowIndex] ?? projection.lines[0];
  if (record === undefined) return { rowIndex: 0, columnCells: 0 };
  const localOffset = Math.max(0, Math.min(record.text.length, offset - record.start));
  const grapheme = record.index.codeUnitOffsetToGraphemeIndex(localOffset);
  return { rowIndex, columnCells: record.index.graphemeIndexToVisualColumn(grapheme) };
}

export function textAreaOffsetInProjection(
  projection: TextAreaDocumentProjection,
  row: number,
  column: number
): number {
  const rowIndex = Math.max(0, Math.min(projection.lines.length - 1, Math.floor(row)));
  const record = projection.lines[rowIndex];
  if (record === undefined) return 0;
  const grapheme = record.index.visualColumnToGraphemeIndex(Math.max(0, Math.floor(column)));
  return record.start + record.index.graphemeIndexToCodeUnitOffset(grapheme);
}

export function textAreaVisibleText(
  projection: TextAreaDocumentProjection,
  scroll: ScrollState
): string {
  return projection.lines
    .slice(scroll.offsetRow, scroll.offsetRow + Math.max(0, scroll.viewportRows))
    .map((record) => textAreaVisibleLine(record, scroll.offsetColumn, scroll.viewportColumns))
    .join('\n');
}

function textAreaVisibleLine(record: ProjectedTextAreaLine, offsetColumn: number, width: number): string {
  const startGrapheme = record.index.visualColumnToGraphemeIndex(Math.max(0, offsetColumn));
  const endGrapheme = record.index.visualColumnToGraphemeIndex(Math.max(0, offsetColumn + width));
  const start = record.index.graphemeIndexToCodeUnitOffset(startGrapheme);
  const end = record.index.graphemeIndexToCodeUnitOffset(endGrapheme);
  return record.text.slice(start, end);
}

function projectLine(
  text: string,
  start: number,
  logicalLineIndex: number,
  index: TerminalTextIndex,
  width: number,
  wrap: boolean,
  widthProfile: TextWidthProfile
): readonly ProjectedTextAreaLine[] {
  if (!wrap || width <= 0 || index.cells <= width || text.length === 0) {
    return [{ text, start, logicalLineIndex, firstVisualLine: true, index }];
  }
  const rows: ProjectedTextAreaLine[] = [];
  let visualColumn = 0;
  while (visualColumn < index.cells) {
    const startGrapheme = index.visualColumnToGraphemeIndex(visualColumn);
    const endGrapheme = Math.max(startGrapheme + 1, index.visualColumnToGraphemeIndex(visualColumn + width));
    const startOffset = index.graphemeIndexToCodeUnitOffset(startGrapheme);
    const endOffset = index.graphemeIndexToCodeUnitOffset(endGrapheme);
    const rowText = text.slice(startOffset, endOffset);
    rows.push({
      text: rowText,
      start: start + startOffset,
      logicalLineIndex,
      firstVisualLine: rows.length === 0,
      index: createTerminalTextIndex(rowText, { widthProfile })
    });
    visualColumn = index.graphemeIndexToVisualColumn(endGrapheme);
    if (endOffset >= text.length) break;
  }
  return rows;
}

function projectionCache(document: TextDocument): Map<string, TextAreaDocumentProjection> {
  const existing = projections.get(document);
  if (existing !== undefined) return existing;
  const created = new Map<string, TextAreaDocumentProjection>();
  projections.set(document, created);
  return created;
}

function touch(
  cache: Map<string, TextAreaDocumentProjection>,
  key: string
): TextAreaDocumentProjection | undefined {
  const value = cache.get(key);
  if (value === undefined) return undefined;
  cache.delete(key);
  cache.set(key, value);
  return value;
}

function retain(
  cache: Map<string, TextAreaDocumentProjection>,
  key: string,
  value: TextAreaDocumentProjection
): void {
  while (cache.size >= MAX_LAYOUTS_PER_DOCUMENT) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
  cache.set(key, value);
}

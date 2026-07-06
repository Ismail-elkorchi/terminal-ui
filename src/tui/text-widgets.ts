import { createTerminalTextIndex, normalizeTextCursor, sanitizeTerminalText } from '../text/index.ts';
import { block, blockFromText, line, span, wrapRenderSpans } from './frame.ts';
import { widgetFrameSource } from './frame-source.ts';
import { normalizeScrollState } from './scroll.ts';
import {
  selectionFromUnknown,
  textCursorLineMetrics,
  textDisplayWidth
} from './text-display.ts';
import {
  textAreaInputContentBounds,
  textAreaInputCursor,
  textAreaInputLine,
  type TextAreaVisualLine
} from './input-visual.ts';
import {
  activityIndicatorText as feedbackActivityIndicatorText,
  helpBarText as feedbackHelpBarText,
  spinnerBlock as feedbackSpinnerBlock,
  spinnerText as feedbackSpinnerText
} from './feedback-visual.ts';
import { clampedTextOffset, textOffsetAtVisualColumn } from './text-pointer.ts';
import { defaultStyleForTextRole, mergeStyles, resolveWidgetStyle, themeStyle } from './widget-style.ts';
import { numberProp, stringify } from './widget-props.ts';
import { defaultTheme } from '../theme/index.ts';
import type { AccessibleNode } from '../accessibility/index.ts';
import type { TerminalTheme } from '../theme/index.ts';
import type { Widget, WidgetTextRole } from '../widgets/index.ts';
import { normalizeWidgetProcessStatus } from '../widgets/index.ts';
import type { CursorPosition } from './cursor.ts';
import type { FrameCellSource, RenderBlock, RenderLine, RenderSpan, TerminalStyle } from './frame.ts';
import type { Rect } from './layout.ts';
import type { RoutedPointerEvent } from './pointer-types.ts';

export function textBlock(widget: Widget): RenderBlock {
  const content = sanitizeTerminalText(stringify(widget.props['content'])).text;
  return blockFromText(content, {
    ...styleOption(textStyle(widget)),
    source: textSource(widget)
  });
}

export function textAccessibleBase(widget: Widget, id: string): AccessibleNode {
  return {
    id,
    role: 'text',
    label: id,
    value: sanitizeTerminalText(stringify(widget.props['content'])).text
  };
}

export function richTextBlock(widget: Widget, bounds: Rect): RenderBlock {
  const segments = richTextSegments(widget);
  if (widget.props['wrap'] === true && bounds.width > 0) {
    return block(wrapRenderSpans(segments, bounds.width));
  }
  return block([line(segments)]);
}

export function richTextText(widget: Widget, bounds: Rect): string {
  const segments = richTextSegments(widget);
  const lines = widget.props['wrap'] === true && bounds.width > 0
    ? wrapRenderSpans(segments, bounds.width)
    : [line(segments)];
  return lines.map(lineText).join('\n');
}

export function richTextAccessibleBase(widget: Widget, id: string): AccessibleNode {
  return {
    id,
    role: 'text',
    label: id,
    value: richTextSegments(widget).map((segment) => segment.text).join('')
  };
}

export function textAreaText(widget: Widget, bounds: Rect): string {
  return textAreaBlock(widget, bounds, defaultTheme).lines.map((currentLine) =>
    currentLine.spans.map((currentSpan) => currentSpan.text).join('')
  ).join('\n');
}

export function textAreaBlock(widget: Widget, bounds: Rect, theme: TerminalTheme, focused = false): RenderBlock {
  const value = sanitizeTerminalText(stringify(widget.props['value'])).text;
  const placeholder = sanitizeTerminalText(stringify(widget.props['placeholder'])).text;
  const usesPlaceholder = value.length === 0 && placeholder.length > 0;
  const lines = textAreaLines(widget);
  const contentBounds = textAreaInputContentBounds(bounds, theme, widget, lines.length);
  const lineRecords = textAreaVisualLineRecords(widget, usesPlaceholder ? placeholder : value, contentBounds.width);
  const scroll = textAreaScroll(widget, lineRecords, contentBounds);
  const activeLineIndex = usesPlaceholder ? undefined : textCursorLineMetrics(value, numberProp(widget, 'cursor')).lineIndex;
  const selection = usesPlaceholder ? undefined : selectionFromUnknown(value, widget.props['selection']);
  return block(lineRecords
    .slice(scroll.offsetRow, scroll.offsetRow + Math.max(0, bounds.height))
    .map((record, index): RenderLine => textAreaInputLine({
      widget,
      bounds,
      theme,
      lineCount: lines.length,
      usesPlaceholder,
      focused,
      ...(activeLineIndex === undefined ? {} : { activeLineIndex }),
      ...(selection === undefined ? {} : { selection })
    }, {
      lineRecord: record,
      rowIndex: index,
      lineIndex: scroll.offsetRow + index,
      offsetColumn: scroll.offsetColumn
    })));
}

export function textAreaAccessibleBase(
  widget: Widget,
  id: string,
  focused: boolean,
  bounds?: Rect,
  theme: TerminalTheme = defaultTheme
): AccessibleNode {
  const value = sanitizeTerminalText(stringify(widget.props['value'])).text;
  return {
    id,
    role: 'textbox',
    label: id,
    value,
    description: textAreaDescription(widget, value, bounds, theme),
    ...(widget.props['disabled'] === true ? { disabled: true } : {}),
    ...(focused ? { focused } : {})
  };
}

export function textAreaCursor(widget: Widget, bounds: Rect, theme: TerminalTheme = defaultTheme): CursorPosition {
  const value = sanitizeTerminalText(stringify(widget.props['value'])).text;
  const lineCount = textAreaLines(widget).length;
  const contentBounds = textAreaInputContentBounds(bounds, theme, widget, lineCount);
  const lineRecords = textAreaVisualLineRecords(widget, value, contentBounds.width);
  const scroll = textAreaScroll(widget, lineRecords, contentBounds);
  const cursor = textAreaVisualCursor(value, numberProp(widget, 'cursor'), lineRecords);
  const rowOffset = Math.max(0, Math.min(bounds.height - 1, cursor.rowIndex - scroll.offsetRow));
  return textAreaInputCursor({
    widget,
    bounds,
    theme,
    rowOffset,
    columnCells: cursor.columnCells,
    offsetColumn: scroll.offsetColumn,
    lineCount
  });
}

export function textAreaPointerOffset(
  widget: Widget,
  bounds: Rect,
  theme: TerminalTheme,
  pointer: RoutedPointerEvent
): number | undefined {
  if (pointer.localRow === undefined || pointer.localColumn === undefined) return undefined;
  const value = sanitizeTerminalText(stringify(widget.props['value'])).text;
  const lineCount = textAreaLines(widget).length;
  const contentBounds = textAreaInputContentBounds(bounds, theme, widget, lineCount);
  const lineRecords = textAreaVisualLineRecords(widget, value, contentBounds.width);
  const scroll = textAreaScroll(widget, lineRecords, contentBounds);
  const rowIndex = Math.max(
    0,
    Math.min(lineRecords.length - 1, scroll.offsetRow + pointer.localRow - 1)
  );
  const record = lineRecords[rowIndex];
  if (record === undefined) return 0;
  const gutterWidth = Math.max(0, bounds.width - contentBounds.width);
  const visualColumn = Math.max(0, pointer.localColumn - 1 - gutterWidth + scroll.offsetColumn);
  return clampedTextOffset(value, record.start + textOffsetAtVisualColumn(record.text, visualColumn));
}

export function helpBarText(widget: Widget): string {
  return feedbackHelpBarText(widget);
}

export function helpBarAccessibleBase(widget: Widget, id: string): AccessibleNode {
  return {
    id,
    role: 'status',
    label: id,
    value: helpBarText(widget),
    live: 'polite'
  };
}

export function activityIndicatorText(widget: Widget, theme: TerminalTheme): string {
  return feedbackActivityIndicatorText(widget, theme);
}

export function activityIndicatorAccessibleBase(widget: Widget, id: string): AccessibleNode {
  return {
    id,
    role: 'status',
    label: id,
    value: activityIndicatorText(widget, defaultTheme),
    live: 'polite'
  };
}

export function spinnerBlock(widget: Widget, theme: TerminalTheme): RenderBlock {
  return feedbackSpinnerBlock(widget, theme);
}

export function spinnerText(widget: Widget, theme: TerminalTheme): string {
  return feedbackSpinnerText(widget, theme);
}

export function spinnerAccessibleBase(widget: Widget, id: string): AccessibleNode {
  const status = normalizeWidgetProcessStatus(widget.props['status'], 'running');
  const label = stringify(widget.props['label']) || 'Loading';
  return {
    id,
    role: 'status',
    label: id,
    value: `${label} (${status})`,
    live: 'polite'
  };
}

function styledSegments(widget: Widget): readonly RenderSpan[] {
  if (!Array.isArray(widget.props['segments'])) return [];
  return widget.props['segments'].filter((segment): segment is RenderSpan =>
    typeof segment === 'object'
    && segment !== null
    && typeof (segment as { readonly text?: unknown }).text === 'string'
  );
}

function richTextSegments(widget: Widget): readonly RenderSpan[] {
  const rootStyle = resolveWidgetStyle(widget, { slot: 'root' });
  return styledSegments(widget).map((segment, index) => cleanSpan(widget, segment, index, rootStyle));
}

function cleanSpan(
  widget: Widget,
  segment: RenderSpan,
  index: number,
  rootStyle: RenderSpan['style']
): RenderSpan {
  return span(sanitizeTerminalText(segment.text).text, {
    ...styleOption(mergeStyles(rootStyle, linkStyle(segment), segment.style)),
    ...(segment.link === undefined ? {} : { link: segment.link }),
    source: segment.source ?? richTextSource(widget, index)
  });
}

function linkStyle(segment: RenderSpan): RenderSpan['style'] {
  return segment.link === undefined ? undefined : themeStyle('link.foreground', { underline: true });
}

function textStyle(widget: Widget): TerminalStyle | undefined {
  const role = widgetTextRole(widget.props['textRole']);
  const base = role === undefined ? undefined : defaultStyleForTextRole(role);
  if (base === undefined) return resolveWidgetStyle(widget, { slot: 'root' });
  return resolveWidgetStyle(widget, {
    slot: 'root',
    base
  });
}

function styleOption(style: TerminalStyle | undefined): { readonly style?: TerminalStyle } {
  return style === undefined ? {} : { style };
}

function textSource(widget: Widget): FrameCellSource {
  const role = widgetTextRole(widget.props['textRole']);
  return widgetFrameSource(widget, {
    family: 'text',
    role: 'text',
    part: role === undefined ? 'content' : `role.${role}`,
    label: role === undefined ? 'content' : `role.${role}`
  });
}

function richTextSource(widget: Widget, index: number): FrameCellSource {
  return widgetFrameSource(widget, {
    family: 'text',
    role: 'text',
    part: 'segment',
    itemIndex: index,
    label: `segment.${String(index)}`
  });
}

function widgetTextRole(value: unknown): WidgetTextRole | undefined {
  switch (value) {
    case 'title':
    case 'subtitle':
    case 'heading':
    case 'body':
    case 'caption':
    case 'metadata':
    case 'metric':
    case 'badge':
    case 'danger':
    case 'warning':
    case 'success':
      return value;
    default:
      return undefined;
  }
}

function lineText(renderLine: RenderLine): string {
  return renderLine.spans.map((currentSpan) => currentSpan.text).join('');
}

function textAreaDescription(widget: Widget, value: string, bounds: Rect | undefined, theme: TerminalTheme): string {
  const lines = value.length === 0 ? 0 : value.split('\n').length;
  const scrollText = bounds === undefined ? '' : textAreaScrollDescription(widget, bounds, theme);
  const selection = widget.props['selection'];
  const selectionText = typeof selection === 'object' && selection !== null ? ' Selection active.' : '';
  const requiredText = widget.props['required'] === true ? ' Required.' : '';
  const error = sanitizeTerminalText(stringify(widget.props['error'])).text;
  const errorText = error.length === 0 ? '' : ` ${error}`;
  return `${String(lines)} lines.${scrollText}${selectionText}${requiredText}${errorText}`;
}

function textAreaScrollDescription(widget: Widget, bounds: Rect, theme: TerminalTheme): string {
  const lines = textAreaLines(widget);
  const contentBounds = textAreaInputContentBounds(bounds, theme, widget, lines.length);
  const lineRecords = textAreaVisualLineRecords(widget, textAreaDisplayValue(widget), contentBounds.width);
  const scroll = textAreaScroll(widget, lineRecords, contentBounds);
  const totalRows = scroll.contentRows;
  const visibleRows = Math.min(totalRows, Math.max(0, scroll.viewportRows));
  const start = visibleRows === 0 ? 0 : scroll.offsetRow + 1;
  const end = visibleRows === 0 ? 0 : Math.min(totalRows, scroll.offsetRow + visibleRows);
  const omittedAfter = Math.max(0, totalRows - end);
  return ` Showing ${String(start)}-${String(end)} of ${String(totalRows)} rows. Omitted before: ${String(scroll.offsetRow)}. Omitted after: ${String(omittedAfter)}. Horizontal offset: ${String(scroll.offsetColumn)}.`;
}

function textAreaLines(widget: Widget): readonly string[] {
  const display = textAreaDisplayValue(widget);
  return display.length === 0 ? [''] : display.split('\n');
}

function textAreaDisplayValue(widget: Widget): string {
  const value = sanitizeTerminalText(stringify(widget.props['value'])).text;
  const placeholder = sanitizeTerminalText(stringify(widget.props['placeholder'])).text;
  return value.length === 0 && placeholder.length > 0 ? placeholder : value;
}

function textAreaLogicalLineRecords(value: string): readonly TextAreaVisualLine[] {
  const lines = value.length === 0 ? [''] : value.split('\n');
  let start = 0;
  return lines.map((lineText, index) => {
    const record = {
      text: lineText,
      start,
      logicalLineIndex: index,
      firstVisualLine: true
    };
    start += lineText.length + 1;
    return record;
  });
}

function textAreaVisualLineRecords(widget: Widget, value: string, contentWidth: number): readonly TextAreaVisualLine[] {
  const logical = textAreaLogicalLineRecords(value);
  if (!textAreaWrapEnabled(widget) || contentWidth <= 0) return logical;
  return logical.flatMap((record) => wrapTextAreaLineRecord(record, contentWidth));
}

function wrapTextAreaLineRecord(record: TextAreaVisualLine, width: number): readonly TextAreaVisualLine[] {
  if (record.text.length === 0) return [record];
  const index = createTerminalTextIndex(record.text);
  if (index.cells <= width) return [record];
  const rows: TextAreaVisualLine[] = [];
  let visualColumn = 0;
  while (visualColumn < index.cells) {
    const startGrapheme = index.visualColumnToGraphemeIndex(visualColumn);
    const endGrapheme = Math.max(startGrapheme + 1, index.visualColumnToGraphemeIndex(visualColumn + width));
    const startOffset = index.graphemeIndexToCodeUnitOffset(startGrapheme);
    const endOffset = index.graphemeIndexToCodeUnitOffset(endGrapheme);
    rows.push({
      text: record.text.slice(startOffset, endOffset),
      start: record.start + startOffset,
      logicalLineIndex: record.logicalLineIndex,
      firstVisualLine: rows.length === 0
    });
    visualColumn = index.graphemeIndexToVisualColumn(endGrapheme);
    if (endOffset >= record.text.length) break;
  }
  return rows.length === 0 ? [record] : rows;
}

function textAreaVisualCursor(
  value: string,
  rawCursor: number | undefined,
  records: readonly TextAreaVisualLine[]
): { readonly rowIndex: number; readonly columnCells: number } {
  const cursor = normalizeTextCursor(value, rawCursor ?? value.length);
  const rowIndex = Math.max(0, records.findIndex((record, index) => {
    const end = record.start + record.text.length;
    const last = index === records.length - 1;
    return cursor >= record.start && (cursor < end || last || cursor === end);
  }));
  const record = records[rowIndex] ?? records[0] ?? { text: '', start: 0 };
  return {
    rowIndex,
    columnCells: textDisplayWidth(value.slice(record.start, cursor))
  };
}

function textAreaScroll(
  widget: Widget,
  lines: readonly TextAreaVisualLine[],
  bounds: Rect
): ReturnType<typeof normalizeScrollState> {
  const raw = widget.props['scroll'];
  const rawRecord = isRecord(raw) ? raw : {};
  const contentColumns = textAreaWrapEnabled(widget)
    ? bounds.width
    : lines.reduce<number>((max, lineText) => Math.max(max, textDisplayWidth(lineText.text)), 0);
  return normalizeScrollState({
    offsetRow: numberField(rawRecord, 'offsetRow') ?? 0,
    offsetColumn: numberField(rawRecord, 'offsetColumn') ?? 0,
    contentRows: lines.length,
    contentColumns,
    viewportRows: bounds.height,
    viewportColumns: bounds.width,
    followTail: rawRecord['followTail'] === true
  });
}

function textAreaWrapEnabled(widget: Widget): boolean {
  const raw = widget.props['wrap'];
  if (raw === true) return true;
  if (!isRecord(raw)) return false;
  const mode = raw['mode'];
  return mode === undefined || mode === 'soft';
}

function numberField(record: Readonly<Record<string, unknown>>, key: string): number | undefined {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

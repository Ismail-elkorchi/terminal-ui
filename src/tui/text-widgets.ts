import { sanitizeTerminalText } from '../text/index.ts';
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
  textAreaInputLine
} from './input-visual.ts';
import {
  activityIndicatorText as feedbackActivityIndicatorText,
  helpBarText as feedbackHelpBarText,
  spinnerBlock as feedbackSpinnerBlock,
  spinnerText as feedbackSpinnerText
} from './feedback-visual.ts';
import { defaultStyleForTextRole, mergeStyles, resolveWidgetStyle } from './widget-style.ts';
import { numberProp, stringify } from './widget-props.ts';
import { defaultTheme } from '../theme/index.ts';
import type { AccessibleNode } from '../accessibility/index.ts';
import type { TerminalTheme } from '../theme/index.ts';
import type { Widget, WidgetTextRole } from '../widgets/index.ts';
import { normalizeWidgetProcessStatus } from '../widgets/index.ts';
import type { CursorPosition } from './cursor.ts';
import type { FrameCellSource, RenderBlock, RenderLine, RenderSpan, TerminalStyle } from './frame.ts';
import type { Rect } from './layout.ts';

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
  const contentBounds = textAreaInputContentBounds(bounds, theme);
  const scroll = textAreaScroll(widget, lines, contentBounds);
  const lineRecords = textAreaLineRecords(usesPlaceholder ? placeholder : value);
  const selection = usesPlaceholder ? undefined : selectionFromUnknown(value, widget.props['selection']);
  return block(lineRecords
    .slice(scroll.offsetRow, scroll.offsetRow + Math.max(0, bounds.height))
    .map((record, index): RenderLine => textAreaInputLine({
      widget,
      bounds,
      theme,
      lines: lineRecords,
      usesPlaceholder,
      focused,
      ...(selection === undefined ? {} : { selection })
    }, {
      lineRecord: record,
      rowIndex: index,
      offsetColumn: scroll.offsetColumn
    })));
}

export function textAreaAccessibleBase(widget: Widget, id: string, focused: boolean): AccessibleNode {
  const value = sanitizeTerminalText(stringify(widget.props['value'])).text;
  return {
    id,
    role: 'textbox',
    label: id,
    value,
    description: textAreaDescription(widget, value),
    ...(widget.props['disabled'] === true ? { disabled: true } : {}),
    ...(focused ? { focused } : {})
  };
}

export function textAreaCursor(widget: Widget, bounds: Rect, theme: TerminalTheme = defaultTheme): CursorPosition {
  const value = sanitizeTerminalText(stringify(widget.props['value'])).text;
  const metrics = textCursorLineMetrics(value, numberProp(widget, 'cursor'));
  const contentBounds = textAreaInputContentBounds(bounds, theme);
  const scroll = textAreaScroll(widget, textAreaLines(widget), contentBounds);
  const rowOffset = Math.max(0, Math.min(bounds.height - 1, metrics.lineIndex - scroll.offsetRow));
  return textAreaInputCursor({
    widget,
    bounds,
    theme,
    rowOffset,
    columnCells: metrics.columnCells,
    offsetColumn: scroll.offsetColumn
  });
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
    ...styleOption(mergeStyles(rootStyle, segment.style)),
    ...(segment.link === undefined ? {} : { link: segment.link }),
    source: segment.source ?? richTextSource(widget, index)
  });
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

function textAreaDescription(widget: Widget, value: string): string {
  const lines = value.length === 0 ? 0 : value.split('\n').length;
  const selection = widget.props['selection'];
  const selectionText = typeof selection === 'object' && selection !== null ? ' Selection active.' : '';
  const requiredText = widget.props['required'] === true ? ' Required.' : '';
  const error = sanitizeTerminalText(stringify(widget.props['error'])).text;
  const errorText = error.length === 0 ? '' : ` ${error}`;
  return `${String(lines)} lines.${selectionText}${requiredText}${errorText}`;
}

function textAreaLines(widget: Widget): readonly string[] {
  const value = sanitizeTerminalText(stringify(widget.props['value'])).text;
  const placeholder = sanitizeTerminalText(stringify(widget.props['placeholder'])).text;
  const display = value.length === 0 && placeholder.length > 0 ? placeholder : value;
  return display.length === 0 ? [''] : display.split('\n');
}

function textAreaLineRecords(value: string): readonly { readonly text: string; readonly start: number }[] {
  const lines = value.length === 0 ? [''] : value.split('\n');
  let start = 0;
  return lines.map((lineText) => {
    const record = { text: lineText, start };
    start += lineText.length + 1;
    return record;
  });
}

function textAreaScroll(
  widget: Widget,
  lines: readonly string[],
  bounds: Rect
): ReturnType<typeof normalizeScrollState> {
  const raw = widget.props['scroll'];
  const rawRecord = isRecord(raw) ? raw : {};
  const contentColumns = lines.reduce<number>((max, lineText) => Math.max(max, textDisplayWidth(lineText)), 0);
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

function numberField(record: Readonly<Record<string, unknown>>, key: string): number | undefined {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

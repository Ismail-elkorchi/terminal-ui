import { clipTextCells, measureTextCells, sanitizeTerminalText, wrapTextCells } from '../text/index.ts';
import { block, line, span } from './frame.ts';
import { normalizeScrollState } from './scroll.ts';
import { normalizeSpinnerFrameIndex } from './spinner.ts';
import { activityStatus, statusMarker, statusStyle } from './status-visual.ts';
import { numberProp, stringify } from './widget-props.ts';
import { defaultTheme } from '../theme/index.ts';
import type { AccessibleNode } from '../accessibility/index.ts';
import type { TerminalTheme } from '../theme/index.ts';
import type { Widget } from '../widgets/index.ts';
import type { RenderBlock, RenderSpan } from './frame.ts';
import type { Rect } from './layout.ts';

export function richTextBlock(widget: Widget, bounds: Rect): RenderBlock {
  const segments = styledSegments(widget);
  if (widget.props['wrap'] === true && bounds.width > 0) {
    return blockFromPlainText(richTextText(widget, bounds));
  }
  return block([line(segments.map(cleanSpan))]);
}

export function richTextText(widget: Widget, bounds: Rect): string {
  const text = styledSegments(widget).map((segment) => sanitizeTerminalText(segment.text).text).join('');
  if (widget.props['wrap'] !== true || bounds.width <= 0) return text;
  return wrapTextCells(text, bounds.width).map((line) => line.text).join('\n');
}

export function richTextAccessibleBase(widget: Widget, id: string): AccessibleNode {
  return {
    id,
    role: 'text',
    label: id,
    value: styledSegments(widget).map((segment) => sanitizeTerminalText(segment.text).text).join('')
  };
}

export function textAreaText(widget: Widget, bounds: Rect): string {
  const lines = textAreaLines(widget);
  const scroll = textAreaScroll(widget, lines, bounds);
  return lines
    .slice(scroll.offsetRow, scroll.offsetRow + Math.max(0, bounds.height))
    .map((lineText) => clipTextCells(scrolledLineText(lineText, scroll.offsetColumn), Math.max(0, bounds.width)).text)
    .join('\n');
}

export function textAreaAccessibleBase(widget: Widget, id: string, focused: boolean): AccessibleNode {
  const value = sanitizeTerminalText(stringify(widget.props['value'])).text;
  return {
    id,
    role: 'textbox',
    label: id,
    value,
    description: textAreaDescription(widget, value),
    ...(focused ? { focused } : {})
  };
}

export function textAreaCursor(widget: Widget, bounds: Rect): { readonly row: number; readonly column: number } {
  const value = sanitizeTerminalText(stringify(widget.props['value'])).text;
  const cursor = Math.max(0, Math.min(value.length, Math.floor(numberProp(widget, 'cursor') ?? value.length)));
  const before = value.slice(0, cursor).split('\n');
  const scroll = textAreaScroll(widget, textAreaLines(widget), bounds);
  const rowOffset = Math.max(0, Math.min(bounds.height - 1, before.length - 1 - scroll.offsetRow));
  const currentLine = before.at(-1) ?? '';
  const columnOffset = Math.max(0, Math.min(bounds.width - 1, Math.max(0, measureTextCells(currentLine).cells - scroll.offsetColumn)));
  return { row: bounds.row + rowOffset, column: bounds.column + columnOffset };
}

export function helpBarText(widget: Widget): string {
  return helpBindings(widget)
    .map((binding) => `${binding.key} ${binding.label}`)
    .join('  ');
}

export function helpBarAccessibleBase(widget: Widget, id: string): AccessibleNode {
  return {
    id,
    role: 'status',
    label: id,
    value: helpBarText(widget)
  };
}

export function activityIndicatorText(widget: Widget, theme: TerminalTheme): string {
  const label = stringify(widget.props['label']) || 'Activity';
  const status = activityStatus(widget.props['status']);
  return `${statusMarker(status, theme)} ${label}${status === 'idle' ? '' : ` (${status})`}`;
}

export function activityIndicatorAccessibleBase(widget: Widget, id: string): AccessibleNode {
  return {
    id,
    role: 'status',
    label: id,
    value: activityIndicatorText(widget, defaultTheme)
  };
}

export function spinnerBlock(widget: Widget, theme: TerminalTheme): RenderBlock {
  const status = spinnerStatus(widget.props['status']);
  const label = spinnerLabel(widget);
  return block([line([
    span(spinnerMarker(widget, theme, status), { style: statusStyle(status) }),
    span(` ${label}${status === 'running' ? '' : ` (${status})`}`)
  ])]);
}

export function spinnerText(widget: Widget, theme: TerminalTheme): string {
  return spinnerBlock(widget, theme).lines.map((currentLine) => currentLine.spans.map((currentSpan) => currentSpan.text).join('')).join('\n');
}

export function spinnerAccessibleBase(widget: Widget, id: string): AccessibleNode {
  const status = spinnerStatus(widget.props['status']);
  const label = spinnerLabel(widget);
  return {
    id,
    role: 'status',
    label: id,
    value: `${label} (${status})`
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

function cleanSpan(segment: RenderSpan): RenderSpan {
  return span(sanitizeTerminalText(segment.text).text, {
    ...(segment.style === undefined ? {} : { style: segment.style }),
    ...(segment.link === undefined ? {} : { link: segment.link }),
    ...(segment.source === undefined ? {} : { source: segment.source })
  });
}

function textAreaDescription(widget: Widget, value: string): string {
  const lines = value.length === 0 ? 0 : value.split('\n').length;
  const selection = widget.props['selection'];
  const selectionText = typeof selection === 'object' && selection !== null ? ' Selection active.' : '';
  return `${String(lines)} lines.${selectionText}`;
}

function textAreaLines(widget: Widget): readonly string[] {
  const value = sanitizeTerminalText(stringify(widget.props['value'])).text;
  const placeholder = sanitizeTerminalText(stringify(widget.props['placeholder'])).text;
  const display = value.length === 0 && placeholder.length > 0 ? placeholder : value;
  return display.length === 0 ? [''] : display.split('\n');
}

function textAreaScroll(
  widget: Widget,
  lines: readonly string[],
  bounds: Rect
): ReturnType<typeof normalizeScrollState> {
  const raw = widget.props['scroll'];
  const rawRecord = isRecord(raw) ? raw : {};
  const contentColumns = lines.reduce<number>((max, lineText) => Math.max(max, measureTextCells(lineText).cells), 0);
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

function scrolledLineText(lineText: string, offsetCells: number): string {
  if (offsetCells <= 0) return lineText;
  let skipped = 0;
  let output = '';
  for (const segment of measureTextCells(lineText).graphemes) {
    if (skipped < offsetCells) {
      skipped += segment.cells;
      continue;
    }
    output += segment.text;
  }
  return output;
}

function numberField(record: Readonly<Record<string, unknown>>, key: string): number | undefined {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function helpBindings(widget: Widget): readonly { readonly key: string; readonly label: string }[] {
  if (!Array.isArray(widget.props['bindings'])) return [];
  return widget.props['bindings'].filter((binding): binding is { readonly key: string; readonly label: string } =>
    typeof binding === 'object'
    && binding !== null
    && typeof (binding as { readonly key?: unknown }).key === 'string'
    && typeof (binding as { readonly label?: unknown }).label === 'string'
  ).map((binding) => ({
    key: sanitizeTerminalText(binding.key).text,
    label: sanitizeTerminalText(binding.label).text
  }));
}

function spinnerStatus(value: unknown): ReturnType<typeof activityStatus> {
  return activityStatus(value, 'running');
}

function spinnerLabel(widget: Widget): string {
  return stringify(widget.props['label']) || 'Loading';
}

function spinnerMarker(widget: Widget, theme: TerminalTheme, status: ReturnType<typeof activityStatus>): string {
  if (status !== 'running') return statusMarker(status, theme);
  const frames = spinnerFrames(widget, theme);
  const frameIndex = numberProp(widget, 'frameIndex') ?? 0;
  return frames[normalizeSpinnerFrameIndex(frameIndex, frames.length)] ?? theme.symbols.statusInfo;
}

function spinnerFrames(widget: Widget, theme: TerminalTheme): readonly string[] {
  const frames = widget.props['frames'];
  if (!Array.isArray(frames)) return theme.symbols.spinnerFrames;
  const cleaned = frames.filter((frame): frame is string => typeof frame === 'string')
    .map((frame) => sanitizeTerminalText(frame).text.replace(/\s*\n\s*/gu, ' '))
    .filter((frame) => frame.length > 0);
  return cleaned.length === 0 ? theme.symbols.spinnerFrames : cleaned;
}

function blockFromPlainText(text: string): RenderBlock {
  return block(text.split('\n').map((part) => line([span(part)])));
}

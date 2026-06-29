import { measureTextCells, sanitizeTerminalText } from '../../../text/index.ts';
import type { TerminalTheme } from '../../../theme/index.ts';
import type { Widget } from '../../../widgets/index.ts';
import { dataWindow } from '../../data-window.ts';
import { normalizeScrollState } from '../../scroll.ts';
import { renderScrollbars, scrollbarLayout } from '../../scrollbar.ts';
import { scrollbackWindow } from '../../scrollback.ts';
import { numberProp, stringify } from '../../widget-props.ts';
import { isRecord, nonNegativeInteger } from './common.ts';
import type { FrameBuffer } from '../../frame.ts';
import type { LayoutNode, Rect } from '../../layout.ts';
import type { ScrollbarLayout, ScrollbarOptions, ScrollbarState } from '../../scrollbar.ts';

interface WidgetScrollbarPlan {
  readonly contentBounds: Rect;
  readonly layout?: ScrollbarLayout;
}

export function scrollbarsForWidget(
  widget: Widget,
  bounds: Rect,
  state: ScrollbarState,
  fallbackAxis: NonNullable<ScrollbarOptions['axis']>
): WidgetScrollbarPlan {
  const options = scrollbarOptionsProp(widget, fallbackAxis);
  if (options === undefined) return { contentBounds: bounds };
  const layout = scrollbarLayout(bounds, state, options);
  return {
    contentBounds: layout.contentBounds,
    layout
  };
}

export function drawScrollbars(
  buffer: FrameBuffer,
  plan: WidgetScrollbarPlan,
  theme: TerminalTheme
): void {
  if (plan.layout !== undefined) renderScrollbars(buffer, plan.layout, theme);
}

function scrollbarOptionsProp(
  widget: Widget,
  fallbackAxis: NonNullable<ScrollbarOptions['axis']>
): ScrollbarOptions | undefined {
  const raw = widget.props['scrollbar'];
  if (!isRecord(raw)) return undefined;
  const visible = raw['visible'];
  const axis = raw['axis'];
  return {
    axis: isScrollbarAxis(axis) ? axis : fallbackAxis,
    visible: isScrollbarVisibility(visible) ? visible : 'auto'
  };
}

function isScrollbarAxis(value: unknown): value is NonNullable<ScrollbarOptions['axis']> {
  return value === 'vertical' || value === 'horizontal' || value === 'both';
}

function isScrollbarVisibility(value: unknown): value is NonNullable<ScrollbarOptions['visible']> {
  return value === 'auto' || value === 'always' || value === 'never';
}

export function tableScrollbarState(widget: Widget, bounds: Rect): ScrollbarState {
  const rows = Array.isArray(widget.props['rows']) ? widget.props['rows'] : [];
  const selected = selectedTableRow(widget);
  const window = dataWindow({
    totalRows: rows.length,
    viewportRows: bounds.height,
    selectedIndex: selected
  });
  const configured = normalizedWidgetScroll(widget, {
    offsetRow: scrollNumberProp(widget, 'offsetRow') ?? window.start,
    contentRows: scrollNumberProp(widget, 'contentRows') ?? rows.length,
    contentColumns: scrollNumberProp(widget, 'contentColumns') ?? bounds.width,
    viewportRows: bounds.height,
    viewportColumns: bounds.width
  });
  return scrollbarStateFromScroll(configured);
}

export function treeScrollbarState(widget: Widget, bounds: Rect): ScrollbarState {
  const scroll = normalizedWidgetScroll(widget, {
    contentRows: scrollNumberProp(widget, 'contentRows') ?? bounds.height,
    contentColumns: scrollNumberProp(widget, 'contentColumns') ?? bounds.width,
    viewportRows: bounds.height,
    viewportColumns: bounds.width
  });
  return scrollbarStateFromScroll(scroll);
}

export function viewportScrollbarState(widget: Widget, bounds: Rect): ScrollbarState {
  const scrollRow = nonNegativeInteger(numberProp(widget, 'scrollRow'));
  const scrollColumn = nonNegativeInteger(numberProp(widget, 'scrollColumn'));
  const contentRows = Math.max(bounds.height + scrollRow, nonNegativeInteger(numberProp(widget, 'contentRows')));
  const contentColumns = Math.max(bounds.width + scrollColumn, nonNegativeInteger(numberProp(widget, 'contentColumns')));
  return {
    offsetRow: scrollRow,
    offsetColumn: scrollColumn,
    contentRows,
    contentColumns
  };
}

export function scrollbackScrollbarState(widget: Widget, node: LayoutNode): ScrollbarState {
  const window = scrollbackWindow(widget, node);
  return {
    offsetRow: window.start,
    offsetColumn: 0,
    contentRows: window.totalRows,
    contentColumns: node.bounds.width
  };
}

export function paletteScrollbarState(widget: Widget, bounds: Rect): ScrollbarState {
  const entries = Array.isArray(widget.props['entries']) ? widget.props['entries'] : [];
  const scroll = normalizedWidgetScroll(widget, {
    contentRows: scrollNumberProp(widget, 'contentRows') ?? entries.length,
    contentColumns: scrollNumberProp(widget, 'contentColumns') ?? bounds.width,
    viewportRows: bounds.height,
    viewportColumns: bounds.width
  });
  return scrollbarStateFromScroll(scroll);
}

export function menuScrollbarState(widget: Widget, bounds: Rect): ScrollbarState {
  const rows = countMenuRows(widget.props['items']);
  const scroll = normalizedWidgetScroll(widget, {
    contentRows: scrollNumberProp(widget, 'contentRows') ?? rows,
    contentColumns: scrollNumberProp(widget, 'contentColumns') ?? bounds.width,
    viewportRows: bounds.height,
    viewportColumns: bounds.width
  });
  return scrollbarStateFromScroll(scroll);
}

export function textAreaScrollbarState(widget: Widget, bounds: Rect): ScrollbarState {
  const lines = textAreaLines(widget);
  const contentColumns = lines.reduce<number>((max, lineText) => Math.max(max, measureTextCells(lineText).cells), 0);
  const scroll = normalizedWidgetScroll(widget, {
    contentRows: lines.length,
    contentColumns,
    viewportRows: bounds.height,
    viewportColumns: bounds.width
  });
  return scrollbarStateFromScroll(scroll);
}

function scrollbarStateFromScroll(scroll: ReturnType<typeof normalizeScrollState>): ScrollbarState {
  return {
    offsetRow: scroll.offsetRow,
    offsetColumn: scroll.offsetColumn,
    contentRows: scroll.contentRows,
    contentColumns: scroll.contentColumns
  };
}

interface WidgetScrollStateInput {
  readonly offsetRow?: number;
  readonly offsetColumn?: number;
  readonly contentRows: number;
  readonly contentColumns: number;
  readonly viewportRows: number;
  readonly viewportColumns: number;
}

function normalizedWidgetScroll(widget: Widget, input: WidgetScrollStateInput): ReturnType<typeof normalizeScrollState> {
  const raw = isRecord(widget.props['scroll']) ? widget.props['scroll'] : {};
  const selectedIndex = scrollNumberField(raw, 'selectedIndex');
  return normalizeScrollState({
    offsetRow: input.offsetRow ?? scrollNumberField(raw, 'offsetRow') ?? 0,
    offsetColumn: input.offsetColumn ?? scrollNumberField(raw, 'offsetColumn') ?? 0,
    contentRows: input.contentRows,
    contentColumns: input.contentColumns,
    viewportRows: input.viewportRows,
    viewportColumns: input.viewportColumns,
    followTail: raw['followTail'] === true,
    ...(selectedIndex === undefined ? {} : { selectedIndex })
  });
}

function scrollNumberProp(widget: Widget, key: string): number | undefined {
  const raw = widget.props['scroll'];
  return isRecord(raw) ? scrollNumberField(raw, key) : undefined;
}

function scrollNumberField(record: Readonly<Record<string, unknown>>, key: string): number | undefined {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function countMenuRows(value: unknown): number {
  if (!Array.isArray(value)) return 0;
  return value.reduce<number>((count, item) => {
    if (!isRecord(item)) return count;
    const children = item['expanded'] === true ? countMenuRows(item['children']) : 0;
    return count + 1 + children;
  }, 0);
}

function textAreaLines(widget: Widget): readonly string[] {
  const value = sanitizeTerminalText(stringify(widget.props['value'])).text;
  const placeholder = sanitizeTerminalText(stringify(widget.props['placeholder'])).text;
  const display = value.length === 0 && placeholder.length > 0 ? placeholder : value;
  return display.length === 0 ? [''] : display.split('\n');
}

function selectedTableRow(widget: Widget): number {
  const selectedCell = widget.props['selectedCell'];
  if (isRecord(selectedCell)) {
    const row = selectedCell['row'];
    if (typeof row === 'number' && Number.isFinite(row)) return Math.max(0, Math.floor(row));
  }
  return Math.max(0, Math.floor(numberProp(widget, 'selected') ?? 0));
}

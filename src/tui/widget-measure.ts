import { measureTextCells, sanitizeTerminalText } from '../text/index.ts';
import { commandBarBlock } from './command-bar.ts';
import { barChartText, chartText, sparklineText } from './chart-widgets.ts';
import { paginatorText } from './data-widgets.ts';
import {
  buttonBlock,
  checkboxBlock,
  labelBlock,
  numberInputBlock,
  radioGroupBlock,
  selectBoxBlock,
  textInputBlock
} from './form-widgets.ts';
import { contextMenuBlock, dropdownBlock, menuBarBlock, menuBlock } from './menu-widgets.ts';
import { paletteBlock } from './palette.ts';
import { progressText } from './progress-widget.ts';
import { borderForWidget } from './renderers/support/border.ts';
import { isRecord, nonNegativeInteger } from './renderers/support/common.ts';
import { tabsHeaderText } from './renderers/support/tabs.ts';
import { activityFeedBlock, structuredBlockBlock } from './structured-block.ts';
import { activityIndicatorText, helpBarText, richTextBlock, spinnerBlock } from './text-widgets.ts';
import { treeBlock } from './tree.ts';
import { numberProp, stringify } from './widget-props.ts';
import type { TerminalTheme } from '../theme/index.ts';
import type { Widget } from '../widgets/index.ts';
import type { RenderBlock, RenderLine } from './frame.ts';
import type { LayoutNode, Rect } from './layout.ts';
import type { WidgetMeasureResult } from './widget-renderer.ts';

export type WidgetMeasureFunction = (widget: Widget, bounds: Rect, theme: TerminalTheme) => WidgetMeasureResult;

export function sanitizeWidgetMeasure(measure: WidgetMeasureResult): WidgetMeasureResult {
  const minWidth = nonNegativeInteger(measure.minWidth);
  const minHeight = nonNegativeInteger(measure.minHeight);
  const maxWidth = optionalSize(measure.maxWidth);
  const maxHeight = optionalSize(measure.maxHeight);
  const preferredWidth = clampMeasuredSize(measure.preferredWidth, minWidth, maxWidth);
  const preferredHeight = clampMeasuredSize(measure.preferredHeight, minHeight, maxHeight);
  return {
    minWidth,
    minHeight,
    preferredWidth,
    preferredHeight,
    ...(maxWidth === undefined ? {} : { maxWidth }),
    ...(maxHeight === undefined ? {} : { maxHeight })
  };
}

export function zeroWidgetMeasure(): WidgetMeasureResult {
  return { minWidth: 0, minHeight: 0, preferredWidth: 0, preferredHeight: 0 };
}

export function measureBuiltinWidget(
  widget: Widget,
  bounds: Rect,
  theme: TerminalTheme,
  measureWidget: WidgetMeasureFunction
): WidgetMeasureResult {
  switch (widget.kind) {
    case 'text':
      return measurePlainText(stringify(widget.props['content']));
    case 'richText':
      return measureRenderBlock(richTextBlock(widget, intrinsicBounds(bounds)));
    case 'statusBar':
      return measurePlainText(stringify(widget.props['text']));
    case 'inputField':
      return measurePlainText(stringify(widget.props['value']));
    case 'textArea':
      return measurePlainText(textAreaMeasureText(widget));
    case 'label':
      return measureRenderBlock(labelBlock(widget, intrinsicBounds(bounds)));
    case 'button':
      return measureRenderBlock(buttonBlock(widget, intrinsicBounds(bounds)));
    case 'checkbox':
      return measureRenderBlock(checkboxBlock(widget, intrinsicBounds(bounds), theme));
    case 'radioGroup':
      return measureRenderBlock(radioGroupBlock(widget, intrinsicBounds(bounds), theme));
    case 'selectBox':
      return measureRenderBlock(selectBoxBlock(widget, intrinsicBounds(bounds), theme));
    case 'textInput':
      return measureRenderBlock(textInputBlock(widget, intrinsicBounds(bounds)));
    case 'numberInput':
      return measureRenderBlock(numberInputBlock(widget, intrinsicBounds(bounds)));
    case 'menu':
      return measureRenderBlock(menuBlock(widget, intrinsicBounds(bounds), theme));
    case 'menuBar':
      return measureRenderBlock(menuBarBlock(widget, intrinsicBounds(bounds)));
    case 'contextMenu':
      return measureRenderBlock(contextMenuBlock(widget, intrinsicBounds(bounds), theme));
    case 'dropdown':
      return measureRenderBlock(dropdownBlock(widget, intrinsicBounds(bounds), theme));
    case 'helpBar':
      return measurePlainText(helpBarText(widget));
    case 'activityIndicator':
      return measurePlainText(activityIndicatorText(widget, theme));
    case 'spinner':
      return measureRenderBlock(spinnerBlock(widget, theme));
    case 'progressBar':
      return measurePlainText(progressText(widget, theme));
    case 'sparkline':
      return measurePlainText(sparklineText(widget));
    case 'barChart':
      return measurePlainText(barChartText(widget, fakeLayoutNode(widget, intrinsicBounds(bounds)), theme));
    case 'chart':
      return measurePlainText(chartText(widget, fakeLayoutNode(widget, intrinsicBounds(bounds))));
    case 'list':
      return measureListWidget(widget, theme);
    case 'table':
      return measureTableWidget(widget);
    case 'tree':
      return measureRenderBlock(treeBlock(widget, intrinsicBounds(bounds), theme));
    case 'paginator':
      return measurePlainText(paginatorText(widget));
    case 'scrollback':
      return measurePlainText(scrollbackMeasureText(widget));
    case 'structuredBlock':
      return measureRenderBlock(structuredBlockBlock(widget, fakeLayoutNode(widget, intrinsicBounds(bounds)), theme));
    case 'activityFeed':
      return measureRenderBlock(activityFeedBlock(widget, fakeLayoutNode(widget, intrinsicBounds(bounds)), theme));
    case 'commandBar':
      return measureRenderBlock(commandBarBlock(widget, intrinsicBounds(bounds).height, theme));
    case 'palette':
      return measureRenderBlock(paletteBlock(widget, intrinsicBounds(bounds).height, theme));
    case 'box':
      return measureBoxWidget(widget, bounds, theme, measureWidget);
    case 'form':
    case 'field':
    case 'stack':
      return measureChildrenVertically(widget, bounds, theme, measureWidget);
    case 'row':
      return measureChildrenHorizontally(widget, bounds, theme, measureWidget);
    case 'grid':
    case 'splitPane':
    case 'surface':
    case 'overlay':
      return measureChildrenOverlay(widget, bounds, theme, measureWidget);
    case 'absolute':
      return measureAbsoluteWidget(widget, bounds, theme, measureWidget);
    case 'canvas':
      return measureCanvasWidget(widget);
    case 'viewport':
      return measureViewportWidget(widget, bounds, theme, measureWidget);
    case 'tabs':
      return measureTabsWidget(widget, bounds, theme, measureWidget);
    case 'modal':
      return measureModalWidget(widget, bounds, theme, measureWidget);
    case 'custom':
      return zeroWidgetMeasure();
  }
}

function measureSize(preferredWidth: number, preferredHeight: number, minWidth = 0, minHeight = 0): WidgetMeasureResult {
  return sanitizeWidgetMeasure({ minWidth, minHeight, preferredWidth, preferredHeight });
}

function measurePlainText(text: string): WidgetMeasureResult {
  const lines = cleanText(text).split('\n');
  return measureSize(
    lines.reduce((max, lineText) => Math.max(max, measureTextCells(lineText).cells), 0),
    lines.length
  );
}

function measureRenderBlock(block: RenderBlock): WidgetMeasureResult {
  return measureSize(
    block.lines.reduce((max, currentLine) => Math.max(max, measureRenderLineCells(currentLine)), 0),
    block.lines.length
  );
}

function measureRenderLineCells(renderLine: RenderLine): number {
  return renderLine.spans.reduce((sum, currentSpan) => sum + measureTextCells(cleanText(currentSpan.text)).cells, 0);
}

function measureListWidget(widget: Widget, theme: TerminalTheme): WidgetMeasureResult {
  const items = Array.isArray(widget.props['items']) ? widget.props['items'] : [];
  const lines = items.map((item, index) => {
    const marker = index === numberProp(widget, 'selected') ? theme.symbols.pointer : theme.symbols.unselected;
    return `${marker} ${String(item)}`;
  });
  return measureLines(lines);
}

function measureTableWidget(widget: Widget): WidgetMeasureResult {
  const rows = Array.isArray(widget.props['rows']) ? widget.props['rows'] : [];
  const columns = tableColumnMeasureInputs(widget, rows);
  const width = columns.reduce((sum, column, index) => sum + column.width + (index === 0 ? 2 : 4), 0);
  const hasHeader = columns.some((column) => column.header.length > 0);
  return measureSize(width, rows.length + (hasHeader ? 1 : 0));
}

function measureBoxWidget(
  widget: Widget,
  bounds: Rect,
  theme: TerminalTheme,
  measureWidget: WidgetMeasureFunction
): WidgetMeasureResult {
  const content = measureChildrenOverlay(widget, bounds, theme, measureWidget);
  const border = borderForWidget(widget);
  const insetCells = border.kind === 'none' ? 0 : 2;
  return measureSize(content.preferredWidth + insetCells, content.preferredHeight + insetCells);
}

function measureChildrenVertically(
  widget: Widget,
  bounds: Rect,
  theme: TerminalTheme,
  measureWidget: WidgetMeasureFunction
): WidgetMeasureResult {
  const measures = childMeasuresFor(widget, bounds, theme, measureWidget);
  const gap = nonNegativeInteger(numberProp(widget, 'gap'));
  const preferredHeight = measures.reduce((sum, measure) => sum + measure.preferredHeight, 0)
    + gap * Math.max(0, measures.length - 1);
  return measureSize(
    measures.reduce((max, measure) => Math.max(max, measure.preferredWidth), 0),
    preferredHeight
  );
}

function measureChildrenHorizontally(
  widget: Widget,
  bounds: Rect,
  theme: TerminalTheme,
  measureWidget: WidgetMeasureFunction
): WidgetMeasureResult {
  const measures = childMeasuresFor(widget, bounds, theme, measureWidget);
  const gap = nonNegativeInteger(numberProp(widget, 'gap'));
  const preferredWidth = measures.reduce((sum, measure) => sum + measure.preferredWidth, 0)
    + gap * Math.max(0, measures.length - 1);
  return measureSize(
    preferredWidth,
    measures.reduce((max, measure) => Math.max(max, measure.preferredHeight), 0)
  );
}

function measureChildrenOverlay(
  widget: Widget,
  bounds: Rect,
  theme: TerminalTheme,
  measureWidget: WidgetMeasureFunction
): WidgetMeasureResult {
  const measures = childMeasuresFor(widget, bounds, theme, measureWidget);
  return measureSize(
    measures.reduce((max, measure) => Math.max(max, measure.preferredWidth), 0),
    measures.reduce((max, measure) => Math.max(max, measure.preferredHeight), 0)
  );
}

function measureAbsoluteWidget(
  widget: Widget,
  bounds: Rect,
  theme: TerminalTheme,
  measureWidget: WidgetMeasureFunction
): WidgetMeasureResult {
  const measures = childMeasuresFor(widget, bounds, theme, measureWidget);
  const width = nonNegativeInteger(numberProp(widget, 'width'));
  const height = nonNegativeInteger(numberProp(widget, 'height'));
  const content = measures[0] ?? zeroWidgetMeasure();
  return measureSize(width || content.preferredWidth, height || content.preferredHeight);
}

function measureCanvasWidget(widget: Widget): WidgetMeasureResult {
  const label = stringify(widget.props['label']);
  return label.length === 0 ? zeroWidgetMeasure() : measurePlainText(label);
}

function measureViewportWidget(
  widget: Widget,
  bounds: Rect,
  theme: TerminalTheme,
  measureWidget: WidgetMeasureFunction
): WidgetMeasureResult {
  const content = measureChildrenOverlay(widget, bounds, theme, measureWidget);
  return measureSize(
    Math.max(content.preferredWidth, nonNegativeInteger(numberProp(widget, 'contentColumns'))),
    Math.max(content.preferredHeight, nonNegativeInteger(numberProp(widget, 'contentRows')))
  );
}

function measureTabsWidget(
  widget: Widget,
  bounds: Rect,
  theme: TerminalTheme,
  measureWidget: WidgetMeasureFunction
): WidgetMeasureResult {
  const header = measurePlainText(tabsHeaderText(widget));
  const panel = measureChildrenOverlay(widget, bounds, theme, measureWidget);
  return measureSize(Math.max(header.preferredWidth, panel.preferredWidth), header.preferredHeight + panel.preferredHeight);
}

function measureModalWidget(
  widget: Widget,
  bounds: Rect,
  theme: TerminalTheme,
  measureWidget: WidgetMeasureFunction
): WidgetMeasureResult {
  const explicitWidth = numberProp(widget, 'width');
  const explicitHeight = numberProp(widget, 'height');
  if (explicitWidth !== undefined && explicitHeight !== undefined) {
    return measureSize(explicitWidth, explicitHeight, Math.min(4, explicitWidth), Math.min(3, explicitHeight));
  }
  const content = measureBoxWidget(widget, bounds, theme, measureWidget);
  return measureSize(
    explicitWidth ?? Math.max(4, content.preferredWidth),
    explicitHeight ?? Math.max(3, content.preferredHeight)
  );
}

function childMeasuresFor(
  widget: Widget,
  bounds: Rect,
  theme: TerminalTheme,
  measureWidget: WidgetMeasureFunction
): readonly WidgetMeasureResult[] {
  return (widget.children ?? []).map((child) => measureWidget(child, bounds, theme));
}

function scrollbackMeasureText(widget: Widget): string {
  const items = Array.isArray(widget.props['items']) ? widget.props['items'] : [];
  return items.map((item) => isRecord(item) ? stringify(item['text']) : '').join('\n');
}

function textAreaMeasureText(widget: Widget): string {
  const value = stringify(widget.props['value']);
  const placeholder = stringify(widget.props['placeholder']);
  return value.length === 0 && placeholder.length > 0 ? placeholder : value;
}

function tableColumnMeasureInputs(widget: Widget, rows: readonly unknown[]): readonly { readonly header: string; readonly width: number }[] {
  const columns = Array.isArray(widget.props['columns']) ? widget.props['columns'] : [];
  if (columns.length === 0) {
    const keys = rows.flatMap((row): string[] => isRecord(row) ? Object.keys(row) : []);
    return [...new Set(keys)].map((key) => ({ header: key, width: measureTextCells(key).cells }));
  }
  return columns.flatMap((column): readonly { readonly header: string; readonly width: number }[] => {
    if (!isRecord(column) || column['hidden'] === true) return [];
    const header = stringify(column['header']);
    const explicitWidth = typeof column['width'] === 'number' && Number.isFinite(column['width'])
      ? Math.max(1, Math.floor(column['width']))
      : undefined;
    return [{
      header,
      width: explicitWidth ?? Math.max(1, measureTextCells(header).cells)
    }];
  });
}

function measureLines(lines: readonly string[]): WidgetMeasureResult {
  return measureSize(lines.reduce((max, currentLine) => Math.max(max, measureTextCells(cleanText(currentLine)).cells), 0), lines.length);
}

function cleanText(text: string): string {
  return sanitizeTerminalText(text).text;
}

function intrinsicBounds(bounds: Rect): Rect {
  return {
    row: bounds.row,
    column: bounds.column,
    width: Math.max(bounds.width, 1_000),
    height: Math.max(bounds.height, 1_000)
  };
}

function fakeLayoutNode(widget: Widget, bounds: Rect): LayoutNode {
  return {
    ...(widget.id === undefined ? {} : { id: widget.id }),
    kind: widget.kind,
    bounds,
    layer: { id: widget.id ?? widget.kind, zIndex: 0, bounds, opacity: widget.layer?.opacity ?? 'transparent' },
    visible: true,
    focusable: false,
    focusTargets: [],
    children: []
  };
}

function optionalSize(value: number | undefined): number | undefined {
  return value === undefined || !Number.isFinite(value) ? undefined : Math.max(0, Math.floor(value));
}

function clampMeasuredSize(value: number, min: number, max: number | undefined): number {
  const preferred = Number.isFinite(value) ? Math.max(min, Math.floor(value)) : min;
  return max === undefined ? preferred : Math.min(preferred, Math.max(min, max));
}

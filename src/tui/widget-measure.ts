import { measureTextCells } from '../text/index.ts';
import { borderStyleFromValue } from './border.ts';
import { commandBarBlock } from './command-bar.ts';
import { barChartText, chartText, gaugeText, heatmapText, sparklineText } from './chart-widgets.ts';
import { dividerPreferredSize } from './divider.ts';
import { paginatorText } from './data-widgets.ts';
import {
  buttonBlock,
  checkboxBlock,
  checkboxListBlock,
  colorPickerBlock,
  datePickerBlock,
  labelBlock,
  numberInputBlock,
  radioGroupBlock,
  rangeSliderBlock,
  selectBoxBlock,
  sliderBlock,
  textInputBlock,
  toggleSwitchBlock
} from './form-widgets.ts';
import { contextMenuBlock, dropdownBlock, menuBarBlock, menuBlock } from './menu-widgets.ts';
import {
  combineMeasurementsHorizontally,
  combineMeasurementsOverlay,
  combineMeasurementsVertically,
  measureBlock,
  measureLines,
  measureSize,
  measureText,
  zeroMeasurement
} from './measurement.ts';
import { paletteBlock } from './palette.ts';
import { progressText } from './progress-widget.ts';
import { notificationStackPreferredSize } from './notifications.ts';
import { statusBarText } from './feedback-visual.ts';
import { isRecord, nonNegativeInteger } from './renderers/support/common.ts';
import { tabsHeaderText } from './renderers/support/tabs.ts';
import { activityFeedBlock, structuredBlockBlock } from './structured-block.ts';
import { activityIndicatorText, helpBarText, richTextBlock, spinnerBlock } from './text-widgets.ts';
import { tooltipPreferredSize } from './tooltip.ts';
import { treeBlock } from './tree.ts';
import { numberProp, stringify } from './widget-props.ts';
import type { TerminalTheme } from '../theme/index.ts';
import type { Widget } from '../widgets/index.ts';
import type { BorderStyle } from './border.ts';
import type { LayoutNode, Rect } from './layout.ts';
import type { Measurement } from './measurement.ts';

export type WidgetMeasureFunction = (widget: Widget, bounds: Rect, theme: TerminalTheme) => Measurement;

export function measureBuiltinWidget(
  widget: Widget,
  bounds: Rect,
  theme: TerminalTheme,
  measureWidget: WidgetMeasureFunction
): Measurement {
  switch (widget.kind) {
    case 'text':
      return measureText(stringify(widget.props['content']));
    case 'richText':
      return measureBlock(richTextBlock(widget, intrinsicBounds(bounds)));
    case 'statusBar':
      return measureText(statusBarText(widget));
    case 'textArea':
      return measureText(textAreaMeasureText(widget));
    case 'label':
      return measureBlock(labelBlock(widget, intrinsicBounds(bounds)));
    case 'button':
      return measureBlock(buttonBlock(widget, intrinsicBounds(bounds), false, theme));
    case 'checkbox':
      return measureBlock(checkboxBlock(widget, intrinsicBounds(bounds), theme));
    case 'toggleSwitch':
      return measureBlock(toggleSwitchBlock(widget, intrinsicBounds(bounds)));
    case 'slider':
      return measureBlock(sliderBlock(widget, intrinsicBounds(bounds)));
    case 'rangeSlider':
      return measureBlock(rangeSliderBlock(widget, intrinsicBounds(bounds)));
    case 'checkboxList':
      return measureBlock(checkboxListBlock(widget, intrinsicBounds(bounds), theme));
    case 'radioGroup':
      return measureBlock(radioGroupBlock(widget, intrinsicBounds(bounds), theme));
    case 'selectBox':
      return measureBlock(selectBoxBlock(widget, intrinsicBounds(bounds), theme));
    case 'colorPicker':
      return measureBlock(colorPickerBlock(widget, intrinsicBounds(bounds)));
    case 'datePicker':
      return measureBlock(datePickerBlock(widget, intrinsicBounds(bounds)));
    case 'textInput':
      return measureBlock(textInputBlock(widget, intrinsicBounds(bounds), false, theme));
    case 'numberInput':
      return measureBlock(numberInputBlock(widget, intrinsicBounds(bounds), false, theme));
    case 'menu':
      return measureBlock(menuBlock(widget, intrinsicBounds(bounds), theme));
    case 'menuBar':
      return measureBlock(menuBarBlock(widget, intrinsicBounds(bounds), theme));
    case 'contextMenu':
      return measureBlock(contextMenuBlock(widget, intrinsicBounds(bounds), theme));
    case 'dropdown':
      return measureBlock(dropdownBlock(widget, intrinsicBounds(bounds), theme));
    case 'divider': {
      const preferred = dividerPreferredSize(widget);
      return measureSize(preferred.width, preferred.height);
    }
    case 'tooltip': {
      const preferred = tooltipPreferredSize(widget);
      return measureSize(preferred.width, preferred.height);
    }
    case 'helpBar':
      return measureText(helpBarText(widget));
    case 'activityIndicator':
      return measureText(activityIndicatorText(widget, theme));
    case 'spinner':
      return measureBlock(spinnerBlock(widget, theme));
    case 'progressBar':
      return measureText(progressText(widget, theme));
    case 'notificationStack': {
      const preferred = notificationStackPreferredSize(widget);
      return measureSize(preferred.width, preferred.height);
    }
    case 'sparkline':
      return measureText(sparklineText(widget, theme));
    case 'barChart':
      return measureText(barChartText(widget, fakeLayoutNode(widget, visualMeasureBounds(bounds)), theme));
    case 'chart':
      return measureText(chartText(widget, fakeLayoutNode(widget, visualMeasureBounds(bounds)), theme));
    case 'gauge':
      return measureText(gaugeText(widget, theme));
    case 'heatmap':
      return measureText(heatmapText(widget, fakeLayoutNode(widget, visualMeasureBounds(bounds)), theme));
    case 'list':
      return measureListWidget(widget, theme);
    case 'table':
      return measureTableWidget(widget);
    case 'tree':
      return measureBlock(treeBlock(widget, intrinsicBounds(bounds), theme));
    case 'paginator':
      return measureText(paginatorText(widget));
    case 'scrollback':
      return measureText(scrollbackMeasureText(widget));
    case 'structuredBlock':
      return measureBlock(structuredBlockBlock(widget, fakeLayoutNode(widget, intrinsicBounds(bounds)), theme));
    case 'activityFeed':
      return measureBlock(activityFeedBlock(widget, fakeLayoutNode(widget, intrinsicBounds(bounds)), theme));
    case 'commandBar':
      return measureBlock(commandBarBlock(widget, intrinsicBounds(bounds).height, theme));
    case 'palette':
      return measureBlock(paletteBlock(widget, intrinsicBounds(bounds).height, theme));
    case 'form':
    case 'field':
    case 'stack':
      return measureChildrenVertically(widget, bounds, theme, measureWidget);
    case 'row':
      return measureChildrenHorizontally(widget, bounds, theme, measureWidget);
    case 'grid':
    case 'splitPane':
    case 'overlay':
      return measureChildrenOverlay(widget, bounds, theme, measureWidget);
    case 'surface':
      return measureSurfaceWidget(widget, bounds, theme, measureWidget);
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
      return zeroMeasurement();
  }
}

function measureListWidget(widget: Widget, theme: TerminalTheme): Measurement {
  const items = Array.isArray(widget.props['items']) ? widget.props['items'] : [];
  const lines = items.map((item, index) => {
    const marker = index === numberProp(widget, 'selected') ? theme.symbols.pointer : theme.symbols.unselected;
    return `${marker} ${String(item)}`;
  });
  return measureLines(lines);
}

function measureTableWidget(widget: Widget): Measurement {
  const rows = Array.isArray(widget.props['rows']) ? widget.props['rows'] : [];
  const columns = tableColumnMeasureInputs(widget, rows);
  const width = columns.reduce((sum, column, index) => sum + column.width + (index === 0 ? 2 : 4), 0);
  const hasHeader = columns.some((column) => column.header.length > 0);
  return measureSize(width, rows.length + (hasHeader ? 1 : 0));
}

function measureSurfaceWidget(
  widget: Widget,
  bounds: Rect,
  theme: TerminalTheme,
  measureWidget: WidgetMeasureFunction
): Measurement {
  const content = measureChildrenOverlay(widget, bounds, theme, measureWidget);
  const border = borderFromWidget(widget);
  const insetCells = border.kind === 'none' ? 0 : 2;
  return measureSize(content.preferredWidth + insetCells, content.preferredHeight + insetCells);
}

function borderFromWidget(widget: Widget): BorderStyle {
  const explicit = borderStyleFromValue(widget.props['border']);
  if (explicit !== undefined) return explicit;
  const variant = widget.props['variant'];
  return variant === undefined || variant === 'neutral' ? { kind: 'none' } : { kind: 'single' };
}

function measureChildrenVertically(
  widget: Widget,
  bounds: Rect,
  theme: TerminalTheme,
  measureWidget: WidgetMeasureFunction
): Measurement {
  return combineMeasurementsVertically(
    childMeasuresFor(widget, bounds, theme, measureWidget),
    nonNegativeInteger(numberProp(widget, 'gap'))
  );
}

function measureChildrenHorizontally(
  widget: Widget,
  bounds: Rect,
  theme: TerminalTheme,
  measureWidget: WidgetMeasureFunction
): Measurement {
  return combineMeasurementsHorizontally(
    childMeasuresFor(widget, bounds, theme, measureWidget),
    nonNegativeInteger(numberProp(widget, 'gap'))
  );
}

function measureChildrenOverlay(
  widget: Widget,
  bounds: Rect,
  theme: TerminalTheme,
  measureWidget: WidgetMeasureFunction
): Measurement {
  return combineMeasurementsOverlay(childMeasuresFor(widget, bounds, theme, measureWidget));
}

function measureAbsoluteWidget(
  widget: Widget,
  bounds: Rect,
  theme: TerminalTheme,
  measureWidget: WidgetMeasureFunction
): Measurement {
  const measures = childMeasuresFor(widget, bounds, theme, measureWidget);
  const width = nonNegativeInteger(numberProp(widget, 'width'));
  const height = nonNegativeInteger(numberProp(widget, 'height'));
  const content = measures[0] ?? zeroMeasurement();
  return measureSize(width || content.preferredWidth, height || content.preferredHeight);
}

function measureCanvasWidget(widget: Widget): Measurement {
  const label = stringify(widget.props['label']);
  return label.length === 0 ? zeroMeasurement() : measureText(label);
}

function measureViewportWidget(
  widget: Widget,
  bounds: Rect,
  theme: TerminalTheme,
  measureWidget: WidgetMeasureFunction
): Measurement {
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
): Measurement {
  const header = measureText(tabsHeaderText(widget));
  const panel = measureChildrenOverlay(widget, bounds, theme, measureWidget);
  return measureSize(Math.max(header.preferredWidth, panel.preferredWidth), header.preferredHeight + panel.preferredHeight);
}

function measureModalWidget(
  widget: Widget,
  bounds: Rect,
  theme: TerminalTheme,
  measureWidget: WidgetMeasureFunction
): Measurement {
  const explicitWidth = numberProp(widget, 'width');
  const explicitHeight = numberProp(widget, 'height');
  if (explicitWidth !== undefined && explicitHeight !== undefined) {
    return measureSize(explicitWidth, explicitHeight, Math.min(4, explicitWidth), Math.min(3, explicitHeight));
  }
  const content = measureModalContentWidget(widget, bounds, theme, measureWidget);
  const border = borderStyleFromValue(widget.props['border']) ?? { kind: 'single' };
  const insetCells = border.kind === 'none' ? 0 : 2;
  return measureSize(
    explicitWidth ?? Math.max(4, content.preferredWidth + insetCells),
    explicitHeight ?? Math.max(3, content.preferredHeight + insetCells)
  );
}

function measureModalContentWidget(
  widget: Widget,
  bounds: Rect,
  theme: TerminalTheme,
  measureWidget: WidgetMeasureFunction
): Measurement {
  const measures = childMeasuresFor(widget, bounds, theme, measureWidget);
  const body = measures[0] ?? zeroMeasurement();
  const actions = measures[1];
  return measureSize(
    Math.max(body.preferredWidth, actions?.preferredWidth ?? 0),
    body.preferredHeight + (actions === undefined ? 0 : actions.preferredHeight + 1)
  );
}

function childMeasuresFor(
  widget: Widget,
  bounds: Rect,
  theme: TerminalTheme,
  measureWidget: WidgetMeasureFunction
): readonly Measurement[] {
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

function intrinsicBounds(bounds: Rect): Rect {
  return {
    row: bounds.row,
    column: bounds.column,
    width: Math.max(bounds.width, 1_000),
    height: Math.max(bounds.height, 1_000)
  };
}

function visualMeasureBounds(bounds: Rect): Rect {
  return {
    row: bounds.row,
    column: bounds.column,
    width: boundedMeasureSize(bounds.width, 40, 120),
    height: boundedMeasureSize(bounds.height, 8, 30)
  };
}

function boundedMeasureSize(value: number, minimum: number, maximum: number): number {
  const current = Number.isFinite(value) ? Math.floor(value) : 0;
  return Math.min(maximum, Math.max(minimum, current));
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

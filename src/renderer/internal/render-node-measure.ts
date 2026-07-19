import { measureTextCells } from '../../text/index.ts';
import { borderStyleFromValue } from './border.ts';
import { commandInputBlock } from './command-input.ts';
import { barChartText, chartText, meterText, heatmapText, sparklineText } from './charts/index.ts';
import { dividerPreferredSize } from './divider.ts';
import { paginatorText } from './data-widgets.ts';
import {
  buttonBlock,
  checkboxBlock,
  checkboxGroupBlock,
  colorSwatchPickerBlock,
  calendarBlock,
  labelBlock,
  numberInputBlock,
  radioGroupBlock,
  rangeSliderBlock,
  selectBlock,
  sliderBlock,
  textInputBlock,
  toggleSwitchBlock
} from './forms/index.ts';
import { dropdownMenuBlock, menuBarBlock, menuBlock } from './menu-widgets.ts';
import {
  combineMeasurementsHorizontally,
  combineMeasurementsOverlay,
  combineMeasurementsVertically,
  measureBlock,
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
import { listIntrinsicMeasurement } from './renderers/support/list.ts';
import { activityFeedBlock, structuredBlockBlock } from './structured-block.ts';
import { statusIndicatorText, helpBarText, richTextBlock, spinnerBlock } from './text-widgets.ts';
import { tooltipPreferredSize } from './tooltip.ts';
import { treeBlock } from './tree.ts';
import { numberProp, stringify } from './render-node-props.ts';
import type { TerminalTheme } from '../../theme/index.ts';
import type { RenderNode, RenderNodeOfKind } from '../model/index.ts';
import type { BorderStyle } from './border.ts';
import type { LayoutNode, Rect } from '../model/layout.ts';
import type { Measurement } from './measurement.ts';
import type { TextWidthProfile } from '../../text/index.ts';

type TableNode = RenderNodeOfKind<unknown, 'table'>;
type SurfaceNode = RenderNodeOfKind<unknown, 'surface'>;
type AbsoluteNode = RenderNodeOfKind<unknown, 'absolute'>;
type CanvasNode = RenderNodeOfKind<unknown, 'canvas'>;
type ViewportNode = RenderNodeOfKind<unknown, 'viewport'>;
type TabsNode = RenderNodeOfKind<unknown, 'tabs'>;
type DialogNode = RenderNodeOfKind<unknown, 'dialog'>;
type ScrollbackNode = RenderNodeOfKind<unknown, 'scrollback'>;
type TextAreaNode = RenderNodeOfKind<unknown, 'textArea'>;

export type RenderNodeMeasureFunction = (
  widget: RenderNode,
  bounds: Rect,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile
) => Measurement;

export function measureBuiltinRenderNode(
  widget: RenderNode,
  bounds: Rect,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile,
  measureNode: RenderNodeMeasureFunction
): Measurement {
  switch (widget.kind) {
    case 'text':
      return measureText(stringify(widget.props.content), { widthProfile });
    case 'richText':
      return measureBlock(richTextBlock(widget, constrainedMeasureBounds(bounds), theme, widthProfile), { widthProfile });
    case 'statusBar':
      return measureText(statusBarText(widget, theme, widthProfile), { widthProfile });
    case 'textArea':
      return measureText(textAreaMeasureText(widget), { widthProfile });
    case 'label':
      return measureBlock(labelBlock(widget, constrainedMeasureBounds(bounds), widthProfile), { widthProfile });
    case 'button':
      return measureBlock(buttonBlock(widget, constrainedMeasureBounds(bounds), false, theme, widthProfile), { widthProfile });
    case 'checkbox':
      return measureBlock(checkboxBlock(widget, constrainedMeasureBounds(bounds), theme, widthProfile), { widthProfile });
    case 'toggleSwitch':
      return measureBlock(toggleSwitchBlock(widget, constrainedMeasureBounds(bounds), widthProfile), { widthProfile });
    case 'slider':
      return measureBlock(sliderBlock(widget, constrainedMeasureBounds(bounds), widthProfile), { widthProfile });
    case 'rangeSlider':
      return measureBlock(rangeSliderBlock(widget, constrainedMeasureBounds(bounds), widthProfile), { widthProfile });
    case 'checkboxGroup':
      return measureBlock(checkboxGroupBlock(widget, constrainedMeasureBounds(bounds), theme, widthProfile), { widthProfile });
    case 'radioGroup':
      return measureBlock(radioGroupBlock(widget, constrainedMeasureBounds(bounds), theme, widthProfile), { widthProfile });
    case 'select':
      return measureBlock(selectBlock(widget, constrainedMeasureBounds(bounds), theme, widthProfile), { widthProfile });
    case 'colorSwatchPicker':
      return measureBlock(colorSwatchPickerBlock(widget, constrainedMeasureBounds(bounds), widthProfile), { widthProfile });
    case 'calendar':
      return measureBlock(calendarBlock(widget, constrainedMeasureBounds(bounds), widthProfile), { widthProfile });
    case 'textInput':
      return measureBlock(
        textInputBlock(widget, constrainedMeasureBounds(bounds), false, theme, widthProfile),
        { widthProfile }
      );
    case 'numberInput':
      return measureBlock(
        numberInputBlock(widget, constrainedMeasureBounds(bounds), false, theme, widthProfile),
        { widthProfile }
      );
    case 'menu':
      return measureBlock(menuBlock(widget, constrainedMeasureBounds(bounds), theme, widthProfile), { widthProfile });
    case 'menuBar':
      return measureBlock(menuBarBlock(widget, constrainedMeasureBounds(bounds), theme, widthProfile), { widthProfile });
    case 'contextMenu':
      return zeroMeasurement();
    case 'dropdownMenu':
      return measureBlock(dropdownMenuBlock(widget, constrainedMeasureBounds(bounds), theme, widthProfile), { widthProfile });
    case 'divider': {
      const preferred = dividerPreferredSize(widget, widthProfile);
      return measureSize(preferred.width, preferred.height);
    }
    case 'tooltip': {
      const preferred = tooltipPreferredSize(widget, widthProfile);
      return measureSize(preferred.width, preferred.height);
    }
    case 'helpBar':
      return measureText(helpBarText(widget, widthProfile), { widthProfile });
    case 'statusIndicator':
      return measureText(statusIndicatorText(widget, theme), { widthProfile });
    case 'spinner':
      return measureBlock(spinnerBlock(widget, theme), { widthProfile });
    case 'progressBar':
      return measureText(progressText(widget, theme, widthProfile), { widthProfile });
    case 'notificationStack': {
      const preferred = notificationStackPreferredSize(widget, widthProfile);
      return measureSize(preferred.width, preferred.height);
    }
    case 'sparkline':
      return measureText(sparklineText(widget, theme), { widthProfile });
    case 'barChart':
      return measureText(
        barChartText(widget, fakeLayoutNode(widget, visualMeasureBounds(bounds)), theme, widthProfile),
        { widthProfile }
      );
    case 'chart':
      return measureText(
        chartText(widget, fakeLayoutNode(widget, visualMeasureBounds(bounds)), theme, widthProfile),
        { widthProfile }
      );
    case 'meter':
      return measureText(meterText(widget, theme, widthProfile), { widthProfile });
    case 'heatmap':
      return measureText(
        heatmapText(widget, fakeLayoutNode(widget, visualMeasureBounds(bounds)), theme, widthProfile),
        { widthProfile }
      );
    case 'list':
      return listIntrinsicMeasurement(widget, theme, widthProfile);
    case 'table':
      return measureTable(widget, widthProfile);
    case 'tree':
      return measureBlock(treeBlock(widget, constrainedMeasureBounds(bounds), theme, widthProfile), { widthProfile });
    case 'paginator':
      return measureText(paginatorText(widget, widthProfile), { widthProfile });
    case 'scrollback':
      return measureText(scrollbackMeasureText(widget), { widthProfile });
    case 'structuredBlock':
      return measureBlock(
        structuredBlockBlock(widget, fakeLayoutNode(widget, constrainedMeasureBounds(bounds)), theme, widthProfile),
        { widthProfile }
      );
    case 'activityFeed':
      return measureBlock(
        activityFeedBlock(widget, fakeLayoutNode(widget, constrainedMeasureBounds(bounds)), theme, widthProfile),
        { widthProfile }
      );
    case 'commandInput':
      return measureBlock(
        commandInputBlock(widget, constrainedMeasureBounds(bounds), theme, widthProfile),
        { widthProfile }
      );
    case 'palette':
      return measureBlock(
        paletteBlock(widget, constrainedMeasureBounds(bounds).height, theme),
        { widthProfile }
      );
    case 'form':
    case 'field':
    case 'column':
      return measureChildrenVertically(widget, bounds, theme, widthProfile, measureNode);
    case 'row':
      return measureChildrenHorizontally(widget, bounds, theme, widthProfile, measureNode);
    case 'grid':
    case 'splitPane':
    case 'overlay':
      return measureChildrenOverlay(widget, bounds, theme, widthProfile, measureNode);
    case 'surface':
      return measureSurface(widget, bounds, theme, widthProfile, measureNode);
    case 'absolute':
      return measureAbsolute(widget, bounds, theme, widthProfile, measureNode);
    case 'canvas':
      return measureCanvas(widget, widthProfile);
    case 'viewport':
      return measureViewport(widget, bounds, theme, widthProfile, measureNode);
    case 'tabs':
      return measureTabs(widget, bounds, theme, widthProfile, measureNode);
    case 'dialog':
      return measureDialog(widget, bounds, theme, widthProfile, measureNode);
    case 'custom':
      return zeroMeasurement();
  }
}

function measureTable(widget: TableNode, widthProfile: TextWidthProfile): Measurement {
  const rows = widget.props.collection.records.slice(0, 64).map((record) => record.row);
  const columns = tableColumnMeasureInputs(widget, rows, widthProfile);
  const width = columns.reduce((sum, column, index) => sum + column.width + (index === 0 ? 2 : 4), 0);
  const hasHeader = columns.some((column) => column.header.length > 0);
  return measureSize(width, widget.props.collection.total + (hasHeader ? 1 : 0));
}

function measureSurface(
  widget: SurfaceNode,
  bounds: Rect,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile,
  measureNode: RenderNodeMeasureFunction
): Measurement {
  const content = measureChildrenOverlay(widget, bounds, theme, widthProfile, measureNode);
  const border = borderFromRenderNode(widget);
  const insetCells = border.kind === 'none' ? 0 : 2;
  return measureSize(content.preferredWidth + insetCells, content.preferredHeight + insetCells);
}

function borderFromRenderNode(widget: SurfaceNode): BorderStyle {
  const explicit = borderStyleFromValue(widget.props.border);
  if (explicit !== undefined) return explicit;
  const variant = widget.props.variant;
  return variant === undefined || variant === 'neutral' ? { kind: 'none' } : { kind: 'single' };
}

function measureChildrenVertically(
  widget: RenderNode,
  bounds: Rect,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile,
  measureNode: RenderNodeMeasureFunction
): Measurement {
  return combineMeasurementsVertically(
    childMeasuresFor(widget, bounds, theme, widthProfile, measureNode),
    nonNegativeInteger(numberProp(widget, 'gap'))
  );
}

function measureChildrenHorizontally(
  widget: RenderNode,
  bounds: Rect,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile,
  measureNode: RenderNodeMeasureFunction
): Measurement {
  return combineMeasurementsHorizontally(
    childMeasuresFor(widget, bounds, theme, widthProfile, measureNode),
    nonNegativeInteger(numberProp(widget, 'gap'))
  );
}

function measureChildrenOverlay(
  widget: RenderNode,
  bounds: Rect,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile,
  measureNode: RenderNodeMeasureFunction
): Measurement {
  return combineMeasurementsOverlay(childMeasuresFor(widget, bounds, theme, widthProfile, measureNode));
}

function measureAbsolute(
  widget: AbsoluteNode,
  bounds: Rect,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile,
  measureNode: RenderNodeMeasureFunction
): Measurement {
  const measures = childMeasuresFor(widget, bounds, theme, widthProfile, measureNode);
  const width = nonNegativeInteger(numberProp(widget, 'width'));
  const height = nonNegativeInteger(numberProp(widget, 'height'));
  const content = measures[0] ?? zeroMeasurement();
  return measureSize(width || content.preferredWidth, height || content.preferredHeight);
}

function measureCanvas(widget: CanvasNode, widthProfile: TextWidthProfile): Measurement {
  const label = stringify(widget.props.label);
  return label.length === 0 ? zeroMeasurement() : measureText(label, { widthProfile });
}

function measureViewport(
  widget: ViewportNode,
  bounds: Rect,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile,
  measureNode: RenderNodeMeasureFunction
): Measurement {
  const content = measureChildrenOverlay(widget, bounds, theme, widthProfile, measureNode);
  return measureSize(
    Math.max(content.preferredWidth, nonNegativeInteger(numberProp(widget, 'contentColumns'))),
    Math.max(content.preferredHeight, nonNegativeInteger(numberProp(widget, 'contentRows')))
  );
}

function measureTabs(
  widget: TabsNode,
  bounds: Rect,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile,
  measureNode: RenderNodeMeasureFunction
): Measurement {
  const header = measureText(tabsHeaderText(widget, theme, widthProfile), { widthProfile });
  const panel = measureChildrenOverlay(widget, bounds, theme, widthProfile, measureNode);
  return measureSize(Math.max(header.preferredWidth, panel.preferredWidth), header.preferredHeight + panel.preferredHeight);
}

function measureDialog(
  widget: DialogNode,
  bounds: Rect,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile,
  measureNode: RenderNodeMeasureFunction
): Measurement {
  const explicitWidth = numberProp(widget, 'width');
  const explicitHeight = numberProp(widget, 'height');
  if (explicitWidth !== undefined && explicitHeight !== undefined) {
    return measureSize(explicitWidth, explicitHeight, Math.min(4, explicitWidth), Math.min(3, explicitHeight));
  }
  const content = measureDialogContent(widget, bounds, theme, widthProfile, measureNode);
  const border = borderStyleFromValue(widget.props.border) ?? { kind: 'single' };
  const insetCells = border.kind === 'none' ? 0 : 2;
  return measureSize(
    explicitWidth ?? Math.max(4, content.preferredWidth + insetCells),
    explicitHeight ?? Math.max(3, content.preferredHeight + insetCells)
  );
}

function measureDialogContent(
  widget: DialogNode,
  bounds: Rect,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile,
  measureNode: RenderNodeMeasureFunction
): Measurement {
  const measures = childMeasuresFor(widget, bounds, theme, widthProfile, measureNode);
  const body = measures[0] ?? zeroMeasurement();
  const actions = measures[1];
  return measureSize(
    Math.max(body.preferredWidth, actions?.preferredWidth ?? 0),
    body.preferredHeight + (actions === undefined ? 0 : actions.preferredHeight + 1)
  );
}

function childMeasuresFor(
  widget: RenderNode,
  bounds: Rect,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile,
  measureNode: RenderNodeMeasureFunction
): readonly Measurement[] {
  return (widget.children ?? []).map((child) => measureNode(child, bounds, theme, widthProfile));
}

function scrollbackMeasureText(widget: ScrollbackNode): string {
  const items = Array.isArray(widget.props.items) ? widget.props.items : [];
  const scroll = isRecord(widget.props.scroll) ? widget.props.scroll : undefined;
  const viewportRows = boundedMeasureSize(
    typeof scroll?.viewportRows === 'number' ? scroll.viewportRows : 0,
    1,
    200
  );
  const offset = typeof scroll?.offsetRow === 'number'
    ? Math.max(0, Math.floor(scroll.offsetRow))
    : Math.max(0, items.length - viewportRows);
  return items
    .slice(offset, offset + viewportRows + 1)
    .map((item) => isRecord(item) ? stringify(item['text']) : '')
    .join('\n');
}

function textAreaMeasureText(widget: TextAreaNode): string {
  const value = stringify(widget.props.value);
  const placeholder = stringify(widget.props.placeholder);
  return value.length === 0 && placeholder.length > 0 ? placeholder : value;
}

function tableColumnMeasureInputs(
  widget: TableNode,
  rows: readonly unknown[],
  widthProfile: TextWidthProfile
): readonly { readonly header: string; readonly width: number }[] {
  const columns = Array.isArray(widget.props.columns) ? widget.props.columns : [];
  if (columns.length === 0) {
    const keys = rows.flatMap((row): string[] => isRecord(row) ? Object.keys(row) : []);
    return [...new Set(keys)].map((key) => ({
      header: key,
      width: measureTextCells(key, { widthProfile }).cells
    }));
  }
  return columns.flatMap((column): readonly { readonly header: string; readonly width: number }[] => {
    if (!isRecord(column) || column['hidden'] === true) return [];
    const header = stringify(column['header']);
    const explicitWidth = typeof column['width'] === 'number' && Number.isFinite(column['width'])
      ? Math.max(1, Math.floor(column['width']))
      : undefined;
    return [{
      header,
      width: explicitWidth ?? Math.max(1, measureTextCells(header, { widthProfile }).cells)
    }];
  });
}

function constrainedMeasureBounds(bounds: Rect): Rect {
  return {
    row: bounds.row,
    column: bounds.column,
    width: Math.max(1, bounds.width),
    height: Math.max(1, bounds.height)
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

function fakeLayoutNode(widget: RenderNode, bounds: Rect): LayoutNode {
  return {
    ...(widget.id === undefined ? {} : { id: widget.id }),
    kind: widget.kind,
    bounds,
    viewport: bounds,
    identity: widget.id ?? `${widget.kind}:0`,
    layer: { id: widget.id ?? `${widget.kind}:0`, zIndex: 0, bounds, opacity: widget.layer?.opacity ?? 'transparent' },
    visible: true,
    focusable: false,
    focusTargets: [],
    children: []
  };
}

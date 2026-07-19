import type { AccessibleNode } from '../../../accessibility/index.ts';
import type { Rect } from '../../../geometry/types.ts';
import type { BarChartAction } from '../../../ui-model/visualization.ts';
import type { RenderNodeOfKind } from '../../model/index.ts';
import type { HitTarget } from '../../model/renderer.ts';
import { fillTextCells, measureTextCells, sanitizeTerminalText } from '../../../text/index.ts';
import type { TextWidthProfile } from '../../../text/index.ts';
import type { TerminalTheme } from '../../../theme/index.ts';
import {
  chartLabelStyle,
  chartPlaceholderStyle,
  chartSelectedStyle,
  chartSeriesStyle,
  chartSpan,
  chartStateBlock,
  chartStateDescription,
  chartTextFromBlock,
  chartValueStyle
} from '../chart-visual.ts';
import type { LayoutNode } from '../../model/layout.ts';
import { numberProp } from '../render-node-props.ts';
import type { RenderBlock } from '../../../visual/render.ts';
import { visibleWindow } from '../visible-window.ts';
import { barItems, cleanLabel } from './support/values.ts';

export function barChartBlock(
  widget: BarChartNode,
  node: LayoutNode,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile
): RenderBlock {
  const items = barItems(widget.props.items);
  const state = chartStateBlock(widget, 'barChart', theme, {
    empty: items.length === 0,
    emptyText: chartStateDescription(widget, 'No bars'),
    loadingText: cleanLabel(widget.props.loadingText),
    errorText: cleanLabel(widget.props.errorText)
  });
  if (state !== undefined) return state;
  const selected = selectedBarIndex(widget, items);
  const max = Math.max(1, numberProp(widget, 'max') ?? Math.max(1, ...items.map((item) => item.value)));
  const window = visibleWindow(items.length, node.bounds.height, selected);
  return {
    lines: items.slice(window.start, window.end).map((item, offset) => {
      const index = window.start + offset;
      const currentSelected = index === selected;
      const prefix = currentSelected ? theme.tokens.symbols.pointer : theme.tokens.symbols.unselected;
      const label = sanitizeTerminalText(item.label).text;
      const value = String(item.value);
      const fixedCells = measureTextCells(`${prefix} ${label}  ${value}`, { widthProfile }).cells;
      const availableCells = Math.max(0, node.bounds.width - fixedCells);
      const filledCells = Math.max(
        0,
        Math.min(availableCells, Math.round((item.value / max) * availableCells))
      );
      const selectionStyle = currentSelected ? chartSelectedStyle(widget) : undefined;
      return {
        spans: [
          chartSpan(widget, 'barChart', 'marker', `bar.${item.id}.marker`, prefix, selectionStyle ?? chartPlaceholderStyle(widget)),
          chartSpan(widget, 'barChart', 'separator', `bar.${item.id}.separator.beforeLabel`, ' ', chartPlaceholderStyle(widget)),
          chartSpan(widget, 'barChart', 'label', `bar.${item.id}.label`, label, selectionStyle ?? chartLabelStyle(widget)),
          chartSpan(widget, 'barChart', 'separator', `bar.${item.id}.separator.beforeFill`, ' ', chartPlaceholderStyle(widget)),
          chartSpan(
            widget,
            'barChart',
            'bar',
            `bar.${item.id}.fill`,
            fillTextCells(theme.tokens.symbols.progressFilled, filledCells, { widthProfile }),
            selectionStyle ?? chartSeriesStyle(widget, index)
          ),
          chartSpan(widget, 'barChart', 'separator', `bar.${item.id}.separator.beforeValue`, ' ', chartPlaceholderStyle(widget)),
          chartSpan(widget, 'barChart', 'metric', `bar.${item.id}.value`, value, selectionStyle ?? chartValueStyle(widget))
        ]
      };
    })
  };
}

export function barChartText(
  widget: BarChartNode,
  node: LayoutNode,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile
): string {
  return chartTextFromBlock(barChartBlock(widget, node, theme, widthProfile));
}

export function barChartAccessibleBase(widget: BarChartNode, node: LayoutNode, id: string, focused: boolean): AccessibleNode {
  const items = barItems(widget.props.items);
  const selected = selectedBarIndex(widget, items);
  const window = visibleWindow(items.length, node.bounds.height, selected);
  return {
    id,
    role: 'listbox',
    label: id,
    description: `${String(items.length)} bars. Showing ${String(window.start + 1)}-${String(window.end)}.`,
    ...(focused ? { focused } : {})
  };
}

export function barChartAccessibleChildren(widget: BarChartNode, node: LayoutNode): readonly AccessibleNode[] {
  const items = barItems(widget.props.items);
  const selected = selectedBarIndex(widget, items);
  const window = visibleWindow(items.length, node.bounds.height, selected);
  return items.slice(window.start, window.end).map((item, offset) => {
    const index = window.start + offset;
    return {
      id: `${widget.id ?? 'bar-chart'}:${item.id}`,
      role: 'option',
      label: sanitizeTerminalText(item.label).text,
      value: item.value,
      selected: index === selected
    };
  });
}

export function barChartHitTargets<TMessage>(widget: BarChartNode<TMessage>, bounds: Rect): readonly HitTarget<TMessage>[] {
  const toMessage = barChartActionMessageFactory(widget);
  if (toMessage === undefined) return [];
  const items = barItems(widget.props.items);
  const selected = selectedBarIndex(widget, items);
  const window = visibleWindow(items.length, bounds.height, selected);
  return items.slice(window.start, window.end).map((item, visibleIndex) => {
    const index = window.start + visibleIndex;
    return {
      id: `${widget.id ?? widget.kind}:bar:${item.id}`,
      bounds: { row: bounds.row + visibleIndex, column: bounds.column, width: bounds.width, height: 1 },
      cursor: 'pointer',
      message: () => toMessage({ kind: 'select', id: item.id, index })
    };
  });
}

function selectedBarIndex(widget: BarChartNode, items: readonly { readonly id: string }[]): number {
  return items.findIndex((item) => item.id === widget.props.selectedId);
}

function barChartActionMessageFactory<TMessage>(widget: BarChartNode<TMessage>): ((action: BarChartAction) => TMessage) | undefined {
  return typeof widget.props.toActionMessage === 'function' ? widget.props.toActionMessage : undefined;
}

type BarChartNode<TMessage = unknown> = RenderNodeOfKind<TMessage, 'barChart'>;

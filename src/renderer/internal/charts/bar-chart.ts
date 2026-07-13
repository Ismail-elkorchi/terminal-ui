import type { AccessibleNode } from '../../../accessibility/index.ts';
import type { RenderNodeOfKind } from '../../model/index.ts';
import { sanitizeTerminalText } from '../../../text/index.ts';
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

export function barChartBlock(widget: BarChartNode, node: LayoutNode, theme: TerminalTheme): RenderBlock {
  const items = barItems(widget.props.items);
  const state = chartStateBlock(widget, 'barChart', theme, {
    empty: items.length === 0,
    emptyText: chartStateDescription(widget, 'No bars'),
    loadingText: cleanLabel(widget.props.loadingText),
    errorText: cleanLabel(widget.props.errorText)
  });
  if (state !== undefined) return state;
  const selected = numberProp(widget, 'selected') ?? -1;
  const max = Math.max(1, numberProp(widget, 'max') ?? Math.max(1, ...items.map((item) => item.value)));
  const window = visibleWindow(items.length, node.bounds.height, selected);
  return {
    lines: items.slice(window.start, window.end).map((item, offset) => {
      const index = window.start + offset;
      const currentSelected = index === selected;
      const prefix = currentSelected ? theme.tokens.symbols.pointer : theme.tokens.symbols.unselected;
      const label = sanitizeTerminalText(item.label).text;
      const available = Math.max(1, node.bounds.width - label.length - String(item.value).length - 5);
      const filled = Math.max(0, Math.min(available, Math.round((item.value / max) * available)));
      const selectionStyle = currentSelected ? chartSelectedStyle(widget) : undefined;
      return {
        spans: [
          chartSpan(widget, 'barChart', 'marker', `bar.${String(index)}.marker`, prefix, selectionStyle ?? chartPlaceholderStyle(widget)),
          chartSpan(widget, 'barChart', 'separator', `bar.${String(index)}.separator.beforeLabel`, ' ', chartPlaceholderStyle(widget)),
          chartSpan(widget, 'barChart', 'label', `bar.${String(index)}.label`, label, selectionStyle ?? chartLabelStyle(widget)),
          chartSpan(widget, 'barChart', 'separator', `bar.${String(index)}.separator.beforeFill`, ' ', chartPlaceholderStyle(widget)),
          chartSpan(widget, 'barChart', 'bar', `bar.${String(index)}.fill`, theme.tokens.symbols.progressFilled.repeat(filled), selectionStyle ?? chartSeriesStyle(widget, index)),
          chartSpan(widget, 'barChart', 'separator', `bar.${String(index)}.separator.beforeValue`, ' ', chartPlaceholderStyle(widget)),
          chartSpan(widget, 'barChart', 'metric', `bar.${String(index)}.value`, String(item.value), selectionStyle ?? chartValueStyle(widget))
        ]
      };
    })
  };
}

export function barChartText(widget: BarChartNode, node: LayoutNode, theme: TerminalTheme): string {
  return chartTextFromBlock(barChartBlock(widget, node, theme));
}

export function barChartAccessibleBase(widget: BarChartNode, node: LayoutNode, id: string, focused: boolean): AccessibleNode {
  const items = barItems(widget.props.items);
  const selected = numberProp(widget, 'selected') ?? 0;
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
  const selected = numberProp(widget, 'selected') ?? -1;
  const window = visibleWindow(items.length, node.bounds.height, selected);
  return items.slice(window.start, window.end).map((item, offset) => {
    const index = window.start + offset;
    return {
      id: `${widget.id ?? 'bar-chart'}:${String(index)}`,
      role: 'option',
      label: sanitizeTerminalText(item.label).text,
      value: item.value,
      selected: index === selected
    };
  });
}
type BarChartNode = RenderNodeOfKind<unknown, 'barChart'>;

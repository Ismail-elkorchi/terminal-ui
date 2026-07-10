import type { AccessibleNode } from '../../accessibility/index.ts';
import type { RenderNodeOfKind } from '../../render-node/index.ts';
import type { TerminalTheme } from '../../theme/index.ts';
import {
  chartLabelStyle,
  chartMetricStyle,
  chartPlaceholderStyle,
  chartSpan,
  chartStatus,
  chartTextFromBlock,
  chartValueStyle
} from '../chart-visual.ts';
import { numberProp } from '../render-node-props.ts';
import type { RenderBlock } from '../render-primitives.ts';
import { boundedInteger, cleanLabel } from './support/values.ts';

export function gaugeBlock(widget: GaugeNode, theme: TerminalTheme): RenderBlock {
  const value = numberProp(widget, 'value') ?? 0;
  const min = numberProp(widget, 'min') ?? 0;
  const max = Math.max(min + 1, numberProp(widget, 'max') ?? 100);
  const width = boundedInteger(numberProp(widget, 'width'), 4, 40, 12);
  const ratio = Math.max(0, Math.min(1, (value - min) / (max - min)));
  if (gaugeVariant(widget) === 'dial') return gaugeDialBlock(widget, ratio, width);
  const filled = Math.round(ratio * width);
  const empty = Math.max(0, width - filled);
  const label = cleanLabel(widget.props.label);
  const status = chartStatus(widget.props.status);
  const valueText = `${String(Math.round(ratio * 100))}%`;
  return {
    lines: [{
      spans: [
        ...(label.length === 0 ? [] : [
          chartSpan(widget, 'gauge', 'label', 'metric.label', label, chartLabelStyle(widget)),
          chartSpan(widget, 'gauge', 'separator', 'metric.separator.afterLabel', ' ', chartPlaceholderStyle(widget))
        ]),
        chartSpan(widget, 'gauge', 'chrome', 'metric.bar.open', '[', chartPlaceholderStyle(widget)),
        chartSpan(widget, 'gauge', 'fill', 'metric.bar.filled', theme.tokens.symbols.progressFilled.repeat(filled), chartMetricStyle(widget, status)),
        chartSpan(widget, 'gauge', 'fill', 'metric.bar.empty', theme.tokens.symbols.progressEmpty.repeat(empty), chartPlaceholderStyle(widget)),
        chartSpan(widget, 'gauge', 'chrome', 'metric.bar.close', ']', chartPlaceholderStyle(widget)),
        chartSpan(widget, 'gauge', 'separator', 'metric.separator.beforeValue', ' ', chartPlaceholderStyle(widget)),
        chartSpan(widget, 'gauge', 'metric', 'metric.value', valueText, chartMetricStyle(widget, status)),
        ...(status === undefined ? [] : [
          chartSpan(widget, 'gauge', 'separator', 'status.separator', ' ', chartPlaceholderStyle(widget)),
          chartSpan(widget, 'gauge', 'status', 'status.value', status, chartMetricStyle(widget, status))
        ])
      ]
    }]
  };
}

function gaugeDialBlock(widget: GaugeNode, ratio: number, width: number): RenderBlock {
  const innerWidth = Math.max(4, width);
  const filled = Math.round(ratio * innerWidth);
  const empty = Math.max(0, innerWidth - filled);
  const label = cleanLabel(widget.props.label);
  const status = chartStatus(widget.props.status);
  const valueText = `${String(Math.round(ratio * 100))}%`;
  const markerColumn = Math.max(0, Math.min(innerWidth - 1, Math.round(ratio * (innerWidth - 1))));
  const marker = `${' '.repeat(markerColumn)}▲${' '.repeat(Math.max(0, innerWidth - markerColumn - 1))}`;
  return {
    lines: [
      ...(label.length === 0 ? [] : [{
        spans: [chartSpan(widget, 'gauge', 'label', 'dial.label', label, chartLabelStyle(widget))]
      }]),
      {
        spans: [
          chartSpan(widget, 'gauge', 'chrome', 'dial.open', '╭', chartPlaceholderStyle(widget)),
          chartSpan(widget, 'gauge', 'fill', 'dial.filled', '─'.repeat(filled), chartMetricStyle(widget, status)),
          chartSpan(widget, 'gauge', 'fill', 'dial.empty', '─'.repeat(empty), chartPlaceholderStyle(widget)),
          chartSpan(widget, 'gauge', 'chrome', 'dial.close', '╮', chartPlaceholderStyle(widget))
        ]
      },
      {
        spans: [
          chartSpan(widget, 'gauge', 'chrome', 'dial.side.left', '│', chartPlaceholderStyle(widget)),
          chartSpan(widget, 'gauge', 'marker', 'dial.needle', marker, chartMetricStyle(widget, status)),
          chartSpan(widget, 'gauge', 'chrome', 'dial.side.right', '│', chartPlaceholderStyle(widget)),
          chartSpan(widget, 'gauge', 'separator', 'dial.separator.beforeValue', ' ', chartPlaceholderStyle(widget)),
          chartSpan(widget, 'gauge', 'metric', 'dial.value', valueText, chartValueStyle(widget))
        ]
      },
      {
        spans: [
          chartSpan(widget, 'gauge', 'chrome', 'dial.bottom.open', '╰', chartPlaceholderStyle(widget)),
          chartSpan(widget, 'gauge', 'chrome', 'dial.bottom.edge', '─'.repeat(innerWidth), chartPlaceholderStyle(widget)),
          chartSpan(widget, 'gauge', 'chrome', 'dial.bottom.close', '╯', chartPlaceholderStyle(widget))
        ]
      }
    ]
  };
}

function gaugeVariant(widget: GaugeNode): 'linear' | 'dial' {
  return widget.props.variant === 'dial' ? 'dial' : 'linear';
}

export function gaugeText(widget: GaugeNode, theme: TerminalTheme): string {
  return chartTextFromBlock(gaugeBlock(widget, theme));
}

export function gaugeAccessibleBase(widget: GaugeNode, id: string): AccessibleNode {
  const value = numberProp(widget, 'value') ?? 0;
  const min = numberProp(widget, 'min') ?? 0;
  const max = Math.max(min + 1, numberProp(widget, 'max') ?? 100);
  const label = cleanLabel(widget.props.label);
  return {
    id,
    role: 'progressbar',
    label: label.length === 0 ? id : label,
    value,
    description: `Gauge from ${String(min)} to ${String(max)}.`
  };
}
type GaugeNode = RenderNodeOfKind<unknown, 'gauge'>;

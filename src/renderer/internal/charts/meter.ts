import type { AccessibleNode } from '../../../accessibility/index.ts';
import type { RenderNodeOfKind } from '../../model/index.ts';
import type { TerminalTheme } from '../../../theme/index.ts';
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
import type { RenderBlock } from '../../../visual/render.ts';
import { boundedInteger, cleanLabel } from './support/values.ts';

export function meterBlock(widget: MeterNode, theme: TerminalTheme): RenderBlock {
  const value = numberProp(widget, 'value') ?? 0;
  const min = numberProp(widget, 'min') ?? 0;
  const max = Math.max(min + 1, numberProp(widget, 'max') ?? 100);
  const width = boundedInteger(numberProp(widget, 'width'), 4, 40, 12);
  const ratio = Math.max(0, Math.min(1, (value - min) / (max - min)));
  if (meterVariant(widget) === 'dial') return meterDialBlock(widget, ratio, width);
  const filled = Math.round(ratio * width);
  const empty = Math.max(0, width - filled);
  const label = cleanLabel(widget.props.label);
  const status = chartStatus(widget.props.status);
  const valueText = `${String(Math.round(ratio * 100))}%`;
  return {
    lines: [{
      spans: [
        ...(label.length === 0 ? [] : [
          chartSpan(widget, 'meter', 'label', 'metric.label', label, chartLabelStyle(widget)),
          chartSpan(widget, 'meter', 'separator', 'metric.separator.afterLabel', ' ', chartPlaceholderStyle(widget))
        ]),
        chartSpan(widget, 'meter', 'chrome', 'metric.bar.open', '[', chartPlaceholderStyle(widget)),
        chartSpan(widget, 'meter', 'fill', 'metric.bar.filled', theme.tokens.symbols.progressFilled.repeat(filled), chartMetricStyle(widget, status)),
        chartSpan(widget, 'meter', 'fill', 'metric.bar.empty', theme.tokens.symbols.progressEmpty.repeat(empty), chartPlaceholderStyle(widget)),
        chartSpan(widget, 'meter', 'chrome', 'metric.bar.close', ']', chartPlaceholderStyle(widget)),
        chartSpan(widget, 'meter', 'separator', 'metric.separator.beforeValue', ' ', chartPlaceholderStyle(widget)),
        chartSpan(widget, 'meter', 'metric', 'metric.value', valueText, chartMetricStyle(widget, status)),
        ...(status === undefined ? [] : [
          chartSpan(widget, 'meter', 'separator', 'status.separator', ' ', chartPlaceholderStyle(widget)),
          chartSpan(widget, 'meter', 'status', 'status.value', status, chartMetricStyle(widget, status))
        ])
      ]
    }]
  };
}

function meterDialBlock(widget: MeterNode, ratio: number, width: number): RenderBlock {
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
        spans: [chartSpan(widget, 'meter', 'label', 'dial.label', label, chartLabelStyle(widget))]
      }]),
      {
        spans: [
          chartSpan(widget, 'meter', 'chrome', 'dial.open', '╭', chartPlaceholderStyle(widget)),
          chartSpan(widget, 'meter', 'fill', 'dial.filled', '─'.repeat(filled), chartMetricStyle(widget, status)),
          chartSpan(widget, 'meter', 'fill', 'dial.empty', '─'.repeat(empty), chartPlaceholderStyle(widget)),
          chartSpan(widget, 'meter', 'chrome', 'dial.close', '╮', chartPlaceholderStyle(widget))
        ]
      },
      {
        spans: [
          chartSpan(widget, 'meter', 'chrome', 'dial.side.left', '│', chartPlaceholderStyle(widget)),
          chartSpan(widget, 'meter', 'marker', 'dial.needle', marker, chartMetricStyle(widget, status)),
          chartSpan(widget, 'meter', 'chrome', 'dial.side.right', '│', chartPlaceholderStyle(widget)),
          chartSpan(widget, 'meter', 'separator', 'dial.separator.beforeValue', ' ', chartPlaceholderStyle(widget)),
          chartSpan(widget, 'meter', 'metric', 'dial.value', valueText, chartValueStyle(widget))
        ]
      },
      {
        spans: [
          chartSpan(widget, 'meter', 'chrome', 'dial.bottom.open', '╰', chartPlaceholderStyle(widget)),
          chartSpan(widget, 'meter', 'chrome', 'dial.bottom.edge', '─'.repeat(innerWidth), chartPlaceholderStyle(widget)),
          chartSpan(widget, 'meter', 'chrome', 'dial.bottom.close', '╯', chartPlaceholderStyle(widget))
        ]
      }
    ]
  };
}

function meterVariant(widget: MeterNode): 'linear' | 'dial' {
  return widget.props.variant === 'dial' ? 'dial' : 'linear';
}

export function meterText(widget: MeterNode, theme: TerminalTheme): string {
  return chartTextFromBlock(meterBlock(widget, theme));
}

export function meterAccessibleBase(widget: MeterNode, id: string): AccessibleNode {
  const value = numberProp(widget, 'value') ?? 0;
  const min = numberProp(widget, 'min') ?? 0;
  const max = Math.max(min + 1, numberProp(widget, 'max') ?? 100);
  const label = cleanLabel(widget.props.label);
  return {
    id,
    role: 'progressbar',
    label: label.length === 0 ? id : label,
    value,
    description: `Meter from ${String(min)} to ${String(max)}.`
  };
}
type MeterNode = RenderNodeOfKind<unknown, 'meter'>;

import type { AccessibleNode } from '../../../accessibility/index.ts';
import type { RenderNodeOfKind } from '../../model/index.ts';
import type { TerminalTheme } from '../../../theme/index.ts';
import { fillTextCells, measureTextCells, oneCellGlyph } from '../../../text/index.ts';
import type { TextWidthProfile } from '../../../text/index.ts';
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

export function meterBlock(
  widget: MeterNode,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile
): RenderBlock {
  const value = numberProp(widget, 'value') ?? 0;
  const min = numberProp(widget, 'min') ?? 0;
  const max = Math.max(min + 1, numberProp(widget, 'max') ?? 100);
  const width = boundedInteger(numberProp(widget, 'width'), 4, 40, 12);
  const ratio = Math.max(0, Math.min(1, (value - min) / (max - min)));
  if (meterVariant(widget) === 'dial') return meterDialBlock(widget, ratio, width, widthProfile);
  const filledCells = Math.round(ratio * width);
  const emptyCells = Math.max(0, width - filledCells);
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
        chartSpan(
          widget,
          'meter',
          'fill',
          'metric.bar.filled',
          fillTextCells(theme.tokens.symbols.progressFilled, filledCells, { widthProfile }),
          chartMetricStyle(widget, status)
        ),
        chartSpan(
          widget,
          'meter',
          'fill',
          'metric.bar.empty',
          fillTextCells(theme.tokens.symbols.progressEmpty, emptyCells, { widthProfile }),
          chartPlaceholderStyle(widget)
        ),
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

function meterDialBlock(
  widget: MeterNode,
  ratio: number,
  width: number,
  widthProfile: TextWidthProfile
): RenderBlock {
  const innerWidth = Math.max(4, width);
  const filledCells = Math.round(ratio * innerWidth);
  const emptyCells = Math.max(0, innerWidth - filledCells);
  const label = cleanLabel(widget.props.label);
  const status = chartStatus(widget.props.status);
  const valueText = `${String(Math.round(ratio * 100))}%`;
  const markerGlyph = '▲';
  const markerCells = measureTextCells(markerGlyph, { widthProfile }).cells;
  const markerColumn = Math.max(
    0,
    Math.min(innerWidth - markerCells, Math.round(ratio * Math.max(0, innerWidth - markerCells)))
  );
  const marker = `${' '.repeat(markerColumn)}${markerGlyph}${' '.repeat(
    Math.max(0, innerWidth - markerColumn - markerCells)
  )}`;
  return {
    lines: [
      ...(label.length === 0 ? [] : [{
        spans: [chartSpan(widget, 'meter', 'label', 'dial.label', label, chartLabelStyle(widget))]
      }]),
      {
        spans: [
          chartSpan(widget, 'meter', 'chrome', 'dial.open', oneCellGlyph('╭', '+', { widthProfile }), chartPlaceholderStyle(widget)),
          chartSpan(widget, 'meter', 'fill', 'dial.filled', fillTextCells('─', filledCells, { widthProfile }), chartMetricStyle(widget, status)),
          chartSpan(widget, 'meter', 'fill', 'dial.empty', fillTextCells('─', emptyCells, { widthProfile }), chartPlaceholderStyle(widget)),
          chartSpan(widget, 'meter', 'chrome', 'dial.close', oneCellGlyph('╮', '+', { widthProfile }), chartPlaceholderStyle(widget))
        ]
      },
      {
        spans: [
          chartSpan(widget, 'meter', 'chrome', 'dial.side.left', oneCellGlyph('│', '|', { widthProfile }), chartPlaceholderStyle(widget)),
          chartSpan(widget, 'meter', 'marker', 'dial.needle', marker, chartMetricStyle(widget, status)),
          chartSpan(widget, 'meter', 'chrome', 'dial.side.right', oneCellGlyph('│', '|', { widthProfile }), chartPlaceholderStyle(widget)),
          chartSpan(widget, 'meter', 'separator', 'dial.separator.beforeValue', ' ', chartPlaceholderStyle(widget)),
          chartSpan(widget, 'meter', 'metric', 'dial.value', valueText, chartValueStyle(widget))
        ]
      },
      {
        spans: [
          chartSpan(widget, 'meter', 'chrome', 'dial.bottom.open', oneCellGlyph('╰', '+', { widthProfile }), chartPlaceholderStyle(widget)),
          chartSpan(widget, 'meter', 'chrome', 'dial.bottom.edge', fillTextCells('─', innerWidth, { widthProfile }), chartPlaceholderStyle(widget)),
          chartSpan(widget, 'meter', 'chrome', 'dial.bottom.close', oneCellGlyph('╯', '+', { widthProfile }), chartPlaceholderStyle(widget))
        ]
      }
    ]
  };
}

function meterVariant(widget: MeterNode): 'linear' | 'dial' {
  return widget.props.variant === 'dial' ? 'dial' : 'linear';
}

export function meterText(
  widget: MeterNode,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile
): string {
  return chartTextFromBlock(meterBlock(widget, theme, widthProfile));
}

export function meterAccessibleBase(widget: MeterNode, id: string): AccessibleNode {
  const value = numberProp(widget, 'value') ?? 0;
  const min = numberProp(widget, 'min') ?? 0;
  const max = Math.max(min + 1, numberProp(widget, 'max') ?? 100);
  const label = cleanLabel(widget.props.label);
  return {
    id,
    role: 'meter',
    label: label.length === 0 ? id : label,
    value,
    numericValue: { current: value, minimum: min, maximum: max },
    description: `Meter from ${String(min)} to ${String(max)}.`
  };
}
type MeterNode = RenderNodeOfKind<unknown, 'meter'>;

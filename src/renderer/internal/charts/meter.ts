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
  renderNode: MeterNode,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile
): RenderBlock {
  const value = numberProp(renderNode, 'value') ?? 0;
  const min = numberProp(renderNode, 'min') ?? 0;
  const max = Math.max(min + 1, numberProp(renderNode, 'max') ?? 100);
  const width = boundedInteger(numberProp(renderNode, 'width'), 4, 40, 12);
  const ratio = Math.max(0, Math.min(1, (value - min) / (max - min)));
  if (meterVariant(renderNode) === 'dial') return meterDialBlock(renderNode, ratio, width, widthProfile);
  const filledCells = Math.round(ratio * width);
  const emptyCells = Math.max(0, width - filledCells);
  const label = cleanLabel(renderNode.props.label);
  const status = chartStatus(renderNode.props.status);
  const valueText = `${String(Math.round(ratio * 100))}%`;
  return {
    lines: [{
      spans: [
        ...(label.length === 0 ? [] : [
          chartSpan(renderNode, 'meter', 'label', 'metric.label', label, chartLabelStyle(renderNode)),
          chartSpan(renderNode, 'meter', 'separator', 'metric.separator.afterLabel', ' ', chartPlaceholderStyle(renderNode))
        ]),
        chartSpan(renderNode, 'meter', 'frame', 'metric.bar.open', '[', chartPlaceholderStyle(renderNode)),
        chartSpan(
          renderNode,
          'meter',
          'fill',
          'metric.bar.filled',
          fillTextCells(theme.tokens.symbols.progressFilled, filledCells, { widthProfile }),
          chartMetricStyle(renderNode, status)
        ),
        chartSpan(
          renderNode,
          'meter',
          'fill',
          'metric.bar.empty',
          fillTextCells(theme.tokens.symbols.progressEmpty, emptyCells, { widthProfile }),
          chartPlaceholderStyle(renderNode)
        ),
        chartSpan(renderNode, 'meter', 'frame', 'metric.bar.close', ']', chartPlaceholderStyle(renderNode)),
        chartSpan(renderNode, 'meter', 'separator', 'metric.separator.beforeValue', ' ', chartPlaceholderStyle(renderNode)),
        chartSpan(renderNode, 'meter', 'metric', 'metric.value', valueText, chartMetricStyle(renderNode, status)),
        ...(status === undefined ? [] : [
          chartSpan(renderNode, 'meter', 'separator', 'status.separator', ' ', chartPlaceholderStyle(renderNode)),
          chartSpan(renderNode, 'meter', 'status', 'status.value', status, chartMetricStyle(renderNode, status))
        ])
      ]
    }]
  };
}

function meterDialBlock(
  renderNode: MeterNode,
  ratio: number,
  width: number,
  widthProfile: TextWidthProfile
): RenderBlock {
  const innerWidth = Math.max(4, width);
  const filledCells = Math.round(ratio * innerWidth);
  const emptyCells = Math.max(0, innerWidth - filledCells);
  const label = cleanLabel(renderNode.props.label);
  const status = chartStatus(renderNode.props.status);
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
        spans: [chartSpan(renderNode, 'meter', 'label', 'dial.label', label, chartLabelStyle(renderNode))]
      }]),
      {
        spans: [
          chartSpan(renderNode, 'meter', 'frame', 'dial.open', oneCellGlyph('╭', '+', { widthProfile }), chartPlaceholderStyle(renderNode)),
          chartSpan(renderNode, 'meter', 'fill', 'dial.filled', fillTextCells('─', filledCells, { widthProfile }), chartMetricStyle(renderNode, status)),
          chartSpan(renderNode, 'meter', 'fill', 'dial.empty', fillTextCells('─', emptyCells, { widthProfile }), chartPlaceholderStyle(renderNode)),
          chartSpan(renderNode, 'meter', 'frame', 'dial.close', oneCellGlyph('╮', '+', { widthProfile }), chartPlaceholderStyle(renderNode))
        ]
      },
      {
        spans: [
          chartSpan(renderNode, 'meter', 'frame', 'dial.side.left', oneCellGlyph('│', '|', { widthProfile }), chartPlaceholderStyle(renderNode)),
          chartSpan(renderNode, 'meter', 'marker', 'dial.needle', marker, chartMetricStyle(renderNode, status)),
          chartSpan(renderNode, 'meter', 'frame', 'dial.side.right', oneCellGlyph('│', '|', { widthProfile }), chartPlaceholderStyle(renderNode)),
          chartSpan(renderNode, 'meter', 'separator', 'dial.separator.beforeValue', ' ', chartPlaceholderStyle(renderNode)),
          chartSpan(renderNode, 'meter', 'metric', 'dial.value', valueText, chartValueStyle(renderNode))
        ]
      },
      {
        spans: [
          chartSpan(renderNode, 'meter', 'frame', 'dial.bottom.open', oneCellGlyph('╰', '+', { widthProfile }), chartPlaceholderStyle(renderNode)),
          chartSpan(renderNode, 'meter', 'frame', 'dial.bottom.edge', fillTextCells('─', innerWidth, { widthProfile }), chartPlaceholderStyle(renderNode)),
          chartSpan(renderNode, 'meter', 'frame', 'dial.bottom.close', oneCellGlyph('╯', '+', { widthProfile }), chartPlaceholderStyle(renderNode))
        ]
      }
    ]
  };
}

function meterVariant(renderNode: MeterNode): 'linear' | 'dial' {
  return renderNode.props.variant === 'dial' ? 'dial' : 'linear';
}

export function meterText(
  renderNode: MeterNode,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile
): string {
  return chartTextFromBlock(meterBlock(renderNode, theme, widthProfile));
}

export function meterAccessibleBase(renderNode: MeterNode, id: string): AccessibleNode {
  const value = numberProp(renderNode, 'value') ?? 0;
  const min = numberProp(renderNode, 'min') ?? 0;
  const max = Math.max(min + 1, numberProp(renderNode, 'max') ?? 100);
  const label = cleanLabel(renderNode.props.label);
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

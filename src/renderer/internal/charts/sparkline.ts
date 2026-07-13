import type { AccessibleNode } from '../../../accessibility/index.ts';
import type { RenderNodeOfKind } from '../../model/index.ts';
import type { TerminalTheme } from '../../../theme/index.ts';
import {
  chartSeriesStyle,
  chartSpan,
  chartStateBlock,
  chartStateDescription,
  chartTextFromBlock
} from '../chart-visual.ts';
import { numberProp } from '../render-node-props.ts';
import type { RenderBlock } from '../../../visual/render.ts';
import { normalizeValueScale, valueScaleStyle } from '../value-scale.ts';
import { cleanLabel, numberArray, rangeFor, sparkGlyph } from './support/values.ts';

export function sparklineBlock(widget: SparklineNode, theme: TerminalTheme): RenderBlock {
  const values = numberArray(widget.props.values);
  const state = chartStateBlock(widget, 'sparkline', theme, {
    empty: values.length === 0,
    emptyText: chartStateDescription(widget, 'No sparkline data'),
    loadingText: cleanLabel(widget.props.loadingText),
    errorText: cleanLabel(widget.props.errorText)
  });
  if (state !== undefined) return state;
  const range = rangeFor(values, numberProp(widget, 'min'), numberProp(widget, 'max'));
  const scale = normalizeValueScale(widget.props.valueScale);
  return {
    lines: [{
      spans: values.map((value, index) => chartSpan(
        widget,
        'sparkline',
        'point',
        `point.${String(index)}`,
        sparkGlyph(value, range),
        valueScaleStyle(value, range, scale, chartSeriesStyle(widget, 0))
      ))
    }]
  };
}

export function sparklineText(widget: SparklineNode, theme: TerminalTheme): string {
  return chartTextFromBlock(sparklineBlock(widget, theme));
}

export function sparklineAccessibleBase(widget: SparklineNode, id: string): AccessibleNode {
  const values = numberArray(widget.props.values);
  return {
    id,
    role: 'text',
    label: id,
    ...(values.length === 0 ? {} : { value: `${String(values.length)} points` }),
    description: `${String(values.length)} sparkline points.`
  };
}
type SparklineNode = RenderNodeOfKind<unknown, 'sparkline'>;

import type { AccessibleNode } from '../../accessibility/index.ts';
import type { RenderNode } from '../../render-node/index.ts';
import type { TerminalTheme } from '../../theme/index.ts';
import {
  chartSeriesStyle,
  chartSpan,
  chartStateBlock,
  chartStateDescription,
  chartTextFromBlock
} from '../chart-visual.ts';
import { numberProp } from '../render-node-props.ts';
import type { RenderBlock } from '../render-primitives.ts';
import { normalizeValueScale, valueScaleStyle } from '../value-scale.ts';
import { cleanLabel, numberArray, rangeFor, sparkGlyph } from './support.ts';

export function sparklineBlock(widget: RenderNode, theme: TerminalTheme): RenderBlock {
  const values = numberArray(widget.props['values']);
  const state = chartStateBlock(widget, 'sparkline', theme, {
    empty: values.length === 0,
    emptyText: chartStateDescription(widget, 'No sparkline data'),
    loadingText: cleanLabel(widget.props['loadingText']),
    errorText: cleanLabel(widget.props['errorText'])
  });
  if (state !== undefined) return state;
  const range = rangeFor(values, numberProp(widget, 'min'), numberProp(widget, 'max'));
  const scale = normalizeValueScale(widget.props['valueScale']);
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

export function sparklineText(widget: RenderNode, theme: TerminalTheme): string {
  return chartTextFromBlock(sparklineBlock(widget, theme));
}

export function sparklineAccessibleBase(widget: RenderNode, id: string): AccessibleNode {
  const values = numberArray(widget.props['values']);
  return {
    id,
    role: 'text',
    label: id,
    ...(values.length === 0 ? {} : { value: `${String(values.length)} points` }),
    description: `${String(values.length)} sparkline points.`
  };
}

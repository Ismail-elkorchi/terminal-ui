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

export function sparklineBlock(renderNode: SparklineNode, theme: TerminalTheme): RenderBlock {
  const values = numberArray(renderNode.props.values);
  const state = chartStateBlock(renderNode, 'sparkline', theme, {
    empty: values.length === 0,
    emptyText: chartStateDescription(renderNode, 'No sparkline data'),
    loadingText: cleanLabel(renderNode.props.loadingText),
    errorText: cleanLabel(renderNode.props.errorText)
  });
  if (state !== undefined) return state;
  const range = rangeFor(values, numberProp(renderNode, 'min'), numberProp(renderNode, 'max'));
  const scale = normalizeValueScale(renderNode.props.valueScale);
  return {
    lines: [{
      spans: values.map((value, index) => chartSpan(
        renderNode,
        'sparkline',
        'point',
        `point.${String(index)}`,
        sparkGlyph(value, range),
        valueScaleStyle(value, range, scale, chartSeriesStyle(renderNode, 0))
      ))
    }]
  };
}

export function sparklineText(renderNode: SparklineNode, theme: TerminalTheme): string {
  return chartTextFromBlock(sparklineBlock(renderNode, theme));
}

export function sparklineAccessibleBase(renderNode: SparklineNode, id: string): AccessibleNode {
  const values = numberArray(renderNode.props.values);
  return {
    id,
    role: 'text',
    label: id,
    ...(values.length === 0 ? {} : { value: `${String(values.length)} points` }),
    description: `${String(values.length)} sparkline points.`
  };
}
type SparklineNode = RenderNodeOfKind<unknown, 'sparkline'>;

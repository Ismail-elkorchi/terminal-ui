import type { HeatmapCell } from '../../../components/options/feedback.ts';
import type { HeatmapAction } from '../../../components/visualization.ts';
import type { RenderNodeOfKind } from '../../../render-node/index.ts';
import { sanitizeTerminalText } from '../../../text/index.ts';
import { chartHeatmapStyle, chartSpan } from '../../chart-visual.ts';
import { numberProp } from '../../render-node-props.ts';
import type { RenderSpan } from '../../render-primitives.ts';
import { valueScaleStyle } from '../../value-scale.ts';
import type { NormalizedValueScaleStop } from '../../value-scale.ts';
import { boundedInteger, normalizedIndex, rangeFor } from './values.ts';

const heatmapGlyphs = [' ', '░', '▒', '▓', '█'] as const;

type HeatmapNode<TMessage = unknown> = RenderNodeOfKind<TMessage, 'heatmap'>;

export const heatmapIntensityLevelCount = heatmapGlyphs.length;

export function heatmapRows(value: unknown): readonly (readonly HeatmapCell[])[] {
  if (!Array.isArray(value)) return [];
  return value.map((row) => Array.isArray(row)
    ? row.filter(isHeatmapCell).map((cell) => ({
        id: sanitizeTerminalText(cell.id).text,
        ...(cell.label === undefined ? {} : { label: sanitizeTerminalText(cell.label).text }),
        value: cell.value,
        ...(cell.payload === undefined ? {} : { payload: cell.payload }),
        ...(cell.disabled === undefined ? {} : { disabled: cell.disabled })
      }))
    : []
  );
}

export function heatmapCellSpans(
  widget: HeatmapNode,
  rowIndex: number,
  columnIndex: number,
  options: {
    readonly cellWidth: number;
    readonly value: number;
    readonly range: { readonly min: number; readonly max: number };
    readonly scale: readonly NormalizedValueScaleStop[];
    readonly intensity: number;
    readonly selected: boolean;
  }
): readonly RenderSpan[] {
  const glyph = heatmapGlyphs[options.intensity] ?? heatmapGlyphs[0];
  const id = `cell.${String(rowIndex)}.${String(columnIndex)}`;
  const cellStyle = valueScaleStyle(
    options.value,
    options.range,
    options.scale,
    chartHeatmapStyle(widget, options.intensity, options.selected)
  );
  if (!options.selected) {
    return [chartSpan(widget, 'heatmap', 'cell', `${id}.value`, glyph.repeat(options.cellWidth), cellStyle)];
  }
  if (options.cellWidth === 1) {
    return [chartSpan(widget, 'heatmap', 'selected', `${id}.selected`, '◆', cellStyle)];
  }
  if (options.cellWidth === 2) {
    return [
      chartSpan(widget, 'heatmap', 'marker', `${id}.selected.marker`, '›', cellStyle),
      chartSpan(widget, 'heatmap', 'cell', `${id}.value`, glyph, cellStyle)
    ];
  }
  return [
    chartSpan(widget, 'heatmap', 'marker', `${id}.selected.open`, '[', cellStyle),
    chartSpan(
      widget,
      'heatmap',
      'cell',
      `${id}.value`,
      glyph.repeat(Math.max(1, options.cellWidth - 2)),
      cellStyle
    ),
    chartSpan(widget, 'heatmap', 'marker', `${id}.selected.close`, ']', cellStyle)
  ];
}

export function heatmapRange(
  rows: readonly (readonly HeatmapCell[])[],
  explicitMin: number | undefined,
  explicitMax: number | undefined
): { readonly min: number; readonly max: number } {
  const values = rows.flatMap((row) => row.map((cell) => cell.value));
  return values.length === 0 ? { min: 0, max: 1 } : rangeFor(values, explicitMin, explicitMax);
}

export function heatmapSelected(
  widget: HeatmapNode
): { readonly row: number; readonly column: number } | undefined {
  const selected = widget.props.selected;
  if (selected === undefined) return undefined;
  return {
    row: Math.max(0, Math.floor(selected.row)),
    column: Math.max(0, Math.floor(selected.column))
  };
}

export function heatmapCellWidth(widget: HeatmapNode): number {
  return boundedInteger(numberProp(widget, 'cellWidth'), 1, 8, 3);
}

export function heatmapGap(widget: HeatmapNode): number {
  return boundedInteger(numberProp(widget, 'gap'), 0, 4, 1);
}

export function heatmapMessageFactory<TMessage>(
  widget: HeatmapNode<TMessage>
): ((action: HeatmapAction) => TMessage) | undefined {
  return widget.props.toActionMessage;
}

export { normalizedIndex };

function isHeatmapCell(value: unknown): value is HeatmapCell {
  return typeof value === 'object'
    && value !== null
    && typeof (value as { readonly id?: unknown }).id === 'string'
    && typeof (value as { readonly value?: unknown }).value === 'number'
    && Number.isFinite((value as { readonly value: number }).value);
}

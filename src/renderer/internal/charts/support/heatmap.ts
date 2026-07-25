import type { HeatmapCell, ValueScaleStop } from '../../../../ui-model/feedback.ts';
import type { HeatmapAction } from '../../../../ui-model/visualization.ts';
import type { RenderNodeOfKind } from '../../../model/index.ts';
import { fillTextCells, oneCellGlyph, sanitizeTerminalText } from '../../../../text/index.ts';
import type { TextWidthProfile } from '../../../../text/index.ts';
import { chartHeatmapStyle, chartSpan } from '../../chart-visual.ts';
import { numberProp } from '../../render-node-props.ts';
import type { RenderSpan } from '../../../../visual/render.ts';
import { valueScaleStyle } from '../../value-scale.ts';
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
  renderNode: HeatmapNode,
  rowIndex: number,
  columnIndex: number,
  options: {
    readonly cellWidth: number;
    readonly value: number;
    readonly range: { readonly min: number; readonly max: number };
    readonly scale: readonly ValueScaleStop[];
    readonly intensity: number;
    readonly selected: boolean;
    readonly widthProfile: TextWidthProfile;
  }
): readonly RenderSpan[] {
  const glyph = heatmapGlyphs[options.intensity] ?? heatmapGlyphs[0];
  const id = `cell.${String(rowIndex)}.${String(columnIndex)}`;
  const cellStyle = valueScaleStyle(
    options.value,
    options.range,
    options.scale,
    chartHeatmapStyle(renderNode, options.intensity, options.selected)
  );
  if (!options.selected) {
    return [chartSpan(
      renderNode,
      'heatmap',
      'cell',
      `${id}.value`,
      fillTextCells(glyph, options.cellWidth, { widthProfile: options.widthProfile }),
      cellStyle
    )];
  }
  if (options.cellWidth === 1) {
    return [chartSpan(
      renderNode,
      'heatmap',
      'selected',
      `${id}.selected`,
      oneCellGlyph('◆', '*', { widthProfile: options.widthProfile }),
      cellStyle
    )];
  }
  if (options.cellWidth === 2) {
    return [
      chartSpan(renderNode, 'heatmap', 'marker', `${id}.selected.marker`, '›', cellStyle),
      chartSpan(
        renderNode,
        'heatmap',
        'cell',
        `${id}.value`,
        fillTextCells(glyph, 1, { widthProfile: options.widthProfile }),
        cellStyle
      )
    ];
  }
  return [
    chartSpan(renderNode, 'heatmap', 'marker', `${id}.selected.open`, '[', cellStyle),
    chartSpan(
      renderNode,
      'heatmap',
      'cell',
      `${id}.value`,
      fillTextCells(glyph, Math.max(1, options.cellWidth - 2), {
        widthProfile: options.widthProfile
      }),
      cellStyle
    ),
    chartSpan(renderNode, 'heatmap', 'marker', `${id}.selected.close`, ']', cellStyle)
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
  renderNode: HeatmapNode
): { readonly rowIndex: number; readonly columnIndex: number } | undefined {
  const selected = renderNode.props.selected;
  if (selected === undefined) return undefined;
  return {
    rowIndex: Math.max(0, Math.floor(selected.rowIndex)),
    columnIndex: Math.max(0, Math.floor(selected.columnIndex))
  };
}

export function heatmapCellWidth(renderNode: HeatmapNode): number {
  return boundedInteger(numberProp(renderNode, 'cellWidth'), 1, 8, 3);
}

export function heatmapGap(renderNode: HeatmapNode): number {
  return boundedInteger(numberProp(renderNode, 'gap'), 0, 4, 1);
}

export function heatmapMessageFactory<TMessage>(
  renderNode: HeatmapNode<TMessage>
): ((action: HeatmapAction) => TMessage) | undefined {
  return renderNode.props.toActionMessage;
}

export { normalizedIndex };

function isHeatmapCell(value: unknown): value is HeatmapCell {
  return typeof value === 'object'
    && value !== null
    && typeof (value as { readonly id?: unknown }).id === 'string'
    && typeof (value as { readonly value?: unknown }).value === 'number'
    && Number.isFinite((value as { readonly value: number }).value);
}

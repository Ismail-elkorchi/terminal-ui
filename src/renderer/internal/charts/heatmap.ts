import type { AccessibleNode } from '../../../accessibility/index.ts';
import type { RenderNodeOfKind } from '../../model/index.ts';
import type { TerminalTheme } from '../../../theme/index.ts';
import {
  chartPlaceholderStyle,
  chartSpan,
  chartStateBlock,
  chartStateDescription,
  chartTextFromBlock
} from '../chart-visual.ts';
import type { LayoutNode, Rect } from '../../model/layout.ts';
import { numberProp } from '../render-node-props.ts';
import type { RenderBlock, RenderLine, RenderSpan } from '../../../visual/render.ts';
import type { HitTarget } from '../../model/renderer.ts';
import { normalizeValueScale } from '../value-scale.ts';
import { visibleWindow } from '../visible-window.ts';
import {
  heatmapCellSpans,
  heatmapCellWidth,
  heatmapGap,
  heatmapIntensityLevelCount,
  heatmapMessageFactory,
  heatmapRange,
  heatmapRows,
  heatmapSelected,
  normalizedIndex
} from './support/heatmap.ts';
import { clipLineSpans } from './support/render-block.ts';
import { cleanLabel } from './support/values.ts';

export function heatmapBlock(widget: HeatmapNode, node: LayoutNode, theme: TerminalTheme): RenderBlock {
  const rows = heatmapRows(widget.props.rows);
  const state = chartStateBlock(widget, 'heatmap', theme, {
    empty: rows.length === 0,
    emptyText: chartStateDescription(widget, 'No heatmap data'),
    loadingText: cleanLabel(widget.props.loadingText),
    errorText: cleanLabel(widget.props.errorText)
  });
  if (state !== undefined) return state;
  const cellWidth = heatmapCellWidth(widget);
  const gap = heatmapGap(widget);
  const range = heatmapRange(rows, numberProp(widget, 'min'), numberProp(widget, 'max'));
  const selected = heatmapSelected(widget);
  const scale = normalizeValueScale(widget.props.valueScale);
  const rowWindow = visibleWindow(rows.length, node.bounds.height, selected?.row ?? 0);
  return {
    lines: rows.slice(rowWindow.start, rowWindow.end).map((row, rowOffset): RenderLine => {
      const rowIndex = rowWindow.start + rowOffset;
      const spans = row.flatMap((cell, columnIndex): readonly RenderSpan[] => [
        ...(columnIndex === 0 ? [] : [
          chartSpan(widget, 'heatmap', 'separator', `cell.${String(rowIndex)}.${String(columnIndex)}.gap`, ' '.repeat(gap), chartPlaceholderStyle(widget))
        ]),
        ...heatmapCellSpans(widget, rowIndex, columnIndex, {
          cellWidth,
          value: cell.value,
          range,
          scale,
          intensity: normalizedIndex(cell.value, range, heatmapIntensityLevelCount - 1),
          selected: selected?.row === rowIndex && selected.column === columnIndex
        })
      ]);
      return { spans: clipLineSpans(spans, Math.max(0, node.bounds.width)) };
    })
  };
}

export function heatmapText(widget: HeatmapNode, node: LayoutNode, theme: TerminalTheme): string {
  return chartTextFromBlock(heatmapBlock(widget, node, theme));
}

export function heatmapAccessibleBase(widget: HeatmapNode, node: LayoutNode, id: string, focused: boolean): AccessibleNode {
  const rows = heatmapRows(widget.props.rows);
  const selected = heatmapSelected(widget);
  const rowWindow = visibleWindow(rows.length, node.bounds.height, selected?.row ?? 0);
  return {
    id,
    role: 'table',
    label: id,
    description: `${String(rows.length)} heatmap rows. Showing ${String(rowWindow.start + 1)}-${String(rowWindow.end)}.`,
    ...(focused ? { focused } : {})
  };
}

export function heatmapAccessibleChildren(widget: HeatmapNode, node: LayoutNode): readonly AccessibleNode[] {
  const rows = heatmapRows(widget.props.rows);
  const selected = heatmapSelected(widget);
  const rowWindow = visibleWindow(rows.length, node.bounds.height, selected?.row ?? 0);
  return rows.slice(rowWindow.start, rowWindow.end).flatMap((row, rowOffset) => {
    const rowIndex = rowWindow.start + rowOffset;
    return row.map((cell, columnIndex) => ({
      id: `${widget.id ?? 'heatmap'}:${String(rowIndex)}:${String(columnIndex)}`,
      role: 'cell' as const,
      label: cell.label ?? cell.id,
      value: cell.value,
      selected: selected?.row === rowIndex && selected.column === columnIndex
    }));
  });
}

export function heatmapHitTargets<TMessage>(widget: HeatmapNode<TMessage>, bounds: Rect): readonly HitTarget<TMessage>[] {
  const toMessage = heatmapMessageFactory(widget);
  if (toMessage === undefined) return [];
  const rows = heatmapRows(widget.props.rows);
  const selected = heatmapSelected(widget);
  const rowWindow = visibleWindow(rows.length, bounds.height, selected?.row ?? 0);
  const cellWidth = heatmapCellWidth(widget);
  const gap = heatmapGap(widget);
  return rows.slice(rowWindow.start, rowWindow.end).flatMap((row, rowOffset): HitTarget<TMessage>[] => {
    const rowIndex = rowWindow.start + rowOffset;
    return row.flatMap((cell, columnIndex): HitTarget<TMessage>[] => {
      if (cell.disabled === true) return [];
      const column = bounds.column + columnIndex * (cellWidth + gap);
      if (column > bounds.column + bounds.width - 1) return [];
      return [{
        id: `${widget.id ?? 'heatmap'}:${String(rowIndex)}:${String(columnIndex)}`,
        bounds: {
          row: bounds.row + rowOffset,
          column,
          width: Math.min(cellWidth, bounds.column + bounds.width - column),
          height: 1
        },
        message: () => toMessage({ kind: 'select', row: rowIndex, column: columnIndex }),
        cursor: 'pointer'
      }];
    });
  });
}
type HeatmapNode<TMessage = unknown> = RenderNodeOfKind<TMessage, 'heatmap'>;

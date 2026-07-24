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
import type { TextWidthProfile } from '../../../text/index.ts';

export function heatmapBlock(
  renderNode: HeatmapNode,
  node: LayoutNode,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile
): RenderBlock {
  const rows = heatmapRows(renderNode.props.rows);
  const state = chartStateBlock(renderNode, 'heatmap', theme, {
    empty: rows.length === 0,
    emptyText: chartStateDescription(renderNode, 'No heatmap data'),
    loadingText: cleanLabel(renderNode.props.loadingText),
    errorText: cleanLabel(renderNode.props.errorText)
  });
  if (state !== undefined) return state;
  const cellWidth = heatmapCellWidth(renderNode);
  const gap = heatmapGap(renderNode);
  const range = heatmapRange(rows, numberProp(renderNode, 'min'), numberProp(renderNode, 'max'));
  const selected = heatmapSelected(renderNode);
  const scale = normalizeValueScale(renderNode.props.valueScale);
  const rowWindow = visibleWindow(rows.length, node.bounds.height, selected?.rowIndex ?? 0);
  return {
    lines: rows.slice(rowWindow.start, rowWindow.end).map((row, rowOffset): RenderLine => {
      const rowIndex = rowWindow.start + rowOffset;
      const spans = row.flatMap((cell, columnIndex): readonly RenderSpan[] => [
        ...(columnIndex === 0 ? [] : [
          chartSpan(renderNode, 'heatmap', 'separator', `cell.${String(rowIndex)}.${String(columnIndex)}.gap`, ' '.repeat(gap), chartPlaceholderStyle(renderNode))
        ]),
        ...heatmapCellSpans(renderNode, rowIndex, columnIndex, {
          cellWidth,
          value: cell.value,
          range,
          scale,
          intensity: normalizedIndex(cell.value, range, heatmapIntensityLevelCount - 1),
          selected: selected?.rowIndex === rowIndex && selected.columnIndex === columnIndex,
          widthProfile
        })
      ]);
      return { spans: clipLineSpans(spans, Math.max(0, node.bounds.width), widthProfile) };
    })
  };
}

export function heatmapText(
  renderNode: HeatmapNode,
  node: LayoutNode,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile
): string {
  return chartTextFromBlock(heatmapBlock(renderNode, node, theme, widthProfile));
}

export function heatmapAccessibleBase(renderNode: HeatmapNode, node: LayoutNode, id: string, focused: boolean): AccessibleNode {
  const rows = heatmapRows(renderNode.props.rows);
  const selected = heatmapSelected(renderNode);
  const rowWindow = visibleWindow(rows.length, node.bounds.height, selected?.rowIndex ?? 0);
  return {
    id,
    role: 'grid',
    label: id,
    description: `${String(rows.length)} heatmap rows. Showing ${String(rowWindow.start + 1)}-${String(rowWindow.end)}.`,
    ...(focused ? { focused } : {})
  };
}

export function heatmapAccessibleChildren(renderNode: HeatmapNode, node: LayoutNode): readonly AccessibleNode[] {
  const rows = heatmapRows(renderNode.props.rows);
  const selected = heatmapSelected(renderNode);
  const rowWindow = visibleWindow(rows.length, node.bounds.height, selected?.rowIndex ?? 0);
  return rows.slice(rowWindow.start, rowWindow.end).map((row, rowOffset): AccessibleNode => {
    const rowIndex = rowWindow.start + rowOffset;
    return {
      id: `${renderNode.id ?? 'heatmap'}:row:${String(rowIndex)}`,
      role: 'row',
      position: { rowIndex: rowIndex + 1, rowCount: rows.length, columnCount: row.length },
      children: row.map((cell, columnIndex) => ({
        id: `${renderNode.id ?? 'heatmap'}:${String(rowIndex)}:${String(columnIndex)}`,
        role: 'gridcell' as const,
        label: cell.label ?? cell.id,
        value: cell.value,
        selected: selected?.rowIndex === rowIndex && selected.columnIndex === columnIndex,
        position: {
          rowIndex: rowIndex + 1,
          rowCount: rows.length,
          columnIndex: columnIndex + 1,
          columnCount: row.length
        }
      }))
    };
  });
}

export function heatmapHitTargets<TMessage>(renderNode: HeatmapNode<TMessage>, bounds: Rect): readonly HitTarget<TMessage>[] {
  const toMessage = heatmapMessageFactory(renderNode);
  if (toMessage === undefined) return [];
  const rows = heatmapRows(renderNode.props.rows);
  const selected = heatmapSelected(renderNode);
  const rowWindow = visibleWindow(rows.length, bounds.height, selected?.rowIndex ?? 0);
  const cellWidth = heatmapCellWidth(renderNode);
  const gap = heatmapGap(renderNode);
  return rows.slice(rowWindow.start, rowWindow.end).flatMap((row, rowOffset): HitTarget<TMessage>[] => {
    const rowIndex = rowWindow.start + rowOffset;
    return row.flatMap((cell, columnIndex): HitTarget<TMessage>[] => {
      if (cell.disabled === true) return [];
      const column = bounds.column + columnIndex * (cellWidth + gap);
      if (column > bounds.column + bounds.width - 1) return [];
      return [{
        id: `${renderNode.id ?? 'heatmap'}:${String(rowIndex)}:${String(columnIndex)}`,
        bounds: {
          row: bounds.row + rowOffset,
          column,
          width: Math.min(cellWidth, bounds.column + bounds.width - column),
          height: 1
        },
        message: () => toMessage({ kind: 'select', rowIndex, columnIndex }),
        cursor: 'pointer'
      }];
    });
  });
}
type HeatmapNode<TMessage = unknown> = RenderNodeOfKind<TMessage, 'heatmap'>;

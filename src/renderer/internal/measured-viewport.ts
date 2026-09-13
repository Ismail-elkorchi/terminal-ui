import { normalizeScrollState } from '../../behavior/scroll.ts';
import type { RenderNode, RenderNodeOfKind } from './render-tree/types.ts';
import type { Rect } from '../contracts.ts';
import type { RenderMeasurementContext } from './render-node-behavior.ts';
import type { MeasuredColumnRenderEntry } from './render-tree/props/layout.ts';
import { retainViewportScrollbarPlan, scrollbarsForRenderNode } from './node-renderers/support/scroll.ts';

export function resolveMeasuredViewport<TMessage>(
  node: RenderNodeOfKind<TMessage, 'viewport'>,
  bounds: Rect,
  measurements: RenderMeasurementContext,
  depth: number,
): RenderNodeOfKind<TMessage, 'viewport'> {
  const children = node.children ?? [];
  const rowsAt = (content: Rect) => children.map((child) =>
    measurements.measure(child, content, depth + 2).preferredHeight);
  const entriesAt = (content: Rect) => {
    let rowOffset = 0;
    return rowsAt(content).map((rows, index) => {
      const entry = { id: children[index]?.id ?? `entry:${String(index)}`, rowOffset, rows };
      rowOffset += rows;
      return entry;
    });
  };
  const plan = scrollbarsForRenderNode(node, bounds, (content) => {
    const entries = entriesAt(content);
    const geometry = {
      contentRows: entries.reduce((total, entry) => total + entry.rows, 0),
      contentColumns: content.width,
      viewportRows: content.height,
      viewportColumns: content.width,
    };
    const anchor = node.props.anchor;
    const entry = anchor === undefined ? undefined : entries.find((item) => item.id === anchor.itemId);
    const offsetRow = anchor !== undefined && entry !== undefined
      ? entry.rowOffset + Math.min(anchor.rowWithinItem, Math.max(0, entry.rows - 1)) - anchor.viewportRow
      : node.props.offsetRow ?? 0;
    return { ...geometry, ...normalizeScrollState({ offsetRow, offsetColumn: 0,
      followTail: node.props.followTail === true }, geometry) };
  }, 'vertical');
  const rows = rowsAt(plan.contentBounds);
  const offset = plan.state.offsetRow;
  node.props.onLayout?.({
    entries: entriesAt(plan.contentBounds),
    geometry: { contentRows: plan.state.contentRows, contentColumns: plan.state.contentColumns,
      viewportRows: plan.contentBounds.height, viewportColumns: plan.contentBounds.width },
    scroll: { offsetRow: offset, offsetColumn: 0, followTail: plan.state.followTail },
  });
  const end = offset + plan.contentBounds.height;
  const visible: RenderNode<TMessage>[] = [];
  const entries: MeasuredColumnRenderEntry[] = [];
  let rowOffset = 0;
  children.forEach((child, index) => {
    const height = rows[index] ?? 0;
    if (height > 0 && rowOffset < end && rowOffset + height > offset) {
      visible.push(child);
      entries.push({ rowOffset, rows: height, clippedRowsBefore: 0,
        measurementHeight: plan.contentBounds.height, sourceIndex: index });
    }
    rowOffset += height;
  });
  return retainViewportScrollbarPlan<TMessage>({
    ...node,
    props: { ...node.props, measured: false, offsetRow: offset },
    children: [{
      kind: 'measuredColumn',
      props: { entries, totalRows: rowOffset },
      children: visible,
    }],
  }, bounds, plan);
}

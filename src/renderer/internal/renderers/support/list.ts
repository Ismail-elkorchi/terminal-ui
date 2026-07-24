import type { AccessibleNode } from '../../../../accessibility/index.ts';
import type { TerminalTheme } from '../../../../theme/index.ts';
import type { TextWidthProfile } from '../../../../text/index.ts';
import type { RenderNodeOfKind } from '../../../model/index.ts';
import { projectedRowWindow, rowWindow, scrollStateFromUnknown } from '../../../../behavior/data-window.ts';
import { createScrollState, normalizeScrollState } from '../../../../behavior/scroll.ts';
import { dataSource, dataSpan, dataValueSpans, mergeDataStyles, selectionMarkerSpans } from '../../data-visual.ts';
import type { ScrollState } from '../../../../interaction/scroll.ts';
import { windowDescription } from '../../visible-window.ts';
import { stringify } from '../../render-node-props.ts';
import { resolveRenderNodeStyle, themeStyle } from '../../render-node-style.ts';
import type { LayoutNode, Rect } from '../../../model/layout.ts';
import type { RenderBlock, RenderLine } from '../../../../visual/render.ts';
import type { HitTarget } from '../../../model/renderer.ts';
import type { ListControlAction } from '../../../../ui-model/list.ts';
import type { ListViewProjection } from '../../../../ui-model/list.ts';
import { interactionVisualState, renderNodeTargetId } from '../../pointer-presentation.ts';
import { measureBlock } from '../../measurement.ts';
import type { Measurement } from '../../../model/measurement.ts';

type ListNode<TMessage = unknown> = RenderNodeOfKind<TMessage, 'list'>;

const intrinsicMeasurementRows = 64;

export function listScrollbarState(renderNode: ListNode, bounds: Rect): ScrollState {
  const projection = renderNode.props.view;
  const selected = selectedVisibleIndex(projection, stringify(renderNode.props.selectedId));
  const explicitScroll = scrollStateFromUnknown(renderNode.props.scroll);
  if (explicitScroll !== undefined) {
    return normalizeScrollState({
      ...explicitScroll,
      contentRows: projection.total,
      contentColumns: bounds.width,
      viewportRows: bounds.height,
      viewportColumns: bounds.width
    });
  }
  const window = listWindow(renderNode, projection, bounds.height, selected, bounds.width);
  return createScrollState({
    offsetRow: window.start,
    offsetColumn: window.offsetColumn,
    contentRows: window.totalRows,
    contentColumns: bounds.width,
    viewportRows: bounds.height,
    viewportColumns: bounds.width,
    ...(window.selectedIndex === undefined ? {} : { selectedIndex: window.selectedIndex })
  });
}

export function listBlock(renderNode: ListNode, height: number, theme: TerminalTheme, focused = false): RenderBlock {
  const projection = renderNode.props.view;
  const selectedId = stringify(renderNode.props.selectedId);
  const selected = selectedVisibleIndex(projection, selectedId);
  const window = listWindow(renderNode, projection, height, selected);
  const query = projection.query;
  if (window.rows.length === 0 && height > 0) {
    return {
      lines: [{
        spans: [dataSpan(
          query.length === 0 ? 'No items' : 'No matching items',
          resolveRenderNodeStyle(renderNode, { part: 'empty', base: themeStyle('text.muted', { dim: true }) }),
          dataSource(renderNode, query.length === 0 ? 'empty' : 'filter.empty', { role: 'text' })
        )]
      }]
    };
  }
  return {
    lines: window.rows.map((entry): RenderLine => {
      const itemIndex = entry.sourceIndex;
      const isSelected = entry.id === selectedId;
      const state = interactionVisualState(renderNode, listOptionTargetId(renderNode, entry.id), {
        disabled: entry.item.disabled,
        selected: isSelected,
        focused: focused && isSelected
      });
      const style = resolveRenderNodeStyle(renderNode, {
        part: 'item',
        base: themeStyle('text.default'),
        ...(state === undefined ? {} : { state })
      });
      const matchStyle = mergeDataStyles(
        style,
        themeStyle('menu.match', { underline: true }),
        renderNode.styles?.parts?.['match']
      );
      return {
        spans: [
          ...selectionMarkerSpans(
            renderNode,
            isSelected,
            theme,
            style,
            dataSource(renderNode, `item.${entry.id}.marker`, {
              itemId: entry.id,
              itemIndex,
              role: 'decoration',
              ...(state === undefined ? {} : { state })
            })
          ),
          ...dataValueSpans(entry.item.label, query, style, {
            source: dataSource(renderNode, `item.${entry.id}.value`, {
              itemId: entry.id,
              itemIndex,
              ...(state === undefined ? {} : { state })
            }),
            matchSource: dataSource(renderNode, `item.${entry.id}.match`, { itemId: entry.id, itemIndex }),
            ...(matchStyle === undefined ? {} : { matchStyle })
          }),
          ...(entry.item.description === undefined ? [] : [dataSpan(
            ` · ${entry.item.description}`,
            resolveRenderNodeStyle(renderNode, { part: 'description', base: themeStyle('text.muted', { dim: true }) }),
            dataSource(renderNode, `item.${entry.id}.description`, {
              itemId: entry.id,
              itemIndex,
              ...(state === undefined ? {} : { state })
            })
          )])
        ]
      };
    })
  };
}

export function listIntrinsicMeasurement(
  renderNode: ListNode,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile
): Measurement {
  const rowCount = Math.max(1, Math.min(intrinsicMeasurementRows, renderNode.props.view.total));
  return measureBlock(listBlock(renderNode, rowCount, theme), { widthProfile });
}

export function listAccessibleNode(renderNode: ListNode, node: LayoutNode, id: string, focused: boolean): AccessibleNode {
  const projection = renderNode.props.view;
  const selected = selectedVisibleIndex(projection, stringify(renderNode.props.selectedId));
  const window = listWindow(renderNode, projection, node.bounds.height, selected, node.bounds.width);
  return {
    id,
    role: 'listbox',
    label: id,
    description: windowDescription('items', window, projection.total),
    ...(focused ? { focused } : {})
  };
}

export function listAccessibleChildren(renderNode: ListNode, node: LayoutNode): readonly AccessibleNode[] {
  const projection = renderNode.props.view;
  const selectedId = stringify(renderNode.props.selectedId);
  const selected = selectedVisibleIndex(projection, selectedId);
  const window = listWindow(renderNode, projection, node.bounds.height, selected, node.bounds.width);
  return window.rows.map((entry) => ({
      id: listOptionTargetId(renderNode, entry.id),
      role: 'option',
      label: entry.item.label,
      ...(entry.item.description === undefined ? {} : { description: entry.item.description }),
      selected: entry.id === selectedId,
      disabled: entry.item.disabled
    }));
}

function listOptionTargetId(renderNode: ListNode, entryId: string): string {
  return renderNodeTargetId(renderNode, 'option', entryId);
}

export function listCursor(renderNode: ListNode, bounds: Rect): { readonly row: number; readonly column: number } {
  const projection = renderNode.props.view;
  const selected = selectedVisibleIndex(projection, stringify(renderNode.props.selectedId));
  if (selected < 0 || projection.total === 0 || bounds.height <= 0) {
    return { row: bounds.row, column: bounds.column };
  }
  const window = listWindow(renderNode, projection, bounds.height, selected, bounds.width);
  const selectedRow = selected >= window.start && selected < window.end
    ? bounds.row + selected - window.start
    : bounds.row;
  return { row: selectedRow, column: bounds.column };
}

export function listHitTargets<TMessage>(renderNode: ListNode<TMessage>, bounds: Rect): readonly HitTarget<TMessage>[] {
  const toMessage = toActionMessageProp(renderNode);
  if (toMessage === undefined) return [];
  const projection = renderNode.props.view;
  const selected = selectedVisibleIndex(projection, stringify(renderNode.props.selectedId));
  const window = listWindow(renderNode, projection, bounds.height, selected, bounds.width);
  return window.rows.flatMap((entry, index): HitTarget<TMessage>[] => {
    if (entry.item.disabled) return [];
    const itemIndex = entry.sourceIndex;
    return [{
      id: listOptionTargetId(renderNode, entry.id),
      bounds: {
        row: bounds.row + index,
        column: bounds.column,
        width: bounds.width,
        height: 1
      },
      message: (event) => toMessage(event.clickCount === 2
        ? { kind: 'activate', id: entry.id, index: itemIndex }
        : { kind: 'select', id: entry.id, index: itemIndex }),
      cursor: 'pointer'
    }];
  });
}

function listWindow(renderNode: ListNode, projection: ListViewProjection<unknown>, height: number, selected: number, width = 0) {
  const input = {
    viewportRows: height,
    viewportColumns: width,
    contentColumns: width,
    selectedIndex: selected,
    ...scrollInput(renderNode)
  };
  if (projection.source.kind === 'complete') return rowWindow(projection.entries, input);
  const window = projectedRowWindow(projection.source, input);
  const localStart = window.start - projection.source.start;
  return {
    ...window,
    rows: projection.entries.slice(localStart, localStart + window.rows.length)
  };
}

function scrollInput(renderNode: ListNode): { readonly scroll?: ScrollState } {
  const scroll = scrollStateFromUnknown(renderNode.props.scroll);
  return scroll === undefined ? {} : { scroll };
}

function toActionMessageProp<TMessage>(renderNode: ListNode<TMessage>): ((action: ListControlAction) => TMessage) | undefined {
  return renderNode.props.toActionMessage;
}

function selectedVisibleIndex(projection: ListViewProjection<unknown>, selectedId: string): number {
  if (selectedId.length === 0) return -1;
  const local = projection.entries.findIndex((entry) => entry.id === selectedId);
  return local < 0 ? -1 : projection.start + local;
}

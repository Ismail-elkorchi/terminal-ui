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

export function listScrollbarState(widget: ListNode, bounds: Rect): ScrollState {
  const projection = widget.props.view;
  const selected = selectedVisibleIndex(projection, stringify(widget.props.selectedId));
  const explicitScroll = scrollStateFromUnknown(widget.props.scroll);
  if (explicitScroll !== undefined) {
    return normalizeScrollState({
      ...explicitScroll,
      contentRows: projection.total,
      contentColumns: bounds.width,
      viewportRows: bounds.height,
      viewportColumns: bounds.width
    });
  }
  const window = listWindow(widget, projection, bounds.height, selected, bounds.width);
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

export function listBlock(widget: ListNode, height: number, theme: TerminalTheme, focused = false): RenderBlock {
  const projection = widget.props.view;
  const selectedId = stringify(widget.props.selectedId);
  const selected = selectedVisibleIndex(projection, selectedId);
  const window = listWindow(widget, projection, height, selected);
  const query = projection.query;
  if (window.rows.length === 0 && height > 0) {
    return {
      lines: [{
        spans: [dataSpan(
          query.length === 0 ? 'No items' : 'No matching items',
          resolveRenderNodeStyle(widget, { part: 'empty', base: themeStyle('text.muted', { dim: true }) }),
          dataSource(widget, query.length === 0 ? 'empty' : 'filter.empty', { role: 'text' })
        )]
      }]
    };
  }
  return {
    lines: window.rows.map((entry): RenderLine => {
      const itemIndex = entry.sourceIndex;
      const isSelected = entry.id === selectedId;
      const state = interactionVisualState(widget, listOptionTargetId(widget, entry.id), {
        disabled: entry.item.disabled,
        selected: isSelected,
        focused: focused && isSelected
      });
      const style = resolveRenderNodeStyle(widget, {
        part: 'item',
        base: themeStyle('text.default'),
        ...(state === undefined ? {} : { state })
      });
      const matchStyle = mergeDataStyles(
        style,
        themeStyle('menu.match', { underline: true }),
        widget.styles?.parts?.['match']
      );
      return {
        spans: [
          ...selectionMarkerSpans(
            widget,
            isSelected,
            theme,
            style,
            dataSource(widget, `item.${entry.id}.marker`, {
              itemId: entry.id,
              itemIndex,
              role: 'decoration',
              ...(state === undefined ? {} : { state })
            })
          ),
          ...dataValueSpans(entry.item.label, query, style, {
            source: dataSource(widget, `item.${entry.id}.value`, {
              itemId: entry.id,
              itemIndex,
              ...(state === undefined ? {} : { state })
            }),
            matchSource: dataSource(widget, `item.${entry.id}.match`, { itemId: entry.id, itemIndex, state: 'match' }),
            ...(matchStyle === undefined ? {} : { matchStyle })
          }),
          ...(entry.item.description === undefined ? [] : [dataSpan(
            ` · ${entry.item.description}`,
            resolveRenderNodeStyle(widget, { part: 'description', base: themeStyle('text.muted', { dim: true }) }),
            dataSource(widget, `item.${entry.id}.description`, {
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
  widget: ListNode,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile
): Measurement {
  const rowCount = Math.max(1, Math.min(intrinsicMeasurementRows, widget.props.view.total));
  return measureBlock(listBlock(widget, rowCount, theme), { widthProfile });
}

export function listAccessibleNode(widget: ListNode, node: LayoutNode, id: string, focused: boolean): AccessibleNode {
  const projection = widget.props.view;
  const selected = selectedVisibleIndex(projection, stringify(widget.props.selectedId));
  const window = listWindow(widget, projection, node.bounds.height, selected, node.bounds.width);
  return {
    id,
    role: 'listbox',
    label: id,
    description: windowDescription('items', window, projection.total),
    ...(focused ? { focused } : {})
  };
}

export function listAccessibleChildren(widget: ListNode, node: LayoutNode): readonly AccessibleNode[] {
  const projection = widget.props.view;
  const selectedId = stringify(widget.props.selectedId);
  const selected = selectedVisibleIndex(projection, selectedId);
  const window = listWindow(widget, projection, node.bounds.height, selected, node.bounds.width);
  return window.rows.map((entry) => ({
      id: listOptionTargetId(widget, entry.id),
      role: 'option',
      label: entry.item.label,
      ...(entry.item.description === undefined ? {} : { description: entry.item.description }),
      selected: entry.id === selectedId,
      disabled: entry.item.disabled
    }));
}

function listOptionTargetId(widget: ListNode, entryId: string): string {
  return renderNodeTargetId(widget, 'option', entryId);
}

export function listCursor(widget: ListNode, bounds: Rect): { readonly row: number; readonly column: number } {
  const projection = widget.props.view;
  const selected = selectedVisibleIndex(projection, stringify(widget.props.selectedId));
  if (selected < 0 || projection.total === 0 || bounds.height <= 0) {
    return { row: bounds.row, column: bounds.column };
  }
  const window = listWindow(widget, projection, bounds.height, selected, bounds.width);
  const selectedRow = selected >= window.start && selected < window.end
    ? bounds.row + selected - window.start
    : bounds.row;
  return { row: selectedRow, column: bounds.column };
}

export function listHitTargets<TMessage>(widget: ListNode<TMessage>, bounds: Rect): readonly HitTarget<TMessage>[] {
  const toMessage = toActionMessageProp(widget);
  if (toMessage === undefined) return [];
  const projection = widget.props.view;
  const selected = selectedVisibleIndex(projection, stringify(widget.props.selectedId));
  const window = listWindow(widget, projection, bounds.height, selected, bounds.width);
  return window.rows.flatMap((entry, index): HitTarget<TMessage>[] => {
    if (entry.item.disabled) return [];
    const itemIndex = entry.sourceIndex;
    return [{
      id: listOptionTargetId(widget, entry.id),
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

function listWindow(widget: ListNode, projection: ListViewProjection<unknown>, height: number, selected: number, width = 0) {
  const input = {
    viewportRows: height,
    viewportColumns: width,
    contentColumns: width,
    selectedIndex: selected,
    ...scrollInput(widget)
  };
  if (projection.source.kind === 'complete') return rowWindow(projection.entries, input);
  const window = projectedRowWindow(projection.source, input);
  const localStart = window.start - projection.source.start;
  return {
    ...window,
    rows: projection.entries.slice(localStart, localStart + window.rows.length)
  };
}

function scrollInput(widget: ListNode): { readonly scroll?: ScrollState } {
  const scroll = scrollStateFromUnknown(widget.props.scroll);
  return scroll === undefined ? {} : { scroll };
}

function toActionMessageProp<TMessage>(widget: ListNode<TMessage>): ((action: ListControlAction) => TMessage) | undefined {
  return widget.props.toActionMessage;
}

function selectedVisibleIndex(projection: ListViewProjection<unknown>, selectedId: string): number {
  if (selectedId.length === 0) return -1;
  const local = projection.entries.findIndex((entry) => entry.id === selectedId);
  return local < 0 ? -1 : projection.start + local;
}

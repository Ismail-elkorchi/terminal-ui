import type { AccessibleNode } from '../../../accessibility/index.ts';
import type { TerminalTheme } from '../../../theme/index.ts';
import type { RenderNodeOfKind } from '../../../render-node/index.ts';
import { rowWindow, scrollStateFromUnknown } from '../../../behavior/data-window.ts';
import { createScrollState, normalizeScrollState } from '../../../behavior/scroll.ts';
import { dataSource, dataSpan, dataValueSpans, mergeDataStyles, selectionMarkerSpans } from '../../data-visual.ts';
import type { ScrollState } from '../../../interaction/scroll.ts';
import { sanitizeTerminalText } from '../../../text/index.ts';
import { windowDescription } from '../../visible-window.ts';
import { numberProp, stringify } from '../../render-node-props.ts';
import { resolveRenderNodeStyle, themeStyle } from '../../render-node-style.ts';
import type { LayoutNode, Rect } from '../../layout.ts';
import type { RenderBlock, RenderLine } from '../../render-primitives.ts';
import type { HitTarget } from '../../render-node-renderer.ts';
import type { ListAction } from '../../../ui-model/list.ts';

type ListNode<TMessage = unknown> = RenderNodeOfKind<TMessage, 'list'>;

export function listScrollbarState(widget: ListNode, bounds: Rect): ScrollState {
  const items = filteredListItems(widget);
  const selected = selectedVisibleIndex(items, numberProp(widget, 'selected'));
  const explicitScroll = scrollStateFromUnknown(widget.props.scroll);
  if (explicitScroll !== undefined) {
    return normalizeScrollState({
      ...explicitScroll,
      contentRows: items.length,
      contentColumns: bounds.width,
      viewportRows: bounds.height,
      viewportColumns: bounds.width
    });
  }
  const window = listWindow(widget, items, bounds.height, selected, bounds.width);
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

export function listBlock(widget: ListNode, height: number, theme: TerminalTheme): RenderBlock {
  const items = filteredListItems(widget);
  const selectedSourceIndex = numberProp(widget, 'selected');
  const selected = selectedVisibleIndex(items, selectedSourceIndex);
  const window = listWindow(widget, items, height, selected);
  const query = filterQuery(widget);
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
      const itemIndex = entry.index;
      const isSelected = itemIndex === selectedSourceIndex;
      const style = resolveRenderNodeStyle(widget, {
        part: 'item',
        base: themeStyle('text.default'),
        ...(isSelected ? { state: 'selected' } : {})
      });
      const matchStyle = mergeDataStyles(
        style,
        themeStyle('menu.match', { underline: true }),
        widget.styles?.parts?.['match']
      );
      const itemSourceId = `${widget.id ?? 'list'}:option:${String(itemIndex)}`;
      return {
        spans: [
          ...selectionMarkerSpans(
            widget,
            isSelected,
            theme,
            style,
            dataSource(widget, `item.${String(itemIndex)}.marker`, { itemId: itemSourceId, itemIndex, role: 'decoration' })
          ),
          ...dataValueSpans(clean(String(entry.value)), query, style, {
            source: dataSource(widget, `item.${String(itemIndex)}.value`, { itemId: itemSourceId, itemIndex }),
            matchSource: dataSource(widget, `item.${String(itemIndex)}.match`, { itemId: itemSourceId, itemIndex }),
            ...(matchStyle === undefined ? {} : { matchStyle })
          })
        ]
      };
    })
  };
}

export function listAccessibleNode(widget: ListNode, node: LayoutNode, id: string, focused: boolean): AccessibleNode {
  const items = filteredListItems(widget);
  const selected = selectedVisibleIndex(items, numberProp(widget, 'selected'));
  const window = listWindow(widget, items, node.bounds.height, selected, node.bounds.width);
  return {
    id,
    role: 'listbox',
    label: id,
    description: windowDescription('items', window, items.length),
    ...(focused ? { focused } : {})
  };
}

export function listAccessibleChildren(widget: ListNode, node: LayoutNode): readonly AccessibleNode[] {
  const items = filteredListItems(widget);
  const selectedSourceIndex = numberProp(widget, 'selected');
  const selected = selectedVisibleIndex(items, selectedSourceIndex);
  const window = listWindow(widget, items, node.bounds.height, selected, node.bounds.width);
  return window.rows.map((entry) => {
    const itemIndex = entry.index;
    return {
      id: `${widget.id ?? 'list'}:option:${String(itemIndex)}`,
      role: 'option',
      label: String(entry.value),
      selected: itemIndex === selectedSourceIndex,
      disabled: entry.disabled
    };
  });
}

export function listCursor(widget: ListNode, bounds: Rect): { readonly row: number; readonly column: number } {
  const items = filteredListItems(widget);
  const selected = selectedVisibleIndex(items, numberProp(widget, 'selected'));
  if (selected < 0 || items.length === 0 || bounds.height <= 0) {
    return { row: bounds.row, column: bounds.column };
  }
  const window = listWindow(widget, items, bounds.height, selected, bounds.width);
  const selectedRow = selected >= window.start && selected < window.end
    ? bounds.row + selected - window.start
    : bounds.row;
  return { row: selectedRow, column: bounds.column };
}

export function listHitTargets<TMessage>(widget: ListNode<TMessage>, bounds: Rect): readonly HitTarget<TMessage>[] {
  const toMessage = toActionMessageProp(widget);
  if (toMessage === undefined) return [];
  const items = filteredListItems(widget);
  const selected = selectedVisibleIndex(items, numberProp(widget, 'selected'));
  const window = listWindow(widget, items, bounds.height, selected, bounds.width);
  return window.rows.flatMap((entry, index): HitTarget<TMessage>[] => {
    if (entry.disabled) return [];
    const itemIndex = entry.index;
    return [{
      id: `${widget.id ?? 'list'}:option:${String(itemIndex)}`,
      bounds: {
        row: bounds.row + index,
        column: bounds.column,
        width: bounds.width,
        height: 1
      },
      message: () => toMessage({ kind: 'select', index: itemIndex }),
      cursor: 'pointer'
    }];
  });
}

interface ListEntry {
  readonly value: unknown;
  readonly index: number;
  readonly disabled: boolean;
}

function filteredListItems(widget: ListNode): readonly ListEntry[] {
  const items = Array.isArray(widget.props.items) ? widget.props.items : [];
  const disabled = new Set(widget.props.disabledIndices ?? []);
  const query = filterQuery(widget).toLocaleLowerCase();
  return items.flatMap((value, index): readonly ListEntry[] =>
    query.length > 0 && !String(value).toLocaleLowerCase().includes(query)
      ? []
      : [{ value, index, disabled: disabled.has(index) }]
  );
}

function filterQuery(widget: ListNode): string {
  return clean(stringify(widget.props.filterQuery)).trim();
}

function listWindow(widget: ListNode, items: readonly ListEntry[], height: number, selected: number, width = 0) {
  return rowWindow(items, {
    viewportRows: height,
    viewportColumns: width,
    contentColumns: width,
    selectedIndex: selected,
    ...scrollInput(widget)
  });
}

function scrollInput(widget: ListNode): { readonly scroll?: ScrollState } {
  const scroll = scrollStateFromUnknown(widget.props.scroll);
  return scroll === undefined ? {} : { scroll };
}

function toActionMessageProp<TMessage>(widget: ListNode<TMessage>): ((action: ListAction) => TMessage) | undefined {
  return widget.props.toActionMessage;
}

function selectedVisibleIndex(items: readonly ListEntry[], selected: number | undefined): number {
  return selected === undefined ? -1 : items.findIndex((entry) => entry.index === selected);
}

function clean(value: string): string {
  return sanitizeTerminalText(value).text.replace(/\s*\n\s*/gu, ' ');
}

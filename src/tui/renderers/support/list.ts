import type { AccessibleNode } from '../../../accessibility/index.ts';
import type { TerminalTheme } from '../../../theme/index.ts';
import type { Widget } from '../../../widgets/index.ts';
import { rowWindow, scrollStateFromUnknown } from '../../data-window.ts';
import { dataSource, dataSpan, dataValueSpans, selectionMarkerSpans } from '../../data-visual.ts';
import type { ScrollState } from '../../scroll.ts';
import { sanitizeTerminalText } from '../../../text/index.ts';
import { windowDescription } from '../../visible-window.ts';
import { numberProp, stringify } from '../../widget-props.ts';
import { widgetStyle } from '../../widget-style.ts';
import type { LayoutNode, Rect } from '../../layout.ts';
import type { RenderBlock, RenderLine } from '../../render-primitives.ts';
import type { ScrollbarState } from '../../scrollbar.ts';
import type { HitTarget } from '../../widget-renderer.ts';

export function listScrollbarState(widget: Widget, bounds: Rect): ScrollbarState {
  const items = filteredListItems(widget);
  const selected = numberProp(widget, 'selected') ?? -1;
  const window = listWindow(widget, items, bounds.height, selected, bounds.width);
  return {
    offsetRow: window.start,
    offsetColumn: window.offsetColumn,
    contentRows: window.totalRows,
    contentColumns: bounds.width
  };
}

export function listBlock(widget: Widget, height: number, theme: TerminalTheme): RenderBlock {
  const items = filteredListItems(widget);
  const selected = numberProp(widget, 'selected') ?? -1;
  const window = listWindow(widget, items, height, selected);
  const query = filterQuery(widget);
  if (window.rows.length === 0 && height > 0) {
    return {
      lines: [{
        spans: [dataSpan(
          query.length === 0 ? 'No items' : 'No matching items',
          widgetStyle(widget, 'placeholder'),
          dataSource(widget, query.length === 0 ? 'empty' : 'filter.empty', { role: 'text' })
        )]
      }]
    };
  }
  return {
    lines: window.rows.map((item, index): RenderLine => {
      const itemIndex = window.start + index;
      const isSelected = itemIndex === selected;
      const style = isSelected ? widgetStyle(widget, 'value', 'selected') : undefined;
      const itemSourceId = `${widget.id ?? 'list'}:option:${String(itemIndex)}`;
      return {
        spans: [
          ...selectionMarkerSpans(
            widget,
            isSelected,
            theme,
            style,
            dataSource(widget, `item.${String(itemIndex)}.marker`, { id: itemSourceId, role: 'decoration' })
          ),
          ...dataValueSpans(clean(String(item)), query, style, {
            source: dataSource(widget, `item.${String(itemIndex)}.value`, { id: itemSourceId }),
            matchSource: dataSource(widget, `item.${String(itemIndex)}.match`, { id: itemSourceId })
          })
        ]
      };
    })
  };
}

export function listAccessibleNode(widget: Widget, node: LayoutNode, id: string, focused: boolean): AccessibleNode {
  const items = filteredListItems(widget);
  const selected = numberProp(widget, 'selected') ?? -1;
  const window = listWindow(widget, items, node.bounds.height, selected, node.bounds.width);
  return {
    id,
    role: 'listbox',
    label: id,
    description: windowDescription('items', window, items.length),
    ...(focused ? { focused } : {})
  };
}

export function listAccessibleChildren(widget: Widget, node: LayoutNode): readonly AccessibleNode[] {
  const items = filteredListItems(widget);
  const selected = numberProp(widget, 'selected') ?? -1;
  const window = listWindow(widget, items, node.bounds.height, selected, node.bounds.width);
  return window.rows.map((item, index) => {
    const itemIndex = window.start + index;
    return {
      id: `${widget.id ?? 'list'}:option:${String(itemIndex)}`,
      role: 'option',
      label: String(item),
      selected: itemIndex === selected
    };
  });
}

export function listCursor(widget: Widget, bounds: Rect): { readonly row: number; readonly column: number } {
  const items = filteredListItems(widget);
  const selected = numberProp(widget, 'selected');
  if (selected === undefined || items.length === 0 || bounds.height <= 0) {
    return { row: bounds.row, column: bounds.column };
  }
  const window = listWindow(widget, items, bounds.height, selected, bounds.width);
  const selectedRow = selected >= window.start && selected < window.end
    ? bounds.row + selected - window.start
    : bounds.row;
  return { row: selectedRow, column: bounds.column };
}

export function listHitTargets<TMessage>(widget: Widget<TMessage>, bounds: Rect): readonly HitTarget<TMessage>[] {
  const toMessage = toMessageProp(widget);
  if (toMessage === undefined) return [];
  const items = filteredListItems(widget);
  const selected = numberProp(widget, 'selected') ?? -1;
  const window = listWindow(widget, items, bounds.height, selected, bounds.width);
  return window.rows.flatMap((item, index): HitTarget<TMessage>[] => {
    const itemIndex = window.start + index;
    return [{
      id: `${widget.id ?? 'list'}:option:${String(itemIndex)}`,
      bounds: {
        row: bounds.row + index,
        column: bounds.column,
        width: bounds.width,
        height: 1
      },
      message: () => toMessage(item),
      cursor: 'pointer'
    }];
  });
}

function filteredListItems(widget: Widget): readonly unknown[] {
  const items = Array.isArray(widget.props['items']) ? widget.props['items'] : [];
  const query = filterQuery(widget).toLocaleLowerCase();
  if (query.length === 0) return items;
  return items.filter((item) => String(item).toLocaleLowerCase().includes(query));
}

function filterQuery(widget: Widget): string {
  return clean(stringify(widget.props['filterQuery'])).trim();
}

function listWindow(widget: Widget, items: readonly unknown[], height: number, selected: number, width = 0) {
  return rowWindow(items, {
    viewportRows: height,
    viewportColumns: width,
    contentColumns: width,
    selectedIndex: selected,
    ...scrollInput(widget)
  });
}

function scrollInput(widget: Widget): { readonly scroll?: ScrollState } {
  const scroll = scrollStateFromUnknown(widget.props['scroll']);
  return scroll === undefined ? {} : { scroll };
}

function toMessageProp<TMessage>(widget: Widget<TMessage>): ((value: unknown) => TMessage) | undefined {
  const toMessage = widget.props['toMessage'];
  return isListMessageFactory(toMessage) ? (value) => toMessage(value) as TMessage : undefined;
}

function isListMessageFactory(value: unknown): value is (item: unknown) => unknown {
  return typeof value === 'function';
}

function clean(value: string): string {
  return sanitizeTerminalText(value).text.replace(/\s*\n\s*/gu, ' ');
}

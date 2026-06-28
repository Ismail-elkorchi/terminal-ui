import type { AccessibleNode } from '../../../accessibility/index.ts';
import type { TerminalTheme } from '../../../theme/index.ts';
import type { Widget } from '../../../widgets/index.ts';
import { normalizeScrollState, visibleWindowFromScroll } from '../../scroll.ts';
import { visibleWindow, windowDescription } from '../../visible-window.ts';
import { numberProp, stringify } from '../../widget-props.ts';
import type { LayoutNode, Rect } from '../../layout.ts';
import type { ScrollbarState } from '../../scrollbar.ts';

export function listScrollbarState(widget: Widget, bounds: Rect): ScrollbarState {
  const items = filteredListItems(widget);
  const selected = numberProp(widget, 'selected') ?? -1;
  const window = listWindow(widget, items.length, bounds.height, selected);
  const scroll = normalizeScrollState({
    offsetRow: window.start,
    offsetColumn: 0,
    contentRows: items.length,
    contentColumns: bounds.width,
    viewportRows: bounds.height,
    viewportColumns: bounds.width,
    followTail: false
  });
  return {
    offsetRow: scroll.offsetRow,
    offsetColumn: scroll.offsetColumn,
    contentRows: scroll.contentRows,
    contentColumns: scroll.contentColumns
  };
}

export function listText(widget: Widget, height: number, theme: TerminalTheme): string {
  const items = filteredListItems(widget);
  const selected = numberProp(widget, 'selected') ?? -1;
  const window = listWindow(widget, items.length, height, selected);
  return items
    .slice(window.start, window.end)
    .map((item, index) => {
      const itemIndex = window.start + index;
      return `${itemIndex === selected ? theme.symbols.pointer : theme.symbols.unselected} ${String(item)}`;
    })
    .join('\n');
}

export function listAccessibleNode(widget: Widget, node: LayoutNode, id: string, focused: boolean): AccessibleNode {
  const items = filteredListItems(widget);
  const selected = numberProp(widget, 'selected') ?? -1;
  const window = listWindow(widget, items.length, node.bounds.height, selected);
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
  const window = listWindow(widget, items.length, node.bounds.height, selected);
  return items.slice(window.start, window.end).map((item, index) => {
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
  const items = Array.isArray(widget.props['items']) ? widget.props['items'] : [];
  const selected = numberProp(widget, 'selected');
  if (selected === undefined || items.length === 0 || bounds.height <= 0) {
    return { row: bounds.row, column: bounds.column };
  }
  const window = visibleWindow(items.length, bounds.height, selected);
  const selectedRow = selected >= window.start && selected < window.end
    ? bounds.row + selected - window.start
    : bounds.row;
  return { row: selectedRow, column: bounds.column };
}

function filteredListItems(widget: Widget): readonly unknown[] {
  const items = Array.isArray(widget.props['items']) ? widget.props['items'] : [];
  const query = stringify(widget.props['filterQuery']).trim().toLocaleLowerCase();
  if (query.length === 0) return items;
  return items.filter((item) => String(item).toLocaleLowerCase().includes(query));
}

function listWindow(widget: Widget, count: number, height: number, selected: number) {
  const scroll = widget.props['scroll'];
  if (typeof scroll === 'object' && scroll !== null) {
    return visibleWindowFromScroll(normalizeScrollState({
      ...scroll as Parameters<typeof normalizeScrollState>[0],
      contentRows: count,
      viewportRows: height
    }));
  }
  return visibleWindow(count, height, selected);
}

import { focusPathIncludes } from './focus.ts';
import { numberProp, stringify } from './widget-props.ts';
import { visibleWindow, windowDescription } from './visible-window.ts';
import type { AccessibleNode } from '../accessibility/index.ts';
import type { Widget } from '../widgets/index.ts';
import type { FocusPath } from './focus.ts';
import type { LayoutNode } from './layout.ts';

export function accessibleNode(
  widget: Widget,
  node: LayoutNode,
  parentPath: FocusPath,
  focusPath: FocusPath | undefined
): AccessibleNode {
  const path = [...parentPath, node.id ?? `${node.kind}:${String(node.bounds.row)}:${String(node.bounds.column)}`];
  const base = accessibleBaseNode(widget, node, focusPathIncludes(focusPath, path));
  const children = accessibleChildren(widget, node, path, focusPath);
  return mergeAccessibleNode(base, widget.accessibility, children);
}

function accessibleBaseNode(widget: Widget, node: LayoutNode, focused: boolean): AccessibleNode {
  const id = widget.id ?? `${widget.kind}-${String(node.bounds.row)}-${String(node.bounds.column)}`;
  switch (widget.kind) {
    case 'list':
      return listAccessibleNode(widget, node, id, focused);
    case 'table':
      return tableAccessibleNode(widget, node, id, focused);
    case 'inputField':
      return {
        id,
        role: 'textbox',
        label: id,
        value: stringify(widget.props['value']),
        ...(focused ? { focused } : {})
      };
    case 'progressBar':
      return accessibleProgressNode(widget, id);
    case 'spinner':
      return {
        id,
        role: 'status',
        label: id,
        value: stringify(widget.props['label']) || 'Loading'
      };
    case 'statusBar':
      return { id, role: 'status', label: id, value: stringify(widget.props['text']) };
    case 'text':
      return { id, role: 'text', label: id, value: stringify(widget.props['content']) };
    case 'viewport':
      return { id, role: 'text', label: id, description: viewportAccessibleDescription(widget, node) };
    default:
      return { id, role: 'text', label: id, ...(focused ? { focused } : {}) };
  }
}

function viewportAccessibleDescription(widget: Widget, node: LayoutNode): string {
  const scrollRow = Math.max(0, Math.floor(numberProp(widget, 'scrollRow') ?? 0));
  const scrollColumn = Math.max(0, Math.floor(numberProp(widget, 'scrollColumn') ?? 0));
  const contentRows = Math.max(node.bounds.height + scrollRow, Math.floor(numberProp(widget, 'contentRows') ?? 0));
  const contentColumns = Math.max(node.bounds.width + scrollColumn, Math.floor(numberProp(widget, 'contentColumns') ?? 0));
  const rowEnd = Math.min(contentRows, scrollRow + node.bounds.height);
  const columnEnd = Math.min(contentColumns, scrollColumn + node.bounds.width);
  return `Showing rows ${String(scrollRow + 1)}-${String(rowEnd)} of ${String(contentRows)}, columns ${String(scrollColumn + 1)}-${String(columnEnd)} of ${String(contentColumns)}.`;
}

function accessibleProgressNode(widget: Widget, id: string): AccessibleNode {
  const label = stringify(widget.props['label']) || id;
  if (widget.props['indeterminate'] === true || widget.props['value'] === undefined) {
    return {
      id,
      role: 'progressbar',
      label,
      progress: { indeterminate: true }
    };
  }
  const rawMax = numberProp(widget, 'max') ?? 100;
  const max = rawMax > 0 ? rawMax : 100;
  const rawValue = numberProp(widget, 'value') ?? 0;
  const value = Math.max(0, Math.min(max, rawValue));
  return {
    id,
    role: 'progressbar',
    label,
    progress: {
      value,
      max
    }
  };
}

function listAccessibleNode(widget: Widget, node: LayoutNode, id: string, focused: boolean): AccessibleNode {
  const items = Array.isArray(widget.props['items']) ? widget.props['items'] : [];
  const selected = numberProp(widget, 'selected') ?? -1;
  const window = visibleWindow(items.length, node.bounds.height, selected);
  return {
    id,
    role: 'listbox',
    label: id,
    description: windowDescription('items', window, items.length),
    ...(focused ? { focused } : {})
  };
}

function tableAccessibleNode(widget: Widget, node: LayoutNode, id: string, focused: boolean): AccessibleNode {
  const rows = Array.isArray(widget.props['rows']) ? widget.props['rows'] : [];
  const window = visibleWindow(rows.length, node.bounds.height, 0);
  return {
    id,
    role: 'table',
    label: id,
    description: windowDescription('rows', window, rows.length),
    ...(focused ? { focused } : {})
  };
}

function accessibleChildren(
  widget: Widget,
  node: LayoutNode,
  path: FocusPath,
  focusPath: FocusPath | undefined
): readonly AccessibleNode[] | undefined {
  if (widget.kind === 'list') {
    const items = Array.isArray(widget.props['items']) ? widget.props['items'] : [];
    const selected = numberProp(widget, 'selected') ?? -1;
    const window = visibleWindow(items.length, node.bounds.height, selected);
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
  if (widget.kind === 'table') {
    const rows = Array.isArray(widget.props['rows']) ? widget.props['rows'] : [];
    const window = visibleWindow(rows.length, node.bounds.height, 0);
    return rows.slice(window.start, window.end).map((row, index) => {
      const rowIndex = window.start + index;
      return {
        id: `${widget.id ?? 'table'}:row:${String(rowIndex)}`,
        role: 'row',
        children: tableCells(row, widget.id ?? 'table', rowIndex)
      };
    });
  }
  const children = widget.children ?? [];
  if (children.length === 0) return undefined;
  return children.map((child, index) => accessibleNode(child, node.children[index] ?? node, path, focusPath));
}

function tableCells(row: unknown, tableId: string, rowIndex: number): readonly AccessibleNode[] {
  const cells = Array.isArray(row) ? row : [row];
  return cells.map((cell, cellIndex) => ({
    id: `${tableId}:row:${String(rowIndex)}:cell:${String(cellIndex)}`,
    role: 'cell',
    label: String(cell),
    value: String(cell)
  }));
}

function mergeAccessibleNode(
  base: AccessibleNode,
  override: AccessibleNode | undefined,
  children: readonly AccessibleNode[] | undefined
): AccessibleNode {
  const merged = override === undefined ? base : { ...base, ...override };
  return {
    ...merged,
    ...(children === undefined ? {} : { children }),
    ...(base.focused === true ? { focused: true } : override?.focused === true ? { focused: true } : {})
  };
}

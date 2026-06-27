import { clipTextCells, sanitizeTerminalText } from '../text/index.ts';
import { stringify } from './widget-props.ts';
import type { AccessibleNode } from '../accessibility/index.ts';
import type { TerminalTheme } from '../theme/index.ts';
import type { Widget } from '../widgets/index.ts';
import type { RenderBlock, RenderLine, RenderSpan, TerminalStyle } from './render-primitives.ts';
import type { Rect } from './layout.ts';
import type { HitTarget } from './widget-renderer.ts';

interface VisibleMenuItem {
  readonly id: string;
  readonly label: string;
  readonly message?: unknown;
  readonly disabled?: boolean;
  readonly checked?: boolean;
  readonly description?: string;
  readonly shortcut?: string;
  readonly depth: number;
  readonly expanded?: boolean;
  readonly hasChildren: boolean;
  readonly children?: readonly VisibleMenuItem[];
}

interface MenuRow {
  readonly item: VisibleMenuItem;
  readonly row: number;
}

export function menuBlock(widget: Widget, bounds: Rect, theme: TerminalTheme): RenderBlock {
  const rows = menuRows(widget, bounds, 0);
  if (rows.length === 0 && bounds.height > 0) {
    return { lines: [{ spans: [{ text: emptyText(widget), style: themeStyle('text.muted') }] }] };
  }
  return { lines: rows.map((row) => menuLine(row.item, selectedId(widget), bounds.width, theme)) };
}

export function contextMenuBlock(widget: Widget, bounds: Rect, theme: TerminalTheme): RenderBlock {
  const title = clean(stringify(widget.props['title']));
  const lines: RenderLine[] = [];
  if (title.length > 0) {
    lines.push({ spans: [{ text: clip(title, bounds.width), style: themeStyle('text.strong', { bold: true }) }] });
  }
  lines.push(...menuBlock(widget, {
    ...bounds,
    height: Math.max(0, bounds.height - lines.length)
  }, theme).lines);
  return { lines: lines.slice(0, Math.max(0, bounds.height)) };
}

export function menuBarBlock(widget: Widget, bounds: Rect): RenderBlock {
  const selected = selectedId(widget);
  const spans: RenderSpan[] = [];
  for (const item of topLevelMenuItems(widget)) {
    if (spans.length > 0) spans.push({ text: '  ', style: themeStyle('text.muted') });
    spans.push(styledSpan(
      item.label,
      item.disabled === true
        ? themeStyle('text.muted', { dim: true })
        : item.id === selected
          ? themeStyle('menu.selected', { bold: true })
        : undefined
    ));
  }
  return {
    lines: [{
      spans: clipSpans(spans, bounds.width)
    }]
  };
}

export function dropdownBlock(widget: Widget, bounds: Rect, theme: TerminalTheme): RenderBlock {
  const selected = selectedMenuItem(widget);
  const label = clean(stringify(widget.props['label']));
  const placeholder = clean(stringify(widget.props['placeholder'])) || 'Select…';
  const value = selected?.label ?? placeholder;
  const open = widget.props['open'] === true;
  const prefix = label.length === 0 ? '' : `${label}: `;
  const lines: RenderLine[] = [{
    spans: [styledSpan(
      clip(`${prefix}${value} ${open ? theme.symbols.treeExpanded : theme.symbols.treeCollapsed}`, bounds.width),
      selected === undefined ? themeStyle('input.placeholder', { dim: true }) : undefined
    )]
  }];
  if (open) {
    lines.push(...menuBlock(widget, {
      row: bounds.row + 1,
      column: bounds.column,
      width: bounds.width,
      height: Math.max(0, bounds.height - 1)
    }, theme).lines);
  }
  return { lines: lines.slice(0, Math.max(0, bounds.height)) };
}

export function menuAccessibleBase(widget: Widget, id: string, focused: boolean): AccessibleNode {
  return {
    id,
    role: 'menu',
    label: clean(stringify(widget.props['title'])) || id,
    ...(focused ? { focused } : {})
  };
}

export function dropdownAccessibleBase(widget: Widget, id: string, focused: boolean): AccessibleNode {
  const selected = selectedMenuItem(widget);
  return {
    id,
    role: 'menu',
    label: clean(stringify(widget.props['label'])) || id,
    ...(selected === undefined ? {} : { value: selected.label }),
    expanded: widget.props['open'] === true,
    ...(focused ? { focused } : {})
  };
}

export function menuAccessibleChildren(widget: Widget): readonly AccessibleNode[] {
  const selected = selectedId(widget);
  return visibleMenuItems(widget).map((item) => ({
    id: `${widget.id ?? widget.kind}:${item.id}`,
    role: 'menuitem',
    label: item.label,
    selected: item.id === selected,
    disabled: item.disabled === true,
    checked: item.checked === true,
    ...(item.description === undefined && item.shortcut === undefined
      ? {}
      : { description: [item.description, item.shortcut].filter((value): value is string => value !== undefined).join(' ') }),
    ...(item.hasChildren ? { expanded: item.expanded === true } : {})
  }));
}

export function dropdownAccessibleChildren(widget: Widget): readonly AccessibleNode[] | undefined {
  return widget.props['open'] === true ? menuAccessibleChildren(widget) : undefined;
}

export function menuHitTargets<TMessage>(widget: Widget<TMessage>, bounds: Rect): readonly HitTarget<TMessage>[] {
  return menuRows(widget, bounds, 0).flatMap((row) => hitTargetForRow(widget, bounds, row));
}

export function contextMenuHitTargets<TMessage>(widget: Widget<TMessage>, bounds: Rect): readonly HitTarget<TMessage>[] {
  const titleRows = clean(stringify(widget.props['title'])).length > 0 ? 1 : 0;
  return menuRows(widget, bounds, titleRows).flatMap((row) => hitTargetForRow(widget, bounds, row));
}

export function menuBarHitTargets<TMessage>(widget: Widget<TMessage>, bounds: Rect): readonly HitTarget<TMessage>[] {
  let column = bounds.column;
  const targets: HitTarget<TMessage>[] = [];
  for (const item of topLevelMenuItems(widget)) {
    const width = Math.min(bounds.width, item.label.length);
    if (item.disabled !== true && item.message !== undefined) {
      targets.push({
        id: `${widget.id ?? widget.kind}:${item.id}`,
        bounds: { row: bounds.row, column, width, height: 1 },
        message: item.message as TMessage,
        cursor: 'pointer'
      });
    }
    column += item.label.length + 2;
  }
  return targets;
}

export function dropdownHitTargets<TMessage>(widget: Widget<TMessage>, bounds: Rect): readonly HitTarget<TMessage>[] {
  if (widget.props['open'] !== true) return menuBarHitTargets(widget, bounds).slice(0, 1);
  return menuRows(widget, bounds, 1).flatMap((row) => hitTargetForRow(widget, bounds, row));
}

export function menuCursor(widget: Widget, bounds: Rect, rowOffset = 0): { readonly row: number; readonly column: number } {
  const selected = selectedId(widget);
  const row = selected === undefined ? 0 : menuRows(widget, bounds, rowOffset).find((item) => item.item.id === selected)?.row ?? rowOffset;
  return {
    row: bounds.row + Math.min(Math.max(0, row), Math.max(0, bounds.height - 1)),
    column: bounds.column
  };
}

function hitTargetForRow<TMessage>(
  _widget: Widget<TMessage>,
  bounds: Rect,
  row: MenuRow
): HitTarget<TMessage>[] {
  if (row.item.disabled === true || row.item.message === undefined) return [];
  return [{
    id: `${_widget.id ?? _widget.kind}:${row.item.id}`,
    bounds: {
      row: bounds.row + row.row,
      column: bounds.column,
      width: bounds.width,
      height: 1
    },
    message: row.item.message as TMessage,
    cursor: 'pointer'
  }];
}

function menuRows(widget: Widget, bounds: Rect, rowOffset: number): readonly MenuRow[] {
  return visibleMenuItems(widget)
    .slice(0, Math.max(0, bounds.height - rowOffset))
    .map((item, index) => ({ item, row: rowOffset + index }));
}

function menuLine(item: VisibleMenuItem, selected: string | undefined, width: number, theme: TerminalTheme): RenderLine {
  const pointer = item.id === selected ? theme.symbols.pointer : theme.symbols.unselected;
  const checked = item.checked === true ? theme.symbols.checkboxChecked : '   ';
  const branch = item.hasChildren ? item.expanded === true ? theme.symbols.treeExpanded : theme.symbols.treeCollapsed : theme.symbols.unselected;
  const shortcut = item.shortcut === undefined ? '' : `  ${item.shortcut}`;
  const indent = '  '.repeat(item.depth);
  const text = `${pointer} ${indent}${checked} ${branch} ${item.label}${shortcut}`;
  return {
    spans: [styledSpan(clip(text, width), menuItemStyle(item, selected))]
  };
}

function visibleMenuItems(widget: Widget): readonly VisibleMenuItem[] {
  return flattenVisibleMenuItems(menuItems(widget.props['items'], 0));
}

function topLevelMenuItems(widget: Widget): readonly VisibleMenuItem[] {
  return menuItems(widget.props['items'], 0);
}

function selectedId(widget: Widget): string | undefined {
  const selected = widget.props['selected'];
  return typeof selected === 'string' ? clean(selected) : firstEnabledItem(widget)?.id;
}

function selectedMenuItem(widget: Widget): VisibleMenuItem | undefined {
  const selected = selectedId(widget);
  return selected === undefined ? undefined : visibleMenuItems(widget).find((item) => item.id === selected);
}

function firstEnabledItem(widget: Widget): VisibleMenuItem | undefined {
  return visibleMenuItems(widget).find((item) => item.disabled !== true);
}

function menuItems(value: unknown, depth: number): readonly VisibleMenuItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): readonly VisibleMenuItem[] => sanitizeMenuItem(item, depth));
}

function sanitizeMenuItem(value: unknown, depth: number): readonly VisibleMenuItem[] {
  if (!isRecord(value)) return [];
  const id = value['id'];
  const label = value['label'];
  if (typeof id !== 'string' || typeof label !== 'string') return [];
  const children = menuItems(value['children'], depth + 1);
  const description = value['description'];
  const shortcut = value['shortcut'];
  const expanded = value['expanded'] === true;
  const normalized: VisibleMenuItem = {
    id: clean(id),
    label: clean(label),
    ...(value['message'] === undefined ? {} : { message: value['message'] }),
    ...(value['disabled'] === true ? { disabled: true } : {}),
    ...(value['checked'] === true ? { checked: true } : {}),
    ...(typeof description === 'string' ? { description: clean(description) } : {}),
    ...(typeof shortcut === 'string' ? { shortcut: clean(shortcut) } : {}),
    depth,
    ...(expanded ? { expanded } : {}),
    hasChildren: children.length > 0,
    ...(children.length === 0 ? {} : { children })
  };
  return [normalized];
}

function flattenVisibleMenuItems(items: readonly VisibleMenuItem[]): readonly VisibleMenuItem[] {
  return items.flatMap((item): readonly VisibleMenuItem[] => [
    item,
    ...(item.expanded === true ? flattenVisibleMenuItems(item.children ?? []) : [])
  ]);
}

function emptyText(widget: Widget): string {
  const text = clean(stringify(widget.props['emptyText']));
  return text.length === 0 ? 'No menu items' : text;
}

function clipSpans(spans: readonly RenderSpan[], width: number): readonly RenderSpan[] {
  const clipped: RenderSpan[] = [];
  let used = 0;
  for (const current of spans) {
    const text = clip(current.text, width - used);
    if (text.length === 0) break;
    clipped.push({
      text,
      ...(current.style === undefined ? {} : { style: current.style })
    });
    used += text.length;
    if (used >= width) break;
  }
  return clipped;
}

function styledSpan(text: string, style: TerminalStyle | undefined): RenderSpan {
  return style === undefined ? { text } : { text, style };
}

function menuItemStyle(item: VisibleMenuItem, selected: string | undefined): TerminalStyle | undefined {
  if (item.disabled === true) return themeStyle('text.muted', { dim: true });
  if (item.id === selected) return themeStyle('menu.selected', { bold: true });
  return undefined;
}

function clip(value: string, width: number): string {
  return clipTextCells(value, Math.max(0, width), { ellipsis: '…' }).text;
}

function clean(value: string): string {
  return sanitizeTerminalText(value).text.replace(/\s*\n\s*/gu, ' ');
}

function themeStyle(token: string, extra: Omit<TerminalStyle, 'fg'> = {}): TerminalStyle {
  return {
    fg: { kind: 'theme', token },
    ...extra
  };
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

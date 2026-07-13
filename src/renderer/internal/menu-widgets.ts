import type { RenderNodeOfKind } from '../model/index.ts';
import { sanitizeTerminalText } from '../../text/index.ts';
import { stringify } from './render-node-props.ts';
import type { AccessibleNode } from '../../accessibility/index.ts';
import type { TerminalTheme } from '../../theme/index.ts';
import type { ComponentActionTone } from '../../ui-model/contracts.ts';
import {
  dropdownMenuControlLine,
  menuBarLine,
  menuEmptyLine,
  menuItemLine,
  menuTitleLine
} from './menu-visual.ts';
import type { MenuVisualItem } from './menu-visual.ts';
import type { RenderBlock, RenderLine } from '../../visual/render.ts';
import type { Rect } from '../model/layout.ts';
import type { HitTarget } from '../model/renderer.ts';
import type { DropdownMenuAction, MenuAction } from '../../ui-model/menu.ts';

type MenuNode<TMessage = unknown> = RenderNodeOfKind<TMessage, 'menu'>;
type ContextMenuNode<TMessage = unknown> = RenderNodeOfKind<TMessage, 'contextMenu'>;
type MenuBarNode<TMessage = unknown> = RenderNodeOfKind<TMessage, 'menuBar'>;
type DropdownMenuNode<TMessage = unknown> = RenderNodeOfKind<TMessage, 'dropdownMenu'>;
type MenuCollectionNode<TMessage = unknown> = MenuNode<TMessage> | ContextMenuNode<TMessage> | DropdownMenuNode<TMessage>;
type ActionMenuNode<TMessage = unknown> = MenuNode<TMessage> | ContextMenuNode<TMessage> | MenuBarNode<TMessage>;
type AnyMenuNode<TMessage = unknown> = MenuCollectionNode<TMessage> | MenuBarNode<TMessage>;

interface VisibleMenuItem extends MenuVisualItem {
  readonly id: string;
  readonly label: string;
  readonly disabled?: boolean;
  readonly checked?: boolean;
  readonly tone?: ComponentActionTone;
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

export function menuBlock(widget: MenuCollectionNode, bounds: Rect, theme: TerminalTheme): RenderBlock {
  const rows = menuRows(widget, bounds, 0);
  if (rows.length === 0 && bounds.height > 0) {
    return { lines: [menuEmptyLine(widget, emptyText(widget), bounds.width)] };
  }
  return { lines: rows.map((row) => menuLine(widget, row.item, activeId(widget), bounds.width, theme)) };
}

export function contextMenuBlock(widget: ContextMenuNode, bounds: Rect, theme: TerminalTheme): RenderBlock {
  const lines: RenderLine[] = [...contextMenuTitleBlock(widget, bounds).lines];
  lines.push(...menuBlock(widget, {
    ...bounds,
    height: Math.max(0, bounds.height - lines.length)
  }, theme).lines);
  return { lines: lines.slice(0, Math.max(0, bounds.height)) };
}

export function contextMenuTitleBlock(widget: ContextMenuNode, bounds: Rect): RenderBlock {
  const title = clean(stringify(widget.props.title));
  return title.length > 0 && bounds.height > 0
    ? { lines: [menuTitleLine(widget, title, bounds.width)] }
    : { lines: [] };
}

export function contextMenuTitleRows(widget: ContextMenuNode): number {
  return clean(stringify(widget.props.title)).length > 0 ? 1 : 0;
}

export function menuBarBlock(widget: MenuBarNode, bounds: Rect, theme: TerminalTheme): RenderBlock {
  const selected = selectedId(widget);
  return {
    lines: [menuBarLine(widget, topLevelMenuItems(widget), selected, bounds.width, theme)]
  };
}

export function dropdownMenuBlock(widget: DropdownMenuNode, bounds: Rect, theme: TerminalTheme): RenderBlock {
  const selected = selectedMenuItem(widget);
  const label = clean(stringify(widget.props.label));
  const placeholder = clean(stringify(widget.props.placeholder)) || 'Select…';
  const value = selected?.label ?? placeholder;
  const open = widget.props.presentation.kind === 'open';
  const lines: RenderLine[] = [{
    spans: dropdownMenuControlLine({
      widget,
      label,
      value,
      placeholder: selected === undefined,
      open,
      width: bounds.width,
      theme
    }).spans
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

export function menuAccessibleBase(widget: AnyMenuNode, id: string, focused: boolean): AccessibleNode {
  const title = widget.kind === 'contextMenu' ? clean(stringify(widget.props.title)) : '';
  return {
    id,
    role: 'menu',
    label: title || id,
    ...(focused ? { focused } : {})
  };
}

export function dropdownMenuAccessibleBase(widget: DropdownMenuNode, id: string, focused: boolean): AccessibleNode {
  const selected = selectedMenuItem(widget);
  return {
    id,
    role: 'menu',
    label: clean(stringify(widget.props.label)) || id,
    ...(selected === undefined ? {} : { value: selected.label }),
    expanded: widget.props.presentation.kind === 'open',
    ...(focused ? { focused } : {})
  };
}

export function menuAccessibleChildren(widget: AnyMenuNode): readonly AccessibleNode[] {
  const selected = activeId(widget);
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

export function dropdownMenuAccessibleChildren(widget: DropdownMenuNode): readonly AccessibleNode[] | undefined {
  return widget.props.presentation.kind === 'open' ? menuAccessibleChildren(widget) : undefined;
}

export function menuHitTargets<TMessage>(widget: MenuNode<TMessage> | ContextMenuNode<TMessage>, bounds: Rect): readonly HitTarget<TMessage>[] {
  return menuRows(widget, bounds, 0).flatMap((row) => hitTargetForRow(widget, bounds, row));
}

export function menuBarHitTargets<TMessage>(widget: MenuBarNode<TMessage>, bounds: Rect): readonly HitTarget<TMessage>[] {
  const toMessage = menuActionMessageFactory(widget);
  if (toMessage === undefined) return [];
  let column = bounds.column;
  const targets: HitTarget<TMessage>[] = [];
  const selected = selectedId(widget);
  for (const item of topLevelMenuItems(widget)) {
    const width = Math.min(bounds.width, menuBarItemWidth(item, item.id === selected));
    if (item.disabled !== true) {
      targets.push({
        id: `${widget.id ?? widget.kind}:${item.id}`,
        bounds: { row: bounds.row, column, width, height: 1 },
        message: () => toMessage({ kind: 'activate', id: item.id }),
        cursor: 'pointer'
      });
    }
    column += width + 2;
  }
  return targets;
}

export function dropdownMenuHitTargets<TMessage>(widget: DropdownMenuNode<TMessage>, bounds: Rect): readonly HitTarget<TMessage>[] {
  const toMessage = dropdownMenuActionMessageFactory(widget);
  if (toMessage === undefined) return [];
  if (widget.props.presentation.kind !== 'open') {
    return [{
      id: `${widget.id ?? widget.kind}:control`,
      bounds: { ...bounds, height: Math.min(1, bounds.height) },
      message: () => toMessage({ kind: 'toggle' }),
      cursor: 'pointer'
    }];
  }
  return menuRows(widget, bounds, 1).flatMap((row) => dropdownMenuHitTargetForRow(widget, bounds, row, toMessage));
}

export function menuCursor(widget: MenuCollectionNode, bounds: Rect, rowOffset = 0): { readonly row: number; readonly column: number } {
  const selected = activeId(widget);
  const row = selected === undefined ? 0 : menuRows(widget, bounds, rowOffset).find((item) => item.item.id === selected)?.row ?? rowOffset;
  return {
    row: bounds.row + Math.min(Math.max(0, row), Math.max(0, bounds.height - 1)),
    column: bounds.column
  };
}

function hitTargetForRow<TMessage>(
  widget: MenuNode<TMessage> | ContextMenuNode<TMessage>,
  bounds: Rect,
  row: MenuRow
): HitTarget<TMessage>[] {
  const toMessage = menuActionMessageFactory(widget);
  if (row.item.disabled === true || toMessage === undefined) return [];
  return [{
    id: `${widget.id ?? widget.kind}:${row.item.id}`,
    bounds: {
      row: bounds.row + row.row,
      column: bounds.column,
      width: bounds.width,
      height: 1
    },
    message: () => toMessage({ kind: 'activate', id: row.item.id }),
    cursor: 'pointer'
  }];
}

function dropdownMenuHitTargetForRow<TMessage>(
  widget: DropdownMenuNode<TMessage>,
  bounds: Rect,
  row: MenuRow,
  toMessage: (action: DropdownMenuAction) => TMessage
): HitTarget<TMessage>[] {
  if (row.item.disabled === true) return [];
  return [{
    id: `${widget.id ?? widget.kind}:${row.item.id}`,
    bounds: {
      row: bounds.row + row.row,
      column: bounds.column,
      width: bounds.width,
      height: 1
    },
    message: () => toMessage({ kind: 'activate', id: row.item.id }),
    cursor: 'pointer'
  }];
}

function menuRows(widget: MenuCollectionNode, bounds: Rect, rowOffset: number): readonly MenuRow[] {
  const rows = visibleMenuItems(widget);
  const start = menuScrollOffset(widget, rows.length, Math.max(0, bounds.height - rowOffset));
  return rows
    .slice(start, start + Math.max(0, bounds.height - rowOffset))
    .map((item, index) => ({ item, row: rowOffset + index }));
}

function menuLine(widget: MenuCollectionNode, item: VisibleMenuItem, selected: string | undefined, width: number, theme: TerminalTheme): RenderLine {
  return menuItemLine(widget, item, item.id === selected, width, theme);
}

function visibleMenuItems(widget: AnyMenuNode): readonly VisibleMenuItem[] {
  return flattenVisibleMenuItems(menuItems(widget.props.items, 0));
}

function topLevelMenuItems(widget: AnyMenuNode): readonly VisibleMenuItem[] {
  return menuItems(widget.props.items, 0);
}

function selectedId(widget: AnyMenuNode): string | undefined {
  const selected = widget.kind === 'dropdownMenu' ? widget.props.presentation.selected : widget.props.selected;
  return typeof selected === 'string' ? clean(selected) : firstEnabledItem(widget)?.id;
}

function activeId(widget: AnyMenuNode): string | undefined {
  if (widget.kind === 'dropdownMenu' && widget.props.presentation.kind === 'open' && typeof widget.props.presentation.highlighted === 'string') {
    return clean(widget.props.presentation.highlighted);
  }
  return selectedId(widget);
}

function selectedMenuItem(widget: AnyMenuNode): VisibleMenuItem | undefined {
  const selected = selectedId(widget);
  return selected === undefined ? undefined : visibleMenuItems(widget).find((item) => item.id === selected);
}

function menuActionMessageFactory<TMessage>(widget: ActionMenuNode<TMessage>): ((action: MenuAction) => TMessage) | undefined {
  return widget.props.toActionMessage;
}

function dropdownMenuActionMessageFactory<TMessage>(widget: DropdownMenuNode<TMessage>): ((action: DropdownMenuAction) => TMessage) | undefined {
  return widget.props.toDropdownMenuActionMessage;
}

function firstEnabledItem(widget: AnyMenuNode): VisibleMenuItem | undefined {
  return visibleMenuItems(widget).find((item) => item.disabled !== true);
}

function menuBarItemWidth(item: VisibleMenuItem, selected: boolean): number {
  return item.label.length + (selected || item.disabled === true ? 2 : 0);
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
  const tone = value['tone'];
  const expanded = value['expanded'] === true;
  const normalized: VisibleMenuItem = {
    id: clean(id),
    label: clean(label),
    ...(value['disabled'] === true ? { disabled: true } : {}),
    ...(value['checked'] === true ? { checked: true } : {}),
    ...(tone === 'destructive' ? { tone } : {}),
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

function emptyText(widget: MenuCollectionNode): string {
  const text = clean(stringify(widget.props.emptyText));
  return text.length === 0 ? 'No menu items' : text;
}

function menuScrollOffset(widget: MenuCollectionNode, total: number, height: number): number {
  const scroll = widget.props.scroll;
  if (!isRecord(scroll)) return 0;
  const rawOffset = scroll.offsetRow;
  if (typeof rawOffset !== 'number' || !Number.isFinite(rawOffset)) return 0;
  return Math.max(0, Math.min(Math.floor(rawOffset), Math.max(0, total - Math.max(0, height))));
}

function clean(value: string): string {
  return sanitizeTerminalText(value).text.replace(/\s*\n\s*/gu, ' ');
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

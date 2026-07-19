import type { AccessibleNode } from '../../accessibility/index.ts';
import { sanitizeTerminalText } from '../../text/index.ts';
import type { TerminalTheme } from '../../theme/index.ts';
import type { ComponentActionTone } from '../../ui-model/contracts.ts';
import { isInlineContent } from '../../visual/inline-content.ts';
import type { RenderBlock } from '../../visual/render.ts';
import { terminalTextWidth } from '../../text/index.ts';
import type { RenderNodeOfKind } from '../model/index.ts';
import type { Rect } from '../model/layout.ts';
import type { HitTarget } from '../model/renderer.ts';
import {
  dropdownMenuControlLine,
  menuBarLine,
  menuEmptyLine,
  menuItemLine
} from './menu-visual.ts';
import type { MenuVisualItem } from './menu-visual.ts';
import { renderNodeTargetId } from './pointer-presentation.ts';
import { stringify } from './render-node-props.ts';
import type { TextWidthProfile } from '../../text/index.ts';

type MenuNode<TMessage = unknown> = RenderNodeOfKind<TMessage, 'menu'>;
type ContextMenuNode<TMessage = unknown> = RenderNodeOfKind<TMessage, 'contextMenu'>;
type MenuBarNode<TMessage = unknown> = RenderNodeOfKind<TMessage, 'menuBar'>;
type DropdownMenuNode<TMessage = unknown> = RenderNodeOfKind<TMessage, 'dropdownMenu'>;

export interface VisibleMenuItem extends MenuVisualItem {
  readonly kind: 'action' | 'check' | 'submenu';
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

export function menuBlock(
  widget: MenuNode,
  bounds: Rect,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile,
  focused = false
): RenderBlock {
  const rows = menuRows(widget, bounds);
  if (rows.length === 0 && bounds.height > 0) {
    return { lines: [menuEmptyLine(widget, emptyText(widget), bounds.width, widthProfile)] };
  }
  const active = menuActiveId(widget);
  return { lines: rows.map((row) => menuItemLine(widget, row.item, row.item.id === active, bounds.width, theme, widthProfile, focused)) };
}

export function menuBarBlock(
  widget: MenuBarNode,
  bounds: Rect,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile,
  focused = false
): RenderBlock {
  return {
    lines: [menuBarLine(widget, topLevelMenuItems(widget), menuBarActiveId(widget), bounds.width, theme, widthProfile, focused)]
  };
}

export function dropdownMenuBlock(
  widget: DropdownMenuNode,
  bounds: Rect,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile,
  focused = false
): RenderBlock {
  const active = dropdownActiveItem(widget);
  const placeholder = clean(stringify(widget.props.placeholder)) || 'Choose action…';
  return {
    lines: [dropdownMenuControlLine({
      widget,
      label: clean(stringify(widget.props.label)),
      value: active?.label ?? placeholder,
      placeholder: active === undefined,
      open: widget.props.presentation.kind === 'open',
      focused,
      width: bounds.width,
      theme,
      widthProfile
    })]
  };
}

export function menuAccessibleBase(_widget: MenuNode, id: string, focused: boolean): AccessibleNode {
  return { id, role: 'menu', label: id, ...(focused ? { focused } : {}) };
}

export function menuBarAccessibleBase(_widget: MenuBarNode, id: string, focused: boolean): AccessibleNode {
  return { id, role: 'menubar', label: id, ...(focused ? { focused } : {}) };
}

export function contextMenuAccessibleBase(widget: ContextMenuNode, id: string, focused: boolean): AccessibleNode {
  return {
    id,
    role: 'menu',
    label: clean(stringify(widget.props.title)) || id,
    expanded: widget.props.presentation.kind === 'open',
    ...(focused ? { focused } : {})
  };
}

export function dropdownMenuAccessibleBase(widget: DropdownMenuNode, id: string, focused: boolean): AccessibleNode {
  const active = dropdownActiveItem(widget);
  return {
    id,
    role: 'button',
    label: clean(stringify(widget.props.label)) || id,
    ...(active === undefined ? {} : { value: active.label }),
    expanded: widget.props.presentation.kind === 'open',
    ...(focused ? { focused } : {})
  };
}

export function menuAccessibleChildren(widget: MenuNode): readonly AccessibleNode[] {
  return accessibleMenuItems(
    widget.id ?? widget.kind,
    visibleMenuItems(widget.props.items),
    menuActiveId(widget)
  );
}

export function menuBarAccessibleChildren(widget: MenuBarNode): readonly AccessibleNode[] {
  const active = menuBarActiveId(widget);
  return topLevelMenuItems(widget).map((item) => ({
    id: `${widget.id ?? widget.kind}:${item.id}`,
    role: 'menuitem',
    label: item.label,
    selected: item.id === active,
    disabled: item.disabled === true,
    ...(item.hasChildren ? { expanded: widget.props.presentation.kind === 'open' && item.id === active } : {}),
    ...(widget.props.presentation.kind === 'open' && item.id === active
      ? {
          children: accessibleMenuItems(
            `${widget.id ?? widget.kind}:${item.id}`,
            visibleMenuItems(widget.props.presentation.menu.items),
            widget.props.presentation.menu.activePath.at(-1)
          )
        }
      : {})
  }));
}

export function contextMenuAccessibleChildren(widget: ContextMenuNode): readonly AccessibleNode[] | undefined {
  if (widget.props.presentation.kind === 'closed') return undefined;
  return accessibleMenuItems(
    widget.id ?? widget.kind,
    visibleMenuItems(widget.props.presentation.menu.items),
    widget.props.presentation.menu.activePath.at(-1)
  );
}

export function dropdownMenuAccessibleChildren(widget: DropdownMenuNode): readonly AccessibleNode[] | undefined {
  if (widget.props.presentation.kind === 'closed') return undefined;
  return accessibleMenuItems(
    widget.id ?? widget.kind,
    visibleMenuItems(widget.props.presentation.menu.items),
    widget.props.presentation.menu.activePath.at(-1)
  );
}

export function menuHitTargets<TMessage>(widget: MenuNode<TMessage>, bounds: Rect): readonly HitTarget<TMessage>[] {
  const toMessage = widget.props.toActionMessage;
  if (toMessage === undefined) return [];
  return menuRows(widget, bounds).flatMap((row) => row.item.disabled === true ? [] : [{
    id: menuItemTargetId(widget, row.item.id),
    bounds: { row: bounds.row + row.row, column: bounds.column, width: bounds.width, height: 1 },
    message: () => toMessage({ kind: 'activate', id: row.item.id }),
    cursor: 'pointer'
  }]);
}

export function menuBarItemBounds(
  widget: MenuBarNode,
  bounds: Rect,
  widthProfile: TextWidthProfile
): readonly { readonly item: VisibleMenuItem; readonly bounds: Rect }[] {
  let column = bounds.column;
  const active = menuBarActiveId(widget);
  return topLevelMenuItems(widget).map((item) => {
    const width = Math.min(
      Math.max(0, bounds.column + bounds.width - column),
      menuBarItemWidth(item, item.id === active, widthProfile)
    );
    const itemBounds = { row: bounds.row, column, width, height: Math.min(1, bounds.height) };
    column += width + 2;
    return { item, bounds: itemBounds };
  });
}

export function menuCursor(widget: MenuNode, bounds: Rect): { readonly row: number; readonly column: number } {
  const active = menuActiveId(widget);
  const row = active === undefined ? 0 : menuRows(widget, bounds).find((candidate) => candidate.item.id === active)?.row ?? 0;
  return { row: bounds.row + Math.min(Math.max(0, row), Math.max(0, bounds.height - 1)), column: bounds.column };
}

export function menuPopupContentSize(
  items: unknown,
  maxVisibleItems: number,
  title: string | undefined,
  widthProfile: TextWidthProfile
): { readonly width: number; readonly height: number } {
  const visible = visibleMenuItems(items);
  const contentRows = Math.min(Math.max(1, visible.length), maxVisibleItems);
  const titleWidth = title === undefined ? 0 : terminalTextWidth(clean(title), { widthProfile });
  const itemWidth = visible.reduce((width, item) => Math.max(width, menuItemContentWidth(item, widthProfile)), 0);
  return { width: Math.max(8, titleWidth + 4, itemWidth + 4), height: contentRows + 2 };
}

export function topLevelMenuItems(widget: MenuBarNode): readonly VisibleMenuItem[] {
  return menuItems(widget.props.items, 0);
}

function menuRows(widget: MenuNode, bounds: Rect): readonly MenuRow[] {
  const rows = visibleMenuItems(widget.props.items);
  const start = menuScrollOffset(widget, rows.length, bounds.height);
  return rows
    .slice(start, start + Math.max(0, bounds.height))
    .map((item, index) => ({ item, row: index }));
}

function menuActiveId(widget: MenuNode): string | undefined {
  return widget.props.presentation.activePath.at(-1);
}

function menuBarActiveId(widget: MenuBarNode): string | undefined {
  return widget.props.presentation.active ?? topLevelMenuItems(widget).find((item) => item.disabled !== true)?.id;
}

function dropdownActiveItem(widget: DropdownMenuNode): VisibleMenuItem | undefined {
  const active = widget.props.presentation.active;
  return active === undefined ? undefined : flattenMenuItems(menuItems(widget.props.items, 0)).find((item) => item.id === active);
}

function accessibleMenuItems(
  ownerId: string,
  items: readonly VisibleMenuItem[],
  active: string | undefined
): readonly AccessibleNode[] {
  return items.map((item) => ({
    id: `${ownerId}:${item.id}`,
    role: 'menuitem',
    label: item.label,
    selected: item.id === active,
    disabled: item.disabled === true,
    ...(item.kind === 'check' ? { checked: item.checked === true } : {}),
    ...(item.description === undefined && item.shortcut === undefined
      ? {}
      : { description: [item.description, item.shortcut].filter((value): value is string => value !== undefined).join(' ') }),
    ...(item.hasChildren ? { expanded: item.expanded === true } : {})
  }));
}

function visibleMenuItems(value: unknown): readonly VisibleMenuItem[] {
  return flattenVisibleMenuItems(menuItems(value, 0));
}

function menuItems(value: unknown, depth: number): readonly VisibleMenuItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): readonly VisibleMenuItem[] => sanitizeMenuItem(item, depth));
}

function sanitizeMenuItem(value: unknown, depth: number): readonly VisibleMenuItem[] {
  if (!isRecord(value)) return [];
  const id = value['id'];
  const label = value['label'];
  const kind = value['kind'];
  if (typeof id !== 'string' || typeof label !== 'string'
    || (kind !== 'action' && kind !== 'check' && kind !== 'submenu')) return [];
  const children = kind === 'submenu' ? menuItems(value['children'], depth + 1) : [];
  const description = value['description'];
  const shortcut = value['shortcut'];
  const tone = value['tone'];
  const expanded = value['expanded'] === true;
  return [{
    id: clean(id),
    kind,
    label: clean(label),
    ...(isInlineContent(value['leading']) ? { leading: value['leading'] } : {}),
    ...(isInlineContent(value['trailing']) ? { trailing: value['trailing'] } : {}),
    ...(value['disabled'] === true ? { disabled: true } : {}),
    ...(kind === 'check' ? { checked: value['checked'] === true } : {}),
    ...(tone === 'destructive' ? { tone } : {}),
    ...(typeof description === 'string' ? { description: clean(description) } : {}),
    ...(typeof shortcut === 'string' ? { shortcut: clean(shortcut) } : {}),
    depth,
    ...(expanded ? { expanded: true } : {}),
    hasChildren: kind === 'submenu',
    ...(kind === 'submenu' ? { children } : {})
  }];
}

function flattenVisibleMenuItems(items: readonly VisibleMenuItem[]): readonly VisibleMenuItem[] {
  return items.flatMap((item): readonly VisibleMenuItem[] => [
    item,
    ...(item.expanded === true ? flattenVisibleMenuItems(item.children ?? []) : [])
  ]);
}

function flattenMenuItems(items: readonly VisibleMenuItem[]): readonly VisibleMenuItem[] {
  return items.flatMap((item): readonly VisibleMenuItem[] => [item, ...flattenMenuItems(item.children ?? [])]);
}

function emptyText(widget: MenuNode): string {
  const text = clean(stringify(widget.props.emptyText));
  return text.length === 0 ? 'No menu items' : text;
}

function menuScrollOffset(widget: MenuNode, total: number, height: number): number {
  const rawOffset = widget.props.presentation.scroll?.offsetRow;
  return rawOffset === undefined
    ? 0
    : Math.max(0, Math.min(Math.floor(rawOffset), Math.max(0, total - Math.max(0, height))));
}

function menuBarItemWidth(item: VisibleMenuItem, selected: boolean, widthProfile: TextWidthProfile): number {
  return terminalTextWidth(item.label, { widthProfile }) + (selected || item.disabled === true ? 2 : 0);
}

function menuItemContentWidth(item: VisibleMenuItem, widthProfile: TextWidthProfile): number {
  return 8
    + item.depth * 2
    + terminalTextWidth(item.label, { widthProfile })
    + (item.description === undefined ? 0 : terminalTextWidth(item.description, { widthProfile }) + 2)
    + (item.shortcut === undefined ? 0 : terminalTextWidth(item.shortcut, { widthProfile }) + 2);
}

function clean(value: string): string {
  return sanitizeTerminalText(value).text.replace(/\s*\n\s*/gu, ' ');
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function menuItemTargetId(widget: MenuNode, itemId: string): string {
  return renderNodeTargetId(widget, itemId);
}

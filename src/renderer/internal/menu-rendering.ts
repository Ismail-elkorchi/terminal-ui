import type { AccessibleNode } from '../../accessibility/index.ts';
import { isNonArrayObject } from '../../foundation/validation.ts';
import { sanitizeTerminalText } from '../../text/index.ts';
import type { TerminalTheme } from '../../theme/index.ts';
import type { MenuActionTone } from '../../ui-model/menu.ts';
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
import { renderNodeTargetId } from './pointer-interaction.ts';
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
  readonly tone?: MenuActionTone;
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
  renderNode: MenuNode,
  bounds: Rect,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile,
  focused = false
): RenderBlock {
  const rows = menuRows(renderNode, bounds);
  if (rows.length === 0 && bounds.height > 0) {
    return { lines: [menuEmptyLine(renderNode, emptyText(renderNode), bounds.width, widthProfile)] };
  }
  const active = menuActiveId(renderNode);
  return { lines: rows.map((row) => menuItemLine(renderNode, row.item, row.item.id === active, bounds.width, theme, widthProfile, focused)) };
}

export function menuBarBlock(
  renderNode: MenuBarNode,
  bounds: Rect,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile,
  focused = false
): RenderBlock {
  return {
    lines: [menuBarLine(renderNode, topLevelMenuItems(renderNode), menuBarActiveId(renderNode), bounds.width, theme, widthProfile, focused)]
  };
}

export function dropdownMenuBlock(
  renderNode: DropdownMenuNode,
  bounds: Rect,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile,
  focused = false
): RenderBlock {
  const active = dropdownActiveItem(renderNode);
  const placeholder = clean(stringify(renderNode.props.placeholder)) || 'Choose action…';
  return {
    lines: [dropdownMenuControlLine({
      renderNode,
      label: clean(stringify(renderNode.props.label)),
      value: active?.label ?? placeholder,
      placeholder: active === undefined,
      open: renderNode.props.presentation.kind === 'open',
      focused,
      width: bounds.width,
      theme,
      widthProfile
    })]
  };
}

export function menuAccessibleBase(_renderNode: MenuNode, id: string, focused: boolean): AccessibleNode {
  return { id, role: 'menu', label: id, ...(focused ? { focused } : {}) };
}

export function menuBarAccessibleBase(_renderNode: MenuBarNode, id: string, focused: boolean): AccessibleNode {
  return { id, role: 'menubar', label: id, ...(focused ? { focused } : {}) };
}

export function contextMenuAccessibleBase(renderNode: ContextMenuNode, id: string, focused: boolean): AccessibleNode {
  return {
    id,
    role: 'menu',
    label: clean(stringify(renderNode.props.title)) || id,
    ...(focused ? { focused } : {})
  };
}

export function dropdownMenuAccessibleBase(renderNode: DropdownMenuNode, id: string, focused: boolean): AccessibleNode {
  const active = dropdownActiveItem(renderNode);
  return {
    id,
    role: 'button',
    label: clean(stringify(renderNode.props.label)) || id,
    ...(active === undefined ? {} : { value: active.label }),
    expanded: renderNode.props.presentation.kind === 'open',
    ...(focused ? { focused } : {})
  };
}

export function menuAccessibleChildren(renderNode: MenuNode): readonly AccessibleNode[] {
  return accessibleMenuItems(
    renderNode.id ?? renderNode.kind,
    visibleMenuItems(renderNode.props.items)
  );
}

export function menuBarAccessibleChildren(renderNode: MenuBarNode): readonly AccessibleNode[] {
  const active = menuBarActiveId(renderNode);
  return topLevelMenuItems(renderNode).map((item) => ({
    id: `${renderNode.id ?? renderNode.kind}:${item.id}`,
    role: item.kind === 'check' ? 'menuitemcheckbox' : 'menuitem',
    label: item.label,
    disabled: item.disabled === true,
    ...(item.kind === 'check' ? { checked: item.checked === true } : {}),
    ...(item.hasChildren ? { expanded: renderNode.props.presentation.kind === 'open' && item.id === active } : {}),
    ...(renderNode.props.presentation.kind === 'open' && item.id === active
      ? {
          children: accessibleMenuItems(
            `${renderNode.id ?? renderNode.kind}:${item.id}`,
            visibleMenuItems(renderNode.props.presentation.menu.items)
          )
        }
      : {})
  }));
}

export function contextMenuAccessibleChildren(renderNode: ContextMenuNode): readonly AccessibleNode[] | undefined {
  if (renderNode.props.presentation.kind === 'closed') return undefined;
  return accessibleMenuItems(
    renderNode.id ?? renderNode.kind,
    visibleMenuItems(renderNode.props.presentation.menu.items)
  );
}

export function dropdownMenuAccessibleChildren(renderNode: DropdownMenuNode): readonly AccessibleNode[] | undefined {
  if (renderNode.props.presentation.kind === 'closed') return undefined;
  return accessibleMenuItems(
    renderNode.id ?? renderNode.kind,
    visibleMenuItems(renderNode.props.presentation.menu.items)
  );
}

export function menuHitTargets<TMessage>(renderNode: MenuNode<TMessage>, bounds: Rect): readonly HitTarget<TMessage>[] {
  const toMessage = renderNode.props.toActionMessage;
  if (toMessage === undefined) return [];
  return menuRows(renderNode, bounds).flatMap((row) => row.item.disabled === true ? [] : [{
    id: menuItemTargetId(renderNode, row.item.id),
    bounds: { row: bounds.row + row.row, column: bounds.column, width: bounds.width, height: 1 },
    message: () => toMessage({ kind: 'activate', id: row.item.id }),
    cursor: 'pointer'
  }]);
}

export function menuBarItemBounds(
  renderNode: MenuBarNode,
  bounds: Rect,
  widthProfile: TextWidthProfile
): readonly { readonly item: VisibleMenuItem; readonly bounds: Rect }[] {
  let column = bounds.column;
  const active = menuBarActiveId(renderNode);
  return topLevelMenuItems(renderNode).map((item) => {
    const width = Math.min(
      Math.max(0, bounds.column + bounds.width - column),
      menuBarItemWidth(item, item.id === active, widthProfile)
    );
    const itemBounds = { row: bounds.row, column, width, height: Math.min(1, bounds.height) };
    column += width + 2;
    return { item, bounds: itemBounds };
  });
}

export function menuCursor(renderNode: MenuNode, bounds: Rect): { readonly row: number; readonly column: number } {
  const active = menuActiveId(renderNode);
  const row = active === undefined ? 0 : menuRows(renderNode, bounds).find((candidate) => candidate.item.id === active)?.row ?? 0;
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

export function topLevelMenuItems(renderNode: MenuBarNode): readonly VisibleMenuItem[] {
  return menuItems(renderNode.props.items, 0);
}

function menuRows(renderNode: MenuNode, bounds: Rect): readonly MenuRow[] {
  const rows = visibleMenuItems(renderNode.props.items);
  const start = menuScrollOffset(renderNode, rows.length, bounds.height);
  return rows
    .slice(start, start + Math.max(0, bounds.height))
    .map((item, index) => ({ item, row: index }));
}

function menuActiveId(renderNode: MenuNode): string | undefined {
  return renderNode.props.presentation.activePath.at(-1);
}

function menuBarActiveId(renderNode: MenuBarNode): string | undefined {
  return renderNode.props.presentation.active ?? topLevelMenuItems(renderNode).find((item) => item.disabled !== true)?.id;
}

function dropdownActiveItem(renderNode: DropdownMenuNode): VisibleMenuItem | undefined {
  const active = renderNode.props.presentation.active;
  return active === undefined ? undefined : flattenMenuItems(menuItems(renderNode.props.items, 0)).find((item) => item.id === active);
}

function accessibleMenuItems(
  menuId: string,
  items: readonly VisibleMenuItem[]
): readonly AccessibleNode[] {
  return items.map((item) => ({
    id: `${menuId}:${item.id}`,
    role: item.kind === 'check' ? 'menuitemcheckbox' : 'menuitem',
    label: item.label,
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
  if (!isNonArrayObject(value)) return [];
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

function emptyText(renderNode: MenuNode): string {
  const text = clean(stringify(renderNode.props.emptyText));
  return text.length === 0 ? 'No menu items' : text;
}

function menuScrollOffset(renderNode: MenuNode, total: number, height: number): number {
  const rawOffset = renderNode.props.presentation.scroll?.offsetRow;
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


function menuItemTargetId(renderNode: MenuNode, itemId: string): string {
  return renderNodeTargetId(renderNode, itemId);
}

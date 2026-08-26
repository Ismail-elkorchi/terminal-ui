import type { AnchoredSurfaceAnchor } from '../interaction/anchored-surface.ts';
import type { ScrollState } from '../interaction/scroll.ts';
import type {
  ContextMenuTransition,
  ContextMenuView,
  MenuTriggerTransition,
  MenuTriggerView,
  MenuTransition,
  MenuBarTransition,
  MenuBarView,
  MenuItem,
  MenuView,
  MenuViewItem
} from './menu.ts';
import { assertValidMenuItems, menuItemChildren } from './menu.ts';
import { adjacentItemId } from '../interaction/navigation.ts';
import { applyScrollRequest } from './scroll.ts';

export interface MenuState {
  readonly activePath: readonly string[];
  readonly scroll?: ScrollState;
}

export type MenuBarState =
  | { readonly kind: 'closed'; readonly active?: string }
  | { readonly kind: 'open'; readonly active: string; readonly menu: MenuState };

export type ContextMenuState =
  | { readonly kind: 'closed' }
  | { readonly kind: 'open'; readonly anchor: AnchoredSurfaceAnchor; readonly menu: MenuState };

export type MenuTriggerState =
  | { readonly kind: 'closed'; readonly active?: string }
  | { readonly kind: 'open'; readonly active?: string; readonly menu: MenuState };

export function menuReducer(
  state: MenuState,
  transition: MenuTransition,
  items: readonly MenuItem[]
): MenuState {
  const activePath = normalizedActivePath(items, state.activePath);
  const normalized = withActivePath(state, activePath);
  switch (transition.kind) {
    case 'setActive': {
      const path = enabledPathForId(items, transition.id);
      return path === undefined ? normalized : withActivePath(normalized, path);
    }
    case 'move':
      return moveMenuSelection(normalized, items, transition.delta);
    case 'first':
      return selectMenuEdge(normalized, items, 'first');
    case 'last':
      return selectMenuEdge(normalized, items, 'last');
    case 'enter':
      return enterMenuItem(normalized, items);
    case 'back':
      return activePath.length <= 1 ? normalized : withActivePath(normalized, activePath.slice(0, -1));
    case 'scroll': {
      if (normalized.scroll === undefined) return normalized;
      const scroll = applyScrollRequest(normalized.scroll, transition.request);
      return scroll === normalized.scroll ? normalized : { ...normalized, scroll };
    }
  }
}

export function menuView(items: readonly MenuItem[], state: MenuState): MenuView {
  assertValidMenuItems(items);
  const activePath = normalizedActivePath(items, state.activePath);
  return {
    activePath,
    items: menuViewItems(items, activePath, 0),
    ...(state.scroll === undefined ? {} : { scroll: state.scroll })
  };
}

export function menuBarReducer(
  state: MenuBarState,
  transition: MenuBarTransition,
  items: readonly MenuItem[]
): MenuBarState {
  const headings = enabledItems(items);
  const active = validId(headings, state.active) ?? headings[0]?.id;
  switch (transition.kind) {
    case 'setActiveHeading':
      return enabledItem(items, transition.id) === undefined
        ? state
        : transition.id === state.active
          ? state
        : state.kind === 'open'
          ? openMenuBar(items, transition.id)
          : { kind: 'closed', active: transition.id };
    case 'moveHeading': {
      const next = adjacentItemId(headings.map((item) => item.id), active, transition.delta);
      return next === undefined || next === state.active
        ? state
        : state.kind === 'open' ? openMenuBar(items, next) : { kind: 'closed', active: next };
    }
    case 'firstHeading': {
      const first = headings[0]?.id;
      return first === undefined || first === state.active
        ? state
        : state.kind === 'open' ? openMenuBar(items, first) : { kind: 'closed', active: first };
    }
    case 'lastHeading': {
      const last = headings.at(-1)?.id;
      return last === undefined || last === state.active
        ? state
        : state.kind === 'open' ? openMenuBar(items, last) : { kind: 'closed', active: last };
    }
    case 'open': {
      const heading = validId(headings, transition.id ?? active);
      return heading === undefined ? state : openMenuBar(items, heading);
    }
    case 'close':
      return state.kind === 'closed' && state.active === active
        ? state
        : active === undefined ? { kind: 'closed' } : { kind: 'closed', active };
    case 'activateHeading': {
      const item = enabledItem(items, transition.id);
      if (item === undefined) return state;
      return hasEnabledChildren(item) ? openMenuBar(items, item.id) : { kind: 'closed', active: item.id };
    }
    case 'menu': {
      if (state.kind !== 'open') return state;
      const heading = enabledItem(items, state.active);
      if (heading?.kind !== 'submenu') return state;
      const menu = menuReducer(state.menu, transition.transition, heading.children);
      return menu === state.menu ? state : { ...state, menu };
    }
  }
}

export function menuBarView(items: readonly MenuItem[], state: MenuBarState): MenuBarView {
  if (state.kind === 'closed') {
    const active = validId(enabledItems(items), state.active);
    return active === undefined ? { kind: 'closed' } : { kind: 'closed', active };
  }
  const heading = enabledItem(items, state.active);
  if (heading?.kind !== 'submenu') return { kind: 'closed', active: state.active };
  return { kind: 'open', active: state.active, menu: menuView(heading.children, state.menu) };
}

export function contextMenuReducer(
  state: ContextMenuState,
  transition: ContextMenuTransition,
  items: readonly MenuItem[]
): ContextMenuState {
  switch (transition.kind) {
    case 'open': return { kind: 'open', anchor: transition.anchor, menu: initialMenuState(items) };
    case 'dismiss': return state.kind === 'closed' ? state : { kind: 'closed' };
    case 'menu': {
      if (state.kind !== 'open') return state;
      const menu = menuReducer(state.menu, transition.transition, items);
      return menu === state.menu ? state : { ...state, menu };
    }
  }
}

export function contextMenuView(items: readonly MenuItem[], state: ContextMenuState): ContextMenuView {
  return state.kind === 'closed'
    ? state
    : { kind: 'open', anchor: state.anchor, menu: menuView(items, state.menu) };
}

export function menuTriggerReducer(
  state: MenuTriggerState,
  transition: MenuTriggerTransition,
  items: readonly MenuItem[]
): MenuTriggerState {
  switch (transition.kind) {
    case 'open': return state.kind === 'open' ? state : openMenuTrigger(items, state.active);
    case 'toggle': return state.kind === 'open'
      ? closedMenuTrigger(state.active)
      : openMenuTrigger(items, state.active);
    case 'dismiss': return state.kind === 'closed' ? state : closedMenuTrigger(state.active);
    case 'menu': {
      if (state.kind !== 'open') return state;
      const menu = menuReducer(state.menu, transition.transition, items);
      return menu === state.menu ? state : { ...state, menu };
    }
  }
}

export function menuTriggerView(items: readonly MenuItem[], state: MenuTriggerState): MenuTriggerView {
  const active = validId(enabledItems(items), state.active);
  if (state.kind === 'closed') {
    return active === undefined ? { kind: 'closed' } : { kind: 'closed', active };
  }
  return {
    kind: 'open',
    ...(active === undefined ? {} : { active }),
    menu: menuView(items, state.menu)
  };
}

function initialMenuState(items: readonly MenuItem[]): MenuState {
  const first = enabledItems(items)[0]?.id;
  return { activePath: first === undefined ? [] : [first] };
}

function openMenuBar(items: readonly MenuItem[], id: string): MenuBarState {
  const heading = enabledItem(items, id);
  return heading?.kind !== 'submenu'
    ? { kind: 'closed', active: id }
    : { kind: 'open', active: id, menu: initialMenuState(heading.children) };
}

function openMenuTrigger(items: readonly MenuItem[], active: string | undefined): MenuTriggerState {
  const initial = validId(enabledItems(items), active);
  return {
    kind: 'open',
    ...(initial === undefined ? {} : { active: initial }),
    menu: { activePath: initial === undefined ? initialMenuState(items).activePath : [initial] }
  };
}

function closedMenuTrigger(active: string | undefined): MenuTriggerState {
  return active === undefined ? { kind: 'closed' } : { kind: 'closed', active };
}

function enterMenuItem(state: MenuState, items: readonly MenuItem[]): MenuState {
  const item = itemAtPath(items, state.activePath);
  const firstChild = item === undefined ? undefined : enabledItems(menuItemChildren(item))[0];
  return firstChild === undefined ? state : withActivePath(state, [...state.activePath, firstChild.id]);
}

function moveMenuSelection(state: MenuState, items: readonly MenuItem[], delta: number): MenuState {
  const parentPath = state.activePath.slice(0, -1);
  const siblings = enabledItems(itemsAtPath(items, parentPath));
  const current = state.activePath.at(-1);
  const next = adjacentItemId(siblings.map((item) => item.id), current, delta);
  return next === undefined ? state : withActivePath(state, [...parentPath, next]);
}

function selectMenuEdge(state: MenuState, items: readonly MenuItem[], edge: 'first' | 'last'): MenuState {
  const parentPath = state.activePath.slice(0, -1);
  const siblings = enabledItems(itemsAtPath(items, parentPath));
  const next = edge === 'first' ? siblings[0] : siblings.at(-1);
  return next === undefined ? state : withActivePath(state, [...parentPath, next.id]);
}

function normalizedActivePath(items: readonly MenuItem[], path: readonly string[]): readonly string[] {
  const normalized: string[] = [];
  let siblings = items;
  for (const id of path) {
    const item = enabledItem(siblings, id);
    if (item === undefined) break;
    normalized.push(id);
    siblings = menuItemChildren(item);
  }
  if (normalized.length === path.length) return path;
  if (normalized.length > 0 || path.length === 0) return normalized;
  const first = enabledItems(items)[0];
  return first === undefined ? [] : [first.id];
}

function withActivePath(state: MenuState, activePath: readonly string[]): MenuState {
  return samePath(state.activePath, activePath) ? state : { ...state, activePath };
}

function samePath(left: readonly string[], right: readonly string[]): boolean {
  return left === right || left.length === right.length && left.every((id, index) => id === right[index]);
}

function menuViewItems(
  items: readonly MenuItem[],
  activePath: readonly string[],
  depth: number
): readonly MenuViewItem[] {
  return items.map((item) => {
    const expanded = item.kind === 'submenu'
      && activePath[depth] === item.id
      && activePath.length > depth + 1;
    if (item.kind !== 'submenu') return item;
    return {
      ...item,
      ...(expanded ? { expanded: true } : {}),
      children: menuViewItems(item.children, activePath, depth + 1)
    };
  });
}

function enabledPathForId(items: readonly MenuItem[], id: string, parent: readonly string[] = []): readonly string[] | undefined {
  for (const item of items) {
    if (item.kind === 'separator' || item.kind === 'section' || item.disabled === true) {
      if (item.kind === 'section') {
        const child = enabledPathForId(item.children, id, parent);
        if (child !== undefined) return child;
      }
      continue;
    }
    const path = [...parent, item.id];
    if (item.id === id) return path;
    const child = item.kind === 'submenu'
      ? enabledPathForId(item.children, id, path)
      : undefined;
    if (child !== undefined) return child;
  }
  return undefined;
}

function itemAtPath(items: readonly MenuItem[], path: readonly string[]): MenuItem | undefined {
  let siblings = items;
  let current: MenuItem | undefined;
  for (const id of path) {
    current = navigableItem(siblings, id);
    if (current === undefined) return undefined;
    siblings = menuItemChildren(current);
  }
  return current;
}

function itemsAtPath(items: readonly MenuItem[], path: readonly string[]): readonly MenuItem[] {
  if (path.length === 0) return items;
  const item = itemAtPath(items, path);
  return item === undefined ? [] : menuItemChildren(item);
}

function enabledItems(items: readonly MenuItem[]): readonly MenuItem[] {
  return items.flatMap((item): readonly MenuItem[] =>
    item.kind === 'section'
      ? enabledItems(item.children)
      : item.kind === 'separator' || item.disabled === true ? [] : [item]
  );
}

function enabledItem(items: readonly MenuItem[], id: string): MenuItem | undefined {
  return enabledItems(items).find((item) => item.id === id);
}

function navigableItem(items: readonly MenuItem[], id: string): MenuItem | undefined {
  for (const item of items) {
    if (item.kind === 'section') {
      const nested = navigableItem(item.children, id);
      if (nested !== undefined) return nested;
    } else if (item.id === id) return item;
  }
  return undefined;
}

function validId(items: readonly MenuItem[], id: string | undefined): string | undefined {
  return id === undefined ? undefined : enabledItem(items, id)?.id;
}

function hasEnabledChildren(item: MenuItem): boolean {
  return enabledItems(menuItemChildren(item)).length > 0;
}

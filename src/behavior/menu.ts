import type { AnchoredSurfaceAnchor } from '../interaction/anchored-surface.ts';
import type { ScrollState } from '../interaction/scroll.ts';
import type {
  ContextMenuTransition,
  ContextMenuPresentation,
  MenuTriggerTransition,
  MenuTriggerPresentation,
  MenuTransition,
  MenuBarTransition,
  MenuBarPresentation,
  MenuItem,
  MenuPresentation,
  MenuPresentationItem
} from '../ui-model/menu.ts';
import { assertValidMenuItems, menuItemChildren } from '../ui-model/menu.ts';
import { adjacentItemId } from '../interaction/navigation.ts';
import { applyScrollEvent } from './scroll.ts';

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
  action: MenuTransition,
  items: readonly MenuItem[]
): MenuState {
  const activePath = normalizedActivePath(items, state.activePath);
  switch (action.kind) {
    case 'setActive': {
      const path = enabledPathForId(items, action.id);
      return path === undefined ? state : { ...state, activePath: path };
    }
    case 'move':
      return moveMenuSelection({ ...state, activePath }, items, action.delta);
    case 'first':
      return selectMenuEdge({ ...state, activePath }, items, 'first');
    case 'last':
      return selectMenuEdge({ ...state, activePath }, items, 'last');
    case 'enter':
      return enterMenuItem({ ...state, activePath }, items);
    case 'back':
      return activePath.length <= 1 ? { ...state, activePath } : { ...state, activePath: activePath.slice(0, -1) };
    case 'scroll':
      return state.scroll === undefined
        ? state
        : { ...state, scroll: applyScrollEvent(state.scroll, action.event) };
  }
}

export function menuPresentation(items: readonly MenuItem[], state: MenuState): MenuPresentation {
  assertValidMenuItems(items);
  const activePath = normalizedActivePath(items, state.activePath);
  return {
    activePath,
    items: projectMenuItems(items, activePath, 0),
    ...(state.scroll === undefined ? {} : { scroll: state.scroll })
  };
}

export function menuBarReducer(
  state: MenuBarState,
  action: MenuBarTransition,
  items: readonly MenuItem[]
): MenuBarState {
  const headings = enabledItems(items);
  const active = validId(headings, state.active) ?? headings[0]?.id;
  switch (action.kind) {
    case 'setActiveHeading':
      return enabledItem(items, action.id) === undefined
        ? state
        : state.kind === 'open'
          ? openMenuBar(items, action.id)
          : { kind: 'closed', active: action.id };
    case 'moveHeading': {
      const next = adjacentItemId(headings.map((item) => item.id), active, action.delta);
      return next === undefined ? state : state.kind === 'open' ? openMenuBar(items, next) : { kind: 'closed', active: next };
    }
    case 'firstHeading': {
      const first = headings[0]?.id;
      return first === undefined ? state : state.kind === 'open' ? openMenuBar(items, first) : { kind: 'closed', active: first };
    }
    case 'lastHeading': {
      const last = headings.at(-1)?.id;
      return last === undefined ? state : state.kind === 'open' ? openMenuBar(items, last) : { kind: 'closed', active: last };
    }
    case 'open': {
      const heading = validId(headings, action.id ?? active);
      return heading === undefined ? state : openMenuBar(items, heading);
    }
    case 'close':
      return active === undefined ? { kind: 'closed' } : { kind: 'closed', active };
    case 'activateHeading': {
      const item = enabledItem(items, action.id);
      if (item === undefined) return state;
      return hasEnabledChildren(item) ? openMenuBar(items, item.id) : { kind: 'closed', active: item.id };
    }
    case 'menu': {
      if (state.kind !== 'open') return state;
      const heading = enabledItem(items, state.active);
      if (heading?.kind !== 'submenu') return state;
      return { ...state, menu: menuReducer(state.menu, action.transition, heading.children) };
    }
  }
}

export function menuBarPresentation(items: readonly MenuItem[], state: MenuBarState): MenuBarPresentation {
  if (state.kind === 'closed') {
    const active = validId(enabledItems(items), state.active);
    return active === undefined ? { kind: 'closed' } : { kind: 'closed', active };
  }
  const heading = enabledItem(items, state.active);
  if (heading?.kind !== 'submenu') return { kind: 'closed', active: state.active };
  return { kind: 'open', active: state.active, menu: menuPresentation(heading.children, state.menu) };
}

export function contextMenuReducer(
  state: ContextMenuState,
  action: ContextMenuTransition,
  items: readonly MenuItem[]
): ContextMenuState {
  switch (action.kind) {
    case 'open': return { kind: 'open', anchor: action.anchor, menu: initialMenuState(items) };
    case 'dismiss': return { kind: 'closed' };
    case 'menu': {
      if (state.kind !== 'open') return state;
      return { ...state, menu: menuReducer(state.menu, action.transition, items) };
    }
  }
}

export function contextMenuPresentation(items: readonly MenuItem[], state: ContextMenuState): ContextMenuPresentation {
  return state.kind === 'closed'
    ? state
    : { kind: 'open', anchor: state.anchor, menu: menuPresentation(items, state.menu) };
}

export function menuTriggerReducer(
  state: MenuTriggerState,
  action: MenuTriggerTransition,
  items: readonly MenuItem[]
): MenuTriggerState {
  switch (action.kind) {
    case 'open': return state.kind === 'open' ? state : openMenuTrigger(items, state.active);
    case 'toggle': return state.kind === 'open'
      ? closedMenuTrigger(state.active)
      : openMenuTrigger(items, state.active);
    case 'dismiss': return closedMenuTrigger(state.active);
    case 'menu': {
      if (state.kind !== 'open') return state;
      return { ...state, menu: menuReducer(state.menu, action.transition, items) };
    }
  }
}

export function menuTriggerPresentation(items: readonly MenuItem[], state: MenuTriggerState): MenuTriggerPresentation {
  const active = validId(enabledItems(items), state.active);
  if (state.kind === 'closed') {
    return active === undefined ? { kind: 'closed' } : { kind: 'closed', active };
  }
  return {
    kind: 'open',
    ...(active === undefined ? {} : { active }),
    menu: menuPresentation(items, state.menu)
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
  return firstChild === undefined ? state : { ...state, activePath: [...state.activePath, firstChild.id] };
}

function moveMenuSelection(state: MenuState, items: readonly MenuItem[], delta: number): MenuState {
  const parentPath = state.activePath.slice(0, -1);
  const siblings = enabledItems(itemsAtPath(items, parentPath));
  const current = state.activePath.at(-1);
  const next = adjacentItemId(siblings.map((item) => item.id), current, delta);
  return next === undefined ? state : { ...state, activePath: [...parentPath, next] };
}

function selectMenuEdge(state: MenuState, items: readonly MenuItem[], edge: 'first' | 'last'): MenuState {
  const parentPath = state.activePath.slice(0, -1);
  const siblings = enabledItems(itemsAtPath(items, parentPath));
  const next = edge === 'first' ? siblings[0] : siblings.at(-1);
  return next === undefined ? state : { ...state, activePath: [...parentPath, next.id] };
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
  if (normalized.length > 0 || path.length === 0) return normalized;
  const first = enabledItems(items)[0];
  return first === undefined ? [] : [first.id];
}

function projectMenuItems(
  items: readonly MenuItem[],
  activePath: readonly string[],
  depth: number
): readonly MenuPresentationItem[] {
  return items.map((item) => {
    const expanded = item.kind === 'submenu'
      && activePath[depth] === item.id
      && activePath.length > depth + 1;
    if (item.kind !== 'submenu') return item;
    return {
      ...item,
      ...(expanded ? { expanded: true } : {}),
      children: projectMenuItems(item.children, activePath, depth + 1)
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

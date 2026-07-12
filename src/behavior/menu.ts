import type { DropdownAction, MenuAction } from '../components/menu.ts';
import type { MenuItem } from '../components/options/menus.ts';
import { applyScrollEvent } from './scroll.ts';
import type { ScrollState } from './scroll.ts';

export interface MenuState {
  readonly selected?: string;
  readonly expandedIds: readonly string[];
  readonly scroll?: ScrollState;
}

export interface MenuPresentation {
  readonly items: readonly MenuItem[];
  readonly selected?: string;
  readonly scroll?: ScrollState;
}

export function menuReducer(
  state: MenuState,
  action: MenuAction,
  items: readonly MenuItem[]
): MenuState {
  const visible = visibleMenuItems(items, state.expandedIds).filter((item) => item.disabled !== true);
  switch (action.kind) {
    case 'select':
      return visible.some((item) => item.id === action.id) ? { ...state, selected: action.id } : state;
    case 'move':
      return withAdjacentSelection(state, visible, action.delta);
    case 'first':
      return visible[0] === undefined ? state : { ...state, selected: visible[0].id };
    case 'last': {
      const item = visible.at(-1);
      return item === undefined ? state : { ...state, selected: item.id };
    }
    case 'activate': {
      const item = findMenuItem(items, action.id);
      if (item === undefined || item.disabled === true) return state;
      return item.children === undefined || item.children.length === 0
        ? { ...state, selected: item.id }
        : toggleExpanded(state, item.id);
    }
    case 'expand':
      return setExpanded(state, action.id, true);
    case 'collapse':
      return setExpanded(state, action.id, false);
    case 'scroll':
      return state.scroll === undefined
        ? state
        : { ...state, scroll: applyScrollEvent(state.scroll, action.event) };
  }
}

export function menuPresentation(items: readonly MenuItem[], state: MenuState): MenuPresentation {
  return {
    items: projectExpandedItems(items, state.expandedIds),
    ...(state.selected === undefined ? {} : { selected: state.selected }),
    ...(state.scroll === undefined ? {} : { scroll: state.scroll })
  };
}

export interface DropdownState {
  readonly open: boolean;
  readonly selected?: string;
  readonly highlighted?: string;
}

export interface DropdownPresentation {
  readonly open: boolean;
  readonly selected?: string;
  readonly highlighted?: string;
}

export function dropdownReducer(
  state: DropdownState,
  action: DropdownAction,
  items: readonly MenuItem[]
): DropdownState {
  const enabled = visibleMenuItems(items, []).filter((item) => item.disabled !== true);
  switch (action.kind) {
    case 'open':
      return state.open ? state : withHighlight({ ...state, open: true }, validHighlight(state, enabled));
    case 'close':
      return state.open ? withoutHighlight({ ...state, open: false }) : state;
    case 'toggle':
      return state.open
        ? withoutHighlight({ ...state, open: false })
        : withHighlight({ ...state, open: true }, validHighlight(state, enabled));
    case 'highlight':
      return enabled.some((item) => item.id === action.id) ? { ...state, highlighted: action.id } : state;
    case 'move':
      return withAdjacentHighlight(state, enabled, action.delta);
    case 'first':
      return enabled[0] === undefined ? state : { ...state, highlighted: enabled[0].id };
    case 'last': {
      const item = enabled.at(-1);
      return item === undefined ? state : { ...state, highlighted: item.id };
    }
    case 'activate': {
      const item = enabled.find((candidate) => candidate.id === action.id);
      return item === undefined ? state : { open: false, selected: item.id };
    }
  }
}

export function dropdownPresentation(state: DropdownState): DropdownPresentation {
  return {
    open: state.open,
    ...(state.selected === undefined ? {} : { selected: state.selected }),
    ...(state.highlighted === undefined ? {} : { highlighted: state.highlighted })
  };
}

function visibleMenuItems(items: readonly MenuItem[], expandedIds: readonly string[]): readonly MenuItem[] {
  return items.flatMap((item): readonly MenuItem[] => [
    item,
    ...(item.children !== undefined && (item.expanded === true || expandedIds.includes(item.id))
      ? visibleMenuItems(item.children, expandedIds)
      : [])
  ]);
}

function findMenuItem(items: readonly MenuItem[], id: string): MenuItem | undefined {
  for (const item of items) {
    if (item.id === id) return item;
    const child = item.children === undefined ? undefined : findMenuItem(item.children, id);
    if (child !== undefined) return child;
  }
  return undefined;
}

function projectExpandedItems(items: readonly MenuItem[], expandedIds: readonly string[]): readonly MenuItem[] {
  return items.map((item) => ({
    ...item,
    ...(item.children === undefined ? {} : {
      expanded: expandedIds.includes(item.id),
      children: projectExpandedItems(item.children, expandedIds)
    })
  }));
}

function withAdjacentSelection(state: MenuState, items: readonly MenuItem[], delta: number): MenuState {
  if (items.length === 0) return state;
  const current = Math.max(0, items.findIndex((item) => item.id === state.selected));
  const item = items[wrapIndex(current + delta, items.length)];
  return item === undefined ? state : { ...state, selected: item.id };
}

function withAdjacentHighlight(state: DropdownState, items: readonly MenuItem[], delta: number): DropdownState {
  if (items.length === 0) return state;
  const currentId = state.highlighted ?? state.selected;
  const current = Math.max(0, items.findIndex((item) => item.id === currentId));
  const item = items[wrapIndex(current + delta, items.length)];
  return item === undefined ? state : { ...state, highlighted: item.id };
}

function toggleExpanded(state: MenuState, id: string): MenuState {
  return setExpanded(state, id, !state.expandedIds.includes(id));
}

function setExpanded(state: MenuState, id: string, expanded: boolean): MenuState {
  const expandedIds = expanded
    ? state.expandedIds.includes(id) ? state.expandedIds : [...state.expandedIds, id]
    : state.expandedIds.filter((current) => current !== id);
  return expandedIds === state.expandedIds ? state : { ...state, expandedIds };
}

function validHighlight(state: DropdownState, items: readonly MenuItem[]): string | undefined {
  const candidate = state.highlighted ?? state.selected;
  return items.some((item) => item.id === candidate) ? candidate : items[0]?.id;
}

function withoutHighlight(state: DropdownState): DropdownState {
  return state.selected === undefined ? { open: state.open } : { open: state.open, selected: state.selected };
}

function withHighlight(state: DropdownState, highlighted: string | undefined): DropdownState {
  return highlighted === undefined ? withoutHighlight(state) : { ...state, highlighted };
}

function wrapIndex(index: number, count: number): number {
  return ((index % count) + count) % count;
}

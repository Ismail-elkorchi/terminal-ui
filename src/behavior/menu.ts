import type { DropdownAction, DropdownPresentation, MenuAction } from '../ui-model/menu.ts';
import type { MenuItem } from '../ui-model/options/menus.ts';
import { adjacentItemId } from './navigation.ts';
import { applyScrollEvent } from './scroll.ts';
import type { ScrollState } from '../interaction/scroll.ts';

export type { DropdownPresentation } from '../ui-model/menu.ts';

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

export type DropdownState = DropdownPresentation;

export function dropdownReducer(
  state: DropdownState,
  action: DropdownAction,
  items: readonly MenuItem[]
): DropdownState {
  const enabled = visibleMenuItems(items, []).filter((item) => item.disabled !== true);
  switch (action.kind) {
    case 'open':
      return state.kind === 'open' ? state : openDropdown(state, validHighlight(state, enabled));
    case 'close':
      return state.kind === 'open' ? closeDropdown(state) : state;
    case 'toggle':
      return state.kind === 'open'
        ? closeDropdown(state)
        : openDropdown(state, validHighlight(state, enabled));
    case 'highlight':
      return state.kind === 'open' && enabled.some((item) => item.id === action.id)
        ? { ...state, highlighted: action.id }
        : state;
    case 'move':
      return withAdjacentHighlight(state, enabled, action.delta);
    case 'first':
      return state.kind !== 'open' || enabled[0] === undefined ? state : { ...state, highlighted: enabled[0].id };
    case 'last': {
      const item = enabled.at(-1);
      return state.kind !== 'open' || item === undefined ? state : { ...state, highlighted: item.id };
    }
    case 'activate': {
      const item = enabled.find((candidate) => candidate.id === action.id);
      return item === undefined ? state : { kind: 'closed', selected: item.id };
    }
  }
}

export function dropdownPresentation(state: DropdownState): DropdownPresentation {
  return state;
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
  const selected = adjacentItemId(items.map((item) => item.id), state.selected, delta);
  return selected === undefined ? state : { ...state, selected };
}

function withAdjacentHighlight(state: DropdownState, items: readonly MenuItem[], delta: number): DropdownState {
  if (state.kind !== 'open') return state;
  const currentId = state.highlighted ?? state.selected;
  const highlighted = adjacentItemId(items.map((item) => item.id), currentId, delta);
  return highlighted === undefined ? state : { ...state, highlighted };
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
  const candidate = state.kind === 'open' ? state.highlighted ?? state.selected : state.selected;
  return items.some((item) => item.id === candidate) ? candidate : items[0]?.id;
}

function closeDropdown(state: DropdownState): DropdownState {
  return state.selected === undefined ? { kind: 'closed' } : { kind: 'closed', selected: state.selected };
}

function openDropdown(state: DropdownState, highlighted: string | undefined): DropdownState {
  return {
    kind: 'open',
    ...(state.selected === undefined ? {} : { selected: state.selected }),
    ...(highlighted === undefined ? {} : { highlighted })
  };
}

import type { TabAction } from '../components/tabs.ts';

export interface TabBehaviorItem {
  readonly id: string;
  readonly disabled?: boolean;
}

export interface TabsState {
  readonly selected?: string;
}

export interface TabsPresentation {
  readonly selected?: string;
}

export function tabsReducer(
  state: TabsState,
  action: TabAction,
  tabs: readonly TabBehaviorItem[]
): TabsState {
  const enabled = tabs.filter((tab) => tab.disabled !== true);
  switch (action.kind) {
    case 'select':
      return enabled.some((tab) => tab.id === action.id) ? { selected: action.id } : state;
    case 'close':
      return state;
    case 'move':
      return adjacentTab(state, enabled, action.delta);
    case 'first':
      return enabled[0] === undefined ? state : { selected: enabled[0].id };
    case 'last': {
      const tab = enabled.at(-1);
      return tab === undefined ? state : { selected: tab.id };
    }
  }
}

export function tabsPresentation(state: TabsState): TabsPresentation {
  return state.selected === undefined ? {} : { selected: state.selected };
}

function adjacentTab(state: TabsState, tabs: readonly TabBehaviorItem[], delta: number): TabsState {
  if (tabs.length === 0) return state;
  const current = Math.max(0, tabs.findIndex((tab) => tab.id === state.selected));
  const tab = tabs[wrapIndex(current + delta, tabs.length)];
  return tab === undefined ? state : { selected: tab.id };
}

function wrapIndex(index: number, count: number): number {
  return ((index % count) + count) % count;
}

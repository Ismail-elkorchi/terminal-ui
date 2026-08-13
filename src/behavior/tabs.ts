import { adjacentItemId } from '../interaction/navigation.ts';
import type { NavigationPolicy } from '../interaction/navigation.ts';
import type { TabsActivation, TabsPresentation, TabsTransition } from '../ui-model/tabs.ts';

export interface TabBehaviorItem {
  readonly id: string;
  readonly disabled?: boolean;
}

export interface TabsReducerOptions {
  readonly tabs: readonly TabBehaviorItem[];
  readonly activation: TabsActivation;
  readonly navigation?: NavigationPolicy;
}

export function tabsReducer(
  state: TabsPresentation,
  action: TabsTransition,
  options: TabsReducerOptions,
): TabsPresentation {
  const enabled = options.tabs.filter((tab) => tab.disabled !== true).map((tab) => tab.id);
  const activeId = validId(enabled, state.activeId);
  const selectedId = validId(enabled, state.selectedId);
  switch (action.kind) {
    case 'setActive':
      return enabled.includes(action.id)
        ? withActive(state, action.id, options.activation)
        : normalized(state, activeId, selectedId);
    case 'moveActive':
      return withActive(
        state,
        adjacentItemId(enabled, activeId ?? selectedId, action.delta, options.navigation),
        options.activation,
      );
    case 'firstActive':
      return withActive(state, enabled[0], options.activation);
    case 'lastActive':
      return withActive(state, enabled.at(-1), options.activation);
    case 'select':
      return enabled.includes(action.id) ? { activeId: action.id, selectedId: action.id } : state;
    case 'selectActive': {
      const selected = activeId ?? selectedId;
      return selected === undefined ? state : { activeId: selected, selectedId: selected };
    }
  }
}

function withActive(
  state: TabsPresentation,
  activeId: string | undefined,
  activation: TabsActivation,
): TabsPresentation {
  const selectedId = activation === 'automatic' ? activeId : state.selectedId;
  return normalized(state, activeId, selectedId);
}

function normalized(
  state: TabsPresentation,
  activeId: string | undefined,
  selectedId: string | undefined,
): TabsPresentation {
  if (state.activeId === activeId && state.selectedId === selectedId) return state;
  return {
    ...(activeId === undefined ? {} : { activeId }),
    ...(selectedId === undefined ? {} : { selectedId }),
  };
}

function validId(ids: readonly string[], id: string | undefined): string | undefined {
  return id !== undefined && ids.includes(id) ? id : undefined;
}

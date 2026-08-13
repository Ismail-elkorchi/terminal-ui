import { adjacentItemId } from '../interaction/navigation.ts';
import type { NavigationPolicy } from '../interaction/navigation.ts';
import type { TabsActivation, TabsPresentation, TabsTransition } from '../ui-model/tabs.ts';

export interface TabBehaviorItem<TId extends string = string> {
  readonly id: TId;
  readonly disabled?: boolean;
}

export interface TabsReducerOptions<TId extends string = string> {
  readonly tabs: readonly TabBehaviorItem<TId>[];
  readonly activation: TabsActivation;
  readonly navigation?: NavigationPolicy;
}

export function tabsReducer<TId extends string>(
  state: TabsPresentation<TId>,
  action: TabsTransition<TId>,
  options: TabsReducerOptions<TId>,
): TabsPresentation<TId> {
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

function withActive<TId extends string>(
  state: TabsPresentation<TId>,
  activeId: TId | undefined,
  activation: TabsActivation,
): TabsPresentation<TId> {
  const selectedId = activation === 'automatic' ? activeId : state.selectedId;
  return normalized(state, activeId, selectedId);
}

function normalized<TId extends string>(
  state: TabsPresentation<TId>,
  activeId: TId | undefined,
  selectedId: TId | undefined,
): TabsPresentation<TId> {
  if (state.activeId === activeId && state.selectedId === selectedId) return state;
  return {
    ...(activeId === undefined ? {} : { activeId }),
    ...(selectedId === undefined ? {} : { selectedId }),
  };
}

function validId<TId extends string>(ids: readonly TId[], id: TId | undefined): TId | undefined {
  return id !== undefined && ids.includes(id) ? id : undefined;
}

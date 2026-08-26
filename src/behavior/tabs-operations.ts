import { adjacentItemId } from '../interaction/navigation.ts';
import type { NavigationPolicy } from '../interaction/navigation.ts';
import type { TabsActivation, TabsState, TabsTransition } from './tabs.ts';

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
  state: TabsState<TId>,
  transition: TabsTransition<TId>,
  options: TabsReducerOptions<TId>,
): TabsState<TId> {
  const enabled = options.tabs.filter((tab) => tab.disabled !== true).map((tab) => tab.id);
  const activeId = validId(enabled, state.activeId);
  const selectedId = validId(enabled, state.selectedId);
  switch (transition.kind) {
    case 'setActive':
      return enabled.includes(transition.id)
        ? withActive(state, transition.id, options.activation)
        : normalized(state, activeId, selectedId);
    case 'moveActive':
      return withActive(
        state,
        adjacentItemId(enabled, activeId ?? selectedId, transition.delta, options.navigation),
        options.activation,
      );
    case 'firstActive':
      return withActive(state, enabled[0], options.activation);
    case 'lastActive':
      return withActive(state, enabled.at(-1), options.activation);
    case 'select':
      return enabled.includes(transition.id) ? { activeId: transition.id, selectedId: transition.id } : state;
    case 'selectActive': {
      const selected = activeId ?? selectedId;
      return selected === undefined ? state : { activeId: selected, selectedId: selected };
    }
  }
}

function withActive<TId extends string>(
  state: TabsState<TId>,
  activeId: TId | undefined,
  activation: TabsActivation,
): TabsState<TId> {
  const selectedId = activation === 'automatic' ? activeId : state.selectedId;
  return normalized(state, activeId, selectedId);
}

function normalized<TId extends string>(
  state: TabsState<TId>,
  activeId: TId | undefined,
  selectedId: TId | undefined,
): TabsState<TId> {
  if (state.activeId === activeId && state.selectedId === selectedId) return state;
  return {
    ...(activeId === undefined ? {} : { activeId }),
    ...(selectedId === undefined ? {} : { selectedId }),
  };
}

function validId<TId extends string>(ids: readonly TId[], id: TId | undefined): TId | undefined {
  return id !== undefined && ids.includes(id) ? id : undefined;
}

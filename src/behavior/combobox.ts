import { collectionInteractionReducer, normalizeCollectionInteraction } from '../interaction/collection.ts';
import type { NavigationPolicy } from '../interaction/navigation.ts';
import { applyScrollEvent } from './scroll.ts';
import type { ComboboxPresentation, ComboboxTransition } from '../ui-model/combobox.ts';
import { popupReducer } from '../interaction/popup.ts';

export interface ComboboxReducerOptions {
  readonly enabledIds: readonly string[];
  readonly navigation?: NavigationPolicy;
}

export function comboboxReducer(
  state: ComboboxPresentation,
  transition: ComboboxTransition,
  options: ComboboxReducerOptions,
): ComboboxPresentation {
  const interaction = normalizeCollectionInteraction(
    state.interaction,
    options.enabledIds,
    { mode: 'single', commitment: 'manual' },
  );
  switch (transition.kind) {
    case 'open':
      return {
        ...state,
        ...popupReducer(state, transition),
        interaction: withInitialActive(interaction, options),
      };
    case 'toggle':
      return {
        ...state,
        ...popupReducer(state, transition),
        interaction: state.open ? interaction : withInitialActive(interaction, options),
      };
    case 'dismiss':
      return { ...state, ...popupReducer(state, transition), interaction };
    case 'scroll':
      return state.open && state.scroll !== undefined
        ? { ...state, interaction, scroll: applyScrollEvent(state.scroll, transition.event) }
        : state;
    default: {
      if (!state.open && transition.kind !== 'moveActive') return state;
      const opened = state.open ? state : { ...state, open: true };
      const action = transition.kind === 'moveActive'
        ? transition
        : transition.kind === 'setActive'
        ? transition
        : transition;
      return {
        ...opened,
        interaction: collectionInteractionReducer(interaction, action, {
          enabledIds: options.enabledIds,
          selection: { mode: 'single', commitment: 'manual' },
          ...(options.navigation === undefined ? {} : { navigation: options.navigation }),
        }),
      };
    }
  }
}

function withInitialActive(
  interaction: ComboboxPresentation['interaction'],
  options: ComboboxReducerOptions,
): ComboboxPresentation['interaction'] {
  if (interaction.activeId !== undefined) return interaction;
  const selected = interaction.selection.mode === 'single'
    ? interaction.selection.selectedId
    : undefined;
  const initialId = selected ?? options.enabledIds[0];
  return collectionInteractionReducer(interaction, {
    kind: 'setActive',
    ...(initialId === undefined ? {} : { id: initialId }),
  }, {
    enabledIds: options.enabledIds,
    selection: { mode: 'single', commitment: 'manual' },
    ...(options.navigation === undefined ? {} : { navigation: options.navigation }),
  });
}

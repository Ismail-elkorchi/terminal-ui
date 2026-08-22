import {
  collectionInteractionHas,
  collectionInteractionIds,
  collectionInteractionReducer,
  normalizeCollectionInteraction,
} from '../interaction/collection.ts';
import type { CollectionInteractionIndex } from '../interaction/collection.ts';
import {
  acceptEditablePopupCompletion,
  createEditablePopupInputState,
  editablePopupInputReducer,
} from '../interaction/editable-popup-input.ts';
import type {
  CreateEditablePopupInputStateInput,
  EditablePopupInputReducerOptions,
} from '../interaction/editable-popup-input.ts';
import type { NavigationPolicy } from '../interaction/navigation.ts';
import { applyScrollEvent } from './scroll.ts';
import { scrollReducer } from './scroll.ts';
import type {
  ComboboxCommitEvent,
  ComboboxControlTransition,
  ComboboxPresentation,
  ScrollableComboboxPresentation,
  ComboboxTransition,
  UnscrolledComboboxPresentation,
  AutocompleteComboboxPresentation,
  AutocompleteComboboxState,
  AutocompleteComboboxTransition,
} from '../ui-model/combobox.ts';
import { popupReducer } from '../interaction/popup.ts';

export interface ComboboxReducerOptions {
  readonly index: CollectionInteractionIndex;
  readonly navigation?: NavigationPolicy;
  readonly pageSize?: number;
}

export interface CreateAutocompleteComboboxStateInput
  extends CreateEditablePopupInputStateInput {
  readonly selectedId?: string;
  readonly scroll?: import('../interaction/scroll.ts').ScrollState;
}

export interface AutocompleteComboboxReducerOptions
  extends EditablePopupInputReducerOptions {
  readonly pageSize?: number;
}

export interface AutocompleteComboboxCommitOptions
  extends EditablePopupInputReducerOptions {
  readonly completionForId: (
    id: string,
    input: AutocompleteComboboxState['editor']['input'],
  ) => import('../interaction/editable-popup-input.ts').EditablePopupCompletion;
}

export function createAutocompleteComboboxState(
  input: CreateAutocompleteComboboxStateInput,
  index: CollectionInteractionIndex,
): AutocompleteComboboxState {
  const editor = createEditablePopupInputState(input, index);
  return Object.freeze({
    kind: 'autocomplete' as const,
    editor,
    selection: Object.freeze({
      mode: 'single' as const,
      ...(input.selectedId === undefined ? {} : { selectedId: input.selectedId }),
    }),
    ...(input.scroll === undefined ? {} : { scroll: input.scroll }),
  });
}

export function autocompleteComboboxPresentation(
  state: AutocompleteComboboxState,
): AutocompleteComboboxPresentation {
  return Object.freeze({
    kind: 'autocomplete' as const,
    open: state.editor.open,
    input: state.editor.input,
    ...(state.editor.activeId === undefined ? {} : { activeId: state.editor.activeId }),
    selection: state.selection,
    ...(state.scroll === undefined ? {} : { scroll: state.scroll }),
  });
}

export function autocompleteComboboxReducer(
  state: AutocompleteComboboxState,
  transition: AutocompleteComboboxTransition,
  options: AutocompleteComboboxReducerOptions,
): AutocompleteComboboxState {
  if (transition.kind === 'scroll') {
    if (state.scroll === undefined || !state.editor.open) return state;
    const scroll = applyScrollEvent(state.scroll, transition.event);
    return scroll === state.scroll ? state : { ...state, scroll };
  }
  const editorTransition = transition.kind === 'pageActive'
    ? {
        kind: 'moveActive' as const,
        delta: transition.delta * Math.max(1, options.pageSize ?? 8),
      }
    : transition;
  const editor = editablePopupInputReducer(state.editor, editorTransition, options);
  if (editor === state.editor) return state;
  if (state.scroll === undefined || editor.activeId === undefined) return { ...state, editor };
  const index = options.indexForText(editor.input.text);
  const itemIndex = collectionInteractionIds(index).indexOf(editor.activeId);
  if (itemIndex < 0) return { ...state, editor };
  return {
    ...state,
    editor,
    scroll: scrollReducer(state.scroll, {
      kind: 'itemIntoView',
      itemIndex,
      alignment: 'nearest',
    }, {
      contentRows: collectionInteractionIds(index).length,
      contentColumns: 0,
      viewportRows: Math.max(1, options.pageSize ?? 8),
      viewportColumns: 0,
    }),
  };
}

export function commitAutocompleteCombobox(
  state: AutocompleteComboboxState,
  event: ComboboxCommitEvent,
  options: AutocompleteComboboxCommitOptions,
): AutocompleteComboboxState {
  const index = options.indexForText(state.editor.input.text);
  if (!collectionInteractionHas(index, event.id)) return state;
  const editor = acceptEditablePopupCompletion(
    state.editor,
    options.completionForId(event.id, state.editor.input),
    options,
  );
  const selection = state.selection.selectedId === event.id
    ? state.selection
    : Object.freeze({ mode: 'single' as const, selectedId: event.id });
  return editor === state.editor && selection === state.selection
    ? state
    : { ...state, editor, selection };
}

export function comboboxReducer(
  state: ScrollableComboboxPresentation,
  transition: ComboboxTransition,
  options: ComboboxReducerOptions,
): ScrollableComboboxPresentation;
export function comboboxReducer(
  state: UnscrolledComboboxPresentation,
  transition: ComboboxControlTransition,
  options: ComboboxReducerOptions,
): UnscrolledComboboxPresentation;
export function comboboxReducer(
  state: ComboboxPresentation,
  transition: ComboboxTransition,
  options: ComboboxReducerOptions,
): ComboboxPresentation {
  const interaction = normalizeCollectionInteraction(
    state.interaction,
    options.index,
  );
  switch (transition.kind) {
    case 'open': {
      const popup = popupReducer(state, transition);
      const nextInteraction = withInitialActive(interaction, options);
      return popup === state && nextInteraction === state.interaction
        ? state
        : { ...state, ...popup, interaction: nextInteraction };
    }
    case 'toggle': {
      const nextInteraction = state.open ? interaction : withInitialActive(interaction, options);
      return { ...state, ...popupReducer(state, transition), interaction: nextInteraction };
    }
    case 'dismiss': {
      const popup = popupReducer(state, transition);
      return popup === state && interaction === state.interaction
        ? state
        : { ...state, ...popup, interaction };
    }
    case 'scroll':
      if (!state.open || state.scroll === undefined) return state;
      {
        const scroll = applyScrollEvent(state.scroll, transition.event);
        return interaction === state.interaction && scroll === state.scroll
          ? state
          : { ...state, interaction, scroll };
      }
    default: {
      if (!state.open && transition.kind !== 'moveActive' && transition.kind !== 'pageActive') return state;
      const opened = state.open ? state : { ...state, open: true };
      const action = transition.kind === 'pageActive'
        ? {
            kind: 'moveActive' as const,
            delta: transition.delta * Math.max(1, options.pageSize ?? 8),
          }
        : transition;
      const nextInteraction = collectionInteractionReducer(interaction, action, {
        index: options.index,
        ...(options.navigation === undefined ? {} : { navigation: options.navigation }),
      });
      const nextScroll = opened.scroll === undefined || nextInteraction.activeId === undefined
        ? opened.scroll
        : scrollReducer(opened.scroll, {
            kind: 'itemIntoView',
            itemIndex: collectionInteractionIds(options.index).indexOf(nextInteraction.activeId),
            alignment: 'nearest',
          }, {
            contentRows: collectionInteractionIds(options.index).length,
            contentColumns: 0,
            viewportRows: Math.max(1, options.pageSize ?? 8),
            viewportColumns: 0,
          });
      if (opened === state && nextInteraction === state.interaction && nextScroll === state.scroll) return state;
      return {
        ...opened,
        interaction: nextInteraction,
        ...(nextScroll === undefined ? {} : { scroll: nextScroll }),
      };
    }
  }
}

export function commitCombobox(
  state: ScrollableComboboxPresentation,
  event: ComboboxCommitEvent,
  options: ComboboxReducerOptions,
): ScrollableComboboxPresentation;
export function commitCombobox(
  state: UnscrolledComboboxPresentation,
  event: ComboboxCommitEvent,
  options: ComboboxReducerOptions,
): UnscrolledComboboxPresentation;
export function commitCombobox(
  state: ComboboxPresentation,
  event: ComboboxCommitEvent,
  options: ComboboxReducerOptions,
): ComboboxPresentation {
  const interaction = normalizeCollectionInteraction(
    state.interaction,
    options.index,
  );
  if (!collectionInteractionHas(options.index, event.id)) {
    return interaction === state.interaction ? state : { ...state, interaction };
  }
  const committed = collectionInteractionReducer(
    interaction,
    { kind: 'select', id: event.id },
    {
      index: options.index,
      ...(options.navigation === undefined ? {} : { navigation: options.navigation }),
    },
  );
  return !state.open && committed === state.interaction
    ? state
    : { ...state, open: false, interaction: committed };
}

function withInitialActive(
  interaction: ComboboxPresentation['interaction'],
  options: ComboboxReducerOptions,
): ComboboxPresentation['interaction'] {
  if (interaction.activeId !== undefined) return interaction;
  const selected = interaction.selection.mode === 'single'
    ? interaction.selection.selectedId
    : undefined;
  const initialId = selected ?? collectionInteractionIds(options.index)[0];
  return collectionInteractionReducer(interaction, {
    kind: 'setActive',
    ...(initialId === undefined ? {} : { id: initialId }),
  }, {
    index: options.index,
    ...(options.navigation === undefined ? {} : { navigation: options.navigation }),
  });
}

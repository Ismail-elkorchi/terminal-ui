import type { AnchoredSurfaceDismissReason } from '../interaction/anchored-surface.ts';
import type { CollectionInteractionState } from '../interaction/collection-interaction.ts';
import type {
  EditablePopupInputState,
  EditablePopupInputTransition,
} from '../interaction/editable-popup-input.ts';
import type { PopupState } from '../interaction/popup.ts';
import type { ScrollRequest, ScrollState } from '../interaction/scroll.ts';
import type { SelectionState } from '../interaction/collection-interaction.ts';

export type ComboboxSelection = Extract<SelectionState, { readonly mode: 'single' }>;

interface ComboboxStateBase extends PopupState {
  readonly kind: 'select';
  readonly interaction: CollectionInteractionState;
}

export interface UnscrolledComboboxState extends ComboboxStateBase {
  readonly scroll?: never;
}

export interface ScrollableComboboxState extends ComboboxStateBase {
  readonly scroll: ScrollState;
}

export type ComboboxState =
  | UnscrolledComboboxState
  | ScrollableComboboxState;

export type ComboboxTransition =
  | { readonly kind: 'open' }
  | { readonly kind: 'toggle' }
  | { readonly kind: 'dismiss'; readonly reason: AnchoredSurfaceDismissReason }
  | { readonly kind: 'setActive'; readonly id?: string }
  | { readonly kind: 'moveActive'; readonly delta: number }
  | { readonly kind: 'pageActive'; readonly delta: -1 | 1 }
  | { readonly kind: 'firstActive' }
  | { readonly kind: 'lastActive' }
  | { readonly kind: 'scroll'; readonly request: ScrollRequest };

export type ComboboxControlTransition = Exclude<
  ComboboxTransition,
  { readonly kind: 'scroll' }
>;

export interface ComboboxCommitEvent {
  readonly kind: 'commit';
  readonly id: string;
}

export interface AutocompleteComboboxState {
  readonly editor: EditablePopupInputState;
  readonly selection: ComboboxSelection;
  readonly scroll?: ScrollState;
}

interface AutocompleteComboboxViewBase extends PopupState {
  readonly kind: 'autocomplete';
  readonly input: EditablePopupInputState['input'];
  readonly activeId?: string;
  readonly selection: ComboboxSelection;
}

export interface UnscrolledAutocompleteComboboxView
  extends AutocompleteComboboxViewBase {
  readonly scroll?: never;
}

export interface ScrollableAutocompleteComboboxView
  extends AutocompleteComboboxViewBase {
  readonly scroll: ScrollState;
}

export type AutocompleteComboboxView =
  | UnscrolledAutocompleteComboboxView
  | ScrollableAutocompleteComboboxView;

export type AutocompleteComboboxTransition =
  | EditablePopupInputTransition
  | { readonly kind: 'pageActive'; readonly delta: -1 | 1 }
  | { readonly kind: 'scroll'; readonly request: ScrollRequest };

export type AutocompleteComboboxControlTransition = Exclude<
  AutocompleteComboboxTransition,
  { readonly kind: 'scroll' }
>;

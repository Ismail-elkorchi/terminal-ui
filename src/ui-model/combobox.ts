import type { AnchoredSurfaceDismissReason } from '../interaction/anchored-surface.ts';
import type { CollectionInteractionState } from '../interaction/collection.ts';
import type { PopupState } from '../interaction/popup.ts';
import type { ScrollEvent, ScrollState } from '../interaction/scroll.ts';

interface ComboboxPresentationBase extends PopupState {
  readonly interaction: CollectionInteractionState;
}

export interface UnscrolledComboboxPresentation extends ComboboxPresentationBase {
  readonly scroll?: never;
}

export interface ScrollableComboboxPresentation extends ComboboxPresentationBase {
  readonly scroll: ScrollState;
}

export type ComboboxPresentation =
  | UnscrolledComboboxPresentation
  | ScrollableComboboxPresentation;

export type ComboboxTransition =
  | { readonly kind: 'open' }
  | { readonly kind: 'toggle' }
  | { readonly kind: 'dismiss'; readonly reason: AnchoredSurfaceDismissReason }
  | { readonly kind: 'setActive'; readonly id?: string }
  | { readonly kind: 'moveActive'; readonly delta: number }
  | { readonly kind: 'pageActive'; readonly delta: -1 | 1 }
  | { readonly kind: 'firstActive' }
  | { readonly kind: 'lastActive' }
  | { readonly kind: 'scroll'; readonly event: ScrollEvent };

export type ComboboxControlTransition = Exclude<
  ComboboxTransition,
  { readonly kind: 'scroll' }
>;

export interface ComboboxCommitEvent {
  readonly kind: 'commit';
  readonly id: string;
}

import type { AnchoredSurfaceDismissReason } from '../interaction/anchored-surface.ts';
import type { CollectionInteractionState } from '../interaction/collection.ts';
import type { PopupState } from '../interaction/popup.ts';
import type { ScrollEvent, ScrollState } from '../interaction/scroll.ts';

export interface ComboboxPresentation extends PopupState {
  readonly interaction: CollectionInteractionState;
  readonly scroll?: ScrollState;
}

export type ComboboxTransition =
  | { readonly kind: 'open' }
  | { readonly kind: 'toggle' }
  | { readonly kind: 'dismiss'; readonly reason: AnchoredSurfaceDismissReason }
  | { readonly kind: 'setActive'; readonly id?: string }
  | { readonly kind: 'moveActive'; readonly delta: number }
  | { readonly kind: 'firstActive' }
  | { readonly kind: 'lastActive' }
  | { readonly kind: 'scroll'; readonly event: ScrollEvent };

export interface ComboboxCommitEvent {
  readonly kind: 'commit';
  readonly id: string;
}

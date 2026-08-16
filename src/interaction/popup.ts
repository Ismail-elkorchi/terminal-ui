import type { AnchoredSurfaceDismissReason } from './anchored-surface.ts';
import type { InitialFocusSelector } from './focus.ts';

/** Open state shared only by trigger-controlled popup composites. */
export interface PopupState {
  readonly open: boolean;
}

export type PopupTransition =
  | { readonly kind: 'open' }
  | { readonly kind: 'toggle' }
  | { readonly kind: 'dismiss'; readonly reason: AnchoredSurfaceDismissReason };

export interface PopupDismissalPolicy {
  readonly escape: boolean;
  readonly outsidePress: boolean;
  readonly focusLoss: boolean;
}

export interface PopupFocusPolicy {
  readonly contain: boolean;
  readonly returnFocus: 'restore' | 'none';
  readonly initialFocus?: InitialFocusSelector;
}

export interface PopupFocusScope {
  readonly kind: 'contain';
  readonly restore: boolean;
  readonly initialFocus?: InitialFocusSelector;
}

export interface PopupRelationship {
  readonly triggerId: string;
  readonly popupId: string;
}

export const standardPopupDismissal: PopupDismissalPolicy = Object.freeze({
  escape: true,
  outsidePress: true,
  focusLoss: true
});

export const standardPopupFocus: PopupFocusPolicy = Object.freeze({
  contain: false,
  returnFocus: 'restore'
});

export const containedPopupFocus: PopupFocusPolicy = Object.freeze({
  contain: true,
  returnFocus: 'restore'
});

export function popupReducer(state: PopupState, transition: PopupTransition): PopupState {
  switch (transition.kind) {
    case 'open':
      return state.open ? state : Object.freeze({ open: true });
    case 'toggle':
      return Object.freeze({ open: !state.open });
    case 'dismiss':
      return state.open ? Object.freeze({ open: false }) : state;
  }
}

export function popupAllowsDismissal(
  policy: PopupDismissalPolicy,
  reason: AnchoredSurfaceDismissReason
): boolean {
  if (reason === 'escape') return policy.escape;
  if (reason === 'outsidePress') return policy.outsidePress;
  if (reason === 'focusLoss') return policy.focusLoss;
  return true;
}

export function popupFocusScope(
  open: boolean,
  policy: PopupFocusPolicy
): PopupFocusScope | undefined {
  if (!open || !policy.contain) return undefined;
  return Object.freeze({
    kind: 'contain',
    restore: policy.returnFocus === 'restore',
    ...(policy.initialFocus === undefined ? {} : { initialFocus: policy.initialFocus })
  });
}

export function popupRelationship(ownerId: string): PopupRelationship {
  if (ownerId.length === 0) throw new TypeError('popup relationship ownerId must not be empty.');
  return Object.freeze({
    triggerId: `${ownerId}:trigger`,
    popupId: `${ownerId}:popup`
  });
}

export function popupActiveDescendantId(
  relationship: PopupRelationship,
  itemId: string
): string;
export function popupActiveDescendantId(
  relationship: PopupRelationship,
  itemId: undefined
): undefined;
export function popupActiveDescendantId(
  relationship: PopupRelationship,
  itemId: string | undefined
): string | undefined {
  return itemId === undefined ? undefined : `${relationship.popupId}:item:${itemId}`;
}

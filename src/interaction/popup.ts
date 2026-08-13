import type { AnchoredSurfaceDismissReason } from './anchored-surface.ts';

/** Open-state foundation shared by popup-trigger composites. */
export interface PopupState {
  readonly open: boolean;
}

export type PopupTransition =
  | { readonly kind: 'open' }
  | { readonly kind: 'toggle' }
  | { readonly kind: 'dismiss'; readonly reason: AnchoredSurfaceDismissReason };

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

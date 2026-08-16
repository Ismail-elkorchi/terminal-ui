export type DialogDismissReason = 'escape' | 'outsidePress';

export type DialogDismissal =
  | { readonly dismissOnEscape: true; readonly dismissOnOutsidePress: boolean }
  | { readonly dismissOnEscape: false; readonly dismissOnOutsidePress: true };

export interface DialogAction {
  readonly kind: 'dismiss';
  readonly reason: DialogDismissReason;
}

export interface DialogFocusPolicy {
  readonly initialFocus?: InitialFocusSelector;
  readonly returnFocus: 'restore' | 'none';
}
import type { InitialFocusSelector } from '../interaction/focus.ts';

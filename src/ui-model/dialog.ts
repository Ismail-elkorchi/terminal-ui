export type DialogDismissReason = 'escape' | 'outsidePress';

export type DialogDismissal =
  | { readonly escape: true; readonly outsidePress: boolean }
  | { readonly escape: false; readonly outsidePress: true };

export interface DialogAction {
  readonly kind: 'dismiss';
  readonly reason: DialogDismissReason;
}

export interface DialogFocusPolicy {
  readonly initialFocus?: InitialFocusSelector;
  readonly returnFocus: 'restore' | 'none';
}
import type { InitialFocusSelector } from '../interaction/focus.ts';

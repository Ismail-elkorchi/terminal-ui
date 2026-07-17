export type DialogDismissReason = 'escape' | 'outsidePress';

export interface DialogDismissal<TMessage> {
  readonly escape: boolean;
  readonly outsidePress: boolean;
  readonly onDismiss: (reason: DialogDismissReason) => TMessage;
}

export interface DialogFocusPolicy {
  readonly initialFocus?: InitialFocusSelector;
  readonly returnFocus: 'restore' | 'none';
}
import type { InitialFocusSelector } from '../interaction/focus.ts';

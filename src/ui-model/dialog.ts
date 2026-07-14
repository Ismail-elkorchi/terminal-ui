export type DialogDismissReason = 'escape' | 'outsidePress';

export interface DialogDismissal<TMessage> {
  readonly escape: boolean;
  readonly outsidePress: boolean;
  readonly onDismiss: (reason: DialogDismissReason) => TMessage;
}

export interface DialogFocusPolicy {
  readonly initialTargetId?: string;
  readonly returnFocus: 'restore' | 'none';
}

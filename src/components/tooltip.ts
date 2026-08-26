export type TooltipTone = 'default' | 'info' | 'success' | 'warning' | 'error';

export interface TooltipTransition {
  readonly kind: 'setOpen';
  readonly open: boolean;
  readonly reason: 'pointer' | 'focus' | 'escape' | 'programmatic';
}

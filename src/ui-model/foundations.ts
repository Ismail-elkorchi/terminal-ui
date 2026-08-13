export interface LinkActivateEvent {
  readonly kind: 'activate';
  readonly href: string;
}

export interface ToggleButtonTransition {
  readonly kind: 'setPressed';
  readonly pressed: boolean;
}

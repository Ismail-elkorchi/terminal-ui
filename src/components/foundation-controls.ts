import type { KeyModifiers, MouseButton, MouseModifiers } from '../input/index.ts';

export interface LinkActivateEvent {
  readonly kind: 'activate';
  readonly href: string;
  readonly trigger:
    | { readonly kind: 'keyboard'; readonly modifiers: KeyModifiers }
    | { readonly kind: 'pointer'; readonly button: MouseButton; readonly modifiers: MouseModifiers };
}

export interface ToggleButtonTransition {
  readonly kind: 'setPressed';
  readonly pressed: boolean;
}

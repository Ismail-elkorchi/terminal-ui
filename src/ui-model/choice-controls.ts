export type CheckboxGroupAction =
  | { readonly kind: 'focus'; readonly id: string }
  | { readonly kind: 'move'; readonly delta: number }
  | { readonly kind: 'first' }
  | { readonly kind: 'last' }
  | { readonly kind: 'toggle'; readonly id: string };

export type RadioGroupAction =
  | { readonly kind: 'focus'; readonly id: string }
  | { readonly kind: 'move'; readonly delta: number }
  | { readonly kind: 'first' }
  | { readonly kind: 'last' }
  | { readonly kind: 'select'; readonly id: string };

export type SelectAction =
  | { readonly kind: 'open' }
  | { readonly kind: 'close' }
  | { readonly kind: 'toggle' }
  | { readonly kind: 'highlight'; readonly id: string }
  | { readonly kind: 'move'; readonly delta: number }
  | { readonly kind: 'first' }
  | { readonly kind: 'last' }
  | { readonly kind: 'commit'; readonly id: string }
  | { readonly kind: 'dismiss'; readonly reason: AnchoredSurfaceDismissReason }
  | { readonly kind: 'scroll'; readonly event: ScrollEvent }
  | { readonly kind: 'pointer'; readonly action: PointerInteractionAction };

export type ColorSwatchPickerAction =
  | { readonly kind: 'focus'; readonly id: string }
  | { readonly kind: 'move'; readonly delta: number }
  | { readonly kind: 'first' }
  | { readonly kind: 'last' }
  | { readonly kind: 'select'; readonly id: string };
import type { AnchoredSurfaceDismissReason } from '../interaction/anchored-surface.ts';
import type { PointerInteractionAction } from '../interaction/pointer-interaction.ts';
import type { ScrollEvent, ScrollState } from '../interaction/scroll.ts';

export type SelectPresentation =
  | { readonly kind: 'closed'; readonly selected?: string }
  | {
      readonly kind: 'open';
      readonly selected?: string;
      readonly highlighted?: string;
      readonly scroll?: ScrollState;
    };

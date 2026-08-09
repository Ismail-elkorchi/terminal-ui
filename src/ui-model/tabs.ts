import type { PointerInteractionAction } from '../interaction/index.ts';

export type TabAction =
  | { readonly kind: 'select'; readonly id: string }
  | { readonly kind: 'close'; readonly id: string }
  | { readonly kind: 'move'; readonly delta: number }
  | { readonly kind: 'first' }
  | { readonly kind: 'last' }
  | { readonly kind: 'pointer'; readonly action: PointerInteractionAction };

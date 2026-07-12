import type { ScrollEvent } from '../behavior/scroll.ts';

export type MenuAction =
  | { readonly kind: 'select'; readonly id: string }
  | { readonly kind: 'move'; readonly delta: number }
  | { readonly kind: 'first' }
  | { readonly kind: 'last' }
  | { readonly kind: 'activate'; readonly id: string }
  | { readonly kind: 'expand'; readonly id: string }
  | { readonly kind: 'collapse'; readonly id: string }
  | { readonly kind: 'scroll'; readonly event: ScrollEvent };

export type DropdownAction =
  | { readonly kind: 'open' }
  | { readonly kind: 'close' }
  | { readonly kind: 'toggle' }
  | { readonly kind: 'highlight'; readonly id: string }
  | { readonly kind: 'move'; readonly delta: number }
  | { readonly kind: 'first' }
  | { readonly kind: 'last' }
  | { readonly kind: 'activate'; readonly id: string };

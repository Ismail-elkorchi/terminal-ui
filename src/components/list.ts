import type { ScrollEvent } from '../behavior/scroll.ts';

export type ListAction =
  | { readonly kind: 'select'; readonly index: number }
  | { readonly kind: 'move'; readonly delta: number }
  | { readonly kind: 'page'; readonly delta: -1 | 1 }
  | { readonly kind: 'first' }
  | { readonly kind: 'last' }
  | { readonly kind: 'activate'; readonly index: number }
  | { readonly kind: 'scroll'; readonly event: ScrollEvent };

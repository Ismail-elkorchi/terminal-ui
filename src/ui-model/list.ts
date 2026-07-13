import type { ScrollEvent } from '../interaction/scroll.ts';

export type ListAction =
  | { readonly kind: 'select'; readonly id: string; readonly index: number }
  | { readonly kind: 'move'; readonly delta: number }
  | { readonly kind: 'page'; readonly delta: -1 | 1 }
  | { readonly kind: 'first' }
  | { readonly kind: 'last' }
  | { readonly kind: 'activate'; readonly id: string; readonly index: number }
  | { readonly kind: 'scroll'; readonly event: ScrollEvent };

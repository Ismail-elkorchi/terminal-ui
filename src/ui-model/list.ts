import type { ScrollEvent } from '../interaction/scroll.ts';

export interface ListItemProjection {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly keywords?: readonly string[];
  readonly disabled?: boolean;
}

export type ListItemProjector<TValue> = (value: TValue, index: number) => ListItemProjection;

export type ListAction =
  | { readonly kind: 'select'; readonly id: string; readonly index: number }
  | { readonly kind: 'move'; readonly delta: number }
  | { readonly kind: 'page'; readonly delta: -1 | 1 }
  | { readonly kind: 'first' }
  | { readonly kind: 'last' }
  | { readonly kind: 'activate'; readonly id: string; readonly index: number }
  | { readonly kind: 'scroll'; readonly event: ScrollEvent };

export type ListControlAction = Exclude<ListAction, { readonly kind: 'scroll' }>;

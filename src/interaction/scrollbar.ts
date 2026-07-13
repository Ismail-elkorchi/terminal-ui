import type { RoutedPointerEvent } from '../input/pointer.ts';

export type ScrollbarVisualState = 'idle' | 'active' | 'hover' | 'disabled' | 'inactive';

export interface ScrollbarOptions {
  readonly visible?: 'auto' | 'always' | 'never';
  readonly axis?: 'vertical' | 'horizontal' | 'both';
  readonly visualState?: ScrollbarVisualState;
}

export interface ScrollbarState {
  readonly offsetRow: number;
  readonly offsetColumn: number;
  readonly contentRows: number;
  readonly contentColumns: number;
}

export interface ScrollbarInteractionState {
  readonly hoveredTargetId?: string;
  readonly activeTargetId?: string;
}

export type ScrollbarInteractionAction =
  | { readonly kind: 'pointer'; readonly event: RoutedPointerEvent }
  | { readonly kind: 'reset' };

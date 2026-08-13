import type { CollectionInteractionAction, CollectionInteractionState } from '../interaction/collection.ts';

export type VisualizationPresentation = CollectionInteractionState;

export type BarChartTransition = CollectionInteractionAction;

export type ChartTransition =
  | CollectionInteractionAction
  | { readonly kind: 'movePoint'; readonly delta: number }
  | { readonly kind: 'pagePoints'; readonly delta: number }
  | { readonly kind: 'moveSeries'; readonly delta: number };

export type HeatmapTransition =
  | CollectionInteractionAction
  | { readonly kind: 'moveCell'; readonly rows: number; readonly columns: number }
  | { readonly kind: 'pageRows'; readonly delta: number };

export interface VisualizationActivateEvent {
  readonly kind: 'activate';
  readonly id: string;
}

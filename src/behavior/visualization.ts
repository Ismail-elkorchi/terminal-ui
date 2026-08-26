import type { CollectionInteractionTransition, CollectionInteractionState } from '../interaction/collection-interaction.ts';

export type VisualizationState = CollectionInteractionState;

export type BarChartTransition = CollectionInteractionTransition;

export type ChartTransition =
  | CollectionInteractionTransition
  | { readonly kind: 'movePoint'; readonly delta: number }
  | { readonly kind: 'pagePoints'; readonly delta: number }
  | { readonly kind: 'moveSeries'; readonly delta: number };

export type HeatmapTransition =
  | CollectionInteractionTransition
  | { readonly kind: 'moveCell'; readonly rows: number; readonly columns: number }
  | { readonly kind: 'pageRows'; readonly delta: number };

export interface VisualizationActivateEvent {
  readonly kind: 'activate';
  readonly id: string;
}

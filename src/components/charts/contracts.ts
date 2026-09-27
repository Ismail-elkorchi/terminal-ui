import type {
  ChartDataStatus,
  ChartInterpolation,
  ChartSampleAlign,
  ChartSampleMode,
  ChartSeriesKind,
  ValueScaleStop,
} from '../../behavior/visualization-data.ts';
import type {
  BarChartTransition,
  ChartTransition,
  HeatmapTransition,
  VisualizationActivateEvent,
} from '../../behavior/visualization.ts';
import type { ComponentMessage } from '../../component/message.ts';
import { type SelectionState } from '../../interaction/collection-interaction.ts';
import type { BarChartOptions, ChartOptions, HeatmapOptions } from './options.ts';


export interface ChartStatus {
  readonly dataStatus?: ChartDataStatus;
  readonly empty: boolean;
  readonly emptyText: string;
  readonly loadingText: string;
  readonly errorText: string;
}

export interface ChartStatusOptions {
  readonly dataStatus?: ChartDataStatus;
  readonly emptyText?: string;
  readonly loadingText?: string;
  readonly errorText?: string;
}

export interface BarModelItem {
  readonly id: string;
  readonly itemIndex: number;
  readonly label: string;
  readonly value: number;
}

export interface BarChartModel extends ChartStatus {
  readonly label: string;
  readonly items: readonly BarModelItem[];
  readonly maximum: number;
  readonly activeId?: string;
  readonly selection: SelectionState;
}

export type BarChartComponentOptions = Omit<
  BarChartOptions<ComponentMessage>,
  'id' | 'disabled' | 'busy' | 'inert' |
  'onTransition' | 'onActivate' | 'styles' | 'meta'
>;

export type BarChartComponentAction =
  | { readonly kind: 'transition'; readonly transition: BarChartTransition }
  | { readonly kind: 'activate'; readonly event: VisualizationActivateEvent };

export interface ChartPointModel {
  readonly id: string;
  readonly pointIndex: number;
  readonly label: string;
  readonly value: number;
}

export interface ChartSeriesModel {
  readonly id: string;
  readonly seriesIndex: number;
  readonly label: string;
  readonly points: readonly ChartPointModel[];
  readonly kind: ChartSeriesKind;
  readonly glyph?: string;
  readonly valueScale: readonly ValueScaleStop[];
  readonly sampleMode?: ChartSampleMode;
  readonly sampleAlign?: ChartSampleAlign;
  readonly interpolation?: ChartInterpolation;
}

export interface ChartModel extends ChartStatus {
  readonly label: string;
  readonly series: readonly ChartSeriesModel[];
  readonly minimum: number;
  readonly maximum: number;
  readonly activeId?: string;
  readonly selection: SelectionState;
  readonly showLegend: boolean;
  readonly signedDomain: boolean;
  readonly xLabel?: string;
  readonly yLabel?: string;
  readonly valueScale: readonly ValueScaleStop[];
  readonly sampleMode: ChartSampleMode;
  readonly sampleAlign: ChartSampleAlign;
  readonly interpolation: ChartInterpolation;
}

export type ChartComponentOptions = Omit<
  ChartOptions<ComponentMessage>,
  'id' | 'disabled' | 'busy' | 'inert' |
  'onTransition' | 'onActivate' | 'styles' | 'meta'
>;

export type ChartComponentAction =
  | { readonly kind: 'transition'; readonly transition: ChartTransition }
  | { readonly kind: 'activate'; readonly event: VisualizationActivateEvent };

export interface ChartLayout {
  readonly plotRow: number;
  readonly plotWidth: number;
  readonly plotHeight: number;
  readonly footerRow?: number;
}

export interface ProjectedPoint {
  readonly point: number;
  readonly pointId: string;
  readonly sourcePosition: number;
  readonly column: number;
  readonly value: number;
}

export interface HeatmapCellModel {
  readonly id: string;
  readonly itemIndex: number;
  readonly row: number;
  readonly column: number;
  readonly label: string;
  readonly value: number;
  readonly disabled: boolean;
}

export interface HeatmapModel extends ChartStatus {
  readonly label: string;
  readonly rows: readonly (readonly HeatmapCellModel[])[];
  readonly minimum: number;
  readonly maximum: number;
  readonly activeId?: string;
  readonly selection: SelectionState;
  readonly cellWidth: number;
  readonly gap: number;
  readonly valueScale: readonly ValueScaleStop[];
}

export type HeatmapComponentOptions = Omit<
  HeatmapOptions<unknown, ComponentMessage>,
  'id' | 'disabled' | 'busy' | 'inert' |
  'onTransition' | 'onActivate' | 'styles' | 'meta'
>;

export type HeatmapComponentAction =
  | { readonly kind: 'transition'; readonly transition: HeatmapTransition }
  | { readonly kind: 'activate'; readonly event: VisualizationActivateEvent };

export type WithoutVisualizationBehavior<TOptions> = TOptions extends unknown
  ? Omit<TOptions, 'onTransition' | 'onActivate'>
  : never;

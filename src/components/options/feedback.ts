import type { ThemeColorToken } from '../../theme/index.ts';
import type {
  HelpBinding,
  ProcessStatus,
  TitledItem,
  ComponentTone
} from '../contracts.ts';
import type { ComponentKeyBindings, ComponentOptions } from './base.ts';

export interface NotificationItem extends TitledItem {
  readonly message?: string;
  readonly tone?: NotificationTone;
  readonly progress?: number;
  readonly createdAt?: number;
  readonly expiresAt?: number;
  readonly paused?: boolean;
}

export type NotificationTone = Extract<ComponentTone, 'info' | 'success' | 'warning' | 'error' | 'progress'>;
export type NotificationPlacement = 'top-right' | 'bottom-right' | 'centered-stack';

export interface NotificationStackOptions<TMessage = never> extends ComponentOptions {
  readonly items: readonly NotificationItem[];
  readonly selected?: number;
  readonly placement?: NotificationPlacement;
  readonly maxVisible?: number;
  readonly maxWidth?: number;
  readonly onDismiss?: (item: NotificationItem) => TMessage;
  readonly keys?: ComponentKeyBindings<TMessage>;
}

export interface StatusBarOptions<TMessage> extends ComponentOptions {
  readonly text: string;
  readonly onPress?: TMessage;
  readonly keys?: ComponentKeyBindings<TMessage>;
}

export interface HelpBarOptions<TMessage = never> extends ComponentOptions {
  readonly bindings: readonly HelpBinding[];
  readonly keys?: ComponentKeyBindings<TMessage>;
}

export interface ActivityIndicatorOptions extends ComponentOptions {
  readonly label?: string;
  readonly status?: ProcessStatus;
}

export type ProgressBarDisplay = 'bar' | 'bar+percent' | 'bar+value' | 'bar+value+percent';
export type ProgressBarLabelPosition = 'start' | 'end' | 'none';

export interface ValueScaleStop {
  readonly at: number;
  readonly token: ThemeColorToken;
  readonly label?: string;
}

export type ValueScale = readonly ValueScaleStop[];

export interface ProgressBarOptions extends ComponentOptions {
  readonly label?: string;
  readonly value?: number;
  readonly max?: number;
  readonly indeterminate?: boolean;
  readonly barWidth?: number;
  readonly display?: ProgressBarDisplay;
  readonly labelPosition?: ProgressBarLabelPosition;
  readonly elapsedMs?: number;
  readonly remainingMs?: number;
  readonly frame?: number;
  readonly status?: ProcessStatus;
  readonly valueScale?: ValueScale;
}

export interface SparklineOptions extends ComponentOptions {
  readonly values: readonly number[];
  readonly min?: number;
  readonly max?: number;
  readonly status?: ProcessStatus;
  readonly valueScale?: ValueScale;
  readonly emptyText?: string;
  readonly loadingText?: string;
  readonly errorText?: string;
}

export interface BarChartItem {
  readonly label: string;
  readonly value: number;
}

export interface BarChartOptions<TMessage = never> extends ComponentOptions {
  readonly items: readonly BarChartItem[];
  readonly max?: number;
  readonly selected?: number;
  readonly status?: ProcessStatus;
  readonly emptyText?: string;
  readonly loadingText?: string;
  readonly errorText?: string;
  readonly keys?: ComponentKeyBindings<TMessage>;
}

export interface ChartSeries {
  readonly id: string;
  readonly label?: string;
  readonly points: readonly number[];
  readonly kind?: ChartSeriesKind;
  readonly glyph?: string;
  readonly valueScale?: ValueScale;
  readonly sampleMode?: ChartSampleMode;
  readonly sampleAlign?: ChartSampleAlign;
  readonly interpolation?: ChartInterpolation;
}

export type ChartSeriesKind = 'line' | 'scatter' | 'area' | 'bar';
export type ChartSampleMode = 'one-per-column' | 'fit' | 'window';
export type ChartSampleAlign = 'start' | 'end';
export type ChartInterpolation = 'nearest' | 'linear';

export interface ChartPointSelection {
  readonly series: string;
  readonly point: number;
}

export interface ChartPointEvent {
  readonly series: string;
  readonly seriesLabel?: string;
  readonly point: number;
  readonly value: number;
}

export interface ChartOptions<TMessage = never> extends ComponentOptions {
  readonly series: readonly ChartSeries[];
  readonly min?: number;
  readonly max?: number;
  readonly selected?: ChartPointSelection;
  readonly legend?: boolean;
  readonly signedDomain?: boolean;
  readonly xLabel?: string;
  readonly yLabel?: string;
  readonly status?: ProcessStatus;
  readonly valueScale?: ValueScale;
  readonly sampleMode?: ChartSampleMode;
  readonly sampleAlign?: ChartSampleAlign;
  readonly interpolation?: ChartInterpolation;
  readonly emptyText?: string;
  readonly loadingText?: string;
  readonly errorText?: string;
  readonly onSelect?: (point: ChartPointEvent) => TMessage;
  readonly keys?: ComponentKeyBindings<TMessage>;
}

export type GaugeVariant = 'linear' | 'dial';

export interface GaugeOptions extends ComponentOptions {
  readonly label?: string;
  readonly value: number;
  readonly min?: number;
  readonly max?: number;
  readonly width?: number;
  readonly variant?: GaugeVariant;
  readonly status?: ProcessStatus;
}

export interface HeatmapCell<TValue = unknown> {
  readonly id: string;
  readonly label?: string;
  readonly value: number;
  readonly payload?: TValue;
  readonly disabled?: boolean;
}

export interface HeatmapSelection {
  readonly row: number;
  readonly column: number;
}

export interface HeatmapOptions<TValue = unknown, TMessage = never> extends ComponentOptions {
  readonly rows: readonly (readonly HeatmapCell<TValue>[])[];
  readonly min?: number;
  readonly max?: number;
  readonly selected?: HeatmapSelection;
  readonly cellWidth?: number;
  readonly gap?: number;
  readonly status?: ProcessStatus;
  readonly valueScale?: ValueScale;
  readonly emptyText?: string;
  readonly loadingText?: string;
  readonly errorText?: string;
  readonly onSelect?: (cell: HeatmapCell<TValue>, row: number, column: number) => TMessage;
  readonly keys?: ComponentKeyBindings<TMessage>;
}

export interface SpinnerOptions extends ComponentOptions {
  readonly frames?: readonly string[];
  readonly frameIndex?: number;
  readonly label?: string;
  readonly status?: ProcessStatus;
}

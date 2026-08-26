import type { ThemeColorToken } from '../visual/color.ts';

export interface ValueScaleStop {
  readonly at: number;
  readonly token: ThemeColorToken;
  readonly label?: string;
}

export type ValueScale = readonly ValueScaleStop[];

export interface BarChartItem {
  readonly id: string;
  readonly label: string;
  readonly value: number;
}

export interface ChartSeries {
  readonly id: string;
  readonly label: string;
  readonly points: readonly ChartPoint[];
  readonly kind?: ChartSeriesKind;
  readonly glyph?: string;
  readonly valueScale?: ValueScale;
  readonly sampleMode?: ChartSampleMode;
  readonly sampleAlign?: ChartSampleAlign;
  readonly interpolation?: ChartInterpolation;
}

export interface ChartPoint {
  readonly id: string;
  readonly label: string;
  readonly value: number;
}

export type ChartSeriesKind = 'line' | 'scatter' | 'area' | 'bar';
export type ChartSampleMode = 'one-per-column' | 'fit' | 'window';
export type ChartSampleAlign = 'start' | 'end';
export type ChartInterpolation = 'nearest' | 'linear';
export type ChartDataStatus = 'loading' | 'error';

export type MeterVariant = 'linear' | 'dial';
export type MeterStatus = 'success' | 'warning' | 'error';

export interface HeatmapCell<TValue = unknown> {
  readonly id: string;
  readonly label: string;
  readonly value: number;
  readonly payload?: TValue;
  readonly disabled?: boolean;
}

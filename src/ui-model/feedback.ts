import type { ThemeColorToken } from '../visual/color.ts';
import type { StatusBarStatus, TitledItem } from './contracts.ts';
import type { InlineContent } from '../visual/inline-content.ts';

export type StatusBarSection = 'leading' | 'center' | 'trailing';

interface StatusBarItemContent {
  readonly id: string;
  readonly leading?: InlineContent;
  readonly trailing?: InlineContent;
}

export type StatusBarItem = StatusBarItemContent & (
  | {
      readonly kind: 'text';
      readonly text: string;
    }
  | {
      readonly kind: 'status';
      readonly text: string;
      readonly status: StatusBarStatus;
    }
);

export interface NotificationItem extends TitledItem {
  readonly message?: string;
  readonly tone?: NotificationTone;
  readonly progress?: number;
  readonly detail?: string;
  readonly dismissible?: boolean;
}

export type NotificationTone = 'info' | 'success' | 'warning' | 'error' | 'progress';
export type NotificationPlacement = 'top-right' | 'bottom-right' | 'centered-stack';
export type ProgressBarDisplay = 'bar' | 'bar+percent' | 'bar+value' | 'bar+value+percent';
export type ProgressBarLabelPosition = 'start' | 'end' | 'none';
export type ProgressBarMode =
  | { readonly kind: 'determinate'; readonly value: number; readonly max?: number }
  | { readonly kind: 'indeterminate'; readonly frame?: number };

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
  readonly pointIndex: number;
}

export type MeterVariant = 'linear' | 'dial';

export interface HeatmapCell<TValue = unknown> {
  readonly id: string;
  readonly label?: string;
  readonly value: number;
  readonly payload?: TValue;
  readonly disabled?: boolean;
}

export interface HeatmapSelection {
  readonly rowIndex: number;
  readonly columnIndex: number;
}

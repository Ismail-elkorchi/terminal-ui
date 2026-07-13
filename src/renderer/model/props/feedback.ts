import type { HelpBinding, ProcessStatus } from '../../../ui-model/contracts.ts';
import type {
  BarChartItem,
  ChartInterpolation,
  ChartPointSelection,
  ChartSampleAlign,
  ChartSampleMode,
  ChartSeries,
  GaugeVariant,
  HeatmapCell,
  HeatmapSelection,
  NotificationItem,
  NotificationPlacement,
  ProgressBarDisplay,
  ProgressBarLabelPosition,
  ValueScale
} from '../../../ui-model/feedback.ts';
import type { NotificationStackAction } from '../../../ui-model/notification-stack.ts';
import type { ChartAction, HeatmapAction } from '../../../ui-model/visualization.ts';

export interface NotificationStackRenderProps<TMessage> {
  readonly items: readonly NotificationItem[];
  readonly selected?: string;
  readonly placement?: NotificationPlacement;
  readonly maxWidth?: number;
  readonly toActionMessage?: (action: NotificationStackAction) => TMessage;
}

export interface StatusBarRenderProps {
  readonly text: string;
}

export interface HelpBarRenderProps {
  readonly bindings: readonly HelpBinding[];
}

export interface ActivityIndicatorRenderProps {
  readonly label?: string;
  readonly status?: ProcessStatus;
}

export interface ProgressBarRenderProps {
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

export interface SparklineRenderProps {
  readonly values: readonly number[];
  readonly min?: number;
  readonly max?: number;
  readonly status?: ProcessStatus;
  readonly valueScale?: ValueScale;
  readonly emptyText?: string;
  readonly loadingText?: string;
  readonly errorText?: string;
}

export interface BarChartRenderProps {
  readonly items: readonly BarChartItem[];
  readonly max?: number;
  readonly selected?: number;
  readonly status?: ProcessStatus;
  readonly emptyText?: string;
  readonly loadingText?: string;
  readonly errorText?: string;
}

export interface ChartRenderProps<TMessage> {
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
  readonly toActionMessage?: (action: ChartAction) => TMessage;
}

export interface GaugeRenderProps {
  readonly label?: string;
  readonly value: number;
  readonly min?: number;
  readonly max?: number;
  readonly width?: number;
  readonly variant?: GaugeVariant;
  readonly status?: ProcessStatus;
}

export interface HeatmapRenderProps<TMessage> {
  readonly rows: readonly (readonly HeatmapCell[])[];
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
  readonly toActionMessage?: (action: HeatmapAction) => TMessage;
}

export interface SpinnerRenderProps {
  readonly frames?: readonly string[];
  readonly frameIndex?: number;
  readonly label?: string;
  readonly status?: ProcessStatus;
}

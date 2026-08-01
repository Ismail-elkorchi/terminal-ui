import type { HelpGroup, ProcessStatus } from '../../../ui-model/contracts.ts';
import type {
  BarChartItem,
  ChartDataState,
  ChartInterpolation,
  ChartPointSelection,
  ChartSampleAlign,
  ChartSampleMode,
  ChartSeries,
  MeterResult,
  MeterVariant,
  HeatmapCell,
  HeatmapSelection,
  NotificationItem,
  NotificationPlacement,
  ProgressBarDisplay,
  ProgressBarLabelPosition,
  ProgressBarMode,
  StatusBarItem,
  ValueScale
} from '../../../ui-model/feedback.ts';
import type { NotificationHistoryAction } from '../../../ui-model/notification.ts';
import type { BarChartAction, ChartAction, HeatmapAction } from '../../../ui-model/visualization.ts';

export interface NotificationRegionRenderProps<TMessage> {
  readonly items: readonly import('../../../ui-model/feedback.ts').NotificationItem[];
  readonly placement?: NotificationPlacement;
  readonly maxWidth?: number;
  readonly toDismissMessage?: (id: string) => TMessage;
}

export interface NotificationHistoryRenderProps<TMessage> {
  readonly items: readonly NotificationItem[];
  readonly selectedId?: string;
  readonly placement?: NotificationPlacement;
  readonly maxWidth?: number;
  readonly toActionMessage: (action: NotificationHistoryAction) => TMessage;
}
export interface StatusBarRenderProps {
  readonly leading: readonly StatusBarItem[];
  readonly center: readonly StatusBarItem[];
  readonly trailing: readonly StatusBarItem[];
}

export interface HelpBarRenderProps {
  readonly groups: readonly HelpGroup[];
}

export interface ActivityIndicatorRenderProps {
  readonly label: string;
  readonly status: ProcessStatus;
  readonly frames?: readonly string[];
  readonly frameIndex?: number;
}

export interface ProgressBarRenderProps {
  readonly label: string;
  readonly mode: ProgressBarMode;
  readonly barWidth?: number;
  readonly display?: ProgressBarDisplay;
  readonly labelPosition?: ProgressBarLabelPosition;
  readonly elapsedMs?: number;
  readonly remainingMs?: number;
  readonly status?: ProcessStatus;
  readonly valueScale?: ValueScale;
}

export interface SparklineRenderProps {
  readonly label: string;
  readonly values: readonly number[];
  readonly min?: number;
  readonly max?: number;
  readonly dataState?: ChartDataState;
  readonly valueScale?: ValueScale;
  readonly emptyText?: string;
  readonly loadingText?: string;
  readonly errorText?: string;
}

export interface BarChartRenderProps<TMessage> {
  readonly label: string;
  readonly items: readonly BarChartItem[];
  readonly max?: number;
  readonly selectedId?: string;
  readonly dataState?: ChartDataState;
  readonly emptyText?: string;
  readonly loadingText?: string;
  readonly errorText?: string;
  readonly toActionMessage?: (action: BarChartAction) => TMessage;
}

export interface ChartRenderProps<TMessage> {
  readonly label: string;
  readonly series: readonly ChartSeries[];
  readonly min?: number;
  readonly max?: number;
  readonly selected?: ChartPointSelection;
  readonly legend?: boolean;
  readonly signedDomain?: boolean;
  readonly xLabel?: string;
  readonly yLabel?: string;
  readonly dataState?: ChartDataState;
  readonly valueScale?: ValueScale;
  readonly sampleMode?: ChartSampleMode;
  readonly sampleAlign?: ChartSampleAlign;
  readonly interpolation?: ChartInterpolation;
  readonly emptyText?: string;
  readonly loadingText?: string;
  readonly errorText?: string;
  readonly toActionMessage?: (action: ChartAction) => TMessage;
}

export interface MeterRenderProps {
  readonly label: string;
  readonly value: number;
  readonly min?: number;
  readonly max?: number;
  readonly width?: number;
  readonly variant?: MeterVariant;
  readonly result?: MeterResult;
}

export interface HeatmapRenderProps<TMessage> {
  readonly label: string;
  readonly rows: readonly (readonly HeatmapCell[])[];
  readonly min?: number;
  readonly max?: number;
  readonly selected?: HeatmapSelection;
  readonly cellWidth?: number;
  readonly gap?: number;
  readonly dataState?: ChartDataState;
  readonly valueScale?: ValueScale;
  readonly emptyText?: string;
  readonly loadingText?: string;
  readonly errorText?: string;
  readonly toActionMessage?: (action: HeatmapAction) => TMessage;
}

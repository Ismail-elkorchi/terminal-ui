import type {
  HelpGroup,
  ProcessStatus
} from '../../ui-model/contracts.ts';
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
  NotificationPlacement,
  ProgressBarDisplay,
  ProgressBarLabelPosition,
  ProgressBarMode,
  StatusBarItem,
  ValueScale
} from '../../ui-model/feedback.ts';
import type { ElementKeyBindings, ElementOptions, InteractiveElementOptions } from '../../element/metadata.ts';
import type { NotificationHistoryAction } from '../../ui-model/notification.ts';
import type { BarChartAction, ChartAction, HeatmapAction } from '../../ui-model/visualization.ts';
import type { ChartStylePart, NotificationStylePart, StatusStylePart } from '../../ui-model/style-parts.ts';

interface NotificationOptionsBase<TMessage>
  extends InteractiveElementOptions<NotificationStylePart, TMessage> {
  readonly placement?: NotificationPlacement;
  readonly maxWidth?: number;
}

export interface NotificationRegionOptions<TMessage = never>
  extends NotificationOptionsBase<TMessage> {
  readonly items: readonly import('../../ui-model/feedback.ts').NotificationItem[];
  readonly onDismiss?: (id: string) => TMessage;
  readonly keys?: never;
}

export interface NotificationHistoryOptions<TMessage = never>
  extends NotificationOptionsBase<TMessage> {
  readonly items: readonly import('../../ui-model/feedback.ts').NotificationItem[];
  readonly selectedId?: string;
  readonly onAction: (action: NotificationHistoryAction) => TMessage;
  readonly keys?: ElementKeyBindings<TMessage>;
}

export interface StatusBarOptions extends ElementOptions<StatusStylePart> {
  readonly id: string;
  readonly leading?: readonly StatusBarItem[];
  readonly center?: readonly StatusBarItem[];
  readonly trailing?: readonly StatusBarItem[];
}

export interface HelpBarOptions extends ElementOptions<StatusStylePart> {
  readonly id: string;
  readonly groups: readonly HelpGroup[];
}

interface ActivityIndicatorOptionsBase extends ElementOptions<StatusStylePart> {
  readonly label: string;
}

export interface RunningActivityIndicatorOptions
  extends ActivityIndicatorOptionsBase {
  readonly status: 'running';
  readonly frames?: readonly string[];
  readonly frameIndex?: number;
}

export interface SettledActivityIndicatorOptions
  extends ActivityIndicatorOptionsBase {
  readonly status: Exclude<ProcessStatus, 'running'>;
  readonly frames?: never;
  readonly frameIndex?: never;
}

export type ActivityIndicatorOptions =
  | RunningActivityIndicatorOptions
  | SettledActivityIndicatorOptions;

export interface ProgressBarOptions extends ElementOptions<StatusStylePart> {
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

export interface SparklineOptions extends ElementOptions<ChartStylePart> {
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

export interface BarChartOptions<TMessage = never> extends InteractiveElementOptions<ChartStylePart, TMessage> {
  readonly label: string;
  readonly items: readonly BarChartItem[];
  readonly max?: number;
  readonly selectedId?: string;
  readonly dataState?: ChartDataState;
  readonly emptyText?: string;
  readonly loadingText?: string;
  readonly errorText?: string;
  readonly onAction?: (action: BarChartAction) => TMessage;
  readonly keys?: ElementKeyBindings<TMessage>;
}

export interface ChartOptions<TMessage = never> extends InteractiveElementOptions<ChartStylePart, TMessage> {
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
  readonly onAction?: (action: ChartAction) => TMessage;
  readonly keys?: ElementKeyBindings<TMessage>;
}

export interface MeterOptions extends ElementOptions<StatusStylePart> {
  readonly label: string;
  readonly value: number;
  readonly min?: number;
  readonly max?: number;
  readonly width?: number;
  readonly variant?: MeterVariant;
  readonly result?: MeterResult;
}

export interface HeatmapOptions<TValue = unknown, TMessage = never> extends InteractiveElementOptions<ChartStylePart, TMessage> {
  readonly label: string;
  readonly rows: readonly (readonly HeatmapCell<TValue>[])[];
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
  readonly onAction?: (action: HeatmapAction) => TMessage;
  readonly keys?: ElementKeyBindings<TMessage>;
}

export type {
  BarChartItem,
  ChartDataState,
  ChartInterpolation,
  ChartPoint,
  ChartPointSelection,
  ChartSampleAlign,
  ChartSampleMode,
  ChartSeries,
  ChartSeriesKind,
  MeterResult,
  MeterVariant,
  HeatmapCell,
  HeatmapSelection,
  NotificationItem,
  NotificationPlacement,
  NotificationTone,
  ProgressBarDisplay,
  ProgressBarLabelPosition,
  ProgressBarMode,
  ValueScale,
  ValueScaleStop
} from '../../ui-model/feedback.ts';
export type {
  NotificationHistoryAction
} from '../../ui-model/notification.ts';

import type {
  HelpGroup,
  ProcessStatus
} from '../../ui-model/contracts.ts';
import type {
  BarChartItem,
  ChartInterpolation,
  ChartPointSelection,
  ChartSampleAlign,
  ChartSampleMode,
  ChartSeries,
  MeterVariant,
  HeatmapCell,
  HeatmapSelection,
  NotificationPlacement,
  ProgressBarDisplay,
  ProgressBarLabelPosition,
  StatusBarItem,
  ValueScale
} from '../../ui-model/feedback.ts';
import type { ElementKeyBindings, ElementOptions, InteractiveElementOptions } from '../../element/metadata.ts';
import type {
  NotificationStackAction,
  NotificationStackPresentation
} from '../../ui-model/notification-stack.ts';
import type { BarChartAction, ChartAction, HeatmapAction } from '../../ui-model/visualization.ts';
import type { ChartStylePart, NotificationStylePart, StatusStylePart } from '../../ui-model/style-parts.ts';

interface NotificationStackBaseOptions<TMessage> extends InteractiveElementOptions<NotificationStylePart, TMessage> {
  readonly presentation: NotificationStackPresentation;
  readonly placement?: NotificationPlacement;
  readonly maxWidth?: number;
}

export interface LiveNotificationStackOptions<TMessage = never> extends NotificationStackBaseOptions<TMessage> {
  readonly presentation: Extract<NotificationStackPresentation, { readonly kind: 'live' }>;
  readonly onDismiss?: (id: string) => TMessage;
}

export interface NotificationHistoryOptions<TMessage = never> extends NotificationStackBaseOptions<TMessage> {
  readonly presentation: Extract<NotificationStackPresentation, { readonly kind: 'history' }>;
  readonly onAction: (action: NotificationStackAction) => TMessage;
  readonly keys?: ElementKeyBindings<TMessage>;
}

export type NotificationStackOptions<TMessage = never> =
  | LiveNotificationStackOptions<TMessage>
  | NotificationHistoryOptions<TMessage>;

export interface StatusBarOptions extends ElementOptions<StatusStylePart> {
  readonly id: string;
  readonly leading?: readonly StatusBarItem[];
  readonly center?: readonly StatusBarItem[];
  readonly trailing?: readonly StatusBarItem[];
}

export interface HelpBarOptions extends ElementOptions<StatusStylePart> {
  readonly groups: readonly HelpGroup[];
}

export interface StatusIndicatorOptions extends ElementOptions<StatusStylePart> {
  readonly label?: string;
  readonly status?: ProcessStatus;
}

export interface ProgressBarOptions extends ElementOptions<StatusStylePart> {
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

export interface SparklineOptions extends ElementOptions<ChartStylePart> {
  readonly values: readonly number[];
  readonly min?: number;
  readonly max?: number;
  readonly status?: ProcessStatus;
  readonly valueScale?: ValueScale;
  readonly emptyText?: string;
  readonly loadingText?: string;
  readonly errorText?: string;
}

export interface BarChartOptions<TMessage = never> extends InteractiveElementOptions<ChartStylePart, TMessage> {
  readonly items: readonly BarChartItem[];
  readonly max?: number;
  readonly selectedId?: string;
  readonly status?: ProcessStatus;
  readonly emptyText?: string;
  readonly loadingText?: string;
  readonly errorText?: string;
  readonly onAction?: (action: BarChartAction) => TMessage;
  readonly keys?: ElementKeyBindings<TMessage>;
}

export interface ChartOptions<TMessage = never> extends InteractiveElementOptions<ChartStylePart, TMessage> {
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
  readonly onAction?: (action: ChartAction) => TMessage;
  readonly keys?: ElementKeyBindings<TMessage>;
}

export interface MeterOptions extends ElementOptions<StatusStylePart> {
  readonly label?: string;
  readonly value: number;
  readonly min?: number;
  readonly max?: number;
  readonly width?: number;
  readonly variant?: MeterVariant;
  readonly status?: ProcessStatus;
}

export interface HeatmapOptions<TValue = unknown, TMessage = never> extends InteractiveElementOptions<ChartStylePart, TMessage> {
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
  readonly onAction?: (action: HeatmapAction) => TMessage;
  readonly keys?: ElementKeyBindings<TMessage>;
}

export interface SpinnerOptions extends ElementOptions<StatusStylePart> {
  readonly frames?: readonly string[];
  readonly frameIndex?: number;
  readonly label?: string;
  readonly status?: ProcessStatus;
}

export type {
  BarChartItem,
  ChartInterpolation,
  ChartPointSelection,
  ChartSampleAlign,
  ChartSampleMode,
  ChartSeries,
  ChartSeriesKind,
  MeterVariant,
  HeatmapCell,
  HeatmapSelection,
  NotificationItem,
  NotificationPlacement,
  NotificationTone,
  ProgressBarDisplay,
  ProgressBarLabelPosition,
  ValueScale,
  ValueScaleStop
} from '../../ui-model/feedback.ts';
export type { NotificationStackPresentation } from '../../ui-model/notification-stack.ts';

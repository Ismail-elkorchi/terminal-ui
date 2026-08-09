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
import type { ElementOptions } from '../../element/metadata.ts';
import type { PointerInteractionState } from '../../interaction/index.ts';
import type { MessageResolution } from '../../interaction/message.ts';
import type { ComponentMetadataOptions } from '../../component/index.ts';
import type { NotificationHistoryAction, NotificationRegionAction } from '../../ui-model/notification.ts';
import type { BarChartAction, ChartAction, HeatmapAction } from '../../ui-model/visualization.ts';
import type { ChartStylePart, NotificationStylePart, StatusStylePart } from '../../ui-model/style-parts.ts';

interface NotificationOptionsBase {
  readonly id: string;
  readonly placement?: NotificationPlacement;
  readonly maxWidth?: number;
  readonly pointerState?: PointerInteractionState;
  readonly meta?: ComponentMetadataOptions<readonly ['focus', 'layer', 'styles'], NotificationStylePart>;
}

interface NotificationRegionOptionsBase extends NotificationOptionsBase {
  readonly items: readonly import('../../ui-model/feedback.ts').NotificationItem[];
}

export type NotificationRegionOptions<TMessage = never> =
  | (NotificationRegionOptionsBase & {
      readonly onAction: (action: NotificationRegionAction) => MessageResolution<TMessage>;
    })
  | (NotificationRegionOptionsBase & {
      readonly onAction?: never;
      readonly pointerState?: never;
    });

export interface NotificationHistoryOptions<TMessage = never>
  extends NotificationOptionsBase {
  readonly items: readonly import('../../ui-model/feedback.ts').NotificationItem[];
  readonly selectedId?: string;
  readonly onAction: (action: NotificationHistoryAction) => MessageResolution<TMessage>;
}

export interface StatusBarOptions {
  readonly id: string;
  readonly leading?: readonly StatusBarItem[];
  readonly center?: readonly StatusBarItem[];
  readonly trailing?: readonly StatusBarItem[];
  readonly meta?: ComponentMetadataOptions<readonly ['styles', 'layer'], StatusStylePart>;
}

export interface HelpBarOptions {
  readonly id: string;
  readonly groups: readonly HelpGroup[];
  readonly meta?: ComponentMetadataOptions<readonly ['styles', 'layer'], StatusStylePart>;
}

interface ActivityIndicatorOptionsBase extends ElementOptions<StatusStylePart> {
  readonly label: string;
  readonly meta?: import('../../component/index.ts').ComponentMetadataOptions<readonly ['styles', 'layer'], StatusStylePart>;
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

export interface ProgressBarOptions {
  readonly id?: string;
  readonly label: string;
  readonly mode: ProgressBarMode;
  readonly barWidth?: number;
  readonly display?: ProgressBarDisplay;
  readonly labelPosition?: ProgressBarLabelPosition;
  readonly elapsedMs?: number;
  readonly remainingMs?: number;
  readonly status?: ProcessStatus;
  readonly valueScale?: ValueScale;
  readonly meta?: ComponentMetadataOptions<readonly ['styles', 'layer'], StatusStylePart>;
}

export interface SparklineOptions {
  readonly id?: string;
  readonly label: string;
  readonly values: readonly number[];
  readonly min?: number;
  readonly max?: number;
  readonly dataState?: ChartDataState;
  readonly valueScale?: ValueScale;
  readonly emptyText?: string;
  readonly loadingText?: string;
  readonly errorText?: string;
  readonly meta?: ComponentMetadataOptions<readonly ['styles', 'layer'], ChartStylePart>;
}

interface BarChartOptionsBase {
  readonly id: string;
  readonly label: string;
  readonly items: readonly BarChartItem[];
  readonly max?: number;
  readonly selectedId?: string;
  readonly dataState?: ChartDataState;
  readonly emptyText?: string;
  readonly loadingText?: string;
  readonly errorText?: string;
  readonly pointerState?: PointerInteractionState;
  readonly meta?: ComponentMetadataOptions<readonly ['focus', 'layer', 'styles'], ChartStylePart>;
}

export type BarChartOptions<TMessage = never> = BarChartOptionsBase & (
  | { readonly onAction?: never; readonly pointerState?: never }
  | { readonly onAction: (action: BarChartAction) => MessageResolution<TMessage>; readonly disabled?: false }
  | { readonly onAction?: never; readonly disabled: true; readonly pointerState?: never }
);

interface ChartOptionsBase {
  readonly id: string;
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
  readonly pointerState?: PointerInteractionState;
  readonly meta?: ComponentMetadataOptions<readonly ['focus', 'layer', 'styles'], ChartStylePart>;
}

export type ChartOptions<TMessage = never> = ChartOptionsBase & (
  | { readonly onAction?: never; readonly pointerState?: never }
  | { readonly onAction: (action: ChartAction) => MessageResolution<TMessage>; readonly disabled?: false }
  | { readonly onAction?: never; readonly disabled: true; readonly pointerState?: never }
);

export interface MeterOptions {
  readonly id?: string;
  readonly label: string;
  readonly value: number;
  readonly min?: number;
  readonly max?: number;
  readonly width?: number;
  readonly variant?: MeterVariant;
  readonly result?: MeterResult;
  readonly meta?: ComponentMetadataOptions<readonly ['styles', 'layer'], StatusStylePart>;
}

interface HeatmapOptionsBase<TValue> {
  readonly id: string;
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
  readonly pointerState?: PointerInteractionState;
  readonly meta?: ComponentMetadataOptions<readonly ['focus', 'layer', 'styles'], ChartStylePart>;
}

export type HeatmapOptions<TValue = unknown, TMessage = never> = HeatmapOptionsBase<TValue> & (
  | { readonly onAction?: never; readonly pointerState?: never }
  | { readonly onAction: (action: HeatmapAction) => MessageResolution<TMessage>; readonly disabled?: false }
  | { readonly onAction?: never; readonly disabled: true; readonly pointerState?: never }
);

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
  NotificationHistoryAction,
  NotificationRegionAction
} from '../../ui-model/notification.ts';

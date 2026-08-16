import type {
  HelpGroup,
  ProcessStatus
} from '../../ui-model/contracts.ts';
import type { ComponentMessage } from '../../component/index.ts';
import type {
  BarChartItem,
  ChartDataState,
  ChartInterpolation,
  ChartSampleAlign,
  ChartSampleMode,
  ChartSeries,
  MeterResult,
  MeterVariant,
  HeatmapCell,
  NotificationPlacement,
  ProgressBarDisplay,
  ProgressBarLabelPosition,
  ProgressBarMode,
  StatusBarItem,
  ValueScale
} from '../../ui-model/feedback.ts';
import type {
  PointerInteractionAction,
  PointerInteractionState,
} from '../../interaction/index.ts';
import type { MessageResolution } from '../../interaction/message.ts';
import type { ComponentMetadataOptions } from '../../component/index.ts';
import type { NotificationHistoryAction, NotificationRegionAction } from '../../ui-model/notification.ts';
import type {
  BarChartTransition,
  ChartTransition,
  HeatmapTransition,
  VisualizationActivateEvent,
  VisualizationPresentation,
} from '../../ui-model/visualization.ts';
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

export type NotificationRegionOptions<TMessage extends ComponentMessage = never> =
  | (NotificationRegionOptionsBase & {
      readonly onAction: (action: NotificationRegionAction) => MessageResolution<TMessage>;
      readonly onPointerAction?: (action: PointerInteractionAction) => MessageResolution<TMessage>;
    })
  | (NotificationRegionOptionsBase & {
      readonly onAction?: never;
      readonly onPointerAction?: never;
      readonly pointerState?: never;
    });

export interface NotificationHistoryOptions<TMessage extends ComponentMessage = never>
  extends NotificationOptionsBase {
  readonly items: readonly import('../../ui-model/feedback.ts').NotificationItem[];
  readonly selectedId?: string;
  readonly onAction: (action: NotificationHistoryAction) => MessageResolution<TMessage>;
  readonly onPointerAction?: (action: PointerInteractionAction) => MessageResolution<TMessage>;
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

interface ActivityIndicatorOptionsBase {
  readonly id?: string;
  readonly label: string;
  readonly onAction?: never;
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
  readonly dataState?: ChartDataState;
  readonly emptyText?: string;
  readonly loadingText?: string;
  readonly errorText?: string;
  readonly meta?: ComponentMetadataOptions<readonly ['focus', 'layer', 'styles'], ChartStylePart>;
}

export type BarChartOptions<TMessage extends ComponentMessage = never> = BarChartOptionsBase &
  VisualizationOptions<BarChartTransition, TMessage>;

interface ChartOptionsBase {
  readonly id: string;
  readonly label: string;
  readonly series: readonly ChartSeries[];
  readonly min?: number;
  readonly max?: number;
  readonly showLegend?: boolean;
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
  readonly meta?: ComponentMetadataOptions<readonly ['focus', 'layer', 'styles'], ChartStylePart>;
}

export type ChartOptions<TMessage extends ComponentMessage = never> = ChartOptionsBase &
  VisualizationOptions<ChartTransition, TMessage>;

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
  readonly cellWidth?: number;
  readonly gap?: number;
  readonly dataState?: ChartDataState;
  readonly valueScale?: ValueScale;
  readonly emptyText?: string;
  readonly loadingText?: string;
  readonly errorText?: string;
  readonly meta?: ComponentMetadataOptions<readonly ['focus', 'layer', 'styles'], ChartStylePart>;
}

export type HeatmapOptions<
  TValue = unknown,
  TMessage extends ComponentMessage = never
> = HeatmapOptionsBase<TValue> & VisualizationOptions<HeatmapTransition, TMessage>;

type VisualizationOptions<
  TTransition,
  TMessage extends ComponentMessage,
> =
  | {
      readonly presentation?: never;
      readonly pointerState?: never;
      readonly disabled?: never;
      readonly busy?: boolean;
      readonly inert?: never;
      readonly onTransition?: never;
      readonly onActivate?: never;
      readonly onPointerAction?: never;
    }
  | {
      readonly presentation: VisualizationPresentation;
      readonly pointerState?: PointerInteractionState;
      readonly disabled?: false;
      readonly busy?: boolean;
      readonly inert?: false;
      readonly onTransition: (transition: TTransition) => MessageResolution<TMessage>;
      readonly onActivate?: (event: VisualizationActivateEvent) => MessageResolution<TMessage>;
      readonly onPointerAction?: (action: PointerInteractionAction) => MessageResolution<TMessage>;
    }
  | {
      readonly presentation: VisualizationPresentation;
      readonly pointerState?: never;
      readonly disabled?: false;
      readonly busy?: boolean;
      readonly inert: true;
      readonly onTransition?: never;
      readonly onActivate?: never;
      readonly onPointerAction?: never;
    }
  | {
      readonly presentation: VisualizationPresentation;
      readonly pointerState?: never;
      readonly disabled: true;
      readonly busy?: boolean;
      readonly inert?: boolean;
      readonly onTransition?: never;
      readonly onActivate?: never;
      readonly onPointerAction?: never;
    };

export type {
  BarChartItem,
  ChartDataState,
  ChartInterpolation,
  ChartPoint,
  ChartSampleAlign,
  ChartSampleMode,
  ChartSeries,
  ChartSeriesKind,
  MeterResult,
  MeterVariant,
  HeatmapCell,
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

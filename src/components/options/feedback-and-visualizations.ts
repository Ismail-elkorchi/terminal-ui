import type { HelpGroup } from '../help.ts';
import type { ProcessStatus, StatusBarItem } from '../status-bar.ts';
import type { ComponentMessage } from '../../component/index.ts';
import type {
  BarChartItem,
  ChartDataStatus,
  ChartInterpolation,
  ChartSampleAlign,
  ChartSampleMode,
  ChartSeries,
  MeterStatus,
  MeterVariant,
  HeatmapCell,
  ValueScale
} from '../../behavior/visualization-data.ts';
import type { NotificationItem, NotificationPlacement } from '../../behavior/notification.ts';
import type { ProgressBarDisplay, ProgressBarLabelPosition, ProgressBarMode } from '../progress.ts';
import type { MessageResolution } from '../../interaction/message.ts';
import type { ComponentMetadataOptions } from '../../component/index.ts';
import type { NotificationHistoryTransition, NotificationDismissEvent } from '../../behavior/notification-history.ts';
import type {
  BarChartTransition,
  ChartTransition,
  HeatmapTransition,
  VisualizationActivateEvent,
  VisualizationState,
} from '../../behavior/visualization.ts';
import type {
  ActivityIndicatorStylePart,
  BarChartStylePart,
  ChartStylePart,
  HeatmapStylePart,
  HelpBarStylePart,
  MeterStylePart,
  NotificationHistoryStylePart,
  NotificationStylePart,
  ProgressBarStylePart,
  SparklineStylePart,
  StatusBarStylePart,
} from '../style-parts.ts';

interface NotificationOptionsBase<
  TPart extends string,
  TVisualState extends import('../../component/index.ts').ComponentVisualState,
> {
  readonly id: string;
  readonly placement?: NotificationPlacement;
  readonly maxWidth?: number;
  readonly styles?: import('../../element/metadata.ts').ElementStyles<TPart, TVisualState>;
  readonly meta?: ComponentMetadataOptions<readonly ['focus', 'layer', 'styles']>;
}

interface NotificationRegionOptionsBase<TVisualState extends import('../../component/index.ts').ComponentVisualState>
  extends NotificationOptionsBase<NotificationStylePart, TVisualState> {
  readonly items: readonly NotificationItem[];
}

export type NotificationRegionOptions<TMessage extends ComponentMessage = never> =
  | (NotificationRegionOptionsBase<'hovered' | 'pressed'> & {
      readonly onDismiss: (event: NotificationDismissEvent) => MessageResolution<TMessage>;
    })
  | (NotificationRegionOptionsBase<never> & {
      readonly onDismiss?: never;
    });

export interface NotificationHistoryOptions<TMessage extends ComponentMessage = never>
  extends NotificationOptionsBase<
    NotificationHistoryStylePart,
    'hovered' | 'pressed' | 'active' | 'selected' | 'disabled'
  > {
  readonly items: readonly NotificationItem[];
  readonly selectedId?: string;
  readonly scroll: import('../../interaction/scroll.ts').ScrollState;
  readonly scrollbar?: import('../../interaction/scrollbar.ts').ScrollbarOptions;
  readonly scrollPolicy?: import('../../interaction/scroll.ts').ScrollPolicy;
  readonly onTransition: (transition: NotificationHistoryTransition) => MessageResolution<TMessage>;
}

export interface StatusBarOptions {
  readonly id: string;
  readonly leading?: readonly StatusBarItem[];
  readonly center?: readonly StatusBarItem[];
  readonly trailing?: readonly StatusBarItem[];
  readonly styles?: import("../../element/metadata.ts").ElementStyles<StatusBarStylePart>;
  readonly meta?: ComponentMetadataOptions<readonly ['styles', 'layer']>;
}

export interface HelpBarOptions {
  readonly id: string;
  readonly groups: readonly HelpGroup[];
  readonly styles?: import("../../element/metadata.ts").ElementStyles<HelpBarStylePart>;
  readonly meta?: ComponentMetadataOptions<readonly ['styles', 'layer']>;
}

interface ActivityIndicatorOptionsBase {
  readonly id?: string;
  readonly label: string;
  readonly onTransition?: never;
  readonly styles?: import('../../element/metadata.ts').ElementStyles<ActivityIndicatorStylePart>;
  readonly meta?: import('../../component/index.ts').ComponentMetadataOptions<readonly ['styles', 'layer']>;
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
  readonly styles?: import("../../element/metadata.ts").ElementStyles<ProgressBarStylePart>;
  readonly meta?: ComponentMetadataOptions<readonly ['styles', 'layer']>;
}

export interface SparklineOptions {
  readonly id?: string;
  readonly label: string;
  readonly values: readonly number[];
  readonly min?: number;
  readonly max?: number;
  readonly dataStatus?: ChartDataStatus;
  readonly valueScale?: ValueScale;
  readonly emptyText?: string;
  readonly loadingText?: string;
  readonly errorText?: string;
  readonly styles?: import("../../element/metadata.ts").ElementStyles<SparklineStylePart>;
  readonly meta?: ComponentMetadataOptions<readonly ['styles', 'layer']>;
}

interface BarChartOptionsBase {
  readonly id: string;
  readonly label: string;
  readonly items: readonly BarChartItem[];
  readonly max?: number;
  readonly dataStatus?: ChartDataStatus;
  readonly emptyText?: string;
  readonly loadingText?: string;
  readonly errorText?: string;
  readonly styles?: import("../../element/metadata.ts").ElementStyles<BarChartStylePart, 'active' | 'selected' | 'disabled' | 'busy'>;
  readonly meta?: ComponentMetadataOptions<readonly ['focus', 'layer', 'styles']>;
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
  readonly dataStatus?: ChartDataStatus;
  readonly valueScale?: ValueScale;
  readonly sampleMode?: ChartSampleMode;
  readonly sampleAlign?: ChartSampleAlign;
  readonly interpolation?: ChartInterpolation;
  readonly emptyText?: string;
  readonly loadingText?: string;
  readonly errorText?: string;
  readonly styles?: import("../../element/metadata.ts").ElementStyles<ChartStylePart, 'active' | 'selected' | 'disabled' | 'busy'>;
  readonly meta?: ComponentMetadataOptions<readonly ['focus', 'layer', 'styles']>;
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
  readonly status?: MeterStatus;
  readonly styles?: import("../../element/metadata.ts").ElementStyles<MeterStylePart>;
  readonly meta?: ComponentMetadataOptions<readonly ['styles', 'layer']>;
}

interface HeatmapOptionsBase<TValue> {
  readonly id: string;
  readonly label: string;
  readonly rows: readonly (readonly HeatmapCell<TValue>[])[];
  readonly min?: number;
  readonly max?: number;
  readonly cellWidth?: number;
  readonly gap?: number;
  readonly dataStatus?: ChartDataStatus;
  readonly valueScale?: ValueScale;
  readonly emptyText?: string;
  readonly loadingText?: string;
  readonly errorText?: string;
  readonly styles?: import("../../element/metadata.ts").ElementStyles<HeatmapStylePart, 'active' | 'selected' | 'disabled' | 'busy'>;
  readonly meta?: ComponentMetadataOptions<readonly ['focus', 'layer', 'styles']>;
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
      readonly state?: never;
      readonly disabled?: never;
      readonly busy?: boolean;
      readonly inert?: never;
      readonly onTransition?: never;
      readonly onActivate?: never;
    }
  | {
      readonly state: VisualizationState;
      readonly disabled?: false;
      readonly busy?: boolean;
      readonly inert?: false;
      readonly onTransition: (transition: TTransition) => MessageResolution<TMessage>;
      readonly onActivate?: (event: VisualizationActivateEvent) => MessageResolution<TMessage>;
    }
  | {
      readonly state: VisualizationState;
      readonly disabled?: false;
      readonly busy?: boolean;
      readonly inert: true;
      readonly onTransition?: never;
      readonly onActivate?: never;
    }
  | {
      readonly state: VisualizationState;
      readonly disabled: true;
      readonly busy?: boolean;
      readonly inert?: boolean;
      readonly onTransition?: never;
      readonly onActivate?: never;
    };

export type {
  BarChartItem,
  ChartDataStatus,
  ChartInterpolation,
  ChartPoint,
  ChartSampleAlign,
  ChartSampleMode,
  ChartSeries,
  ChartSeriesKind,
  MeterStatus,
  MeterVariant,
  HeatmapCell,
  ValueScale,
  ValueScaleStop
} from '../../behavior/visualization-data.ts';
export type {
  NotificationItem,
  NotificationPlacement,
  NotificationTone,
} from '../../behavior/notification.ts';
export type {
  ProgressBarDisplay,
  ProgressBarLabelPosition,
  ProgressBarMode,
} from '../progress.ts';
export type {
  StatusBarItem,
} from '../status-bar.ts';
export type {
  NotificationHistoryTransition,
  NotificationDismissEvent
} from '../../behavior/notification-history.ts';

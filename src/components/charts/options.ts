import type {
  BarChartItem,
  ChartDataStatus,
  ChartInterpolation,
  ChartSampleAlign,
  ChartSampleMode,
  ChartSeries,
  HeatmapCell,
  ValueScale,
} from '../../behavior/visualization-data.ts';
import type {
  BarChartTransition,
  ChartTransition,
  HeatmapTransition,
  VisualizationActivateEvent,
  VisualizationState,
} from '../../behavior/visualization.ts';
import type { ComponentMetadataOptions } from '../../component/contracts.ts';
import type { ComponentMessage } from '../../component/message.ts';
import type { MessageResolution } from '../../interaction/message.ts';
import type { RetainedCallbacks } from '../shared/availability.ts';
import type { BarChartStylePart, ChartStylePart, HeatmapStylePart } from '../style-parts.ts';


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
      readonly disabled?: boolean;
      readonly busy?: boolean;
      readonly inert?: boolean;
      readonly onTransition: (transition: TTransition) => MessageResolution<TMessage>;
      readonly onActivate?: (event: VisualizationActivateEvent) => MessageResolution<TMessage>;
    }
  | {
      readonly state: VisualizationState;
      readonly disabled?: boolean;
      readonly busy?: boolean;
      readonly inert: true;
    } & RetainedCallbacks<{
      readonly onTransition: (transition: TTransition) => MessageResolution<TMessage>;
      readonly onActivate?: (event: VisualizationActivateEvent) => MessageResolution<TMessage>;
    }>
  | {
      readonly state: VisualizationState;
      readonly disabled: true;
      readonly busy?: boolean;
      readonly inert?: boolean;
    } & RetainedCallbacks<{
      readonly onTransition: (transition: TTransition) => MessageResolution<TMessage>;
      readonly onActivate?: (event: VisualizationActivateEvent) => MessageResolution<TMessage>;
    }>;

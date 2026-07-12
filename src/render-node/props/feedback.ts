import type {
  ActivityIndicatorOptions,
  BarChartOptions,
  ChartOptions,
  GaugeOptions,
  HeatmapOptions,
  HelpBarOptions,
  NotificationItem,
  NotificationStackOptions,
  ProgressBarOptions,
  SparklineOptions,
  SpinnerOptions,
  StatusBarOptions
} from '../../components/options/feedback.ts';
import type { AuthoredProps, ReplaceProps } from './shared.ts';
import type { NotificationStackAction } from '../../components/notification-stack.ts';
import type { ChartAction, HeatmapAction } from '../../components/visualization.ts';

export interface NotificationStackRenderProps<TMessage> {
  readonly items: readonly NotificationItem[];
  readonly selected?: string;
  readonly placement?: AuthoredProps<NotificationStackOptions>['placement'];
  readonly maxWidth?: number;
  readonly toActionMessage?: (action: NotificationStackAction) => TMessage;
}

export type StatusBarRenderProps = Omit<AuthoredProps<StatusBarOptions<never>>, 'onPress'>;
export type HelpBarRenderProps = AuthoredProps<HelpBarOptions>;
export type ActivityIndicatorRenderProps = AuthoredProps<ActivityIndicatorOptions>;
export type ProgressBarRenderProps = AuthoredProps<ProgressBarOptions>;
export type SparklineRenderProps = AuthoredProps<SparklineOptions>;
export type BarChartRenderProps = AuthoredProps<BarChartOptions>;
export type ChartRenderProps<TMessage> = ReplaceProps<
  AuthoredProps<ChartOptions>,
  'onAction',
  { readonly toActionMessage?: (action: ChartAction) => TMessage }
>;
export type GaugeRenderProps = AuthoredProps<GaugeOptions>;

export interface HeatmapRenderProps<TMessage> extends Omit<
  AuthoredProps<HeatmapOptions>,
  'onAction'
> {
  readonly toActionMessage?: (action: HeatmapAction) => TMessage;
}

export type SpinnerRenderProps = AuthoredProps<SpinnerOptions>;

import type {
  ActivityIndicatorOptions,
  BarChartOptions,
  ChartOptions,
  ChartPointEvent,
  GaugeOptions,
  HeatmapCell,
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
  'onSelect',
  { readonly toMessage?: (point: ChartPointEvent) => TMessage }
>;
export type GaugeRenderProps = AuthoredProps<GaugeOptions>;

export interface HeatmapRenderProps<TMessage> extends Omit<
  AuthoredProps<HeatmapOptions>,
  'onSelect'
> {
  readonly toMessage?: (cell: HeatmapCell, row: number, column: number) => TMessage;
}

export type SpinnerRenderProps = AuthoredProps<SpinnerOptions>;

/** Passive and interactive data visualizations. */
export { barChart, chart, heatmap } from './factories/chart-components.ts';
export { meter, sparkline } from './factories/feedback.ts';
export type {
  BarChartOptions,
  ChartOptions,
  HeatmapOptions,
  MeterOptions,
  SparklineOptions,
} from './options/feedback.ts';
export type {
  BarChartItem,
  ChartDataState,
  ChartInterpolation,
  ChartPoint,
  ChartSampleAlign,
  ChartSampleMode,
  ChartSeries,
  ChartSeriesKind,
  HeatmapCell,
  MeterResult,
  MeterVariant,
  ValueScale,
  ValueScaleStop,
} from '../ui-model/feedback.ts';
export type {
  BarChartTransition,
  ChartTransition,
  HeatmapTransition,
  VisualizationActivateEvent,
  VisualizationPresentation,
} from '../ui-model/visualization.ts';

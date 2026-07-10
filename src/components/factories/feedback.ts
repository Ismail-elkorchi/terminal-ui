import { elementFromRenderNode } from '../../render-node/element.ts';
import type { Element } from '../element.ts';
import type {
  ActivityIndicatorOptions,
  BarChartOptions,
  ChartOptions,
  GaugeOptions,
  HeatmapOptions,
  HelpBarOptions,
  NotificationStackOptions,
  ProgressBarOptions,
  SparklineOptions,
  SpinnerOptions,
  StatusBarOptions
} from '../options/feedback.ts';
import {
  activationKeyBindings,
  interactionProps,
  withMetaDefaults
} from '../factory-internals/interaction.ts';
import { optionalId } from '../factory-internals/layout.ts';

export function notificationStack<TMessage>(options: NotificationStackOptions<TMessage>): Element<TMessage> {
  const meta = withMetaDefaults(options.meta, { focus: { disabled: true } });
  return elementFromRenderNode({
    ...optionalId(options.id),
    kind: 'notificationStack',
    props: {
      items: options.items,
      ...(options.selected === undefined ? {} : { selected: options.selected }),
      ...(options.placement === undefined ? {} : { placement: options.placement }),
      ...(options.maxVisible === undefined ? {} : { maxVisible: options.maxVisible }),
      ...(options.maxWidth === undefined ? {} : { maxWidth: options.maxWidth }),
      ...(options.onDismiss === undefined ? {} : { toDismissMessage: options.onDismiss })
    },
    ...interactionProps({ keys: options.keys, meta })
  });
}

export function statusBar<TMessage>(options: StatusBarOptions<TMessage>): Element<TMessage> {
  const keyMap = activationKeyBindings(options.onPress, options.keys);
  return elementFromRenderNode({
    ...optionalId(options.id),
    kind: 'statusBar',
    props: { text: options.text },
    ...(keyMap === undefined ? {} : { keyMap }),
    ...interactionProps({ meta: options.meta })
  });
}

export function helpBar<TMessage>(options: HelpBarOptions<TMessage>): Element<TMessage> {
  return elementFromRenderNode({
    ...optionalId(options.id),
    kind: 'helpBar',
    props: { bindings: options.bindings },
    ...interactionProps(options)
  });
}

export function activityIndicator(options: ActivityIndicatorOptions = {}): Element<never> {
  return elementFromRenderNode({
    ...optionalId(options.id),
    kind: 'activityIndicator',
    props: {
      ...(options.label === undefined ? {} : { label: options.label }),
      ...(options.status === undefined ? {} : { status: options.status })
    },
    ...interactionProps(options)
  });
}

export function progressBar(options: ProgressBarOptions): Element<never> {
  return elementFromRenderNode({
    ...optionalId(options.id),
    kind: 'progressBar',
    props: {
      ...(options.label === undefined ? {} : { label: options.label }),
      ...(options.value === undefined ? {} : { value: options.value }),
      ...(options.max === undefined ? {} : { max: options.max }),
      ...(options.indeterminate === undefined ? {} : { indeterminate: options.indeterminate }),
      ...(options.barWidth === undefined ? {} : { barWidth: options.barWidth }),
      ...(options.display === undefined ? {} : { display: options.display }),
      ...(options.labelPosition === undefined ? {} : { labelPosition: options.labelPosition }),
      ...(options.elapsedMs === undefined ? {} : { elapsedMs: options.elapsedMs }),
      ...(options.remainingMs === undefined ? {} : { remainingMs: options.remainingMs }),
      ...(options.frame === undefined ? {} : { frame: options.frame }),
      ...(options.status === undefined ? {} : { status: options.status }),
      ...(options.valueScale === undefined ? {} : { valueScale: options.valueScale })
    },
    ...interactionProps(options)
  });
}

export function sparkline(options: SparklineOptions): Element<never> {
  return elementFromRenderNode({
    ...optionalId(options.id),
    kind: 'sparkline',
    props: {
      values: options.values,
      ...(options.min === undefined ? {} : { min: options.min }),
      ...(options.max === undefined ? {} : { max: options.max }),
      ...(options.status === undefined ? {} : { status: options.status }),
      ...(options.valueScale === undefined ? {} : { valueScale: options.valueScale }),
      ...(options.emptyText === undefined ? {} : { emptyText: options.emptyText }),
      ...(options.loadingText === undefined ? {} : { loadingText: options.loadingText }),
      ...(options.errorText === undefined ? {} : { errorText: options.errorText })
    },
    ...interactionProps(options)
  });
}

export function barChart<TMessage>(options: BarChartOptions<TMessage>): Element<TMessage> {
  return elementFromRenderNode({
    ...optionalId(options.id),
    kind: 'barChart',
    props: {
      items: options.items,
      ...(options.max === undefined ? {} : { max: options.max }),
      ...(options.selected === undefined ? {} : { selected: options.selected }),
      ...(options.status === undefined ? {} : { status: options.status }),
      ...(options.emptyText === undefined ? {} : { emptyText: options.emptyText }),
      ...(options.loadingText === undefined ? {} : { loadingText: options.loadingText }),
      ...(options.errorText === undefined ? {} : { errorText: options.errorText })
    },
    ...interactionProps(options)
  });
}

export function chart<TMessage>(options: ChartOptions<TMessage>): Element<TMessage> {
  return elementFromRenderNode({
    ...optionalId(options.id),
    kind: 'chart',
    props: {
      series: options.series,
      ...(options.min === undefined ? {} : { min: options.min }),
      ...(options.max === undefined ? {} : { max: options.max }),
      ...(options.selected === undefined ? {} : { selected: options.selected }),
      ...(options.legend === undefined ? {} : { legend: options.legend }),
      ...(options.signedDomain === undefined ? {} : { signedDomain: options.signedDomain }),
      ...(options.xLabel === undefined ? {} : { xLabel: options.xLabel }),
      ...(options.yLabel === undefined ? {} : { yLabel: options.yLabel }),
      ...(options.status === undefined ? {} : { status: options.status }),
      ...(options.valueScale === undefined ? {} : { valueScale: options.valueScale }),
      ...(options.sampleMode === undefined ? {} : { sampleMode: options.sampleMode }),
      ...(options.sampleAlign === undefined ? {} : { sampleAlign: options.sampleAlign }),
      ...(options.interpolation === undefined ? {} : { interpolation: options.interpolation }),
      ...(options.emptyText === undefined ? {} : { emptyText: options.emptyText }),
      ...(options.loadingText === undefined ? {} : { loadingText: options.loadingText }),
      ...(options.errorText === undefined ? {} : { errorText: options.errorText }),
      ...(options.onSelect === undefined ? {} : { toMessage: options.onSelect })
    },
    ...interactionProps(options)
  });
}

export function gauge(options: GaugeOptions): Element<never> {
  return elementFromRenderNode({
    ...optionalId(options.id),
    kind: 'gauge',
    props: {
      ...(options.label === undefined ? {} : { label: options.label }),
      value: options.value,
      ...(options.min === undefined ? {} : { min: options.min }),
      ...(options.max === undefined ? {} : { max: options.max }),
      ...(options.width === undefined ? {} : { width: options.width }),
      ...(options.variant === undefined ? {} : { variant: options.variant }),
      ...(options.status === undefined ? {} : { status: options.status })
    },
    ...interactionProps(options)
  });
}

export function heatmap<TValue, TMessage>(options: HeatmapOptions<TValue, TMessage>): Element<TMessage> {
  return elementFromRenderNode({
    ...optionalId(options.id),
    kind: 'heatmap',
    props: {
      rows: options.rows,
      ...(options.min === undefined ? {} : { min: options.min }),
      ...(options.max === undefined ? {} : { max: options.max }),
      ...(options.selected === undefined ? {} : { selected: options.selected }),
      ...(options.cellWidth === undefined ? {} : { cellWidth: options.cellWidth }),
      ...(options.gap === undefined ? {} : { gap: options.gap }),
      ...(options.status === undefined ? {} : { status: options.status }),
      ...(options.valueScale === undefined ? {} : { valueScale: options.valueScale }),
      ...(options.emptyText === undefined ? {} : { emptyText: options.emptyText }),
      ...(options.loadingText === undefined ? {} : { loadingText: options.loadingText }),
      ...(options.errorText === undefined ? {} : { errorText: options.errorText }),
      ...(options.onSelect === undefined ? {} : { toMessage: options.onSelect })
    },
    ...interactionProps(options)
  });
}

export function spinner(options: SpinnerOptions = {}): Element<never> {
  return elementFromRenderNode({
    ...optionalId(options.id),
    kind: 'spinner',
    props: {
      ...(options.frames === undefined ? {} : { frames: options.frames }),
      ...(options.frameIndex === undefined ? {} : { frameIndex: options.frameIndex }),
      ...(options.label === undefined ? {} : { label: options.label }),
      ...(options.status === undefined ? {} : { status: options.status })
    },
    ...interactionProps(options)
  });
}

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
  componentMetaProps,
  interactionProps,
  mergeKeyBindings,
  withMetaDefaults
} from '../factory-internals/interaction.ts';
import { optionalId, requiredId } from '../factory-internals/render-node.ts';
import {
  heatmapRowsForRenderer,
  heatmapSelectionHandler
} from '../factory-internals/domain.ts';
import type {
  ComponentKeyBindingMessages,
  IndependentInteractionOptions,
  InferredComponentKeyBindings
} from '../factory-internals/messages.ts';
import type { NotificationStackAction } from '../notification-stack.ts';

export function notificationStack<
  const TActionMessage = never,
  const TKeys extends InferredComponentKeyBindings | undefined = undefined
>(
  options: IndependentInteractionOptions<
    NotificationStackOptions,
    { readonly onAction: TActionMessage },
    Record<never, never>,
    TKeys
  >
): Element<TActionMessage | ComponentKeyBindingMessages<TKeys>>;
export function notificationStack(options: NotificationStackOptions<unknown>): Element<unknown> {
  const meta = withMetaDefaults(options.meta, { focus: { disabled: true } });
  const onAction = options.onAction;
  const generated = onAction === undefined ? undefined : {
    arrowUp: () => onAction({ kind: 'move', delta: -1 }),
    arrowDown: () => onAction({ kind: 'move', delta: 1 }),
    delete: () => options.selected === undefined
      ? undefined
      : onAction({ kind: 'dismiss', id: options.selected })
  } satisfies import('../options/base.ts').ComponentKeyBindings<unknown>;
  const keyMap = mergeKeyBindings(generated, options.keys);
  return elementFromRenderNode<'notificationStack', unknown>({
    ...requiredId(options.id, 'notificationStack'),
    kind: 'notificationStack',
    props: {
      items: options.items,
      ...(options.selected === undefined ? {} : { selected: options.selected }),
      ...(options.placement === undefined ? {} : { placement: options.placement }),
      ...(options.maxWidth === undefined ? {} : { maxWidth: options.maxWidth }),
      ...(onAction === undefined ? {} : {
        toActionMessage: (action: NotificationStackAction) => onAction(action)
      })
    },
    ...interactionProps({ keys: keyMap, meta })
  });
}

export function statusBar(options: StatusBarOptions<never>): Element;
export function statusBar<
  const TPressMessage = never,
  const TKeys extends InferredComponentKeyBindings | undefined = undefined
>(
  options: IndependentInteractionOptions<
    StatusBarOptions<never>,
    Record<never, never>,
    { readonly onPress: TPressMessage },
    TKeys
  >
): Element<TPressMessage | ComponentKeyBindingMessages<TKeys>>;
export function statusBar(options: StatusBarOptions<unknown>): Element<unknown> {
  const keyMap = activationKeyBindings(
    options.onPress === undefined ? undefined : () => options.onPress,
    options.keys
  );
  return elementFromRenderNode<'statusBar', unknown>({
    ...requiredId(options.id, 'statusBar'),
    kind: 'statusBar',
    props: { text: options.text },
    ...(keyMap === undefined ? {} : { keyMap }),
    ...interactionProps({ meta: options.meta })
  });
}

export function helpBar(options: HelpBarOptions): Element {
  return elementFromRenderNode<'helpBar'>({
    ...optionalId(options.id),
    kind: 'helpBar',
    props: { bindings: options.bindings },
    ...componentMetaProps(options.meta)
  });
}

export function activityIndicator(options: ActivityIndicatorOptions = {}): Element {
  return elementFromRenderNode<'activityIndicator'>({
    ...optionalId(options.id),
    kind: 'activityIndicator',
    props: {
      ...(options.label === undefined ? {} : { label: options.label }),
      ...(options.status === undefined ? {} : { status: options.status })
    },
    ...componentMetaProps(options.meta)
  });
}

export function progressBar(options: ProgressBarOptions): Element {
  return elementFromRenderNode<'progressBar'>({
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
    ...componentMetaProps(options.meta)
  });
}

export function sparkline(options: SparklineOptions): Element {
  return elementFromRenderNode<'sparkline'>({
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
    ...componentMetaProps(options.meta)
  });
}

export function barChart(options: BarChartOptions): Element {
  return elementFromRenderNode<'barChart'>({
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
    ...componentMetaProps(options.meta)
  });
}

export function chart<const TMessage = never>(options: ChartOptions<TMessage>): Element<TMessage> {
  return elementFromRenderNode<'chart', TMessage>({
    ...requiredId(options.id, 'chart'),
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

export function gauge(options: GaugeOptions): Element {
  return elementFromRenderNode<'gauge'>({
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
    ...componentMetaProps(options.meta)
  });
}

export function heatmap<TValue, const TMessage = never>(options: HeatmapOptions<TValue, TMessage>): Element<TMessage> {
  const toMessage = heatmapSelectionHandler(options.onSelect);
  return elementFromRenderNode<'heatmap', TMessage>({
    ...requiredId(options.id, 'heatmap'),
    kind: 'heatmap',
    props: {
      rows: heatmapRowsForRenderer(options.rows),
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
      ...(toMessage === undefined ? {} : { toMessage })
    },
    ...interactionProps(options)
  });
}

export function spinner(options: SpinnerOptions = {}): Element {
  return elementFromRenderNode<'spinner'>({
    ...optionalId(options.id),
    kind: 'spinner',
    props: {
      ...(options.frames === undefined ? {} : { frames: options.frames }),
      ...(options.frameIndex === undefined ? {} : { frameIndex: options.frameIndex }),
      ...(options.label === undefined ? {} : { label: options.label }),
      ...(options.status === undefined ? {} : { status: options.status })
    },
    ...componentMetaProps(options.meta)
  });
}

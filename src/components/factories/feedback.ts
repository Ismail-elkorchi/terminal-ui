import { elementFromRenderNode } from '../../renderer/model/element.ts';
import type { Element } from '../../element/index.ts';
import type {
  StatusIndicatorOptions,
  BarChartOptions,
  ChartOptions,
  MeterOptions,
  HeatmapOptions,
  HelpBarOptions,
  LiveNotificationStackOptions,
  NotificationHistoryOptions,
  NotificationStackOptions,
  ProgressBarOptions,
  SparklineOptions,
  SpinnerOptions,
  StatusBarOptions
} from '../options/feedback.ts';
import {
  componentMetaProps,
  interactionProps,
  mergeKeyBindings,
  withMetaDefaults
} from '../internal/interaction.ts';
import { optionalId, requiredId } from '../../authoring/render-node.ts';
import { heatmapRowsForRenderer } from '../internal/domain.ts';
import type {
  ComponentKeyBindingMessages,
  IndependentInteractionOptions,
  InferredElementKeyBindings
} from '../internal/messages.ts';
import { normalizeInlineContent } from '../../visual/inline-content.ts';
import type { NotificationStackAction } from '../../ui-model/notification-stack.ts';
import type { BarChartAction, ChartAction, HeatmapAction } from '../../ui-model/visualization.ts';
import { resolveStableIds } from '../internal/identity.ts';

export function notificationStack<
  const TDismissMessage = never,
  const TPointerMessage = never,
>(
  options: IndependentInteractionOptions<
    LiveNotificationStackOptions,
    { readonly onDismiss: TDismissMessage },
    Record<never, never>,
    undefined,
    TPointerMessage
  >
): Element<TDismissMessage | TPointerMessage>;
export function notificationStack<
  const TActionMessage,
  const TPointerMessage = never,
  const TKeys extends InferredElementKeyBindings | undefined = undefined
>(
  options: IndependentInteractionOptions<
    NotificationHistoryOptions,
    { readonly onAction: TActionMessage },
    Record<never, never>,
    TKeys,
    TPointerMessage
  > & {
    readonly onAction: (action: NotificationStackAction) => TActionMessage;
  }
): Element<TActionMessage | TPointerMessage | ComponentKeyBindingMessages<TKeys>>;
export function notificationStack(rawOptions: object): Element<unknown> {
  const options = rawOptions as NotificationStackOptions<unknown>;
  const onAction = 'onAction' in options ? options.onAction : undefined;
  const onDismiss = 'onDismiss' in options ? options.onDismiss : undefined;
  const keys = 'keys' in options ? options.keys : undefined;
  const meta = withMetaDefaults(options.meta, {
    focus: { disabled: options.presentation.kind === 'live' }
  });
  const generated = onAction === undefined || options.presentation.kind !== 'history' ? undefined : {
    arrowUp: () => onAction({ kind: 'move', delta: -1 }),
    arrowDown: () => onAction({ kind: 'move', delta: 1 }),
    delete: () => options.presentation.kind !== 'history' || options.presentation.selected === undefined
      ? undefined
      : onAction({ kind: 'dismiss', id: options.presentation.selected })
  } satisfies import('../../element/metadata.ts').ElementKeyBindings<unknown>;
  const keyMap = onAction === undefined
    ? undefined
    : mergeKeyBindings(generated, keys);
  resolveStableIds(options.presentation.items, (item) => item.id, 'notificationStack');
  return elementFromRenderNode<'notificationStack', unknown>({
    ...requiredId(options.id, 'notificationStack'),
    kind: 'notificationStack',
    props: {
      presentation: options.presentation,
      ...(options.placement === undefined ? {} : { placement: options.placement }),
      ...(options.maxWidth === undefined ? {} : { maxWidth: options.maxWidth }),
      ...(onDismiss === undefined ? {} : { toDismissMessage: onDismiss }),
      ...(onAction === undefined
        ? {}
        : { toActionMessage: (action: NotificationStackAction) => onAction(action) })
    },
    ...interactionProps({ keys: keyMap, pointer: options.pointer, meta })
  });
}

export function statusBar(options: StatusBarOptions): Element {
  const leading = normalizedStatusItems(options.leading ?? []);
  const center = normalizedStatusItems(options.center ?? []);
  const trailing = normalizedStatusItems(options.trailing ?? []);
  resolveStableIds([...leading, ...center, ...trailing], (item) => item.id, 'statusBar');
  return elementFromRenderNode<'statusBar'>({
    ...requiredId(options.id, 'statusBar'),
    kind: 'statusBar',
    props: { leading, center, trailing },
    ...componentMetaProps(options.meta)
  });
}

function normalizedStatusItems(
  items: readonly import('../../ui-model/feedback.ts').StatusBarItem[]
): readonly import('../../ui-model/feedback.ts').StatusBarItem[] {
  return items.map((item) => ({
    ...item,
    ...(item.leading === undefined ? {} : { leading: normalizeInlineContent(item.leading) }),
    ...(item.trailing === undefined ? {} : { trailing: normalizeInlineContent(item.trailing) })
  }));
}

export function helpBar(options: HelpBarOptions): Element {
  resolveStableIds(options.groups, (group) => group.id, 'helpBar');
  return elementFromRenderNode<'helpBar'>({
    ...optionalId(options.id),
    kind: 'helpBar',
    props: { groups: options.groups },
    ...componentMetaProps(options.meta)
  });
}

export function statusIndicator(options: StatusIndicatorOptions = {}): Element {
  return elementFromRenderNode<'statusIndicator'>({
    ...optionalId(options.id),
    kind: 'statusIndicator',
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

export function barChart<
  const TActionMessage = never,
  const TPointerMessage = never,
  const TKeys extends InferredElementKeyBindings | undefined = undefined
>(
  options: IndependentInteractionOptions<
    BarChartOptions,
    { readonly onAction: TActionMessage },
    Record<never, never>,
    TKeys,
    TPointerMessage
  >
): Element<TActionMessage | TPointerMessage | ComponentKeyBindingMessages<TKeys>>;
export function barChart(options: BarChartOptions<unknown>): Element<unknown> {
  resolveStableIds(options.items, (item) => item.id, 'barChart');
  const onAction = options.onAction;
  const selectedIndex = options.items.findIndex((item) => item.id === options.selectedId);
  const generated = onAction === undefined ? undefined : {
    arrowUp: () => onAction({ kind: 'move', delta: -1 }),
    arrowDown: () => onAction({ kind: 'move', delta: 1 }),
    home: () => onAction({ kind: 'first' }),
    end: () => onAction({ kind: 'last' }),
    enter: () => selectedIndex < 0
      ? undefined
      : onAction({ kind: 'activate', id: options.items[selectedIndex]?.id ?? '', index: selectedIndex })
  } satisfies import('../../element/metadata.ts').ElementKeyBindings<unknown>;
  return elementFromRenderNode<'barChart', unknown>({
    ...requiredId(options.id, 'barChart'),
    kind: 'barChart',
    props: {
      items: options.items,
      ...(options.max === undefined ? {} : { max: options.max }),
      ...(options.selectedId === undefined ? {} : { selectedId: options.selectedId }),
      ...(options.status === undefined ? {} : { status: options.status }),
      ...(options.emptyText === undefined ? {} : { emptyText: options.emptyText }),
      ...(options.loadingText === undefined ? {} : { loadingText: options.loadingText }),
      ...(options.errorText === undefined ? {} : { errorText: options.errorText }),
      ...(onAction === undefined ? {} : { toActionMessage: (action: BarChartAction) => onAction(action) })
    },
    ...interactionProps({ ...options, keys: mergeKeyBindings(generated, options.keys) })
  });
}

export function chart<const TMessage = never>(options: ChartOptions<TMessage>): Element<TMessage> {
  const onAction = options.onAction;
  const selected = options.selected;
  const generated = onAction === undefined ? undefined : {
    arrowLeft: () => onAction({ kind: 'movePoint', delta: -1 }),
    arrowRight: () => onAction({ kind: 'movePoint', delta: 1 }),
    arrowUp: () => onAction({ kind: 'moveSeries', delta: -1 }),
    arrowDown: () => onAction({ kind: 'moveSeries', delta: 1 }),
    pageUp: () => onAction({ kind: 'pagePoints', delta: -1 }),
    pageDown: () => onAction({ kind: 'pagePoints', delta: 1 }),
    home: () => onAction({ kind: 'firstPoint' }),
    end: () => onAction({ kind: 'lastPoint' }),
    enter: () => selected === undefined
      ? undefined
      : onAction({ kind: 'select', series: selected.series, point: selected.point })
  } satisfies import('../../element/metadata.ts').ElementKeyBindings<TMessage>;
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
      ...(onAction === undefined ? {} : {
        toActionMessage: (action: ChartAction) => onAction(action)
      })
    },
    ...interactionProps({ ...options, keys: mergeKeyBindings(generated, options.keys) })
  });
}

export function meter(options: MeterOptions): Element {
  return elementFromRenderNode<'meter'>({
    ...optionalId(options.id),
    kind: 'meter',
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
  const onAction = options.onAction;
  const selected = options.selected;
  const generated = onAction === undefined ? undefined : {
    arrowUp: () => onAction({ kind: 'move', rows: -1, columns: 0 }),
    arrowDown: () => onAction({ kind: 'move', rows: 1, columns: 0 }),
    arrowLeft: () => onAction({ kind: 'move', rows: 0, columns: -1 }),
    arrowRight: () => onAction({ kind: 'move', rows: 0, columns: 1 }),
    pageUp: () => onAction({ kind: 'pageRows', delta: -1 }),
    pageDown: () => onAction({ kind: 'pageRows', delta: 1 }),
    home: () => onAction({ kind: 'first' }),
    end: () => onAction({ kind: 'last' }),
    enter: () => selected === undefined
      ? undefined
      : onAction({ kind: 'select', row: selected.row, column: selected.column })
  } satisfies import('../../element/metadata.ts').ElementKeyBindings<TMessage>;
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
      ...(onAction === undefined ? {} : {
        toActionMessage: (action: HeatmapAction) => onAction(action)
      })
    },
    ...interactionProps({ ...options, keys: mergeKeyBindings(generated, options.keys) })
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

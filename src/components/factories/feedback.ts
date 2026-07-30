import { componentElementFromRenderNode } from '../../renderer/model/element.ts';
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
import { optionalRenderNodeId, requiredRenderNodeId } from '../../renderer/model/element.ts';
import { ignoreMessage } from '../../interaction/message.ts';
import type {
  ComponentKeyBindingMessages,
  IndependentInteractionOptions,
  InferredElementKeyBindings
} from '../internal/messages.ts';
import { normalizeInlineContent } from '../../visual/inline-content.ts';
import type {
  NotificationStackAction,
  NotificationStackPresentation
} from '../../ui-model/notification-stack.ts';
import type { NotificationItem, StatusBarItem } from '../../ui-model/feedback.ts';
import type { BarChartAction, ChartAction, HeatmapAction } from '../../ui-model/visualization.ts';
import { resolveStableIds } from '../../ui-model/identity.ts';
import {
  isNotificationTone,
  isProcessStatus,
  isStatusBarStatus
} from '../../ui-model/status.ts';
import { sanitizeTerminalText } from '../../text/index.ts';
import { assertOptionalEnum, assertOptionalFiniteNumber } from '../../foundation/validation.ts';

export function notificationStack<
  const TDismissMessage = never,
  const TPointerMessage = never,
>(
  options: IndependentInteractionOptions<
    LiveNotificationStackOptions,
    { readonly onDismiss: TDismissMessage },
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
    TKeys,
    TPointerMessage
  > & {
    readonly onAction: (action: NotificationStackAction) => TActionMessage;
  }
): Element<TActionMessage | TPointerMessage | ComponentKeyBindingMessages<TKeys>>;
export function notificationStack(rawOptions: object): Element<unknown> {
  const options = rawOptions as NotificationStackOptions<unknown>;
  const presentation = normalizeNotificationPresentation(options.presentation);
  assertOptionalEnum(
    options.placement,
    ['top-right', 'bottom-right', 'centered-stack'],
    'notificationStack placement'
  );
  assertOptionalFiniteNumber(options.maxWidth, 'notificationStack maxWidth');
  const onAction = 'onAction' in options ? options.onAction : undefined;
  const onDismiss = 'onDismiss' in options ? options.onDismiss : undefined;
  const keys = 'keys' in options ? options.keys : undefined;
  const meta = withMetaDefaults(options.meta, {
    focus: { disabled: presentation.kind === 'live' }
  });
  const generated = onAction === undefined || presentation.kind !== 'history' ? undefined : {
    arrowUp: () => onAction({ kind: 'move', delta: -1 }),
    arrowDown: () => onAction({ kind: 'move', delta: 1 }),
    delete: () => presentation.selected === undefined
      ? undefined
      : onAction({ kind: 'dismiss', id: presentation.selected })
  } satisfies import('../../element/metadata.ts').ElementKeyBindings<unknown>;
  const keyMap = onAction === undefined
    ? undefined
    : mergeKeyBindings(generated, keys);
  resolveStableIds(presentation.items, (item) => item.id, 'notificationStack');
  return componentElementFromRenderNode<'notificationStack', unknown>({
    ...requiredRenderNodeId(options.id, 'notificationStack'),
    kind: 'notificationStack',
    props: {
      presentation,
      ...(options.placement === undefined ? {} : { placement: options.placement }),
      ...(options.maxWidth === undefined ? {} : { maxWidth: options.maxWidth }),
      ...(onDismiss === undefined ? {} : { toDismissMessage: onDismiss }),
      ...(onAction === undefined
        ? {}
        : { toActionMessage: (action: NotificationStackAction) => onAction(action) })
    },
    ...interactionProps({ keys: keyMap, pointer: options.pointer, meta })
  }, keyMap !== undefined);
}

export function statusBar(options: StatusBarOptions): Element {
  const leading = normalizedStatusItems(options.leading ?? []);
  const center = normalizedStatusItems(options.center ?? []);
  const trailing = normalizedStatusItems(options.trailing ?? []);
  resolveStableIds([...leading, ...center, ...trailing], (item) => item.id, 'statusBar');
  return componentElementFromRenderNode<'statusBar'>({
    ...requiredRenderNodeId(options.id, 'statusBar'),
    kind: 'statusBar',
    props: { leading, center, trailing },
    ...componentMetaProps(options.meta)
  }, false);
}

function normalizedStatusItems(
  items: readonly StatusBarItem[]
): readonly StatusBarItem[] {
  return items.map((item) => {
    assertStatusBarItem(item);
    return {
      ...item,
      id: sanitizeTerminalText(item.id).text,
      text: sanitizeTerminalText(item.text).text,
      ...(item.leading === undefined ? {} : { leading: normalizeInlineContent(item.leading) }),
      ...(item.trailing === undefined ? {} : { trailing: normalizeInlineContent(item.trailing) })
    };
  });
}

export function helpBar(options: HelpBarOptions): Element {
  resolveStableIds(options.groups, (group) => group.id, 'helpBar');
  return componentElementFromRenderNode<'helpBar'>({
    ...optionalRenderNodeId(options.id),
    kind: 'helpBar',
    props: { groups: options.groups },
    ...componentMetaProps(options.meta)
  }, false);
}

export function statusIndicator(options: StatusIndicatorOptions = {}): Element {
  assertProcessStatus(options.status, 'statusIndicator');
  return componentElementFromRenderNode<'statusIndicator'>({
    ...optionalRenderNodeId(options.id),
    kind: 'statusIndicator',
    props: {
      ...(options.label === undefined ? {} : { label: options.label }),
      ...(options.status === undefined ? {} : { status: options.status })
    },
    ...componentMetaProps(options.meta)
  }, false);
}

export function progressBar(options: ProgressBarOptions): Element {
  assertProgressBarMode(options.mode);
  assertProcessStatus(options.status, 'progressBar');
  assertOptionalEnum(
    options.display,
    ['bar', 'bar+percent', 'bar+value', 'bar+value+percent'],
    'progressBar display'
  );
  assertOptionalEnum(options.labelPosition, ['start', 'end', 'none'], 'progressBar labelPosition');
  const barWidth = normalizedProgressBarWidth(options.barWidth);
  const elapsedMs = normalizedDuration(options.elapsedMs, 'progressBar elapsedMs');
  const remainingMs = normalizedDuration(options.remainingMs, 'progressBar remainingMs');
  return componentElementFromRenderNode<'progressBar'>({
    ...optionalRenderNodeId(options.id),
    kind: 'progressBar',
    props: {
      ...(options.label === undefined ? {} : { label: options.label }),
      mode: options.mode,
      ...(barWidth === undefined ? {} : { barWidth }),
      ...(options.display === undefined ? {} : { display: options.display }),
      ...(options.labelPosition === undefined ? {} : { labelPosition: options.labelPosition }),
      ...(elapsedMs === undefined ? {} : { elapsedMs }),
      ...(remainingMs === undefined ? {} : { remainingMs }),
      ...(options.status === undefined ? {} : { status: options.status }),
      ...(options.valueScale === undefined ? {} : { valueScale: options.valueScale })
    },
    ...componentMetaProps(options.meta)
  }, false);
}

function assertProgressBarMode(mode: ProgressBarOptions['mode']): void {
  if (mode.kind === 'indeterminate') {
    if (mode.frame !== undefined && !Number.isFinite(mode.frame)) {
      throw new RangeError('progressBar indeterminate frame must be finite when provided.');
    }
    return;
  }
  if (!Number.isFinite(mode.value)) {
    throw new RangeError('progressBar determinate value must be finite.');
  }
  if (mode.max !== undefined && (!Number.isFinite(mode.max) || mode.max <= 0)) {
    throw new RangeError('progressBar determinate max must be finite and greater than zero.');
  }
}

function normalizedProgressBarWidth(value: unknown): number | undefined {
  assertOptionalFiniteNumber(value, 'progressBar barWidth');
  if (value === undefined) return undefined;
  if (value <= 0) throw new RangeError('progressBar barWidth must be greater than zero.');
  return Math.max(1, Math.min(120, Math.floor(value)));
}

function normalizedDuration(value: unknown, label: string): number | undefined {
  assertOptionalFiniteNumber(value, label);
  if (value === undefined) return undefined;
  if (value < 0) throw new RangeError(`${label} must be non-negative.`);
  return Math.floor(value);
}

export function sparkline(options: SparklineOptions): Element {
  assertChartDataState(options.dataState, 'sparkline');
  return componentElementFromRenderNode<'sparkline'>({
    ...optionalRenderNodeId(options.id),
    kind: 'sparkline',
    props: {
      values: options.values,
      ...(options.min === undefined ? {} : { min: options.min }),
      ...(options.max === undefined ? {} : { max: options.max }),
      ...(options.dataState === undefined ? {} : { dataState: options.dataState }),
      ...(options.valueScale === undefined ? {} : { valueScale: options.valueScale }),
      ...(options.emptyText === undefined ? {} : { emptyText: options.emptyText }),
      ...(options.loadingText === undefined ? {} : { loadingText: options.loadingText }),
      ...(options.errorText === undefined ? {} : { errorText: options.errorText })
    },
    ...componentMetaProps(options.meta)
  }, false);
}

export function barChart<
  const TActionMessage = never,
  const TPointerMessage = never,
  const TKeys extends InferredElementKeyBindings | undefined = undefined
>(
  options: IndependentInteractionOptions<
    BarChartOptions,
    { readonly onAction: TActionMessage },
    TKeys,
    TPointerMessage
  >
): Element<TActionMessage | TPointerMessage | ComponentKeyBindingMessages<TKeys>>;
export function barChart(options: BarChartOptions<unknown>): Element<unknown> {
  assertChartDataState(options.dataState, 'barChart');
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
      : onAction({ kind: 'activate', id: options.items[selectedIndex]?.id ?? '', itemIndex: selectedIndex })
  } satisfies import('../../element/metadata.ts').ElementKeyBindings<unknown>;
  const keyMap = mergeKeyBindings(generated, options.keys);
  return componentElementFromRenderNode<'barChart', unknown>({
    ...requiredRenderNodeId(options.id, 'barChart'),
    kind: 'barChart',
    props: {
      items: options.items,
      ...(options.max === undefined ? {} : { max: options.max }),
      ...(options.selectedId === undefined ? {} : { selectedId: options.selectedId }),
      ...(options.dataState === undefined ? {} : { dataState: options.dataState }),
      ...(options.emptyText === undefined ? {} : { emptyText: options.emptyText }),
      ...(options.loadingText === undefined ? {} : { loadingText: options.loadingText }),
      ...(options.errorText === undefined ? {} : { errorText: options.errorText }),
      ...(onAction === undefined ? {} : { toActionMessage: (action: BarChartAction) => onAction(action) })
    },
    ...interactionProps({ ...options, keys: keyMap })
  }, keyMap !== undefined);
}

export function chart<const TMessage = never>(options: ChartOptions<TMessage>): Element<TMessage> {
  assertChartDataState(options.dataState, 'chart');
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
      ? ignoreMessage()
      : onAction({ kind: 'select', series: selected.series, pointIndex: selected.pointIndex })
  } satisfies import('../../element/metadata.ts').ElementKeyBindings<TMessage>;
  const keyMap = mergeKeyBindings(generated, options.keys);
  return componentElementFromRenderNode<'chart', TMessage>({
    ...requiredRenderNodeId(options.id, 'chart'),
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
      ...(options.dataState === undefined ? {} : { dataState: options.dataState }),
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
    ...interactionProps({ ...options, keys: keyMap })
  }, keyMap !== undefined);
}

export function meter(options: MeterOptions): Element {
  assertMeterResult(options.result);
  return componentElementFromRenderNode<'meter'>({
    ...optionalRenderNodeId(options.id),
    kind: 'meter',
    props: {
      ...(options.label === undefined ? {} : { label: options.label }),
      value: options.value,
      ...(options.min === undefined ? {} : { min: options.min }),
      ...(options.max === undefined ? {} : { max: options.max }),
      ...(options.width === undefined ? {} : { width: options.width }),
      ...(options.variant === undefined ? {} : { variant: options.variant }),
      ...(options.result === undefined ? {} : { result: options.result })
    },
    ...componentMetaProps(options.meta)
  }, false);
}

export function heatmap<TValue, const TMessage = never>(options: HeatmapOptions<TValue, TMessage>): Element<TMessage> {
  assertChartDataState(options.dataState, 'heatmap');
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
      ? ignoreMessage()
      : onAction({
          kind: 'select',
          rowIndex: selected.rowIndex,
          columnIndex: selected.columnIndex
        })
  } satisfies import('../../element/metadata.ts').ElementKeyBindings<TMessage>;
  const keyMap = mergeKeyBindings(generated, options.keys);
  return componentElementFromRenderNode<'heatmap', TMessage>({
    ...requiredRenderNodeId(options.id, 'heatmap'),
    kind: 'heatmap',
    props: {
      rows: options.rows,
      ...(options.min === undefined ? {} : { min: options.min }),
      ...(options.max === undefined ? {} : { max: options.max }),
      ...(options.selected === undefined ? {} : { selected: options.selected }),
      ...(options.cellWidth === undefined ? {} : { cellWidth: options.cellWidth }),
      ...(options.gap === undefined ? {} : { gap: options.gap }),
      ...(options.dataState === undefined ? {} : { dataState: options.dataState }),
      ...(options.valueScale === undefined ? {} : { valueScale: options.valueScale }),
      ...(options.emptyText === undefined ? {} : { emptyText: options.emptyText }),
      ...(options.loadingText === undefined ? {} : { loadingText: options.loadingText }),
      ...(options.errorText === undefined ? {} : { errorText: options.errorText }),
      ...(onAction === undefined ? {} : {
        toActionMessage: (action: HeatmapAction) => onAction(action)
      })
    },
    ...interactionProps({ ...options, keys: keyMap })
  }, keyMap !== undefined);
}

export function spinner(options: SpinnerOptions = {}): Element {
  assertProcessStatus(options.status, 'spinner');
  return componentElementFromRenderNode<'spinner'>({
    ...optionalRenderNodeId(options.id),
    kind: 'spinner',
    props: {
      ...(options.frames === undefined ? {} : { frames: options.frames }),
      ...(options.frameIndex === undefined ? {} : { frameIndex: options.frameIndex }),
      ...(options.label === undefined ? {} : { label: options.label }),
      ...(options.status === undefined ? {} : { status: options.status })
    },
    ...componentMetaProps(options.meta)
  }, false);
}

function normalizeNotificationPresentation(
  value: NotificationStackPresentation
): NotificationStackPresentation {
  const items = Object.freeze(value.items.map(normalizeNotificationItem));
  const kind: unknown = value.kind;
  if (kind === 'live') return Object.freeze({ kind: 'live', items });
  if (kind !== 'history') {
    throw new TypeError('notificationStack presentation kind must be live or history.');
  }
  const history = value as Extract<NotificationStackPresentation, { readonly kind: 'history' }>;
  return Object.freeze({
    kind: 'history',
    items,
    ...(history.selected === undefined ? {} : { selected: sanitizeLine(history.selected) })
  });
}

function normalizeNotificationItem(value: NotificationItem): NotificationItem {
  if (value.id.trim().length === 0) throw new TypeError('Notification item id must not be empty.');
  if (value.tone !== undefined && !isNotificationTone(value.tone)) {
    throw new TypeError('Notification item tone is invalid.');
  }
  if (value.progress !== undefined && !Number.isFinite(value.progress)) {
    throw new RangeError('Notification item progress must be finite when provided.');
  }
  return Object.freeze({
    id: sanitizeLine(value.id),
    title: sanitizeLine(value.title),
    ...(value.message === undefined ? {} : { message: sanitizeLine(value.message) }),
    ...(value.tone === undefined ? {} : { tone: value.tone }),
    ...(value.progress === undefined ? {} : { progress: value.progress }),
    ...(value.detail === undefined ? {} : { detail: sanitizeLine(value.detail) }),
    ...(value.dismissible === undefined ? {} : { dismissible: value.dismissible })
  });
}

function sanitizeLine(value: string): string {
  return sanitizeTerminalText(value).text.replace(/\s*\n\s*/gu, ' ');
}

function assertChartDataState(value: unknown, component: string): void {
  if (value === undefined || value === 'loading' || value === 'error') return;
  throw new TypeError(`${component} dataState must be loading or error.`);
}

function assertMeterResult(value: unknown): void {
  if (value === undefined || value === 'success' || value === 'warning' || value === 'error') return;
  throw new TypeError('meter result must be success, warning, or error.');
}

function assertStatusBarItem(item: StatusBarItem): void {
  const candidate: { readonly kind?: unknown; readonly status?: unknown } = item;
  if (candidate.kind === 'text') return;
  if (candidate.kind === 'status' && isStatusBarStatus(candidate.status)) return;
  throw new TypeError('statusBar item kind or status is invalid.');
}

function assertProcessStatus(value: unknown, component: string): void {
  if (value === undefined || isProcessStatus(value)) return;
  throw new TypeError(`${component} status must be idle, running, success, warning, or error.`);
}

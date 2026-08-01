import { componentElementFromRenderNode } from '../../renderer/model/element.ts';
import type { Element } from '../../element/index.ts';
import type {
  ActivityIndicatorOptions,
  BarChartOptions,
  ChartOptions,
  MeterOptions,
  HeatmapOptions,
  HelpBarOptions,
  NotificationHistoryOptions,
  NotificationRegionOptions,
  ProgressBarOptions,
  SparklineOptions,
  StatusBarOptions
} from '../options/feedback.ts';
import {
  componentMetaProps,
  interactionProps,
  mergeKeyBindings
} from '../internal/interaction.ts';
import { optionalRenderNodeId, requiredRenderNodeId } from '../../renderer/model/element.ts';
import { ignoreMessage } from '../../interaction/message.ts';
import type {
  ComponentKeyBindingMessages,
  IndependentInteractionOptions,
  InferredElementKeyBindings
} from '../internal/messages.ts';
import { normalizeInlineContent } from '../../visual/inline-content.ts';
import type { NotificationHistoryAction } from '../../ui-model/notification.ts';
import type {
  NotificationItem,
  StatusBarItem
} from '../../ui-model/feedback.ts';
import type { BarChartAction, ChartAction, HeatmapAction } from '../../ui-model/visualization.ts';
import { resolveStableIds } from '../../ui-model/identity.ts';
import {
  isNotificationTone,
  isProcessStatus,
  isStatusBarStatus
} from '../../ui-model/status.ts';
import { sanitizeTerminalText } from '../../text/index.ts';
import {
  assertFiniteNumber,
  assertOptionalEnum,
  assertOptionalFiniteNumber,
  isNonArrayObject
} from '../../foundation/validation.ts';
import { isThemeColorToken } from '../../visual/color.ts';

export function notificationRegion<const TMessage = never>(
  options: NotificationRegionOptions<TMessage>
): Element<TMessage> {
  const items = Object.freeze(options.items.map(normalizeNotificationItem));
  assertNotificationLayout(options, 'notificationRegion');
  resolveStableIds(items, (item) => item.id, 'notificationRegion');
  return componentElementFromRenderNode<'notificationRegion', TMessage>({
    ...requiredRenderNodeId(options.id, 'notificationRegion'),
    kind: 'notificationRegion',
    props: {
      items,
      ...(options.placement === undefined ? {} : { placement: options.placement }),
      ...(options.maxWidth === undefined ? {} : { maxWidth: options.maxWidth }),
      ...(options.onDismiss === undefined
        ? {}
        : { toDismissMessage: options.onDismiss })
    },
    ...(options.onDismiss !== undefined
      && items.some((item) => item.dismissible !== false)
      ? { focusable: true }
      : {}),
    ...interactionProps({
      pointer: options.pointer,
      meta: options.meta
    })
  });
}

export function notificationHistory<const TMessage = never>(
  options: NotificationHistoryOptions<TMessage>
): Element<TMessage> {
  if (typeof options.onAction !== 'function') {
    throw new TypeError('notificationHistory requires an onAction function.');
  }
  const items = Object.freeze(options.items.map(normalizeNotificationItem));
  assertNotificationLayout(options, 'notificationHistory');
  resolveStableIds(items, (item) => item.id, 'notificationHistory');
  const generated = {
    arrowUp: () => options.onAction({ kind: 'move', delta: -1 }),
    arrowDown: () => options.onAction({ kind: 'move', delta: 1 }),
    home: () => options.onAction({ kind: 'first' }),
    end: () => options.onAction({ kind: 'last' }),
    delete: () => options.selectedId === undefined
      ? ignoreMessage()
      : options.onAction({ kind: 'remove', id: options.selectedId })
  } satisfies import('../../element/metadata.ts').ElementKeyBindings<TMessage>;
  const keyMap = mergeKeyBindings(generated, options.keys);
  return componentElementFromRenderNode<'notificationHistory', TMessage>({
    ...requiredRenderNodeId(options.id, 'notificationHistory'),
    kind: 'notificationHistory',
    props: {
      items,
      ...(options.selectedId === undefined
        ? {}
        : { selectedId: options.selectedId }),
      ...(options.placement === undefined ? {} : { placement: options.placement }),
      ...(options.maxWidth === undefined ? {} : { maxWidth: options.maxWidth }),
      toActionMessage: (action: NotificationHistoryAction) =>
        options.onAction(action)
    },
    focusable: true,
    ...interactionProps({
      keys: keyMap,
      pointer: options.pointer,
      meta: options.meta
    })
  });
}

function assertNotificationLayout(
  options: Pick<NotificationRegionOptions<unknown>, 'placement' | 'maxWidth'>,
  name: string
): void {
  assertOptionalEnum(
    options.placement,
    ['top-right', 'bottom-right', 'centered-stack'],
    `${name} placement`
  );
  assertOptionalFiniteNumber(options.maxWidth, `${name} maxWidth`);
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
  });
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
    ...requiredRenderNodeId(options.id, 'helpBar'),
    kind: 'helpBar',
    props: { groups: options.groups },
    ...componentMetaProps(options.meta)
  });
}

export function activityIndicator(options: ActivityIndicatorOptions): Element {
  assertProcessStatus(options.status, 'activityIndicator');
  if (typeof options.label !== 'string' || options.label.trim() === '') {
    throw new TypeError('activityIndicator requires a non-empty label.');
  }
  return componentElementFromRenderNode<'activityIndicator'>({
    ...optionalRenderNodeId(options.id),
    kind: 'activityIndicator',
    props: {
      label: options.label,
      status: options.status,
      ...(options.status !== 'running' || options.frames === undefined
        ? {}
        : { frames: options.frames }),
      ...(options.status !== 'running' || options.frameIndex === undefined
        ? {}
        : { frameIndex: options.frameIndex })
    },
    ...componentMetaProps(options.meta)
  });
}

export function progressBar(options: ProgressBarOptions): Element {
  assertAccessibleLabel(options.label, 'progressBar');
  assertProgressBarMode(options.mode);
  assertValueScale(options.valueScale, 'progressBar');
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
      label: options.label,
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
  });
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
  assertAccessibleLabel(options.label, 'sparkline');
  assertChartDataState(options.dataState, 'sparkline');
  assertFiniteValues(options.values, 'sparkline values');
  assertNumericDomain(options.min, options.max, 'sparkline');
  assertValueScale(options.valueScale, 'sparkline');
  return componentElementFromRenderNode<'sparkline'>({
    ...optionalRenderNodeId(options.id),
    kind: 'sparkline',
    props: {
      label: options.label,
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
    TKeys,
    TPointerMessage
  >
): Element<TActionMessage | TPointerMessage | ComponentKeyBindingMessages<TKeys>>;
export function barChart(options: BarChartOptions<unknown>): Element<unknown> {
  assertAccessibleLabel(options.label, 'barChart');
  assertChartDataState(options.dataState, 'barChart');
  assertOptionalFiniteNumber(options.max, 'barChart max');
  assertArrayValue(options.items, 'barChart items');
  for (const item of options.items) {
    assertStableItem(item, 'barChart item');
  }
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
      label: options.label,
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
  });
}

export function chart<const TMessage = never>(options: ChartOptions<TMessage>): Element<TMessage> {
  assertAccessibleLabel(options.label, 'chart');
  assertChartDataState(options.dataState, 'chart');
  assertNumericDomain(options.min, options.max, 'chart');
  assertValueScale(options.valueScale, 'chart');
  assertOptionalEnum(options.sampleMode, ['one-per-column', 'fit', 'window'], 'chart sampleMode');
  assertOptionalEnum(options.sampleAlign, ['start', 'end'], 'chart sampleAlign');
  assertOptionalEnum(options.interpolation, ['nearest', 'linear'], 'chart interpolation');
  assertArrayValue(options.series, 'chart series');
  for (const series of options.series) {
    assertStableLabel(series.id, series.label, 'chart series');
    assertOptionalEnum(series.kind, ['line', 'scatter', 'area', 'bar'], `chart series "${series.id}" kind`);
    assertOptionalEnum(
      series.sampleMode,
      ['one-per-column', 'fit', 'window'],
      `chart series "${series.id}" sampleMode`
    );
    assertOptionalEnum(series.sampleAlign, ['start', 'end'], `chart series "${series.id}" sampleAlign`);
    assertOptionalEnum(
      series.interpolation,
      ['nearest', 'linear'],
      `chart series "${series.id}" interpolation`
    );
    assertValueScale(series.valueScale, `chart series "${series.id}"`);
    assertArrayValue(series.points, `chart series "${series.id}" points`);
    for (const point of series.points) {
      assertStableItem(point, `chart series "${series.id}" point`);
    }
  }
  resolveStableIds(options.series, (series) => series.id, 'chart series');
  for (const series of options.series) {
    resolveStableIds(series.points, (point) => point.id, `chart series "${series.id}" points`);
  }
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
      : onAction({
          kind: 'select',
          seriesId: selected.seriesId,
          pointId: selected.pointId
        })
  } satisfies import('../../element/metadata.ts').ElementKeyBindings<TMessage>;
  const keyMap = mergeKeyBindings(generated, options.keys);
  return componentElementFromRenderNode<'chart', TMessage>({
    ...requiredRenderNodeId(options.id, 'chart'),
    kind: 'chart',
    props: {
      label: options.label,
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
  });
}

export function meter(options: MeterOptions): Element {
  assertAccessibleLabel(options.label, 'meter');
  assertMeterResult(options.result);
  assertFiniteNumber(options.value, 'meter value');
  assertNumericDomain(options.min, options.max, 'meter');
  assertPositiveSafeInteger(options.width, 'meter width');
  return componentElementFromRenderNode<'meter'>({
    ...optionalRenderNodeId(options.id),
    kind: 'meter',
    props: {
      label: options.label,
      value: options.value,
      ...(options.min === undefined ? {} : { min: options.min }),
      ...(options.max === undefined ? {} : { max: options.max }),
      ...(options.width === undefined ? {} : { width: options.width }),
      ...(options.variant === undefined ? {} : { variant: options.variant }),
      ...(options.result === undefined ? {} : { result: options.result })
    },
    ...componentMetaProps(options.meta)
  });
}

export function heatmap<TValue, const TMessage = never>(options: HeatmapOptions<TValue, TMessage>): Element<TMessage> {
  assertAccessibleLabel(options.label, 'heatmap');
  assertChartDataState(options.dataState, 'heatmap');
  assertNumericDomain(options.min, options.max, 'heatmap');
  assertPositiveSafeInteger(options.cellWidth, 'heatmap cellWidth');
  assertNonNegativeSafeInteger(options.gap, 'heatmap gap');
  assertValueScale(options.valueScale, 'heatmap');
  assertArrayValue(options.rows, 'heatmap rows');
  for (const row of options.rows) {
    assertArrayValue(row, 'heatmap row');
    for (const cell of row) assertStableItem(cell, 'heatmap cell');
  }
  resolveStableIds(options.rows.flat(), (cell) => cell.id, 'heatmap cells');
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
      : onAction({ kind: 'select', id: selected.id })
  } satisfies import('../../element/metadata.ts').ElementKeyBindings<TMessage>;
  const keyMap = mergeKeyBindings(generated, options.keys);
  return componentElementFromRenderNode<'heatmap', TMessage>({
    ...requiredRenderNodeId(options.id, 'heatmap'),
    kind: 'heatmap',
    props: {
      label: options.label,
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
  });
}

function assertAccessibleLabel(value: unknown, component: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${component} requires a non-empty label.`);
  }
}

function assertStableItem(
  value: { readonly id: unknown; readonly label: unknown; readonly value: unknown },
  subject: string
): void {
  assertStableLabel(value.id, value.label, subject);
  assertFiniteNumber(value.value, `${subject} value`);
}

function assertStableLabel(id: unknown, label: unknown, subject: string): void {
  if (typeof id !== 'string' || id.length === 0) {
    throw new TypeError(`${subject} id must be a non-empty string.`);
  }
  if (typeof label !== 'string' || label.trim().length === 0) {
    throw new TypeError(`${subject} label must be a non-empty string.`);
  }
}

function assertFiniteValues(values: readonly number[], subject: string): void {
  assertArrayValue(values, subject);
  for (const value of values) assertFiniteNumber(value, `${subject} item`);
}

function assertArrayValue(value: unknown, subject: string): void {
  if (!Array.isArray(value)) throw new TypeError(`${subject} must be an array.`);
}

function assertNumericDomain(
  minimum: unknown,
  maximum: unknown,
  component: string
): void {
  assertOptionalFiniteNumber(minimum, `${component} min`);
  assertOptionalFiniteNumber(maximum, `${component} max`);
  if (
    typeof minimum === 'number'
    && typeof maximum === 'number'
    && maximum < minimum
  ) {
    throw new RangeError(`${component} max must be greater than or equal to min.`);
  }
}

function assertPositiveSafeInteger(value: unknown, subject: string): void {
  if (value === undefined) return;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${subject} must be a positive safe integer.`);
  }
}

function assertNonNegativeSafeInteger(value: unknown, subject: string): void {
  if (value === undefined) return;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${subject} must be a non-negative safe integer.`);
  }
}

function assertValueScale(
  value: import('../../ui-model/feedback.ts').ValueScale | undefined,
  component: string
): void {
  if (value === undefined) return;
  assertArrayValue(value, `${component} valueScale`);
  if (value.length > 32) throw new RangeError(`${component} valueScale cannot contain more than 32 stops.`);
  for (const stop of value as readonly unknown[]) {
    if (!isNonArrayObject(stop)) {
      throw new TypeError(`${component} valueScale stops must be objects.`);
    }
    const at = stop['at'];
    const token = stop['token'];
    const label = stop['label'];
    if (typeof at !== 'number' || !Number.isFinite(at) || at < 0 || at > 1) {
      throw new RangeError(`${component} valueScale stop positions must be finite values from 0 through 1.`);
    }
    if (typeof token !== 'string' || !isThemeColorToken(token)) {
      throw new TypeError(`${component} valueScale stop tokens must be valid theme color tokens.`);
    }
    if (label !== undefined && (typeof label !== 'string' || label.trim().length === 0)) {
      throw new TypeError(`${component} valueScale stop labels must be non-empty strings.`);
    }
  }
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

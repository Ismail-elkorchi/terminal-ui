import type {
  ActivityIndicatorStatus,
  CommandBarValidationTone,
  NotificationTone,
  StructuredBlockStatus
} from './types.ts';
import type {
  WidgetProcessStatus,
  WidgetRecordStatus,
  WidgetStatus,
  WidgetTone,
  WidgetValidationTone
} from './contracts.ts';

const widgetTones = [
  'default',
  'primary',
  'secondary',
  'info',
  'success',
  'warning',
  'error',
  'destructive',
  'progress',
  'muted'
] as const satisfies readonly WidgetTone[];

const widgetStatuses = [
  'idle',
  'pending',
  'running',
  'success',
  'warning',
  'error',
  'info'
] as const satisfies readonly WidgetStatus[];

const widgetProcessStatuses = [
  'idle',
  'running',
  'success',
  'warning',
  'error'
] as const satisfies readonly WidgetProcessStatus[];

const widgetRecordStatuses = [
  'pending',
  'running',
  'success',
  'warning',
  'error',
  'info',
  'failed',
  'cancelled',
  'skipped'
] as const satisfies readonly WidgetRecordStatus[];

const widgetValidationTones = [
  'info',
  'warning',
  'error'
] as const satisfies readonly WidgetValidationTone[];

const notificationTones = [
  'info',
  'success',
  'warning',
  'error',
  'progress'
] as const satisfies readonly NotificationTone[];

export function isWidgetTone(value: unknown): value is WidgetTone {
  return includesValue(widgetTones, value);
}

export function normalizeWidgetTone(value: unknown, fallback: WidgetTone = 'default'): WidgetTone {
  return isWidgetTone(value) ? value : fallback;
}

export function isWidgetStatus(value: unknown): value is WidgetStatus {
  return includesValue(widgetStatuses, value);
}

export function normalizeWidgetStatus(value: unknown, fallback: WidgetStatus = 'idle'): WidgetStatus {
  return isWidgetStatus(value) ? value : fallback;
}

export function isWidgetProcessStatus(value: unknown): value is ActivityIndicatorStatus {
  return includesValue(widgetProcessStatuses, value);
}

export function normalizeWidgetProcessStatus(
  value: unknown,
  fallback: ActivityIndicatorStatus = 'idle'
): ActivityIndicatorStatus {
  return isWidgetProcessStatus(value) ? value : fallback;
}

export function optionalWidgetProcessStatus(value: unknown): ActivityIndicatorStatus | undefined {
  return isWidgetProcessStatus(value) ? value : undefined;
}

export function isWidgetRecordStatus(value: unknown): value is StructuredBlockStatus {
  return includesValue(widgetRecordStatuses, value);
}

export function optionalWidgetRecordStatus(value: unknown): StructuredBlockStatus | undefined {
  return isWidgetRecordStatus(value) ? value : undefined;
}

export function normalizeWidgetRecordStatus(
  value: unknown,
  fallback: StructuredBlockStatus = 'info'
): StructuredBlockStatus {
  return isWidgetRecordStatus(value) ? value : fallback;
}

export function isWidgetValidationTone(value: unknown): value is CommandBarValidationTone {
  return includesValue(widgetValidationTones, value);
}

export function optionalWidgetValidationTone(value: unknown): CommandBarValidationTone | undefined {
  return isWidgetValidationTone(value) ? value : undefined;
}

export function isNotificationTone(value: unknown): value is NotificationTone {
  return includesValue(notificationTones, value);
}

export function normalizeNotificationTone(value: unknown, fallback: NotificationTone = 'info'): NotificationTone {
  return isNotificationTone(value) ? value : fallback;
}

export function statusFromTone(tone: WidgetTone, fallback: WidgetStatus = 'info'): WidgetStatus {
  switch (tone) {
    case 'success':
      return 'success';
    case 'warning':
      return 'warning';
    case 'error':
    case 'destructive':
      return 'error';
    case 'progress':
      return 'running';
    case 'info':
      return 'info';
    case 'default':
    case 'primary':
    case 'secondary':
    case 'muted':
      return fallback;
  }
}

export function recordStatusFromTone(
  tone: WidgetTone,
  fallback: StructuredBlockStatus = 'info'
): StructuredBlockStatus {
  switch (tone) {
    case 'success':
      return 'success';
    case 'warning':
      return 'warning';
    case 'error':
    case 'destructive':
      return 'error';
    case 'progress':
      return 'running';
    case 'info':
      return 'info';
    case 'default':
    case 'primary':
    case 'secondary':
    case 'muted':
      return fallback;
  }
}

export function baseStatusForRecordStatus(status: StructuredBlockStatus): WidgetStatus {
  if (status === 'failed') return 'error';
  if (status === 'cancelled' || status === 'skipped') return 'warning';
  return status;
}

function includesValue<TValue extends string>(values: readonly TValue[], value: unknown): value is TValue {
  return typeof value === 'string' && (values as readonly string[]).includes(value);
}

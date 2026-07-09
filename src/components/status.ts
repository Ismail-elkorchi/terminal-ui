import type { NotificationTone } from './types.ts';
import type {
  ProcessStatus,
  RecordStatus,
  ComponentStatus,
  ComponentTone,
  ComponentValidationTone
} from './contracts.ts';

const componentTones = [
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
] as const satisfies readonly ComponentTone[];

const componentStatuses = [
  'idle',
  'pending',
  'running',
  'success',
  'warning',
  'error',
  'info'
] as const satisfies readonly ComponentStatus[];

const processStatuses = [
  'idle',
  'running',
  'success',
  'warning',
  'error'
] as const satisfies readonly ProcessStatus[];

const recordStatuses = [
  'pending',
  'running',
  'success',
  'warning',
  'error',
  'info',
  'failed',
  'cancelled',
  'skipped'
] as const satisfies readonly RecordStatus[];

const validationTones = [
  'info',
  'warning',
  'error'
] as const satisfies readonly ComponentValidationTone[];

const notificationTones = [
  'info',
  'success',
  'warning',
  'error',
  'progress'
] as const satisfies readonly NotificationTone[];

export function isComponentTone(value: unknown): value is ComponentTone {
  return includesValue(componentTones, value);
}

export function normalizeComponentTone(value: unknown, fallback: ComponentTone = 'default'): ComponentTone {
  return isComponentTone(value) ? value : fallback;
}

export function isComponentStatus(value: unknown): value is ComponentStatus {
  return includesValue(componentStatuses, value);
}

export function normalizeComponentStatus(value: unknown, fallback: ComponentStatus = 'idle'): ComponentStatus {
  return isComponentStatus(value) ? value : fallback;
}

export function isProcessStatus(value: unknown): value is ProcessStatus {
  return includesValue(processStatuses, value);
}

export function normalizeProcessStatus(
  value: unknown,
  fallback: ProcessStatus = 'idle'
): ProcessStatus {
  return isProcessStatus(value) ? value : fallback;
}

export function optionalProcessStatus(value: unknown): ProcessStatus | undefined {
  return isProcessStatus(value) ? value : undefined;
}

export function isRecordStatus(value: unknown): value is RecordStatus {
  return includesValue(recordStatuses, value);
}

export function optionalRecordStatus(value: unknown): RecordStatus | undefined {
  return isRecordStatus(value) ? value : undefined;
}

export function normalizeRecordStatus(
  value: unknown,
  fallback: RecordStatus = 'info'
): RecordStatus {
  return isRecordStatus(value) ? value : fallback;
}

export function isValidationTone(value: unknown): value is ComponentValidationTone {
  return includesValue(validationTones, value);
}

export function optionalValidationTone(value: unknown): ComponentValidationTone | undefined {
  return isValidationTone(value) ? value : undefined;
}

export function isNotificationTone(value: unknown): value is NotificationTone {
  return includesValue(notificationTones, value);
}

export function normalizeNotificationTone(value: unknown, fallback: NotificationTone = 'info'): NotificationTone {
  return isNotificationTone(value) ? value : fallback;
}

export function statusFromTone(tone: ComponentTone, fallback: ComponentStatus = 'info'): ComponentStatus {
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
  tone: ComponentTone,
  fallback: RecordStatus = 'info'
): RecordStatus {
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

export function baseStatusForRecordStatus(status: RecordStatus): ComponentStatus {
  if (status === 'failed') return 'error';
  if (status === 'cancelled' || status === 'skipped') return 'warning';
  return status;
}

function includesValue<TValue extends string>(values: readonly TValue[], value: unknown): value is TValue {
  return typeof value === 'string' && (values as readonly string[]).includes(value);
}

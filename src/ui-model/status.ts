import type { NotificationTone } from './feedback.ts';
import type {
  ProcessStatus,
  RecordStatus,
  StatusBarStatus,
  ValidationLevel
} from './contracts.ts';

const statusBarStatuses = [
  'idle',
  'pending',
  'running',
  'success',
  'warning',
  'error',
  'info'
] as const satisfies readonly StatusBarStatus[];

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

const validationLevels = [
  'info',
  'warning',
  'error'
] as const satisfies readonly ValidationLevel[];

const notificationTones = [
  'info',
  'success',
  'warning',
  'error',
  'progress'
] as const satisfies readonly NotificationTone[];

export function isStatusBarStatus(value: unknown): value is StatusBarStatus {
  return includesValue(statusBarStatuses, value);
}

export function normalizeStatusBarStatus(value: unknown, fallback: StatusBarStatus = 'idle'): StatusBarStatus {
  return isStatusBarStatus(value) ? value : fallback;
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

export function isValidationLevel(value: unknown): value is ValidationLevel {
  return includesValue(validationLevels, value);
}

export function optionalValidationLevel(value: unknown): ValidationLevel | undefined {
  return isValidationLevel(value) ? value : undefined;
}

export function isNotificationTone(value: unknown): value is NotificationTone {
  return includesValue(notificationTones, value);
}

export function normalizeNotificationTone(value: unknown, fallback: NotificationTone = 'info'): NotificationTone {
  return isNotificationTone(value) ? value : fallback;
}

export function baseStatusForRecordStatus(status: RecordStatus): StatusBarStatus {
  if (status === 'failed') return 'error';
  if (status === 'cancelled' || status === 'skipped') return 'warning';
  return status;
}

function includesValue<TValue extends string>(values: readonly TValue[], value: unknown): value is TValue {
  return typeof value === 'string' && (values as readonly string[]).includes(value);
}

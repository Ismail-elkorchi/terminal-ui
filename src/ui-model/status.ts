import type { NotificationTone } from './feedback.ts';
import { isStringMember } from '../foundation/validation.ts';
import type {
  ProcessStatus,
  RecordResult,
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

const recordResults = [
  'pending',
  'running',
  'success',
  'failed',
  'cancelled',
  'skipped'
] as const satisfies readonly RecordResult[];

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
  return isStringMember(value, statusBarStatuses);
}

export function isProcessStatus(value: unknown): value is ProcessStatus {
  return isStringMember(value, processStatuses);
}

export function isRecordResult(value: unknown): value is RecordResult {
  return isStringMember(value, recordResults);
}

export function isValidationLevel(value: unknown): value is ValidationLevel {
  return isStringMember(value, validationLevels);
}

export function isNotificationTone(value: unknown): value is NotificationTone {
  return isStringMember(value, notificationTones);
}

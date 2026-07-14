import type {
  NotificationStackAction,
  NotificationStackPresentation
} from '../ui-model/notification-stack.ts';
import type { NotificationItem, NotificationTone } from '../ui-model/feedback.ts';
import { sanitizeTerminalText } from '../text/index.ts';

export interface NotificationInput extends NotificationItem {
  readonly durationMs?: number;
  readonly dedupeKey?: string;
}

export interface NotificationRecord {
  readonly id: string;
  readonly title: string;
  readonly message: string | null;
  readonly tone: NotificationTone;
  readonly progress: number | null;
  readonly dismissible: boolean;
  readonly createdAt: number;
  readonly shownAt: number | null;
  readonly expiresAt: number | null;
  readonly remainingMs: number | null;
  readonly paused: boolean;
  readonly durationMs: number | null;
  readonly dedupeKey: string | null;
}

export type NotificationHistoryReason = 'dismissed' | 'expired' | 'replaced' | 'capacity';

export interface NotificationHistoryEntry {
  readonly notification: NotificationRecord;
  readonly reason: NotificationHistoryReason;
  readonly endedAt: number;
}

export interface NotificationState {
  readonly active: readonly NotificationRecord[];
  readonly queued: readonly NotificationRecord[];
  readonly history: readonly NotificationHistoryEntry[];
  readonly selected?: string;
}

export type NotificationConflictPolicy = 'keep-existing' | 'replace-existing';

export type NotificationAction =
  | {
      readonly kind: 'enqueue';
      readonly notification: NotificationInput;
      readonly now: number;
      readonly conflict?: NotificationConflictPolicy;
    }
  | {
      readonly kind: 'replace';
      readonly id: string;
      readonly notification: NotificationInput;
      readonly now: number;
    }
  | {
      readonly kind: 'update';
      readonly id: string;
      readonly changes: NotificationUpdate;
      readonly now: number;
    }
  | { readonly kind: 'dismiss'; readonly id: string; readonly now: number }
  | { readonly kind: 'dismissSelected'; readonly now: number }
  | { readonly kind: 'pause'; readonly id: string; readonly now: number }
  | { readonly kind: 'resume'; readonly id: string; readonly now: number }
  | { readonly kind: 'expire'; readonly now: number }
  | { readonly kind: 'select'; readonly id: string; readonly now: number }
  | { readonly kind: 'moveSelection'; readonly delta: -1 | 1; readonly now: number }
  | { readonly kind: 'clear'; readonly now: number }
  | { readonly kind: 'clearHistory'; readonly now: number };

export interface NotificationUpdate {
  readonly title?: string;
  readonly message?: string | null;
  readonly tone?: NotificationTone | null;
  readonly progress?: number | null;
  readonly durationMs?: number | null;
  readonly dismissible?: boolean;
}

export interface NotificationPolicy {
  readonly maxVisible?: number;
  readonly maxQueued?: number;
  readonly maxHistory?: number;
}

interface NotificationPresentationOptionsBase {
  readonly now?: number;
}

export interface LiveNotificationPresentationOptions extends NotificationPresentationOptionsBase {
  readonly mode: 'live';
}

export interface NotificationHistoryPresentationOptions extends NotificationPresentationOptionsBase {
  readonly mode: 'history';
}

export type NotificationPresentationOptions =
  | LiveNotificationPresentationOptions
  | NotificationHistoryPresentationOptions;

export function createNotificationState(): NotificationState {
  return { active: [], queued: [], history: [] };
}

export function notificationReducer(
  state: NotificationState,
  action: NotificationAction,
  policy: NotificationPolicy = {}
): NotificationState {
  const normalized = normalizeCapacity(state, policy, actionNow(action));
  switch (action.kind) {
    case 'enqueue':
      return enqueue(normalized, action.notification, action.now, action.conflict ?? 'keep-existing', policy);
    case 'replace':
      return replace(normalized, action.id, action.notification, action.now, policy);
    case 'update':
      return update(normalized, action.id, action.changes, action.now);
    case 'dismiss':
      return dismiss(normalized, action.id, action.now, policy);
    case 'dismissSelected':
      return normalized.selected === undefined
        ? normalized
        : dismiss(normalized, normalized.selected, action.now, policy);
    case 'pause':
      return mapNotification(normalized, action.id, (record) => pause(record, action.now));
    case 'resume':
      return mapNotification(normalized, action.id, (record) => resume(record, action.now));
    case 'expire':
      return expire(normalized, action.now, policy);
    case 'select':
      return normalized.active.some((record) => record.id === action.id)
        ? { ...normalized, selected: action.id }
        : normalized;
    case 'moveSelection':
      return moveSelection(normalized, action.delta);
    case 'clear':
      return clear(normalized, action.now, policy);
    case 'clearHistory':
      return { ...normalized, history: [] };
  }
}

export function notificationActionFromStack(
  action: NotificationStackAction,
  now: number
): NotificationAction {
  switch (action.kind) {
    case 'select':
      return { ...action, now: finiteTime(now) };
    case 'move':
      return { kind: 'moveSelection', delta: action.delta, now: finiteTime(now) };
    case 'dismiss':
      return { ...action, now: finiteTime(now) };
  }
}

export function notificationPresentation(
  state: NotificationState,
  options: LiveNotificationPresentationOptions
): Extract<NotificationStackPresentation, { readonly kind: 'live' }>;
export function notificationPresentation(
  state: NotificationState,
  options: NotificationHistoryPresentationOptions
): Extract<NotificationStackPresentation, { readonly kind: 'history' }>;
export function notificationPresentation(
  state: NotificationState,
  options: NotificationPresentationOptions
): NotificationStackPresentation {
  const items = state.active.map((record): NotificationItem => ({
    id: record.id,
    title: record.title,
    ...(record.message === null ? {} : { message: record.message }),
    tone: record.tone,
    ...(record.progress === null ? {} : { progress: record.progress }),
    dismissible: record.dismissible,
    ...notificationDetail(record, options.now)
  }));
  return options.mode === 'live'
    ? { kind: 'live', items }
    : {
        kind: 'history',
        items,
        ...(state.selected === undefined ? {} : { selected: state.selected })
      };
}

export function nextNotificationExpiry(state: NotificationState): number | undefined {
  let next: number | undefined;
  for (const record of state.active) {
    if (record.expiresAt === null) continue;
    next = next === undefined ? record.expiresAt : Math.min(next, record.expiresAt);
  }
  return next;
}

function enqueue(
  state: NotificationState,
  input: NotificationInput,
  now: number,
  conflict: NotificationConflictPolicy,
  policy: NotificationPolicy
): NotificationState {
  const record = createRecord(input, now);
  const duplicate = findDuplicate(state, record);
  if (duplicate !== undefined) {
    return conflict === 'replace-existing'
      ? replace(state, duplicate.id, input, now, policy)
      : state;
  }
  return insert(state, record, now, policy);
}

function replace(
  state: NotificationState,
  id: string,
  input: NotificationInput,
  now: number,
  policy: NotificationPolicy
): NotificationState {
  const existing = findRecord(state, id);
  if (existing === undefined) return insert(state, createRecord(input, now), now, policy);
  const removed = removeRecord(state, id);
  const next = appendHistory(removed, existing, 'replaced', now, policy);
  return insert(next, createRecord(input, now), now, policy);
}

function update(
  state: NotificationState,
  id: string,
  changes: NotificationUpdate,
  now: number
): NotificationState {
  return mapNotification(state, id, (record) => {
    const durationMs: number | null = changes.durationMs === undefined
      ? record.durationMs
      : changes.durationMs === null ? null : duration(changes.durationMs);
    const active = state.active.some((item) => item.id === id);
    const next: NotificationRecord = {
      ...record,
      title: changes.title === undefined ? record.title : oneLine(changes.title, 'Notification'),
      message: changes.message === undefined
        ? record.message
        : changes.message === null ? null : cleanText(changes.message),
      tone: changes.tone === undefined
        ? record.tone
        : changes.tone ?? 'info',
      progress: changes.progress === undefined
        ? record.progress
        : changes.progress === null ? null : progress(changes.progress),
      dismissible: changes.dismissible ?? record.dismissible,
      durationMs
    };
    if (!active || next.paused) return next;
    return durationMs === null
      ? withoutLifecycleDeadline(next)
      : { ...next, shownAt: now, expiresAt: now + durationMs, remainingMs: null };
  });
}

function insert(
  state: NotificationState,
  record: NotificationRecord,
  now: number,
  policy: NotificationPolicy
): NotificationState {
  if (state.active.length < maxVisible(policy)) {
    const active = [activate(record, now), ...state.active];
    return ensureSelection({ ...state, active });
  }
  const queued = [...state.queued, record];
  const overflow = queued.length > maxQueued(policy) ? queued.shift() : undefined;
  const next = { ...state, queued };
  return overflow === undefined
    ? next
    : appendHistory(next, overflow, 'capacity', now, policy);
}

function dismiss(
  state: NotificationState,
  id: string,
  now: number,
  policy: NotificationPolicy
): NotificationState {
  const record = findRecord(state, id);
  if (record === undefined) return state;
  const removed = removeRecord(state, id);
  const next = appendHistory(removed, record, 'dismissed', now, policy);
  return promote(next, now, policy);
}

function expire(state: NotificationState, now: number, policy: NotificationPolicy): NotificationState {
  const expired = state.active.filter((record) => record.expiresAt !== null && record.expiresAt <= now);
  if (expired.length === 0) return state;
  let next: NotificationState = {
    ...state,
    active: state.active.filter((record) => !expired.includes(record))
  };
  for (const record of expired) next = appendHistory(next, record, 'expired', now, policy);
  return promote(next, now, policy);
}

function clear(state: NotificationState, now: number, policy: NotificationPolicy): NotificationState {
  let next: NotificationState = withSelection({ ...state, active: [], queued: [] }, undefined);
  for (const record of [...state.active, ...state.queued]) {
    next = appendHistory(next, record, 'dismissed', now, policy);
  }
  return next;
}

function promote(state: NotificationState, now: number, policy: NotificationPolicy): NotificationState {
  const active = [...state.active];
  const queued = [...state.queued];
  while (active.length < maxVisible(policy) && queued.length > 0) {
    const record = queued.shift();
    if (record !== undefined) active.push(activate(record, now));
  }
  return ensureSelection({ ...state, active, queued });
}

function normalizeCapacity(state: NotificationState, policy: NotificationPolicy, now: number): NotificationState {
  const limit = maxVisible(policy);
  if (state.active.length <= limit && state.queued.length <= maxQueued(policy)) return ensureSelection(state);
  const active = state.active.slice(0, limit);
  const queued = [...state.active.slice(limit).map(deactivate), ...state.queued];
  let next: NotificationState = { ...state, active, queued };
  while (queued.length > maxQueued(policy)) {
    const record = queued.pop();
    if (record === undefined) break;
    next = appendHistory({ ...next, queued }, record, 'capacity', now, policy);
  }
  return ensureSelection({ ...next, queued });
}

function appendHistory(
  state: NotificationState,
  notification: NotificationRecord,
  reason: NotificationHistoryReason,
  endedAt: number,
  policy: NotificationPolicy
): NotificationState {
  return {
    ...state,
    history: [{ notification, reason, endedAt }, ...state.history].slice(0, maxHistory(policy))
  };
}

function moveSelection(state: NotificationState, delta: -1 | 1): NotificationState {
  if (state.active.length === 0) return withSelection(state, undefined);
  const index = Math.max(0, state.active.findIndex((record) => record.id === state.selected));
  const next = Math.max(0, Math.min(state.active.length - 1, index + delta));
  return withSelection(state, state.active[next]?.id);
}

function ensureSelection(state: NotificationState): NotificationState {
  if (state.active.length === 0) return state.selected === undefined ? state : withSelection(state, undefined);
  if (state.selected !== undefined && state.active.some((record) => record.id === state.selected)) return state;
  return withSelection(state, state.active[0]?.id);
}

function withSelection(state: NotificationState, selected: string | undefined): NotificationState {
  return {
    active: state.active,
    queued: state.queued,
    history: state.history,
    ...(selected === undefined ? {} : { selected })
  };
}

function mapNotification(
  state: NotificationState,
  id: string,
  transform: (record: NotificationRecord) => NotificationRecord
): NotificationState {
  if (findRecord(state, id) === undefined) return state;
  return {
    ...state,
    active: state.active.map((record) => record.id === id ? transform(record) : record),
    queued: state.queued.map((record) => record.id === id ? transform(record) : record)
  };
}

function pause(record: NotificationRecord, now: number): NotificationRecord {
  if (record.paused || record.expiresAt === null) return record;
  return {
    ...record,
    paused: true,
    remainingMs: Math.max(0, record.expiresAt - now),
    expiresAt: null
  };
}

function resume(record: NotificationRecord, now: number): NotificationRecord {
  if (!record.paused) return record;
  const remainingMs = record.remainingMs ?? record.durationMs;
  return {
    ...record,
    paused: false,
    remainingMs: null,
    expiresAt: remainingMs === null ? null : now + remainingMs
  };
}

function activate(record: NotificationRecord, now: number): NotificationRecord {
  return {
    ...record,
    shownAt: now,
    expiresAt: record.durationMs === null ? null : now + record.durationMs
  };
}

function deactivate(record: NotificationRecord): NotificationRecord {
  return {
    ...record,
    shownAt: null,
    expiresAt: null,
    remainingMs: null,
    paused: false
  };
}

function createRecord(input: NotificationInput, now: number): NotificationRecord {
  const id = oneLine(input.id);
  if (id.length === 0) throw new TypeError('Notification id must contain visible text.');
  return {
    id,
    title: oneLine(input.title, 'Notification'),
    message: input.message === undefined ? null : cleanText(input.message),
    tone: input.tone ?? 'info',
    progress: input.progress === undefined ? null : progress(input.progress),
    dismissible: input.dismissible ?? true,
    durationMs: input.durationMs === undefined ? null : duration(input.durationMs),
    dedupeKey: input.dedupeKey === undefined ? null : oneLine(input.dedupeKey),
    createdAt: finiteTime(now),
    shownAt: null,
    expiresAt: null,
    remainingMs: null,
    paused: false
  };
}

function findDuplicate(state: NotificationState, record: NotificationRecord): NotificationRecord | undefined {
  return [...state.active, ...state.queued].find((candidate) =>
    candidate.id === record.id
    || (record.dedupeKey !== null && candidate.dedupeKey === record.dedupeKey)
  );
}

function findRecord(state: NotificationState, id: string): NotificationRecord | undefined {
  return state.active.find((record) => record.id === id)
    ?? state.queued.find((record) => record.id === id);
}

function removeRecord(state: NotificationState, id: string): NotificationState {
  return {
    ...state,
    active: state.active.filter((record) => record.id !== id),
    queued: state.queued.filter((record) => record.id !== id)
  };
}

function notificationDetail(record: NotificationRecord, now: number | undefined): Pick<NotificationItem, 'detail'> {
  const parts: string[] = [];
  if (record.paused) parts.push('paused');
  const remaining = record.paused
    ? record.remainingMs
    : now === undefined || record.expiresAt === null
      ? record.durationMs
      : Math.max(0, record.expiresAt - now);
  if (remaining !== null) parts.push(`ttl ${formatDuration(remaining)}`);
  return parts.length === 0 ? {} : { detail: parts.join(' · ') };
}

function withoutLifecycleDeadline(record: NotificationRecord): NotificationRecord {
  return { ...record, shownAt: null, expiresAt: null, remainingMs: null };
}

function actionNow(action: NotificationAction): number {
  return finiteTime(action.now);
}

function maxVisible(policy: NotificationPolicy): number {
  return boundedCount(policy.maxVisible, 4, 1, 12);
}

function maxQueued(policy: NotificationPolicy): number {
  return boundedCount(policy.maxQueued, 100, 0, 1_000);
}

function maxHistory(policy: NotificationPolicy): number {
  return boundedCount(policy.maxHistory, 100, 0, 5_000);
}

function boundedCount(value: number | undefined, fallback: number, minimum: number, maximum: number): number {
  return value === undefined || !Number.isFinite(value)
    ? fallback
    : Math.max(minimum, Math.min(maximum, Math.floor(value)));
}

function progress(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : 0;
}

function duration(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function finiteTime(value: number): number {
  if (!Number.isFinite(value)) throw new TypeError('Notification action time must be finite.');
  return value;
}

function oneLine(value: string, fallback = ''): string {
  return cleanText(value).replace(/\s+/gu, ' ').trim() || fallback;
}

function cleanText(value: string): string {
  return sanitizeTerminalText(value).text;
}

function formatDuration(milliseconds: number): string {
  const seconds = Math.max(0, Math.round(milliseconds / 1_000));
  if (seconds < 60) return `${String(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return remainingSeconds === 0
    ? `${String(minutes)}m`
    : `${String(minutes)}m${String(remainingSeconds).padStart(2, '0')}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes === 0
    ? `${String(hours)}h`
    : `${String(hours)}h${String(remainingMinutes).padStart(2, '0')}m`;
}

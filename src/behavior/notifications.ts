import type { ScrollState } from '../interaction/scroll.ts';
import type { NotificationHistoryTransition } from '../ui-model/notification.ts';
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

export type NotificationHistoryReason =
  | 'dismissed'
  | 'expired'
  | 'replaced'
  | 'capacity';

export interface NotificationHistoryEntry {
  readonly notification: NotificationRecord;
  readonly reason: NotificationHistoryReason;
  readonly endedAt: number;
}

export interface NotificationState {
  readonly active: readonly NotificationRecord[];
  readonly queued: readonly NotificationRecord[];
  readonly history: readonly NotificationHistoryEntry[];
  readonly selectedHistoryId?: string;
  readonly historyScroll: ScrollState;
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
  | { readonly kind: 'pause'; readonly id: string; readonly now: number }
  | { readonly kind: 'resume'; readonly id: string; readonly now: number }
  | { readonly kind: 'expire'; readonly now: number }
  | { readonly kind: 'selectHistory'; readonly id: string; readonly now: number }
  | { readonly kind: 'moveHistorySelection'; readonly delta: -1 | 1; readonly now: number }
  | { readonly kind: 'firstHistory'; readonly now: number }
  | { readonly kind: 'lastHistory'; readonly now: number }
  | {
      readonly kind: 'setHistoryView';
      readonly selectedId: string;
      readonly scroll: ScrollState;
      readonly now: number;
    }
  | { readonly kind: 'scrollHistory'; readonly scroll: ScrollState; readonly now: number }
  | { readonly kind: 'removeHistory'; readonly id: string; readonly now: number }
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

export function createNotificationState(): NotificationState {
  return {
    active: [],
    queued: [],
    history: [],
    historyScroll: { offsetRow: 0, offsetColumn: 0, followTail: false },
  };
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
    case 'pause':
      return mapNotification(normalized, action.id, (record) => pause(record, action.now));
    case 'resume':
      return mapNotification(normalized, action.id, (record) => resume(record, action.now));
    case 'expire':
      return expire(normalized, action.now, policy);
    case 'selectHistory':
      return normalized.history.some((entry) => entry.notification.id === action.id)
        ? withHistorySelection(normalized, action.id)
        : normalized;
    case 'moveHistorySelection':
      return moveHistorySelection(normalized, action.delta);
    case 'firstHistory':
      return withHistorySelection(
        normalized,
        normalized.history[0]?.notification.id
      );
    case 'lastHistory':
      return withHistorySelection(
        normalized,
        normalized.history.at(-1)?.notification.id
      );
    case 'setHistoryView':
      if (!normalized.history.some((entry) => entry.notification.id === action.selectedId)) return normalized;
      return withHistoryScroll(withHistorySelection(normalized, action.selectedId), ownScroll(action.scroll));
    case 'scrollHistory':
      return withHistoryScroll(normalized, ownScroll(action.scroll));
    case 'removeHistory':
      return removeHistory(normalized, action.id);
    case 'clear':
      return clear(normalized, action.now, policy);
    case 'clearHistory':
      return normalized.history.length === 0 && normalized.selectedHistoryId === undefined
        ? normalized
        : withHistorySelection({ ...normalized, history: [] }, undefined);
  }
}

export function notificationHistoryAction(
  action: NotificationHistoryTransition,
  now: number
): NotificationAction {
  switch (action.kind) {
    case 'selection':
      return {
        kind: 'setHistoryView',
        selectedId: action.selectedId,
        scroll: ownScroll(action.scroll),
        now: finiteTime(now),
      };
    case 'scroll':
      return { kind: 'scrollHistory', scroll: ownScroll(action.scroll), now: finiteTime(now) };
    case 'remove':
      return { kind: 'removeHistory', id: action.id, now: finiteTime(now) };
  }
}

function ownScroll(scroll: ScrollState): ScrollState {
  if (
    typeof scroll.offsetRow !== 'number' ||
    !Number.isSafeInteger(scroll.offsetRow) ||
    scroll.offsetRow < 0 ||
    typeof scroll.offsetColumn !== 'number' ||
    !Number.isSafeInteger(scroll.offsetColumn) ||
    scroll.offsetColumn < 0 ||
    typeof scroll.followTail !== 'boolean'
  ) {
    throw new TypeError('Notification history scroll must be a valid ScrollState.');
  }
  return Object.freeze({ ...scroll });
}

export function activeNotificationItems(
  state: NotificationState,
  options: { readonly now?: number } = {}
): readonly NotificationItem[] {
  return state.active.map((record): NotificationItem => ({
    id: record.id,
    title: record.title,
    ...(record.message === null ? {} : { message: record.message }),
    tone: record.tone,
    ...(record.progress === null ? {} : { progress: record.progress }),
    dismissible: record.dismissible,
    ...notificationDetail(record, options.now)
  }));
}

export function notificationHistoryItems(
  state: NotificationState
): readonly NotificationItem[] {
  return state.history.map((entry) => ({
    id: entry.notification.id,
    title: entry.notification.title,
    ...(entry.notification.message === null
      ? {}
      : { message: entry.notification.message }),
    tone: entry.notification.tone,
    ...(entry.notification.progress === null
      ? {}
      : { progress: entry.notification.progress }),
    dismissible: true
  }));
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
    return ensureHistorySelection({ ...state, active });
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
  let next: NotificationState = withHistorySelection({ ...state, active: [], queued: [] }, undefined);
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
  return ensureHistorySelection({ ...state, active, queued });
}

function normalizeCapacity(state: NotificationState, policy: NotificationPolicy, now: number): NotificationState {
  const limit = maxVisible(policy);
  if (state.active.length <= limit && state.queued.length <= maxQueued(policy)) return ensureHistorySelection(state);
  const active = state.active.slice(0, limit);
  const queued = [...state.active.slice(limit).map(deactivate), ...state.queued];
  let next: NotificationState = { ...state, active, queued };
  while (queued.length > maxQueued(policy)) {
    const record = queued.pop();
    if (record === undefined) break;
    next = appendHistory({ ...next, queued }, record, 'capacity', now, policy);
  }
  return ensureHistorySelection({ ...next, queued });
}

function appendHistory(
  state: NotificationState,
  notification: NotificationRecord,
  reason: NotificationHistoryReason,
  endedAt: number,
  policy: NotificationPolicy
): NotificationState {
  return ensureHistorySelection({
    ...state,
    history: [{ notification, reason, endedAt }, ...state.history].slice(0, maxHistory(policy))
  });
}

function moveHistorySelection(state: NotificationState, delta: -1 | 1): NotificationState {
  if (state.history.length === 0) {
    return withHistorySelection(state, undefined);
  }
  const index = Math.max(
    0,
    state.history.findIndex(
      (entry) => entry.notification.id === state.selectedHistoryId
    )
  );
  const next = Math.max(0, Math.min(state.history.length - 1, index + delta));
  return withHistorySelection(
    state,
    state.history[next]?.notification.id
  );
}

function ensureHistorySelection(state: NotificationState): NotificationState {
  if (state.history.length === 0) {
    return state.selectedHistoryId === undefined
      ? state
      : withHistorySelection(state, undefined);
  }
  if (state.selectedHistoryId !== undefined
    && state.history.some(
      (entry) => entry.notification.id === state.selectedHistoryId
    )) {
    return state;
  }
  return withHistorySelection(state, state.history[0]?.notification.id);
}

function withHistorySelection(
  state: NotificationState,
  selectedHistoryId: string | undefined
): NotificationState {
  if (state.selectedHistoryId === selectedHistoryId) return state;
  return {
    active: state.active,
    queued: state.queued,
    history: state.history,
    historyScroll: state.historyScroll,
    ...(selectedHistoryId === undefined ? {} : { selectedHistoryId })
  };
}

function withHistoryScroll(state: NotificationState, historyScroll: ScrollState): NotificationState {
  const current = state.historyScroll;
  return current.offsetRow === historyScroll.offsetRow
      && current.offsetColumn === historyScroll.offsetColumn
      && current.followTail === historyScroll.followTail
    ? state
    : { ...state, historyScroll };
}

function removeHistory(
  state: NotificationState,
  id: string
): NotificationState {
  if (!state.history.some((entry) => entry.notification.id === id)) return state;
  return ensureHistorySelection({
    ...state,
    history: state.history.filter((entry) => entry.notification.id !== id)
  });
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

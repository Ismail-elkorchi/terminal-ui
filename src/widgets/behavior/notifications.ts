import { sanitizeTerminalText } from '../../text/index.ts';
import type { NotificationItem, StructuredBlock, StructuredBlockStatus } from '../types.ts';

export interface NotificationState {
  readonly items: readonly NotificationItem[];
  readonly history: readonly NotificationItem[];
}

export type NotificationAction =
  | { readonly kind: 'add'; readonly item: NotificationItem }
  | { readonly kind: 'dismiss'; readonly id: string }
  | { readonly kind: 'dismissLatest' }
  | { readonly kind: 'pause'; readonly id: string }
  | { readonly kind: 'resume'; readonly id: string }
  | { readonly kind: 'tick'; readonly now: number }
  | { readonly kind: 'clear' };

export interface NotificationReducerOptions {
  readonly maxVisible?: number;
  readonly maxHistory?: number;
}

export function notificationReducer(
  state: NotificationState,
  action: NotificationAction,
  options: NotificationReducerOptions = {}
): NotificationState {
  switch (action.kind) {
    case 'add': {
      const item = sanitizeNotificationItem(action.item);
      const active = boundItems([item, ...state.items.filter((current) => current.id !== item.id)], maxVisible(options));
      return {
        items: active,
        history: boundItems([item, ...state.history.filter((current) => current.id !== item.id)], maxHistory(options))
      };
    }
    case 'dismiss':
      return {
        ...state,
        items: state.items.filter((item) => item.id !== action.id)
      };
    case 'dismissLatest':
      return {
        ...state,
        items: state.items.slice(1)
      };
    case 'pause':
      return {
        ...state,
        items: state.items.map((item) => item.id === action.id ? { ...item, paused: true } : item)
      };
    case 'resume':
      return {
        ...state,
        items: state.items.map((item) => item.id === action.id ? withoutPaused(item) : item)
      };
    case 'tick':
      return {
        ...state,
        items: state.items.filter((item) => item.paused === true || item.expiresAt === undefined || item.expiresAt > action.now)
      };
    case 'clear':
      return {
        ...state,
        items: []
      };
  }
}

export function visibleNotifications(
  state: NotificationState,
  options: NotificationReducerOptions = {}
): readonly NotificationItem[] {
  return state.items.slice(0, maxVisible(options));
}

export function notificationsToActivityBlocks(
  items: readonly NotificationItem[]
): readonly StructuredBlock[] {
  return items.map((item): StructuredBlock => ({
    id: `notification:${item.id}`,
    title: item.title,
    ...(item.message === undefined ? {} : { summary: item.message }),
    status: notificationStatus(item),
    collapsed: true,
    fields: [
      ...(item.progress === undefined ? [] : [{ label: 'progress', value: `${String(clampProgress(item.progress))}%` }]),
      ...(item.createdAt === undefined ? [] : [{ label: 'created', value: String(item.createdAt) }])
    ]
  }));
}

function sanitizeNotificationItem(item: NotificationItem): NotificationItem {
  return {
    id: oneLine(item.id),
    title: oneLine(item.title),
    ...(item.message === undefined ? {} : { message: cleanText(item.message) }),
    ...(item.tone === undefined ? {} : { tone: item.tone }),
    ...(item.progress === undefined ? {} : { progress: clampProgress(item.progress) }),
    ...(item.createdAt === undefined ? {} : { createdAt: finiteNumber(item.createdAt) }),
    ...(item.expiresAt === undefined ? {} : { expiresAt: finiteNumber(item.expiresAt) }),
    ...(item.paused === true ? { paused: true } : {})
  };
}

function notificationStatus(item: NotificationItem): StructuredBlockStatus {
  switch (notificationTone(item)) {
    case 'success':
      return 'success';
    case 'warning':
      return 'warning';
    case 'error':
      return 'error';
    case 'progress':
      return 'running';
    case 'info':
      return 'info';
  }
}

function notificationTone(item: NotificationItem): NonNullable<NotificationItem['tone']> {
  return item.tone === 'success'
    || item.tone === 'warning'
    || item.tone === 'error'
    || item.tone === 'progress'
    ? item.tone
    : 'info';
}

function boundItems(items: readonly NotificationItem[], limit: number): readonly NotificationItem[] {
  return items.slice(0, limit);
}

function maxVisible(options: NotificationReducerOptions): number {
  return boundedCount(options.maxVisible, 4);
}

function maxHistory(options: NotificationReducerOptions): number {
  return boundedCount(options.maxHistory, 50);
}

function boundedCount(value: number | undefined, fallback: number): number {
  return value === undefined || !Number.isFinite(value)
    ? fallback
    : Math.max(1, Math.min(500, Math.floor(value)));
}

function clampProgress(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : 0;
}

function finiteNumber(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function withoutPaused(item: NotificationItem): NotificationItem {
  return {
    id: item.id,
    title: item.title,
    ...(item.message === undefined ? {} : { message: item.message }),
    ...(item.tone === undefined ? {} : { tone: item.tone }),
    ...(item.progress === undefined ? {} : { progress: item.progress }),
    ...(item.createdAt === undefined ? {} : { createdAt: item.createdAt }),
    ...(item.expiresAt === undefined ? {} : { expiresAt: item.expiresAt })
  };
}

function oneLine(value: string): string {
  return cleanText(value).replace(/\s+/gu, ' ').trim();
}

function cleanText(value: string): string {
  return sanitizeTerminalText(value).text;
}

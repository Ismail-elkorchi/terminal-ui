import type { TerminalTheme, ThemeToken } from '../theme/index.ts';
import type { ActivityIndicatorStatus, WidgetStatus, WidgetTone } from '../widgets/index.ts';
import type { TerminalStyle } from './frame.ts';

export function widgetStatus(value: unknown, fallback: WidgetStatus = 'idle'): WidgetStatus {
  return isWidgetStatus(value) ? value : fallback;
}

export function activityStatus(value: unknown, fallback: ActivityIndicatorStatus = 'idle'): ActivityIndicatorStatus {
  return value === 'idle' || value === 'running' || value === 'success' || value === 'warning' || value === 'error'
    ? value
    : fallback;
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

export function statusMarker(status: WidgetStatus, theme: TerminalTheme): string {
  switch (status) {
    case 'running':
    case 'info':
      return theme.symbols.statusInfo;
    case 'success':
      return theme.symbols.statusSuccess;
    case 'warning':
      return theme.symbols.statusWarning;
    case 'error':
      return theme.symbols.statusError;
    case 'pending':
    case 'idle':
      return theme.symbols.progressEmpty;
  }
}

export function statusStyle(status: WidgetStatus): TerminalStyle {
  return {
    fg: { kind: 'theme', token: statusToken(status) },
    bold: status === 'error' || status === 'success'
  };
}

export function statusToken(status: WidgetStatus): ThemeToken {
  switch (status) {
    case 'running':
      return 'status.running';
    case 'success':
      return 'status.success';
    case 'warning':
      return 'status.warning';
    case 'error':
      return 'status.error';
    case 'info':
      return 'status.info';
    case 'pending':
    case 'idle':
      return 'status.pending';
  }
}

function isWidgetStatus(value: unknown): value is WidgetStatus {
  return value === 'idle'
    || value === 'pending'
    || value === 'running'
    || value === 'success'
    || value === 'warning'
    || value === 'error'
    || value === 'info';
}

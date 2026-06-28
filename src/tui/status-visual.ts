import type { TerminalTheme, ThemeToken } from '../theme/index.ts';
import type { ActivityIndicatorStatus } from '../widgets/types.ts';
import type { TerminalStyle } from './frame.ts';

export function activityStatus(value: unknown, fallback: ActivityIndicatorStatus = 'idle'): ActivityIndicatorStatus {
  return value === 'idle' || value === 'running' || value === 'success' || value === 'warning' || value === 'error'
    ? value
    : fallback;
}

export function statusMarker(status: ActivityIndicatorStatus, theme: TerminalTheme): string {
  switch (status) {
    case 'running':
      return theme.symbols.statusInfo;
    case 'success':
      return theme.symbols.statusSuccess;
    case 'warning':
      return theme.symbols.statusWarning;
    case 'error':
      return theme.symbols.statusError;
    case 'idle':
      return theme.symbols.progressEmpty;
  }
}

export function statusStyle(status: ActivityIndicatorStatus): TerminalStyle {
  return {
    fg: { kind: 'theme', token: statusToken(status) },
    bold: status === 'error' || status === 'success'
  };
}

export function statusToken(status: ActivityIndicatorStatus): ThemeToken {
  switch (status) {
    case 'running':
      return 'status.running';
    case 'success':
      return 'status.success';
    case 'warning':
      return 'status.warning';
    case 'error':
      return 'status.error';
    case 'idle':
      return 'status.pending';
  }
}

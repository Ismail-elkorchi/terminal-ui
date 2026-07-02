import type { TerminalTheme, ThemeToken } from '../theme/index.ts';
import type { WidgetStatus } from '../widgets/index.ts';
import type { TerminalStyle } from './frame.ts';

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

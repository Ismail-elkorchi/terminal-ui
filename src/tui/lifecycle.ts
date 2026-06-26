import { toAccessibleSnapshot } from '../accessibility/index.ts';
import { diagnostic } from '../diagnostics.ts';
import type { AccessibleSnapshot } from '../accessibility/index.ts';
import type { TerminalDiagnostic } from '../diagnostics.ts';
import type { TerminalHost, TerminalRestoreReason, TerminalSession } from '../host/index.ts';
import type { TuiExit } from './types.ts';

export function tuiSnapshot(id: string): AccessibleSnapshot {
  return toAccessibleSnapshot({
    source: 'tui',
    root: { id, role: 'application', label: id }
  });
}

export async function rejectNonTtyTui<TState>(
  id: string,
  host: TerminalHost
): Promise<TuiExit<TState> | undefined> {
  const capabilities = await host.getCapabilities();
  if (capabilities.isTty) return undefined;
  return {
    status: 'error',
    diagnostics: [
      diagnostic('HOST_CAPABILITY_UNAVAILABLE', 'Full-screen TUI requires a TTY terminal host.', {
        target: id,
        data: {
          runtime: capabilities.runtime,
          isTty: false
        }
      })
    ],
    snapshot: tuiSnapshot(id)
  };
}

export async function setupTuiSession(session: TerminalSession): Promise<readonly TerminalDiagnostic[]> {
  const diagnostics: TerminalDiagnostic[] = [];
  for (const result of [
    await session.enableAlternateScreen(),
    await session.enableBracketedPaste(),
    await session.enableRawInput(),
    await session.enableMouseReporting('click'),
    await session.enableFocusReporting(),
    await session.hideCursor()
  ]) {
    if (result.ok) {
      diagnostics.push(...(result.diagnostics ?? []));
    } else {
      diagnostics.push(result.error, ...(result.diagnostics ?? []));
    }
  }
  return diagnostics;
}

export async function restoreTuiSession(
  session: TerminalSession,
  reason: TerminalRestoreReason
): Promise<readonly TerminalDiagnostic[]> {
  try {
    const result = await session.restore(reason);
    return result.diagnostics;
  } catch (cause) {
    return [diagnostic('HOST_RESTORE_FAILED', 'Terminal session restore failed.', { cause, target: session.id })];
  }
}

export function restoreReasonForExit(status: TuiExit<unknown>['status']): TerminalRestoreReason {
  switch (status) {
    case 'completed':
      return 'success';
    case 'cancelled':
      return 'cancelled';
    case 'interrupted':
      return 'interrupted';
    case 'error':
      return 'error';
  }
}

export function withDiagnostics<TState>(
  exit: TuiExit<TState>,
  diagnostics: readonly TerminalDiagnostic[]
): TuiExit<TState> {
  if (diagnostics.length === 0) return exit;
  return { ...exit, diagnostics: [...exit.diagnostics, ...diagnostics] };
}

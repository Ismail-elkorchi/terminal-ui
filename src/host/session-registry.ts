import type { TerminalHost, TerminalRestoreReason, TerminalRestoreResult, TerminalSession, TerminalStateChange } from './types.ts';

const activeSessions = new WeakMap<TerminalHost, TerminalSession[]>();

export function registerTerminalSession(session: TerminalSession): void {
  const sessions = activeSessions.get(session.host) ?? [];
  sessions.push(session);
  activeSessions.set(session.host, sessions);
}

export function unregisterTerminalSession(session: TerminalSession): void {
  const sessions = activeSessions.get(session.host);
  if (sessions === undefined) return;
  const next = sessions.filter((item) => item !== session);
  if (next.length === 0) activeSessions.delete(session.host);
  else activeSessions.set(session.host, next);
}

export async function restoreActiveTerminalSessions(
  host: TerminalHost,
  reason: TerminalRestoreReason
): Promise<TerminalRestoreResult> {
  const sessions = [...(activeSessions.get(host) ?? [])].reverse();
  const restored: TerminalStateChange[] = [];
  const diagnostics = [];

  for (const session of sessions) {
    const result = await session.restore(reason);
    restored.push(...result.restored);
    diagnostics.push(...result.diagnostics);
  }

  return {
    ok: diagnostics.length === 0,
    reason,
    restored,
    diagnostics
  };
}

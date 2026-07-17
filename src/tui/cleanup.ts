import { diagnostic } from '../diagnostics.ts';
import type { TerminalDiagnostic } from '../diagnostics.ts';
import type { TerminalClock } from '../host/index.ts';
import type { TuiCleanupPolicy } from './types.ts';

export const defaultTuiCleanupPolicy: TuiCleanupPolicy = {
  gracePeriodMs: 1_000
};

export interface TuiCleanupTask {
  readonly owner: string;
  readonly phase: 'runtime' | 'onExit';
  readonly completion: Promise<void>;
}

export async function settleTuiCleanup(
  clock: TerminalClock,
  tasks: readonly TuiCleanupTask[],
  policy: TuiCleanupPolicy = defaultTuiCleanupPolicy
): Promise<readonly TerminalDiagnostic[]> {
  assertCleanupPolicy(policy);
  if (tasks.length === 0) return [];
  const pending = new Set(tasks);
  const diagnostics: TerminalDiagnostic[] = [];
  const settlements = tasks.map(async (task) => {
    try {
      await task.completion;
    } catch (cause) {
      diagnostics.push(diagnostic('TUI_CLEANUP_FAILED', `TUI cleanup failed: ${task.phase}.`, {
        target: task.owner,
        cause,
        data: { phase: task.phase }
      }));
    } finally {
      pending.delete(task);
    }
  });
  const allSettled = Promise.all(settlements).then(() => 'settled' as const);
  const timeoutController = new AbortController();
  const timeout = clock.sleep(policy.gracePeriodMs, timeoutController.signal).then(() => 'timeout' as const);
  const outcome = await Promise.race([allSettled, timeout]);
  if (outcome === 'settled') {
    timeoutController.abort();
    return diagnostics;
  }
  for (const task of pending) {
    diagnostics.push(diagnostic('TUI_CLEANUP_TIMEOUT', `TUI cleanup exceeded its grace period: ${task.phase}.`, {
      target: task.owner,
      data: { phase: task.phase, gracePeriodMs: policy.gracePeriodMs }
    }));
  }
  return diagnostics;
}

function assertCleanupPolicy(policy: TuiCleanupPolicy): void {
  if (!Number.isFinite(policy.gracePeriodMs) || policy.gracePeriodMs < 0) {
    throw new RangeError('TUI cleanup gracePeriodMs must be a non-negative finite number.');
  }
}

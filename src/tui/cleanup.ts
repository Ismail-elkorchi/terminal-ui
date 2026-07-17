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
  readonly run: () => Promise<void>;
}

export async function settleTuiCleanup(
  clock: TerminalClock,
  tasks: readonly TuiCleanupTask[],
  policy: TuiCleanupPolicy = defaultTuiCleanupPolicy
): Promise<readonly TerminalDiagnostic[]> {
  if (tasks.length === 0) return [];
  const diagnostics: TerminalDiagnostic[] = [];
  for (const task of tasks) {
    diagnostics.push(...await settleCleanupTask(clock, task, policy));
  }
  return Object.freeze([...diagnostics]);
}

async function settleCleanupTask(
  clock: TerminalClock,
  task: TuiCleanupTask,
  policy: TuiCleanupPolicy
): Promise<readonly TerminalDiagnostic[]> {
  const diagnostics: TerminalDiagnostic[] = [];
  let acceptingDiagnostics = true;
  const completion = Promise.resolve()
    .then(task.run)
    .then(() => 'settled' as const)
    .catch((cause: unknown) => {
      if (acceptingDiagnostics) {
        diagnostics.push(diagnostic('TUI_CLEANUP_FAILED', `TUI cleanup failed: ${task.phase}.`, {
          target: task.owner,
          cause,
          data: { phase: task.phase }
        }));
      }
      return 'settled' as const;
    });
  const timeoutController = new AbortController();
  const timeout = Promise.resolve()
    .then(() => clock.sleep(policy.gracePeriodMs, timeoutController.signal))
    .then(() => 'timeout' as const)
    .catch((cause: unknown) => {
      if (acceptingDiagnostics) {
        diagnostics.push(diagnostic('TUI_CLEANUP_FAILED', 'TUI cleanup clock failed.', {
          target: task.owner,
          cause,
          data: { phase: 'clock', cleanupPhase: task.phase }
        }));
      }
      return 'clock_failed' as const;
    });
  const outcome = await Promise.race([completion, timeout]);
  if (outcome === 'settled') timeoutController.abort();
  if (outcome === 'timeout') {
    diagnostics.push(diagnostic('TUI_CLEANUP_TIMEOUT', `TUI cleanup exceeded its grace period: ${task.phase}.`, {
      target: task.owner,
      data: { phase: task.phase, gracePeriodMs: policy.gracePeriodMs }
    }));
  }
  acceptingDiagnostics = false;
  return diagnostics;
}

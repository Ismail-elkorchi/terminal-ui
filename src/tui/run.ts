import { diagnostic } from '../diagnostics.ts';
import { runTuiInputLoop } from './input-loop.ts';
import {
  restoreReasonForExit,
  restoreTuiSession,
  setupTuiSession,
  tuiSnapshot
} from './lifecycle.ts';
import { runTuiNonTty } from './non-tty.ts';
import { createTuiRuntime } from './runtime.ts';
import { settleTuiCleanup } from './cleanup.ts';
import { createTuiTranscript, recordTuiRestore, withTuiTranscript } from './transcript.ts';
import type { TerminalDiagnostic } from '../diagnostics.ts';
import type { TerminalHost, TerminalSession } from '../host/index.ts';
import type { TuiCleanupTask } from './cleanup.ts';
import type { TuiApp, TuiExit, TuiRunOptions, TuiRuntime } from './types.ts';

export async function runTui<TState, TMessage>(
  app: TuiApp<TState, TMessage>,
  host?: TerminalHost,
  options: TuiRunOptions<TState> = {}
): Promise<TuiExit<TState>> {
  const transcript = createTuiTranscript(app);
  if (host === undefined) {
    return withTuiTranscript(errorExit(app.id, [
      diagnostic('HOST_CAPABILITY_UNAVAILABLE', 'Full-screen TUI requires an explicit terminal host.', {
        target: app.id
      })
    ]), transcript);
  }

  let session: TerminalSession | undefined;
  let runtime: TuiRuntime<TState, TMessage> | undefined;
  let exit: TuiExit<TState> | undefined;
  let failure: unknown;
  let setupFailed = false;
  let setupFailureDiagnostic: TerminalDiagnostic | undefined;
  const setupDiagnostics: TerminalDiagnostic[] = [];

  try {
    const nonTtyExit = await runTuiNonTty(app, host, transcript);
    if (nonTtyExit !== undefined) return withTuiTranscript(nonTtyExit, transcript);
    session = await host.beginSession({ id: app.id });
    const setup = await setupTuiSession(session, options.sessionPolicy);
    setupDiagnostics.push(...setup.diagnostics);
    if (!setup.ok) {
      setupFailed = true;
      setupFailureDiagnostic = diagnostic(
        'HOST_PROTOCOL_UNSUPPORTED',
        'Required terminal session protocol setup failed.',
        {
          target: app.id,
          data: {
            applied: setup.applied.map((item) => item.kind),
            skipped: setup.skipped.map((item) => item.kind)
          }
        }
      );
    } else {
      runtime = createTuiRuntime({
        app,
        host,
        ...(options.initialFocusPath === undefined ? {} : { initialFocusPath: options.initialFocusPath }),
        ...(options.theme === undefined ? {} : { theme: options.theme }),
        input: {
          capabilities: session.capabilities,
          bracketedPaste: setup.applied.some((item) => item.kind === 'bracketedPaste' && item.enabled),
          keyboard: setup.applied.some((item) => item.kind === 'enhancedKeyboard' && item.enabled)
            ? 'enhanced'
            : 'legacy'
        },
        diagnostics: setupDiagnostics,
        ...(transcript === undefined ? {} : { transcript })
      });
      await runtime.start();
      exit = await runTuiInputLoop(runtime, transcript);
    }
  } catch (cause) {
    failure = cause;
  }

  const cleanupDiagnostics = await cleanupTuiRun(app, host, runtime, exit, options);
  const restoreDiagnostics = session === undefined
    ? []
    : await restoreTuiSession(
      session,
      failure === undefined && !setupFailed && exit !== undefined && !hasFailure(cleanupDiagnostics)
        ? restoreReasonForExit(exit.status)
        : 'error'
    );
  if (session !== undefined) recordTuiRestore(transcript, session.initialState);

  const terminalDiagnostics = mergeDiagnostics(
    failure === undefined ? [] : [diagnostic('TUI_RUN_FAILED', 'TUI run failed before completion.', {
      target: app.id,
      cause: failure
    })],
    setupFailureDiagnostic === undefined ? [] : [setupFailureDiagnostic],
    setupDiagnostics,
    cleanupDiagnostics,
    restoreDiagnostics
  );
  if (setupFailed || failure !== undefined || exit === undefined || hasFailure(cleanupDiagnostics) || hasFailure(restoreDiagnostics)) {
    return withTuiTranscript(errorExitFromRuntime(app.id, runtime, exit, terminalDiagnostics), transcript);
  }
  return withTuiTranscript({
    ...exit,
    diagnostics: mergeDiagnostics(exit.diagnostics, cleanupDiagnostics, restoreDiagnostics)
  }, transcript);
}

async function cleanupTuiRun<TState, TMessage>(
  app: TuiApp<TState, TMessage>,
  host: TerminalHost,
  runtime: TuiRuntime<TState, TMessage> | undefined,
  exit: TuiExit<TState> | undefined,
  options: TuiRunOptions<TState>
): Promise<readonly TerminalDiagnostic[]> {
  const tasks: TuiCleanupTask[] = [];
  if (runtime !== undefined) {
    tasks.push({ owner: app.id, phase: 'runtime', completion: runtime.dispose() });
  }
  if (exit !== undefined && 'state' in exit && app.definition.onExit !== undefined) {
    const state = exit.state;
    tasks.push({
      owner: app.id,
      phase: 'onExit',
      completion: Promise.resolve().then(async () => app.definition.onExit?.(state))
    });
  }
  return settleTuiCleanup(host.clock, tasks, options.cleanup);
}

function errorExit<TState>(id: string, diagnostics: readonly TerminalDiagnostic[]): TuiExit<TState> {
  return { status: 'error', diagnostics, snapshot: tuiSnapshot(id) };
}

function errorExitFromRuntime<TState, TMessage>(
  id: string,
  runtime: TuiRuntime<TState, TMessage> | undefined,
  exit: TuiExit<TState> | undefined,
  diagnostics: readonly TerminalDiagnostic[]
): TuiExit<TState> {
  if (exit !== undefined && 'state' in exit) {
    return { status: 'error', state: exit.state, diagnostics, snapshot: exit.snapshot };
  }
  if (runtime !== undefined) {
    try {
      return {
        status: 'error',
        state: runtime.state(),
        diagnostics,
        snapshot: runtime.frame()?.accessibility ?? tuiSnapshot(id)
      };
    } catch {
      return errorExit(id, diagnostics);
    }
  }
  return errorExit(id, diagnostics);
}

function hasFailure(diagnostics: readonly TerminalDiagnostic[]): boolean {
  return diagnostics.some((item) => item.severity === 'error' || item.severity === 'fatal');
}

function mergeDiagnostics(
  ...groups: readonly (readonly TerminalDiagnostic[])[]
): readonly TerminalDiagnostic[] {
  const seen = new Set<string>();
  const merged: TerminalDiagnostic[] = [];
  for (const item of groups.flat()) {
    const identity = JSON.stringify(item);
    if (seen.has(identity)) continue;
    seen.add(identity);
    merged.push(item);
  }
  return merged;
}

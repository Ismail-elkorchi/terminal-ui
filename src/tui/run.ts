import { diagnostic } from '../diagnostics.ts';
import { runTuiInputLoop } from './input-loop.ts';
import {
  restoreReasonForExit,
  restoreTuiSession,
  setupTuiSession,
  tuiSnapshot,
  withDiagnostics
} from './lifecycle.ts';
import { runTuiNonTty } from './non-tty.ts';
import { createTuiRuntime } from './runtime.ts';
import { createTuiTranscript, recordTuiRestore, withTuiTranscript } from './transcript.ts';
import type { TerminalHost } from '../host/index.ts';
import type { TerminalDiagnostic } from '../diagnostics.ts';
import type { TuiApp, TuiExit, TuiRunOptions } from './types.ts';

export async function runTui<TState, TMessage>(
  app: TuiApp<TState, TMessage>,
  host?: TerminalHost,
  options: TuiRunOptions<TState> = {}
): Promise<TuiExit<TState>> {
  const transcript = createTuiTranscript(app);
  if (host === undefined) {
    return withTuiTranscript({
      status: 'error',
      diagnostics: [
        diagnostic('HOST_CAPABILITY_UNAVAILABLE', 'Full-screen TUI requires an explicit terminal host.', {
          target: app.id
        })
      ],
      snapshot: tuiSnapshot(app.id)
    }, transcript);
  }
  const nonTtyExit = await runTuiNonTty(app, host, transcript);
  if (nonTtyExit !== undefined) return withTuiTranscript(nonTtyExit, transcript);
  const session = await host.beginSession({ id: app.id });
  const setup = await setupTuiSession(session, options.sessionPolicy);
  const setupDiagnostics = setup.diagnostics;
  if (!setup.ok) {
    const restoreDiagnostics = await restoreTuiSession(session, 'error');
    recordTuiRestore(transcript, session.initialState);
    return withTuiTranscript({
      status: 'error',
      diagnostics: [
        ...setupDiagnostics,
        diagnostic('HOST_PROTOCOL_UNSUPPORTED', 'Required terminal session protocol setup failed.', {
          severity: 'error',
          target: app.id,
          data: {
            applied: setup.applied.map((item) => item.kind),
            skipped: setup.skipped.map((item) => item.kind)
          }
        }),
        ...restoreDiagnostics
      ],
      snapshot: tuiSnapshot(app.id)
    }, transcript);
  }
  let runtime: ReturnType<typeof createTuiRuntime<TState, TMessage>> | undefined;
  let exit: TuiExit<TState> | undefined;
  let failure: unknown;
  try {
    runtime = createTuiRuntime({
      app,
      host,
      ...(options.initialFocusPath === undefined ? {} : { initialFocusPath: options.initialFocusPath }),
      ...(options.theme === undefined ? {} : { theme: options.theme }),
      input: {
        capabilities: session.capabilities,
        bracketedPaste: setup.applied.some((item) => item.kind === 'bracketedPaste' && item.enabled)
      },
      diagnostics: setupDiagnostics,
      ...(transcript === undefined ? {} : { transcript })
    });
    await runtime.start();
    exit = await runTuiInputLoop(runtime, transcript);
  } catch (cause) {
    failure = cause;
  }

  const cleanupDiagnostics = await cleanupTuiRun(app, runtime, exit);
  const cleanupFailed = cleanupDiagnostics.some(isFailureDiagnostic);
  const restoreDiagnostics = await restoreTuiSession(
    session,
    failure === undefined && exit !== undefined && !cleanupFailed ? restoreReasonForExit(exit.status) : 'error'
  );
  recordTuiRestore(transcript, session.initialState);

  if (failure !== undefined) {
    return withTuiTranscript({
      status: 'error',
      diagnostics: [
        ...setupDiagnostics,
        diagnostic('TUI_RUN_FAILED', 'TUI run failed before completion.', {
          cause: failure,
          target: app.id
        }),
        ...cleanupDiagnostics,
        ...restoreDiagnostics
      ],
      snapshot: tuiSnapshot(app.id)
    }, transcript);
  }

  if (exit === undefined) {
    return withTuiTranscript({
      status: 'error',
      diagnostics: [
        ...setupDiagnostics,
        diagnostic('TUI_RUN_FAILED', 'TUI run ended without an exit result.', { target: app.id }),
        ...cleanupDiagnostics,
        ...restoreDiagnostics
      ],
      snapshot: tuiSnapshot(app.id)
    }, transcript);
  }

  if (cleanupFailed) {
    return withTuiTranscript({
      status: 'error',
      ...('state' in exit && exit.state !== undefined ? { state: exit.state } : {}),
      diagnostics: [...exit.diagnostics, ...cleanupDiagnostics, ...restoreDiagnostics],
      snapshot: exit.snapshot
    }, transcript);
  }

  return withTuiTranscript(withDiagnostics(exit, [...cleanupDiagnostics, ...restoreDiagnostics]), transcript);
}

function isFailureDiagnostic(item: TerminalDiagnostic): boolean {
  return item.severity === 'error' || item.severity === 'fatal';
}

async function cleanupTuiRun<TState, TMessage>(
  app: TuiApp<TState, TMessage>,
  runtime: ReturnType<typeof createTuiRuntime<TState, TMessage>> | undefined,
  exit: TuiExit<TState> | undefined
): Promise<readonly TerminalDiagnostic[]> {
  const diagnostics: TerminalDiagnostic[] = [];
  if (runtime !== undefined) {
    try {
      await runtime.dispose();
    } catch (cause) {
      diagnostics.push(diagnostic('TUI_CLEANUP_FAILED', 'TUI runtime disposal failed.', {
        cause,
        target: app.id,
        data: { phase: 'runtime' }
      }));
    }
  }
  if (exit !== undefined && 'state' in exit && exit.state !== undefined && app.definition.onExit !== undefined) {
    try {
      await app.definition.onExit(exit.state);
    } catch (cause) {
      diagnostics.push(diagnostic('TUI_CLEANUP_FAILED', 'TUI exit handler failed.', {
        cause,
        target: app.id,
        data: { phase: 'onExit' }
      }));
    }
  }
  return diagnostics;
}

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
      ...(transcript === undefined ? {} : { transcript })
    });
    await runtime.start();
    const exit = await runTuiInputLoop(runtime, transcript);
    await runtime.dispose();
    if ('state' in exit && exit.state !== undefined) {
      await app.definition.onExit?.(exit.state);
    }
    const restoreDiagnostics = await restoreTuiSession(session, restoreReasonForExit(exit.status));
    recordTuiRestore(transcript, session.initialState);
    return withTuiTranscript(withDiagnostics(exit, [...setupDiagnostics, ...restoreDiagnostics]), transcript);
  } catch (cause) {
    await runtime?.dispose();
    const restoreDiagnostics = await restoreTuiSession(session, 'error');
    recordTuiRestore(transcript, session.initialState);
    return withTuiTranscript({
      status: 'error',
      diagnostics: [
        ...setupDiagnostics,
        diagnostic('TUI_RENDER_FAILED', 'TUI run failed before completion.', {
          cause,
          target: app.id
        }),
        ...restoreDiagnostics
      ],
      snapshot: tuiSnapshot(app.id)
    }, transcript);
  }
}

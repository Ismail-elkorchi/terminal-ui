import { diagnostic } from '../diagnostics.ts';
import { runTuiInputLoop } from './input-loop.ts';
import {
  restoreReasonForExit,
  setupTuiSession,
  tuiSnapshot
} from './lifecycle.ts';
import { runTuiNonTty } from './non-tty.ts';
import { createTuiRuntime } from './runtime.ts';
import { TuiRunLifecycleOwner } from './run-lifecycle.ts';
import { normalizeTuiRunOptions } from './run-configuration.ts';
import { createTuiTranscript, withTuiTranscript } from './transcript.ts';
import type { TerminalDiagnostic } from '../diagnostics.ts';
import type { TerminalHost, TerminalSession } from '../host/index.ts';
import { LEGACY_KEYBOARD_PROFILE } from '../protocol/index.ts';
import type { TuiApp, TuiExit, TuiRunOptions, TuiRuntime } from './types.ts';

export async function runTui<TState, TMessage>(
  app: TuiApp<TState, TMessage>,
  host?: TerminalHost,
  options: TuiRunOptions<TState> = {}
): Promise<TuiExit<TState>> {
  const transcript = createTuiTranscript(app);
  let normalized;
  try {
    normalized = normalizeTuiRunOptions(options);
  } catch (cause) {
    return withTuiTranscript(errorExit(app.id, [
      diagnostic('TUI_RUN_FAILED', 'TUI run configuration is invalid.', {
        target: app.id,
        cause,
        data: { phase: 'configuration' }
      })
    ]), transcript);
  }
  if (host === undefined) {
    return withTuiTranscript(errorExit(app.id, [
      diagnostic('HOST_CAPABILITY_UNAVAILABLE', 'Full-screen TUI requires an explicit terminal host.', {
        target: app.id
      })
    ]), transcript);
  }

  const lifecycle = new TuiRunLifecycleOwner(app, host, normalized, transcript);
  let session: TerminalSession | undefined;
  let exit: TuiExit<TState> | undefined;
  let failure: unknown;
  let setupFailed = false;
  let setupFailureDiagnostic: TerminalDiagnostic | undefined;
  const setupDiagnostics: TerminalDiagnostic[] = [];

  try {
    const nonTtyExit = await runTuiNonTty(app, host, transcript);
    if (nonTtyExit !== undefined) return withTuiTranscript(nonTtyExit, transcript);
    session = await host.beginSession({ id: app.id });
    lifecycle.openSession(session);
    const setup = await setupTuiSession(session, normalized.sessionPolicy);
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
      const runtime = createTuiRuntime({
        app,
        host,
        ...(normalized.initialFocus === undefined ? {} : { initialFocus: normalized.initialFocus }),
        ...(normalized.theme === undefined ? {} : { theme: normalized.theme }),
        input: {
          capabilities: session.capabilities,
          bracketedPaste: setup.applied.some((item) => item.kind === 'bracketedPaste' && item.enabled),
          keyboard: setup.applied.find((item) => item.kind === 'keyboardProfile')?.enabled
            ?? LEGACY_KEYBOARD_PROFILE,
          escapeDelayMs: normalized.input.escapeDelayMs
        },
        diagnostics: setupDiagnostics,
        ...(transcript === undefined ? {} : { transcript })
      });
      lifecycle.activateRuntime(runtime);
      await runtime.start();
      exit = await runTuiInputLoop(runtime, transcript);
      lifecycle.complete(exit);
    }
  } catch (cause) {
    failure = cause;
  }

  const finalization = await lifecycle.finalize(
    failure === undefined && !setupFailed && exit !== undefined
      ? restoreReasonForExit(exit.status)
      : 'error'
  );

  const terminalDiagnostics = mergeDiagnostics(
    failure === undefined ? [] : [diagnostic('TUI_RUN_FAILED', 'TUI run failed before completion.', {
      target: app.id,
      cause: failure
    })],
    setupFailureDiagnostic === undefined ? [] : [setupFailureDiagnostic],
    setupDiagnostics,
    finalization.diagnostics
  );
  if (setupFailed || failure !== undefined || exit === undefined || hasFailure(finalization.diagnostics)) {
    return withTuiTranscript(errorExitFromRuntime(app.id, lifecycle.runtime, exit, terminalDiagnostics), transcript);
  }
  return withTuiTranscript({
    ...exit,
    diagnostics: mergeDiagnostics(exit.diagnostics, finalization.diagnostics)
  }, transcript);
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

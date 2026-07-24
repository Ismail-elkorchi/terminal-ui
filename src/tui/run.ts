import { createDiagnosticOccurrenceReporter, diagnostic } from '../diagnostics.ts';
import { runTuiInputLoop } from './input-loop.ts';
import {
  restoreReasonForExit,
  setupTuiSession,
  tuiSnapshot
} from './lifecycle.ts';
import { runTuiNonTty } from './non-tty.ts';
import { createTuiRuntime } from './runtime.ts';
import { TuiRunLifecycleOwner } from './run-lifecycle.ts';
import { runTuiLifecyclePhase } from './lifecycle-phase.ts';
import { normalizeTuiRunOptions } from './run-configuration.ts';
import { createTuiTranscript, withTuiTranscript } from './transcript.ts';
import type {
  DiagnosticOccurrence,
  DiagnosticOccurrenceReporter,
  TerminalDiagnostic
} from '../diagnostics.ts';
import type { TerminalHost, TerminalSession } from '../host/index.ts';
import type { TuiLifecyclePhase } from './lifecycle-phase.ts';
import type { NormalizedTuiRunOptions } from './run-configuration.ts';
import { LEGACY_KEYBOARD_PROFILE } from '../protocol/index.ts';
import type { TuiApp, TuiExit, TuiRunOptions, TuiRuntime } from './types.ts';

export async function runTui<TState, TMessage>(
  app: TuiApp<TState, TMessage>,
  host?: TerminalHost,
  options: TuiRunOptions<TState> = {}
): Promise<TuiExit<TState>> {
  const transcript = createTuiTranscript(app);
  const diagnosticReporter = createDiagnosticOccurrenceReporter(`${app.id}:run`);
  let normalized: NormalizedTuiRunOptions<TState>;
  try {
    normalized = normalizeTuiRunOptions(options);
  } catch (cause) {
    return withTuiTranscript(errorExit(app.id, reportDiagnostics(diagnosticReporter, [
      diagnostic('TUI_RUN_FAILED', 'TUI run configuration is invalid.', {
        target: app.id,
        cause,
        data: { phase: 'configuration' }
      })
    ])), transcript);
  }
  if (host === undefined) {
    return withTuiTranscript(errorExit(app.id, reportDiagnostics(diagnosticReporter, [
      diagnostic('HOST_CAPABILITY_UNAVAILABLE', 'Full-screen TUI requires an explicit terminal host.', {
        target: app.id
      })
    ])), transcript);
  }
  const terminalHost = host;

  const lifecycle = new TuiRunLifecycleOwner(app, terminalHost, normalized, transcript);
  let session: TerminalSession | undefined;
  let exit: TuiExit<TState> | undefined;
  let failure: unknown;
  let setupFailed = false;
  let setupFailureDiagnostic: TerminalDiagnostic | undefined;
  const setupDiagnostics: TerminalDiagnostic[] = [];
  const startupDiagnostics: TerminalDiagnostic[] = [];

  try {
    const capabilities = await startupPhase('capabilities', async (signal) => terminalHost.getCapabilities({
      activeProbes: normalized.sessionPolicy.keyboard.profile.kind === 'kitty'
        ? ['keyboardProtocol']
        : [],
      signal
    }));
    const nonTtyExit = await runTuiNonTty(app, terminalHost, transcript, normalized, capabilities);
    if (nonTtyExit !== undefined) return withTuiTranscript(nonTtyExit, transcript);
    const openedSession = await startupPhase('session', async () => terminalHost.beginSession({ id: app.id }));
    session = openedSession;
    lifecycle.openSession(openedSession);
    const setup = await startupPhase('setup', async (signal) =>
      setupTuiSession(openedSession, normalized.sessionPolicy, { signal }));
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
        host: terminalHost,
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
      await startupPhase('runtime_start', async () => runtime.start());
      exit = await runTuiInputLoop(runtime, transcript, (retirement) => {
        lifecycle.retireInput(retirement);
      });
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

  if (setupFailed || failure !== undefined || exit === undefined || hasFailure(finalization.diagnostics)) {
    const preRuntimeDiagnostics = lifecycle.runtime === undefined
      ? reportDiagnostics(diagnosticReporter, setupDiagnostics)
      : lifecycle.runtime.diagnostics();
    const terminalDiagnostics = mergeOccurrences(
      preRuntimeDiagnostics,
      reportDiagnostics(diagnosticReporter, [
        ...startupDiagnostics,
        ...(failure === undefined || startupDiagnostics.length > 0 ? [] : [diagnostic('TUI_RUN_FAILED', 'TUI run failed before completion.', {
          target: app.id,
          cause: failure
        })]),
        ...(setupFailureDiagnostic === undefined ? [] : [setupFailureDiagnostic]),
        ...finalization.diagnostics
      ])
    );
    return withTuiTranscript(errorExitFromRuntime(app.id, lifecycle.runtime, exit, terminalDiagnostics), transcript);
  }
  return withTuiTranscript({
    ...exit,
    diagnostics: mergeOccurrences(
      exit.diagnostics,
      reportDiagnostics(diagnosticReporter, finalization.diagnostics)
    )
  }, transcript);

  async function startupPhase<TValue>(
    phase: Extract<TuiLifecyclePhase, 'capabilities' | 'session' | 'setup' | 'runtime_start'>,
    operation: (signal: AbortSignal) => TValue | Promise<TValue>
  ): Promise<TValue> {
    const outcome = await runTuiLifecyclePhase({
      clock: terminalHost.clock,
      target: app.id,
      phase,
      timeoutMs: normalized.lifecycle.startupTimeoutMs,
      operation
    });
    if (outcome.status === 'settled') return outcome.value;
    startupDiagnostics.push(outcome.diagnostic);
    throw new Error(outcome.diagnostic.message, { cause: outcome.diagnostic.cause });
  }
}

function errorExit<TState>(id: string, diagnostics: readonly DiagnosticOccurrence[]): TuiExit<TState> {
  return { status: 'error', diagnostics, snapshot: tuiSnapshot(id) };
}

function errorExitFromRuntime<TState, TMessage>(
  id: string,
  runtime: TuiRuntime<TState, TMessage> | undefined,
  exit: TuiExit<TState> | undefined,
  diagnostics: readonly DiagnosticOccurrence[]
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

function mergeOccurrences(
  ...groups: readonly (readonly DiagnosticOccurrence[])[]
): readonly DiagnosticOccurrence[] {
  const seen = new Set<string>();
  const merged: DiagnosticOccurrence[] = [];
  for (const item of groups.flat()) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    merged.push(item);
  }
  return merged;
}

function reportDiagnostics(
  reporter: DiagnosticOccurrenceReporter,
  diagnostics: readonly TerminalDiagnostic[]
): readonly DiagnosticOccurrence[] {
  return diagnostics.map((item) => reporter.report(item));
}

import { createDiagnosticOccurrenceReporter, diagnostic } from '../diagnostics.ts';
import { createTuiSignalQueue, runTuiInputLoop } from './input-loop.ts';
import {
  restoreReasonForExit,
  setupTuiSession,
  tuiSnapshot
} from './lifecycle.ts';
import { createTerminalHost } from '../host/index.ts';
import { runTuiNonTty } from './non-tty.ts';
import { createTuiRuntimeWithCapabilitySnapshot } from './runtime.ts';
import { assertTuiApp } from './definition.ts';
import { TuiRunLifecycleOwner } from './run-lifecycle.ts';
import { runTuiLifecyclePhase } from './lifecycle-phase.ts';
import { TuiInputSuspensionController } from './input-suspension.ts';
import { createTerminalSuspension } from './terminal-suspension.ts';
import { normalizeTuiRunOptions } from './run-configuration.ts';
import { inputProfileForSession } from './session-policy.ts';
import { createTuiTranscript, withTuiTranscript } from './transcript.ts';
import type {
  DiagnosticOccurrence,
  DiagnosticOccurrenceReporter,
  TerminalDiagnostic
} from '../diagnostics.ts';
import type { TerminalHost } from '../host/index.ts';
import type { TuiLifecyclePhase } from './lifecycle-phase.ts';
import type { NormalizedTuiRunOptions } from './run-configuration.ts';
import type { TuiApp, TuiExit, TuiRunOptions, TuiRuntime } from './types.ts';

export async function runTui<TState, TMessage>(
  app: TuiApp<TState, TMessage>,
  host?: TerminalHost,
  options: TuiRunOptions<TState> = {}
): Promise<TuiExit<TState>> {
  assertTuiApp(app);
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
  const ownsHost = host === undefined;
  const terminalHost = host ?? createTerminalHost();
  const signals = createTuiSignalQueue(terminalHost.signals.subscribe.bind(terminalHost.signals));
  const lifecycle = new TuiRunLifecycleOwner(app, terminalHost, ownsHost, normalized, transcript);
  const inputSuspension = new TuiInputSuspensionController();
  const withTerminalSuspended = createTerminalSuspension({
    appId: app.id,
    host: terminalHost,
    input: inputSuspension,
    policy: normalized.sessionPolicy,
    graphics: normalized.graphics,
    recoveryTimeoutMs: normalized.lifecycle.restorationTimeoutMs,
    ...(transcript === undefined ? {} : { transcript }),
    runtime: () => {
      const runtime = lifecycle.runtime;
      if (runtime === undefined) throw new Error('TUI runtime is unavailable during terminal suspension.');
      return runtime;
    },
    session: () => {
      const activeSession = lifecycle.session;
      if (activeSession === undefined) throw new Error('Terminal session is unavailable during suspension.');
      return activeSession;
    },
    replaceSession: (nextSession) => {
      lifecycle.replaceSession(nextSession);
    },
    canReacquire: () => lifecycle.phase === 'runtime_active'
  });
  let exit: TuiExit<TState> | undefined;
  let failure: unknown;
  let setupFailed = false;
  let setupFailureDiagnostic: TerminalDiagnostic | undefined;
  const setupDiagnostics: TerminalDiagnostic[] = [];
  const startupDiagnostics: TerminalDiagnostic[] = [];

  try {
    const capabilities = await startupPhase('capabilities', async (signal) => terminalHost.getCapabilities({
      activeProbes: [
        ...(terminalHost.runtime === 'memory'
          ? []
          : [
              'terminalModes',
              'keyboardProtocol',
              ...(normalized.graphics === 'none' ? [] : ['graphics'] as const),
            ] as const)
      ],
      signal
    }));
    const nonTtyExit = await runTuiNonTty(
      app,
      terminalHost,
      ownsHost,
      transcript,
      normalized,
      capabilities
    );
    if (nonTtyExit !== undefined) {
      signals.dispose();
      return withTuiTranscript(nonTtyExit, transcript);
    }
    assertRequiredGraphics(normalized.graphics, capabilities);
    const openedSession = await startupPhase('session', async () => terminalHost.beginSession({ id: app.id }));
    lifecycle.openSession(openedSession);
    const setup = await startupPhase('setup', async (signal) =>
      setupTuiSession(openedSession, normalized.sessionPolicy, { signal }));
    setupDiagnostics.push(...setup.diagnostics);
    if (setup.status === 'failed') {
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
      const runtime = createTuiRuntimeWithCapabilitySnapshot({
        app,
        host: terminalHost,
        graphics: normalized.graphics,
        graphicsBudget: normalized.graphicsBudget,
        ...(normalized.initialFocus === undefined ? {} : { initialFocus: normalized.initialFocus }),
        ...(normalized.theme === undefined ? {} : { theme: normalized.theme }),
        withTerminalSuspended,
        input: {
          capabilities: openedSession.capabilities,
          ...inputProfileForSession(setup),
          escapeDelayMs: normalized.input.escapeDelayMs
        },
        diagnostics: setupDiagnostics,
        ...(transcript === undefined ? {} : { transcript })
      }, openedSession.capabilities);
      lifecycle.activateRuntime(runtime);
      await startupPhase('runtime_start', async () => runtime.start());
      exit = await runTuiInputLoop(runtime, terminalHost, app.id, transcript, (retirement) => {
        lifecycle.retireInput(retirement);
      }, inputSuspension, signals);
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
  signals.dispose();

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
      operation: (signal) => operation(AbortSignal.any([signal, signals.interruption]))
    });
    if (outcome.status === 'settled') return outcome.value;
    startupDiagnostics.push(outcome.diagnostic);
    throw new Error(outcome.diagnostic.message, { cause: outcome.diagnostic.cause });
  }
}

function assertRequiredGraphics(
  mode: import('../graphics/index.ts').TerminalGraphicsMode,
  capabilities: import('../host/index.ts').TerminalCapabilityProfile,
): void {
  if (mode === 'kitty' && (
    capabilities.graphics.kitty.support !== 'supported'
    || capabilities.graphics.kitty.availability !== 'available'
  )) throw new Error('Kitty graphics were required but could not be verified.');
  if (mode === 'sixel' && (
    capabilities.graphics.sixel.support !== 'supported'
    || capabilities.graphics.sixel.availability !== 'available'
    || capabilities.graphics.cellPixels === undefined
  )) throw new Error('SIXEL graphics were required but support or cell pixel geometry is unavailable.');
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

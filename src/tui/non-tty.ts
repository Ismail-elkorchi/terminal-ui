import { createDiagnosticOccurrenceReporter, diagnostic } from '../diagnostics.ts';
import { projectTuiOutput } from '../renderer/internal/output-projection.ts';
import { diffFrames } from '../renderer/internal/render.ts';
import { completedExitFromSnapshot } from './exit.ts';
import { runTuiLifecyclePhase } from './lifecycle-phase.ts';
import { requireCommittedTerminalWrite } from '../host/write-receipt.ts';
import { tuiSnapshot } from './lifecycle.ts';
import { renderCurrentFrame, resolveTuiTheme } from './runtime-frame.ts';
import { recordTuiCommit } from './transcript.ts';
import type { DiagnosticOccurrence, DiagnosticOccurrenceReporter, TerminalDiagnostic } from '../diagnostics.ts';
import type { TerminalCapabilityProfile, TerminalHost } from '../host/index.ts';
import type { TranscriptRecorder } from '../transcript/index.ts';
import type { NormalizedTuiRunOptions } from './run-configuration.ts';
import type { NormalizedTuiLifecyclePolicy } from './run-configuration.ts';
import type { TuiApp, TuiContext, TuiExit, TuiRuntimeOptions } from './types.ts';

export async function runTuiNonTty<TState, TMessage>(
  app: TuiApp<TState, TMessage>,
  host: TerminalHost,
  transcript: TranscriptRecorder | undefined,
  options: NormalizedTuiRunOptions<TState>,
  capabilities: TerminalCapabilityProfile
): Promise<TuiExit<TState> | undefined> {
  if (capabilities.isTty) return undefined;
  const reporter = createDiagnosticOccurrenceReporter(`${app.id}:non-tty`);
  const policy = app.definition.nonTty ?? { mode: 'reject' as const };
  if (policy.mode === 'reject') {
    const diagnostics = [diagnostic('HOST_CAPABILITY_UNAVAILABLE', 'Full-screen TUI requires a TTY terminal host.', {
      target: app.id,
      ...(policy.diagnosticHint === undefined ? {} : { hint: policy.diagnosticHint }),
      data: { runtime: capabilities.runtime, isTty: false }
    })];
    return finalizeRejectedHost(app, host, reporter, diagnostics, options.lifecycle);
  }

  let state: TState;
  try {
    state = app.definition.init(nonTtyContext(host, capabilities));
  } catch (cause) {
    return finalizeFailedNonTtyRun(app, host, reporter, undefined, [diagnostic(
      'TUI_INITIALIZATION_FAILED',
      'Non-TTY TUI initialization failed.',
      { target: app.id, cause }
    )], options.lifecycle);
  }

  let frame;
  try {
    const context = nonTtyContext(host, capabilities);
    const runtime = runtimeOptions(app, host, transcript);
    frame = renderCurrentFrame(
      app,
      state,
      context,
      undefined,
      resolveTuiTheme(runtime.theme, state),
      0,
      `${app.id}:commit:1`
    ).frame;
    recordTuiCommit(transcript, {
      id: `${app.id}:commit:1`,
      stateVersion: 0,
      terminalSize: context.terminalSize,
      ...(frame.focusPath === undefined ? {} : { focusPath: frame.focusPath }),
      frame,
      diff: diffFrames(undefined, frame)
    });
  } catch (cause) {
    return finalizeFailedNonTtyRun(app, host, reporter, state, [diagnostic(
      'TUI_RENDER_FAILED',
      'Non-TTY TUI rendering failed.',
      { target: app.id, cause }
    )], options.lifecycle);
  }

  const diagnostics: TerminalDiagnostic[] = [];
  if (policy.mode === 'last_frame') {
    const projection = projectTuiOutput({ frame });
    const output = await runTuiLifecyclePhase({
      clock: host.clock,
      target: app.id,
      phase: 'output',
      timeoutMs: options.lifecycle.outputFlushTimeoutMs,
      operation: async (signal) => {
      requireCommittedTerminalWrite(await host.write(
        { text: `${projection.accessibleText}\n\n${projection.plainTextFrame}\n` },
        { signal }
      ));
      }
    });
    if (output.status !== 'settled') diagnostics.push(diagnostic(
      'TUI_OUTPUT_FAILED',
      `Non-TTY TUI output ${output.status === 'timed_out' ? 'timed out' : 'failed'}.`,
      {
        target: app.id,
        ...(output.diagnostic.cause === undefined ? {} : { cause: output.diagnostic.cause }),
        data: { status: output.status }
      }
    ));
  }
  if (app.definition.onExit !== undefined) {
    const onExit = app.definition.onExit;
    const exitHook = await runTuiLifecyclePhase({
      clock: host.clock,
      target: app.id,
      phase: 'onExit',
      timeoutMs: options.lifecycle.exitHandlerTimeoutMs,
      operation: async () => { await onExit(state); }
    });
    if (exitHook.status !== 'settled') diagnostics.push(diagnostic(
      'TUI_EXIT_HOOK_FAILED',
      `Non-TTY TUI exit hook ${exitHook.status === 'timed_out' ? 'timed out' : 'failed'}.`,
      {
        target: app.id,
        ...(exitHook.diagnostic.cause === undefined ? {} : { cause: exitHook.diagnostic.cause }),
        data: { status: exitHook.status }
      }
    ));
  }
  diagnostics.push(...await finalizeNonTtyHost(app.id, host, options.lifecycle));

  const occurrences = reportDiagnostics(reporter, diagnostics);
  return diagnostics.some(isFailure)
    ? {
        status: 'error',
        state,
        diagnostics: occurrences,
        snapshot: frame.accessibility
      }
    : {
        ...completedExitFromSnapshot(state, frame.accessibility, policy.mode),
        diagnostics: occurrences
      };
}

function nonTtyContext(host: TerminalHost, capabilities: TerminalCapabilityProfile): TuiContext {
  return {
    terminalSize: host.getTerminalSize(),
    capabilities,
    diagnostics: [],
    clock: host.clock
  };
}

function runtimeOptions<TState, TMessage>(
  app: TuiApp<TState, TMessage>,
  host: TerminalHost,
  transcript: TranscriptRecorder | undefined
): TuiRuntimeOptions<TState, TMessage> {
  return {
    app,
    host,
    ...(transcript === undefined ? {} : { transcript })
  };
}

async function finalizeRejectedHost<TState, TMessage>(
  app: TuiApp<TState, TMessage>,
  host: TerminalHost,
  reporter: DiagnosticOccurrenceReporter,
  initial: readonly TerminalDiagnostic[],
  lifecycle: NormalizedTuiLifecyclePolicy
): Promise<TuiExit<TState>> {
  const diagnostics = reportDiagnostics(reporter, [...initial, ...await finalizeNonTtyHost(app.id, host, lifecycle)]);
  return { status: 'error', diagnostics, snapshot: tuiSnapshot(app.id) };
}

async function finalizeFailedNonTtyRun<TState, TMessage>(
  app: TuiApp<TState, TMessage>,
  host: TerminalHost,
  reporter: DiagnosticOccurrenceReporter,
  state: TState | undefined,
  initial: readonly TerminalDiagnostic[],
  lifecycle: NormalizedTuiLifecyclePolicy
): Promise<TuiExit<TState>> {
  const diagnostics = reportDiagnostics(reporter, [...initial, ...await finalizeNonTtyHost(app.id, host, lifecycle)]);
  return {
    status: 'error',
    ...(state === undefined ? {} : { state }),
    diagnostics,
    snapshot: tuiSnapshot(app.id)
  };
}

async function finalizeNonTtyHost(
  target: string,
  host: TerminalHost,
  lifecycle: NormalizedTuiLifecyclePolicy
): Promise<readonly TerminalDiagnostic[]> {
  const phases = [
    await runTuiLifecyclePhase({
      clock: host.clock,
      target,
      phase: 'flush',
      timeoutMs: lifecycle.outputFlushTimeoutMs,
      operation: async (signal) => host.flush({ signal })
    }),
    await runTuiLifecyclePhase({
      clock: host.clock,
      target,
      phase: 'host',
      timeoutMs: lifecycle.hostDisposalTimeoutMs,
      operation: async (signal) => host.dispose({ signal })
    })
  ];
  return phases.flatMap((phase) => phase.status === 'settled' ? [] : [phase.diagnostic]);
}

function isFailure(item: TerminalDiagnostic): boolean {
  return item.severity === 'error' || item.severity === 'fatal';
}

function reportDiagnostics(
  reporter: DiagnosticOccurrenceReporter,
  diagnostics: readonly TerminalDiagnostic[]
): readonly DiagnosticOccurrence[] {
  return diagnostics.map((item) => reporter.report(item));
}

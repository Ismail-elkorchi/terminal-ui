import { diagnostic } from '../diagnostics.ts';
import { projectTuiOutput } from '../renderer/internal/output-projection.ts';
import { diffFrames } from '../renderer/internal/render.ts';
import { createTuiContext } from './context.ts';
import { completedExitFromSnapshot } from './exit.ts';
import { TuiFinalizationDeadline } from './finalization-deadline.ts';
import { tuiSnapshot } from './lifecycle.ts';
import { renderCurrentFrame } from './runtime-frame.ts';
import { recordTuiCommit } from './transcript.ts';
import type { TerminalDiagnostic } from '../diagnostics.ts';
import type { TerminalHost } from '../host/index.ts';
import type { TranscriptRecorder } from '../transcript/index.ts';
import type { NormalizedTuiRunOptions } from './run-configuration.ts';
import type { TuiApp, TuiExit, TuiRuntimeOptions } from './types.ts';

export async function runTuiNonTty<TState, TMessage>(
  app: TuiApp<TState, TMessage>,
  host: TerminalHost,
  transcript: TranscriptRecorder | undefined,
  options: NormalizedTuiRunOptions<TState>
): Promise<TuiExit<TState> | undefined> {
  const capabilities = await host.getCapabilities();
  if (capabilities.isTty) return undefined;
  const policy = app.definition.nonTty ?? { mode: 'reject' as const };
  if (policy.mode === 'reject') {
    const diagnostics = [diagnostic('HOST_CAPABILITY_UNAVAILABLE', 'Full-screen TUI requires a TTY terminal host.', {
      target: app.id,
      ...(policy.diagnosticHint === undefined ? {} : { hint: policy.diagnosticHint }),
      data: { runtime: capabilities.runtime, isTty: false }
    })];
    return finalizeRejectedHost(app, host, diagnostics, options.cleanup.timeoutMs);
  }

  let state: TState;
  try {
    state = app.definition.init(await createTuiContext(host));
  } catch (cause) {
    return finalizeFailedProjection(app, host, undefined, [diagnostic(
      'TUI_INITIALIZATION_FAILED',
      'Non-TTY TUI initialization failed.',
      { target: app.id, cause }
    )], options.cleanup.timeoutMs);
  }

  let frame;
  try {
    const context = await createTuiContext(host);
    frame = renderCurrentFrame(
      app,
      state,
      context,
      undefined,
      runtimeOptions(app, host, transcript),
      0,
      `${app.id}:commit:1`
    ).frame;
    recordTuiCommit(transcript, {
      id: `${app.id}:commit:1`,
      stateVersion: 0,
      viewport: context.viewport,
      ...(frame.focusPath === undefined ? {} : { focusPath: frame.focusPath }),
      frame,
      diff: diffFrames(undefined, frame)
    });
  } catch (cause) {
    return finalizeFailedProjection(app, host, state, [diagnostic(
      'TUI_PROJECTION_FAILED',
      'Non-TTY TUI projection failed.',
      { target: app.id, cause }
    )], options.cleanup.timeoutMs);
  }

  const deadline = new TuiFinalizationDeadline(host.clock, app.id, options.cleanup.timeoutMs);
  const diagnostics: TerminalDiagnostic[] = [];
  if (policy.mode === 'last_frame') {
    const projection = projectTuiOutput({ frame });
    const output = await deadline.run('output', async (signal) => {
      await host.write({ text: `${projection.accessibleText}\n\n${projection.plainTextFrame}\n` }, { signal });
    });
    if (output.status !== 'settled') diagnostics.push(diagnostic(
      'TUI_OUTPUT_FAILED',
      `Non-TTY TUI output ${output.status === 'timed_out' ? 'timed out' : 'failed'}.`,
      {
        target: app.id,
        ...(output.diagnostic?.cause === undefined ? {} : { cause: output.diagnostic.cause }),
        data: { status: output.status }
      }
    ));
  }
  if (app.definition.onExit !== undefined) {
    const exitHook = await deadline.run('onExit', async () => { await app.definition.onExit?.(state); });
    if (exitHook.status !== 'settled') diagnostics.push(diagnostic(
      'TUI_EXIT_HOOK_FAILED',
      `Non-TTY TUI exit hook ${exitHook.status === 'timed_out' ? 'timed out' : 'failed'}.`,
      {
        target: app.id,
        ...(exitHook.diagnostic?.cause === undefined ? {} : { cause: exitHook.diagnostic.cause }),
        data: { status: exitHook.status }
      }
    ));
  }
  diagnostics.push(...await finalizeNonTtyHost(deadline, host));

  return diagnostics.some(isFailure)
    ? {
        status: 'error',
        state,
        diagnostics,
        snapshot: frame.accessibility
      }
    : completedExitFromSnapshot(state, frame.accessibility, policy.mode);
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
  initial: readonly TerminalDiagnostic[],
  timeoutMs: number
): Promise<TuiExit<TState>> {
  const deadline = new TuiFinalizationDeadline(host.clock, app.id, timeoutMs);
  const diagnostics = [...initial, ...await finalizeNonTtyHost(deadline, host)];
  return { status: 'error', diagnostics, snapshot: tuiSnapshot(app.id) };
}

async function finalizeFailedProjection<TState, TMessage>(
  app: TuiApp<TState, TMessage>,
  host: TerminalHost,
  state: TState | undefined,
  initial: readonly TerminalDiagnostic[],
  timeoutMs: number
): Promise<TuiExit<TState>> {
  const deadline = new TuiFinalizationDeadline(host.clock, app.id, timeoutMs);
  const diagnostics = [...initial, ...await finalizeNonTtyHost(deadline, host)];
  return {
    status: 'error',
    ...(state === undefined ? {} : { state }),
    diagnostics,
    snapshot: tuiSnapshot(app.id)
  };
}

async function finalizeNonTtyHost(
  deadline: TuiFinalizationDeadline,
  host: TerminalHost
): Promise<readonly TerminalDiagnostic[]> {
  const phases = [
    await deadline.run('flush', async (signal) => host.flush({ signal })),
    await deadline.run('host', async (signal) => host.dispose({ signal }))
  ];
  await deadline.close();
  const clockDiagnostic = deadline.clockDiagnostic();
  return [
    ...phases.flatMap((phase) => phase.diagnostic === undefined ? [] : [phase.diagnostic]),
    ...(clockDiagnostic === undefined ? [] : [clockDiagnostic])
  ];
}

function isFailure(item: TerminalDiagnostic): boolean {
  return item.severity === 'error' || item.severity === 'fatal';
}

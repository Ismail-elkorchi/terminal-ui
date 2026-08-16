import { setupTuiSession } from './lifecycle.ts';
import { errorFromUnknown } from '../errors.ts';
import type { TerminalHost, TerminalSession } from '../host/index.ts';
import type { TranscriptRecorder } from '../transcript/index.ts';
import type { TuiRuntime } from './types.ts';
import type { SessionProtocolPolicy } from './session-policy.ts';
import type { TuiInputSuspensionController } from './input-suspension.ts';
import { inputProfileForSession } from './session-policy.ts';
import { recordTuiRestore } from './transcript.ts';
import { failTuiRuntimeTerminalOwnership } from './runtime.ts';
import { runTuiLifecyclePhase } from './lifecycle-phase.ts';
import type { TerminalGraphicsMode } from '../graphics/index.ts';
import type { TuiLifecyclePhase } from './lifecycle-phase.ts';

interface TerminalSuspensionOptions<TState, TMessage> {
  readonly appId: string;
  readonly host: TerminalHost;
  readonly input: TuiInputSuspensionController;
  readonly policy: SessionProtocolPolicy;
  readonly graphics: TerminalGraphicsMode;
  readonly recoveryTimeoutMs: number;
  readonly transcript?: TranscriptRecorder;
  readonly runtime: () => TuiRuntime<TState, TMessage>;
  readonly session: () => TerminalSession;
  readonly replaceSession: (session: TerminalSession) => void;
  readonly canReacquire: () => boolean;
}

export function createTerminalSuspension<TState, TMessage>(
  options: TerminalSuspensionOptions<TState, TMessage>
): <TValue>(operation: () => Promise<TValue>, signal: AbortSignal) => Promise<TValue> {
  let tail = Promise.resolve();
  let resumeSequence = 1;

  return <TValue>(operation: () => Promise<TValue>, signal: AbortSignal): Promise<TValue> => {
    const completion = tail.then(async () => {
      signal.throwIfAborted();
      const runtime = options.runtime();
      await runtime.suspendOutput();
      const input = options.input.request();
      let inputPaused = false;
      let terminalRestored = false;
      let terminalReacquired = false;
      let value: TValue | undefined;
      let operationCompleted = false;
      let failure: unknown;
      try {
        await input.paused;
        inputPaused = true;
        signal.throwIfAborted();
        const restoration = await lifecycleRecovery('restore', async (recoverySignal) => {
          await options.host.flush({ signal: recoverySignal });
          return options.session().restore('success', { operationSignal: recoverySignal });
        });
        recordTuiRestore(options.transcript, restoration, 'checkpoint');
        if (restoration.status !== 'restored') {
          throw new Error(`Terminal suspension restoration completed with status ${restoration.status}.`);
        }
        terminalRestored = true;
        signal.throwIfAborted();
        value = await operation();
        operationCompleted = true;
      } catch (cause) {
        failure = cause;
      }

      let recoveryFailure: unknown;
      try {
        if (!terminalRestored) {
          throw errorFromUnknown(failure ?? new Error('Terminal ownership was not released for suspension.'));
        }
        if (options.canReacquire()) {
          await lifecycleRecovery('recovery', async (recoverySignal) => {
            await options.host.getCapabilities({
              activeProbes: options.host.runtime === 'memory'
                ? []
                : [
                    'terminalModes',
                    'keyboardProtocol',
                    ...(options.graphics === 'none' ? [] : ['graphics'] as const),
                  ],
              refresh: true,
              signal: recoverySignal
            });
            recoverySignal.throwIfAborted();
            const session = await options.host.beginSession({
              id: `${options.appId}:resume:${String(resumeSequence)}`
            });
            resumeSequence += 1;
            if (!options.canReacquire() || recoverySignal.aborted) {
              await session.restore('cancelled', { operationSignal: recoverySignal });
              recoverySignal.throwIfAborted();
              throw new Error('Terminal runtime ended before suspension recovery completed.');
            }
            const setup = await setupTuiSession(session, options.policy, { signal: recoverySignal });
            if (!setup.ok) {
              throw new Error('Terminal session could not be reconfigured after suspension.');
            }
            options.replaceSession(session);
            runtime.replaceTerminalProfile({
              capabilities: session.capabilities,
              ...inputProfileForSession(setup)
            });
            runtime.resumeOutput();
            await runtime.redraw();
          });
          terminalReacquired = true;
        }
      } catch (cause) {
        recoveryFailure = cause;
        failTuiRuntimeTerminalOwnership(runtime, cause);
      } finally {
        if (terminalReacquired) {
          if (inputPaused) await input.resume();
          else void input.resume();
        }
      }

      if (failure !== undefined && recoveryFailure !== undefined && failure !== recoveryFailure) {
        throw new AggregateError([failure, recoveryFailure], 'External operation and terminal recovery both failed.');
      }
      if (recoveryFailure !== undefined) throw errorFromUnknown(recoveryFailure);
      if (failure !== undefined) throw errorFromUnknown(failure);
      if (!operationCompleted) throw new Error('Terminal suspension ended without completing the external operation.');
      return value as TValue;

      async function lifecycleRecovery<TRecovery>(
        phase: Extract<TuiLifecyclePhase, 'restore' | 'recovery'>,
        operation: (recoverySignal: AbortSignal) => Promise<TRecovery>
      ): Promise<TRecovery> {
        const outcome = await runTuiLifecyclePhase({
          clock: options.host.clock,
          target: options.appId,
          phase,
          timeoutMs: options.recoveryTimeoutMs,
          operation
        });
        if (outcome.status === 'settled') return outcome.value;
        throw new Error(outcome.diagnostic.message, { cause: outcome.diagnostic.cause });
      }
    });
    tail = completion.then(() => undefined, () => undefined);
    return completion;
  };
}

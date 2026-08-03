import { setupTuiSession } from './lifecycle.ts';
import { errorFromUnknown } from '../errors.ts';
import type { TerminalHost, TerminalSession } from '../host/index.ts';
import type { TranscriptRecorder } from '../transcript/index.ts';
import type { TuiRuntime } from './types.ts';
import type { SessionProtocolPolicy } from './session-policy.ts';
import type { TuiInputSuspensionController } from './input-suspension.ts';
import { recordTuiRestore } from './transcript.ts';

interface TerminalSuspensionOptions<TState, TMessage> {
  readonly appId: string;
  readonly host: TerminalHost;
  readonly input: TuiInputSuspensionController;
  readonly policy: SessionProtocolPolicy;
  readonly transcript?: TranscriptRecorder;
  readonly runtime: () => TuiRuntime<TState, TMessage>;
  readonly session: () => TerminalSession;
  readonly replaceSession: (session: TerminalSession) => void;
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
      const input = options.input.request();
      runtime.suspendOutput();
      let inputPaused = false;
      let terminalRestored = false;
      let value: TValue | undefined;
      let operationCompleted = false;
      let failure: unknown;
      try {
        await input.paused;
        inputPaused = true;
        signal.throwIfAborted();
        await options.host.flush({ signal });
        const restoration = await options.session().restore('success', { operationSignal: signal });
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
        if (terminalRestored) {
          signal.throwIfAborted();
          const session = await options.host.beginSession({
            id: `${options.appId}:resume:${String(resumeSequence)}`
          });
          resumeSequence += 1;
          options.replaceSession(session);
          const setup = await setupTuiSession(session, options.policy);
          if (!setup.ok) {
            throw new Error('Terminal session could not be reconfigured after suspension.');
          }
        }
        runtime.resumeOutput();
        await runtime.redraw();
      } catch (cause) {
        recoveryFailure = cause;
      } finally {
        if (inputPaused) await input.resume();
        else void input.resume();
      }

      if (failure !== undefined && recoveryFailure !== undefined) {
        throw new AggregateError([failure, recoveryFailure], 'External operation and terminal recovery both failed.');
      }
      if (recoveryFailure !== undefined) throw errorFromUnknown(recoveryFailure);
      if (failure !== undefined) throw errorFromUnknown(failure);
      if (!operationCompleted) throw new Error('Terminal suspension ended without completing the external operation.');
      return value as TValue;
    });
    tail = completion.then(() => undefined, () => undefined);
    return completion;
  };
}

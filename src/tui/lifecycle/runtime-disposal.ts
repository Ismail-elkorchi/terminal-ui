import { TerminalUiError, errorFromUnknown } from '../../errors.ts';
import type { TerminalClock } from '../../host/types.ts';
import { defaultTuiLifecyclePolicy } from './run-configuration.ts';
import { createRuntimeLifecycle, runtimePhaseError } from './runtime-lifecycle.ts';
import type { TuiRuntimeDisposeOptions } from '../types.ts';

interface RuntimeDisposalOptions {
  readonly clock: TerminalClock;
  readonly lifecycle: Pick<ReturnType<typeof createRuntimeLifecycle>, 'dispose'>;
  readonly stop: (unavailable: TerminalUiError) => void;
  readonly drain: () => Promise<void>;
  readonly settle: readonly (() => Promise<unknown>)[];
  readonly resources: readonly (() => Promise<void>)[];
}

/** Stops admission synchronously and owns the bounded, ordered cleanup. */
export function createRuntimeDisposal(options: RuntimeDisposalOptions) {
  return (disposeOptions: TuiRuntimeDisposeOptions = {}): Promise<void> => {
    let timeoutMs: number;
    try {
      timeoutMs = runtimeDisposalTimeout(disposeOptions.timeoutMs);
    } catch (cause) {
      return Promise.reject(errorFromUnknown(cause));
    }
    return options.lifecycle.dispose(() => {
      options.stop(runtimePhaseError('disposed'));
      const cleanup = (async () => {
        const failures: unknown[] = [];
        try {
          await options.drain();
        } catch (cause) {
          failures.push(cause);
        }
        await Promise.allSettled(options.settle.map((settle) => settle()));
        const cleanups = await Promise.allSettled(options.resources.map((dispose) => dispose()));
        for (const result of cleanups) {
          if (result.status === 'rejected') failures.push(result.reason);
        }
        if (failures.length > 0) throw new AggregateError(failures, 'TUI runtime disposal failed.');
      })();
      return boundedRuntimeDisposal(cleanup, disposeOptions, timeoutMs);
    });
  };

  function boundedRuntimeDisposal(
    cleanup: Promise<void>,
    disposeOptions: TuiRuntimeDisposeOptions,
    timeoutMs: number
  ): Promise<void> {
    const controller = new AbortController();
    const callerSignal = disposeOptions.signal;
    const abortFromCaller = (): void => {
      if (!controller.signal.aborted) controller.abort(callerSignal?.reason);
    };
    if (callerSignal?.aborted === true) abortFromCaller();
    else callerSignal?.addEventListener('abort', abortFromCaller, { once: true });
    void Promise.resolve()
      .then(() => options.clock.sleep(timeoutMs, controller.signal))
      .then((outcome) => {
        if (outcome === 'elapsed') controller.abort(RUNTIME_DISPOSAL_TIMEOUT);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          controller.abort(new TerminalUiError('TUI runtime disposal clock failed.', {
            cause: errorFromUnknown(cause)
          }));
        }
      });
    return raceRuntimeDisposal(cleanup, controller.signal).finally(() => {
      callerSignal?.removeEventListener('abort', abortFromCaller);
      if (!controller.signal.aborted) controller.abort(RUNTIME_DISPOSAL_SETTLED);
    });
  }
}

function runtimeDisposalTimeout(value: number | undefined): number {
  const timeoutMs = value ?? defaultTuiLifecyclePolicy.runtimeDisposalTimeoutMs;
  if (!Number.isFinite(timeoutMs) || timeoutMs < 0) {
    throw new RangeError('TUI runtime disposal timeoutMs must be a non-negative finite number.');
  }
  return timeoutMs;
}

function raceRuntimeDisposal(cleanup: Promise<void>, signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const aborted = (): void => {
      settle(() => {
        reject(runtimeDisposalAbort(signal));
      });
    };
    const settle = (complete: () => void): void => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', aborted);
      complete();
    };
    signal.addEventListener('abort', aborted, { once: true });
    cleanup.then(
      () => {
        settle(() => {
          resolve();
        });
      },
      (cause: unknown) => {
        settle(() => {
          reject(errorFromUnknown(cause));
        });
      }
    );
    if (signal.aborted) aborted();
  });
}

function runtimeDisposalAbort(signal: AbortSignal): TerminalUiError {
  if (signal.reason instanceof TerminalUiError) return signal.reason;
  if (signal.reason === RUNTIME_DISPOSAL_TIMEOUT) {
    return new TerminalUiError('TUI runtime disposal timed out.');
  }
  return new TerminalUiError('TUI runtime disposal was cancelled.', {
    cause: signal.reason
  });
}

const RUNTIME_DISPOSAL_TIMEOUT = Symbol('terminal-ui.runtime-disposal-timeout');

const RUNTIME_DISPOSAL_SETTLED = Symbol('terminal-ui.runtime-disposal-settled');

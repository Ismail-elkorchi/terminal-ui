import { TerminalUiError, errorFromUnknown } from '../errors.ts';
import type { TuiRuntimeChange } from './types.ts';

interface ChangeWaiter<TState> {
  readonly resolve: (change: TuiRuntimeChange<TState>) => void;
  readonly reject: (cause: unknown) => void;
  readonly detach: () => void;
}

export function createRuntimeChangeChannel<TState>() {
  let pendingFrame: Extract<TuiRuntimeChange<TState>, { readonly kind: 'frame' }> | undefined;
  let pendingExit: Extract<TuiRuntimeChange<TState>, { readonly kind: 'exit' }> | undefined;
  let waiter: ChangeWaiter<TState> | undefined;
  let closed: Error | undefined;

  return {
    publish(change: TuiRuntimeChange<TState>) {
      if (closed !== undefined) return;
      const waiting = waiter;
      if (waiting !== undefined) {
        waiter = undefined;
        waiting.detach();
        waiting.resolve(change);
        return;
      }
      if (change.kind === 'frame') pendingFrame = change;
      else pendingExit = change;
    },
    next(signal?: AbortSignal) {
      if (closed !== undefined) return Promise.reject(closed);
      if (signal?.aborted === true) return Promise.reject(cancelledWait());
      if (waiter !== undefined) {
        return Promise.reject(new TerminalUiError('TUI runtime already has a pending change waiter.', {
          code: 'TUI_OVERLOAD', reason: 'change_waiter', limit: 1, observed: 2
        }));
      }
      const pending = consume();
      if (pending !== undefined) return Promise.resolve(pending);
      return wait(signal);
    },
    close(cause: unknown) {
      if (closed !== undefined) return;
      closed = errorFromUnknown(cause);
      pendingFrame = undefined;
      pendingExit = undefined;
      const waiting = waiter;
      waiter = undefined;
      waiting?.detach();
      waiting?.reject(closed);
    }
  };

  function consume(): TuiRuntimeChange<TState> | undefined {
    if (pendingFrame !== undefined) {
      const change = pendingFrame;
      pendingFrame = undefined;
      return change;
    }
    if (pendingExit !== undefined) {
      const change = pendingExit;
      pendingExit = undefined;
      return change;
    }
    return undefined;
  }

  function wait(signal: AbortSignal | undefined): Promise<TuiRuntimeChange<TState>> {
    const { promise, resolve, reject } = Promise.withResolvers<TuiRuntimeChange<TState>>();
    let abort = (): void => undefined;
    const waiting: ChangeWaiter<TState> = {
      resolve,
      reject,
      detach: () => signal?.removeEventListener('abort', abort)
    };
    abort = (): void => {
      if (waiter === waiting) waiter = undefined;
      waiting.detach();
      reject(cancelledWait());
    };
    if (signal?.aborted === true) abort();
    else {
      signal?.addEventListener('abort', abort, { once: true });
      waiter = waiting;
    }
    return promise;
  }
}

function cancelledWait(): TerminalUiError {
  return new TerminalUiError('TUI runtime change wait was cancelled.');
}

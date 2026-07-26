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
  const waiters: ChangeWaiter<TState>[] = [];
  let closed: Error | undefined;

  return {
    publish(change: TuiRuntimeChange<TState>) {
      if (closed !== undefined) return;
      const waiter = waiters.shift();
      if (waiter !== undefined) {
        waiter.detach();
        waiter.resolve(change);
        return;
      }
      if (change.kind === 'frame') pendingFrame = change;
      else pendingExit = change;
    },
    next(signal?: AbortSignal) {
      if (closed !== undefined) return Promise.reject(closed);
      const pending = consume();
      if (pending !== undefined) return Promise.resolve(pending);
      return wait(signal);
    },
    close(cause: unknown) {
      if (closed !== undefined) return;
      closed = errorFromUnknown(cause);
      pendingFrame = undefined;
      pendingExit = undefined;
      for (const waiter of waiters.splice(0)) {
        waiter.detach();
        waiter.reject(closed);
      }
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
    const waiter: ChangeWaiter<TState> = {
      resolve,
      reject,
      detach: () => signal?.removeEventListener('abort', abort)
    };
    abort = (): void => {
      const index = waiters.indexOf(waiter);
      if (index >= 0) waiters.splice(index, 1);
      waiter.detach();
      reject(new TerminalUiError('TUI runtime change wait was cancelled.'));
    };
    if (signal?.aborted === true) abort();
    else {
      signal?.addEventListener('abort', abort, { once: true });
      waiters.push(waiter);
    }
    return promise;
  }
}

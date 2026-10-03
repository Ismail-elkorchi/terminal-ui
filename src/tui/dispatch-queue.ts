import { TerminalUiError, errorFromUnknown } from '../errors.ts';

export interface SerializedDispatchQueue {
  run<TValue>(operation: () => TValue | Promise<TValue>): Promise<TValue>;
  drain(): Promise<void>;
  close(cause: Error): void;
}

/** One transaction pump. Pending records can be settled without waiting for a blocked writer. */
export function createSerializedDispatchQueue(maxPending = 256): SerializedDispatchQueue {
  const pending: { run(): Promise<void>; reject(cause: Error): void }[] = [];
  let running = false;
  let closed: Error | undefined;
  let tail: Promise<void> = Promise.resolve();
  return {
    run<TValue>(operation: () => TValue | Promise<TValue>): Promise<TValue> {
      if (closed !== undefined) return Promise.reject(closed);
      if (pending.length + Number(running) >= maxPending) {
        return Promise.reject(new TerminalUiError('TUI transaction queue is full.', {
          code: 'TUI_OVERLOAD', reason: 'transactions', limit: maxPending,
          observed: pending.length + Number(running) + 1,
        }));
      }
      const result = new Promise<TValue>((resolve, reject) => {
        pending.push({
          async run() {
            try { resolve(await operation()); } catch (cause) { reject(errorFromUnknown(cause)); }
          },
          reject,
        });
      });
      tail = Promise.all([tail, result.then(() => undefined, () => undefined)]).then(() => undefined);
      pump();
      return result;
    },
    drain: () => tail,
    close(cause) {
      closed ??= cause;
      for (const entry of pending.splice(0)) entry.reject(closed);
    },
  };
  function pump(): void {
    if (running) return;
    const entry = pending.shift();
    if (entry === undefined) return;
    running = true;
    void Promise.resolve().then(() => entry.run()).finally(() => { running = false; pump(); });
  }
}

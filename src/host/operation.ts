import { errorFromUnknown } from '../errors.ts';
import type { TerminalOperationContext } from './types.ts';

export function throwIfTerminalOperationAborted(context: TerminalOperationContext | undefined): void {
  context?.signal?.throwIfAborted();
}

export function waitForTerminalOperation<T>(
  operation: Promise<T>,
  context: TerminalOperationContext | undefined
): Promise<T> {
  const signal = context?.signal;
  if (signal === undefined) return operation;
  if (signal.aborted) return Promise.reject(errorFromUnknown(signal.reason));
  return new Promise<T>((resolve, reject) => {
    const aborted = (): void => {
      settle(() => {
        reject(errorFromUnknown(signal.reason));
      });
    };
    const settle = (complete: () => void): void => {
      signal.removeEventListener('abort', aborted);
      complete();
    };
    signal.addEventListener('abort', aborted, { once: true });
    operation.then(
      (value) => {
        settle(() => {
          resolve(value);
        });
      },
      (cause: unknown) => {
        settle(() => {
          reject(errorFromUnknown(cause));
        });
      }
    );
  });
}

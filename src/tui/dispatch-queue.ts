export interface SerializedDispatchQueue {
  run<TValue>(operation: () => Promise<TValue>): Promise<TValue>;
}

export function createSerializedDispatchQueue(): SerializedDispatchQueue {
  let tail: Promise<void> = Promise.resolve();

  return {
    run(operation) {
      const next = tail.then(operation, operation);
      tail = next.then(
        () => undefined,
        () => undefined
      );
      return next;
    }
  };
}

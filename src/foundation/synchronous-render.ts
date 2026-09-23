/** Observe rejected thenables before reporting a synchronous paint contract violation. */
function assertSynchronousRenderResult(value: unknown, callback: string): void {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) return;
  const then = (value as { readonly then?: unknown }).then;
  if (typeof then !== 'function') return;
  void Promise.resolve(value).catch(() => undefined);
  throw new TypeError(`${callback} must complete synchronously; Promise-returning callbacks are unsupported.`);
}

export function executeSynchronousRenderCallback<TInput>(
  callback: (this: undefined, input: TInput) => unknown,
  input: TInput,
  label: string,
): void {
  assertSynchronousRenderResult(callback.call(undefined, input), label);
}

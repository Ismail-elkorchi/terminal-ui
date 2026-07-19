export function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (!Number.isFinite(ms) || ms < 0) {
    throw new RangeError('ms must be a finite non-negative number.');
  }
  if (signal?.aborted === true || ms === 0) return Promise.resolve();

  return new Promise((resolve) => {
    let settled = false;
    const settle = (): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal?.removeEventListener('abort', onAbort);
      resolve();
    };
    const onAbort = (): void => { settle(); };
    const timeout = setTimeout(settle, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

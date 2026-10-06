import type { PtyTerminalHarness } from '../../src/testing/types.ts';

export async function waitUntil(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (predicate()) return;
    await flushAsync();
  }
  throw new Error('Timed out waiting for condition.');
}

export function flushAsync(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

/** Wait for semantic readiness rather than assuming bounded probes finish in a few turns. */
export function waitForRecordedFrames(harness: PtyTerminalHarness, minimum: number): Promise<void> {
  if (harness.frames().length >= minimum) return Promise.resolve();
  const observer = harness.host.observer;
  if (observer?.recordFrame === undefined) throw new Error('Frame recording is unavailable.');
  const recordFrame = observer.recordFrame.bind(observer);
  return new Promise(resolve => {
    observer.recordFrame = frame => {
      recordFrame(frame);
      if (harness.frames().length >= minimum) {
        observer.recordFrame = recordFrame;
        resolve();
      }
    };
  });
}

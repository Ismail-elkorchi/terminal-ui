import assert from 'node:assert/strict';
import test from 'node:test';

import { createMemoryTerminalHost } from '../host/memory.ts';
import { reliableSourceMessage } from './source-channel.ts';
import { createTuiSubscriptionManager } from './subscriptions.ts';

void test('subscription cancellation retires a source blocked on channel capacity', async () => {
  const host = createMemoryTerminalHost();
  const dispatchStarted = deferred();
  const dispatchRelease = deferred();
  const disposed = deferred();
  const manager = createTuiSubscriptionManager({
    subscriptions: () => [{
      id: 'bounded-source',
      generation: 1,
      channel: { capacity: 1 },
      async *messages() {
        yield reliableSourceMessage(1);
        yield reliableSourceMessage(2);
        yield reliableSourceMessage(3);
      },
      dispose() {
        disposed.resolve();
      }
    }],
    context: async () => ({
      terminalSize: host.getTerminalSize(),
      capabilities: await host.getCapabilities(),
      diagnostics: [],
      clock: host.clock
    }),
    reportDiagnostic: () => undefined,
    async dispatchMany() {
      dispatchStarted.resolve();
      await dispatchRelease.promise;
    }
  });

  const prepared = await manager.prepare({}, await managerContext(host));
  manager.activate(prepared);
  await dispatchStarted.promise;
  manager.cancel();

  await disposed.promise;
  assert.equal(manager.metrics().maximumBuffered, 1);
  dispatchRelease.resolve();
  await manager.dispose();
});

async function managerContext(host: ReturnType<typeof createMemoryTerminalHost>) {
  return {
    terminalSize: host.getTerminalSize(),
    capabilities: await host.getCapabilities(),
    diagnostics: [],
    clock: host.clock
  };
}

function deferred(): {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
} {
  const result = Promise.withResolvers<undefined>();
  return { promise: result.promise, resolve: () => { result.resolve(undefined); } };
}

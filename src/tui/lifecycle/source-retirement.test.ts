import assert from 'node:assert/strict';
import test from 'node:test';
import { TerminalUiError } from '../../errors.ts';
import { createMemoryTerminalHost } from '../../host/memory.ts';
import type { TerminalDiagnostic } from '../../diagnostics.ts';
import type { ProducerAdmissionLease } from './producer-admission.ts';
import { createTuiSourceChannel, reliableSourceMessage, replaceableSourceMessage } from './source-channel.ts';
import { createTuiSubscriptionManager } from './subscriptions.ts';

function deferred() {
  const result = Promise.withResolvers<undefined>();
  return { promise: result.promise, resolve: () => { result.resolve(undefined); } };
}

async function tick(): Promise<void> {
  await new Promise<void>((resolve) => { setImmediate(resolve); });
}

async function managerContext() {
  const host = createMemoryTerminalHost();
  return {
    terminalSize: host.getTerminalSize(), capabilities: await host.getCapabilities(),
    diagnostics: [], clock: host.clock,
  };
}

function overload(reason: string) {
  return (cause: unknown): boolean => cause instanceof TerminalUiError
    && cause.code === 'TUI_OVERLOAD' && cause.reason === reason;
}

for (const fails of [false, true]) void test(`cancel rejects channel waits before ${fails ? 'failed' : 'successful'} physical drain settles`, async () => {
  const dispatch = deferred();
  const channel = createTuiSourceChannel({ capacity: 1, async dispatchMany() {
    await dispatch.promise;
    if (fails) throw new Error('late dispatch failure');
  } });
  await channel.admit(reliableSourceMessage('first'));
  const blocked = channel.admit(reliableSourceMessage('second'));
  let physicallySettled = false;
  const settled = channel.settle();
  void settled.then(() => { physicallySettled = true; });
  assert.equal(channel.settle(), settled);
  channel.cancel();
  await assert.rejects(blocked, /cancelled/u);
  await assert.rejects(channel.close(), /cancelled/u);
  await assert.rejects(channel.admit(reliableSourceMessage('late')), /cancelled/u);
  assert.equal(physicallySettled, false);
  assert.equal(channel.metrics().reliableAdmissions, 1);
  dispatch.resolve();
  await settled;
  assert.equal(physicallySettled, true);
  assert.equal(channel.metrics().dispatchedMessages, fails ? 0 : 1);
});

void test('physical channel settlement includes a cadence clock that ignores cancellation', async () => {
  const sleeping = deferred();
  let signal: AbortSignal | undefined;
  let dispatched = 0;
  const channel = createTuiSourceChannel({ capacity: 1, cadence: { intervalMs: 10, clock: {
    monotonicNow: () => 0,
    async sleep(_ms, suppliedSignal) { signal = suppliedSignal; await sleeping.promise; return 'elapsed'; },
  } }, async dispatchMany() { dispatched += 1; } });
  await channel.admit(replaceableSourceMessage('frame', 'discarded'));
  channel.cancel();
  let physicallySettled = false;
  const settled = channel.settle().then(() => { physicallySettled = true; });
  await assert.rejects(channel.close(), /cancelled/u);
  assert.equal(signal?.aborted, true);
  assert.equal(physicallySettled, false);
  sleeping.resolve();
  await settled;
  assert.equal(dispatched, 0);
});

for (const reason of ['owned_sources', 'source_capacity']) void test(`failed sources retain ${reason} through physical drain and disposal`, async () => {
  const context = await managerContext();
  const dispatch = deferred();
  const disposal = deferred();
  const diagnostics: TerminalDiagnostic[] = [];
  const lifecycle: string[] = [];
  const batches: number[][] = [];
  let lease: ProducerAdmissionLease | undefined;
  let runs = 0;
  let disposals = 0;
  const manager = createTuiSubscriptionManager<number, number>({
    maxOwned: reason === 'owned_sources' ? 1 : 2,
    maxCapacity: reason === 'source_capacity' ? 1 : 2,
    subscriptions: (generation) => [{ id: 'source', generation, channel: { capacity: 1 },
      async run(_context, sink) {
        runs += 1;
        await sink.emit(reliableSourceMessage(generation));
        throw new Error('producer failed after admission');
      },
      async dispose() { disposals += 1; await disposal.promise; },
      onLifecycle(event) { lifecycle.push(event.kind); return -1; },
    }],
    context: async () => context,
    reportDiagnostic: (item) => { diagnostics.push(item); },
    async dispatchMany(messages, _source, admittedLease) {
      batches.push([...messages]);
      lease = admittedLease;
      if (messages[0] !== -1) await dispatch.promise;
    },
  });
  await manager.reconcile(0);
  await tick();
  assert.equal(disposals, 1);
  assert.equal(manager.metrics().owned, 1);
  assert.equal(manager.metrics().capacity, 1);
  for (let generation = 1; generation < 7; generation += 1) {
    await assert.rejects(manager.reconcile(generation), overload(reason));
    await assert.rejects(manager.plan(generation, context, [], lease), overload(reason));
  }
  assert.equal(runs, 1);
  assert.deepEqual(batches, [[0]]);
  disposal.resolve();
  await tick();
  assert.equal(manager.metrics().owned, 1);
  assert.equal(manager.metrics().capacity, 1);
  assert.deepEqual(lifecycle, []);
  assert.deepEqual(diagnostics, []);
  dispatch.resolve();
  await tick();
  assert.equal(manager.metrics().owned, 0);
  assert.equal(manager.metrics().capacity, 0);
  assert.equal(manager.metrics().dispatchedMessages, 1);
  assert.deepEqual(lifecycle, ['failed']);
  assert.deepEqual(batches, [[0], [-1]]);
  assert.equal(diagnostics.length, 1);
  await manager.reconcile(0);
  assert.equal(runs, 1);
  await manager.reconcile(7);
  await tick();
  assert.equal(runs, 2);
  assert.equal(manager.metrics().dispatchedMessages, 2);
  assert.deepEqual(lifecycle, ['failed', 'failed']);
  await manager.dispose();
});

void test('cancelling a blocked emission rejects admission promptly but retains its physical dispatch', async () => {
  const context = await managerContext();
  const dispatch = deferred();
  const disposal = deferred();
  let rejected = false;
  let finished = false;
  let lifecycle = 0;
  const batches: number[][] = [];
  const manager = createTuiSubscriptionManager<number, number>({
    maxOwned: 1, maxCapacity: 1,
    subscriptions: (generation) => [{ id: 'source', generation, channel: { capacity: 1 },
      async run(_context, sink) {
        await sink.emit(reliableSourceMessage(1));
        try { await sink.emit(reliableSourceMessage(2)); }
        catch { rejected = true; }
        finally { finished = true; }
      },
      async dispose() { await disposal.promise; },
      onLifecycle() { lifecycle += 1; return -1; },
    }],
    context: async () => context, reportDiagnostic: () => undefined,
    async dispatchMany(messages) { batches.push([...messages]); await dispatch.promise; },
  });
  await manager.reconcile(0);
  await tick();
  manager.cancel();
  await tick();
  assert.equal(rejected, true);
  assert.equal(finished, true);
  assert.equal(manager.metrics().owned, 1);
  assert.equal(manager.metrics().capacity, 1);
  assert.equal(manager.metrics().retiring, 1);
  for (let generation = 1; generation < 7; generation += 1) {
    await assert.rejects(manager.reconcile(generation), overload('owned_sources'));
  }
  dispatch.resolve();
  await tick();
  assert.equal(manager.metrics().dispatchedMessages, 1);
  assert.equal(manager.metrics().owned, 1);
  assert.equal(manager.metrics().capacity, 1);
  let disposed = false;
  const disposing = manager.dispose().then(() => { disposed = true; });
  await tick();
  assert.equal(disposed, false);
  disposal.resolve();
  await disposing;
  assert.deepEqual(batches, [[1]]);
  assert.equal(lifecycle, 0);
  assert.equal(manager.metrics().owned, 0);
  assert.equal(manager.metrics().capacity, 0);
  assert.equal(manager.metrics().retiring, 0);
  assert.equal(manager.metrics().reliableAdmissions, 1);
  assert.equal(manager.metrics().dispatchedMessages, 1);
});

for (const last of ['producer', 'disposer']) void test(`ignored abort retains ownership until the ${last} settles last`, async () => {
  const context = await managerContext();
  const producer = deferred();
  const disposal = deferred();
  const dispatch = deferred();
  let signal: AbortSignal | undefined;
  const batches: number[][] = [];
  const manager = createTuiSubscriptionManager<number, number>({
    maxOwned: 1, maxCapacity: 1,
    subscriptions: (generation) => [{ id: 'source', generation, channel: { capacity: 1 },
      async run(context, sink) {
        signal = context.signal;
        await sink.emit(reliableSourceMessage(1));
        await producer.promise;
        await sink.emit(reliableSourceMessage(2));
      },
      async dispose() { await disposal.promise; },
    }],
    context: async () => context, reportDiagnostic: () => undefined,
    async dispatchMany(messages) { batches.push([...messages]); await dispatch.promise; },
  });
  await manager.reconcile(0);
  await tick();
  manager.cancel();
  assert.equal(signal?.aborted, true);
  dispatch.resolve();
  (last === 'producer' ? disposal : producer).resolve();
  await tick();
  assert.equal(manager.metrics().owned, 1);
  assert.equal(manager.metrics().capacity, 1);
  assert.equal(manager.metrics().retiring, 1);
  await assert.rejects(manager.reconcile(1), overload('owned_sources'));
  (last === 'producer' ? producer : disposal).resolve();
  await tick();
  assert.equal(manager.metrics().owned, 0);
  assert.equal(manager.metrics().capacity, 0);
  assert.equal(manager.metrics().retiring, 0);
  assert.deepEqual(batches, [[1]]);
  assert.equal(manager.metrics().dispatchedMessages, 1);
  await manager.dispose();
});

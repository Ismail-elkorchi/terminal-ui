import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createTuiSourceChannel,
  reliableSourceMessage,
  replaceableSourceMessage,
} from '../../dist/tui/source-channel.js';
import { createMemoryTerminalHost } from '../../dist/host/index.js';

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test('source channel preserves reliable order and coalesces only matching replaceable keys', async () => {
  const firstDispatch = deferred();
  const batches = [];
  let dispatchCount = 0;
  const channel = createTuiSourceChannel({
    capacity: 2,
    async dispatchMany(messages) {
      batches.push([...messages]);
      dispatchCount += 1;
      if (dispatchCount === 1) await firstDispatch.promise;
    },
  });

  await channel.admit(reliableSourceMessage('one'));
  await channel.admit(replaceableSourceMessage('position', 'old-position'));
  await channel.admit(replaceableSourceMessage('position', 'new-position'));
  await channel.admit(reliableSourceMessage('two'));
  let thirdAdmitted = false;
  const third = channel.admit(reliableSourceMessage('three')).then(() => {
    thirdAdmitted = true;
  });
  await Promise.resolve();
  assert.equal(thirdAdmitted, false);

  firstDispatch.resolve();
  await third;
  await channel.close();

  assert.deepEqual(batches.flat(), ['one', 'new-position', 'two', 'three']);
  assert.deepEqual(channel.metrics(), {
    reliableAdmissions: 3,
    replaceableAdmissions: 2,
    replacements: 1,
    dispatchedMessages: 4,
    dispatchedBatches: 3,
    maximumBuffered: 2,
    cadenceFlushes: 0,
  });
});

test('source channel reports dispatch failure to blocked admission and close', async () => {
  const gate = deferred();
  const channel = createTuiSourceChannel({
    capacity: 1,
    async dispatchMany() {
      await gate.promise;
      throw new Error('dispatch failed');
    },
  });
  await channel.admit(reliableSourceMessage('first'));
  await channel.admit(reliableSourceMessage('second'));
  const blocked = channel.admit(reliableSourceMessage('third'));
  gate.resolve();
  await assert.rejects(blocked, /dispatch failed/u);
  await assert.rejects(channel.close(), /dispatch failed/u);
});

test('cadence delays only replaceable emissions and drains them as one keyed batch', async () => {
  const host = createMemoryTerminalHost();
  const batches = [];
  const channel = createTuiSourceChannel({
    capacity: 4,
    cadence: { intervalMs: 16, clock: host.clock },
    async dispatchMany(messages) {
      batches.push([...messages]);
    },
  });
  await channel.admit(replaceableSourceMessage('frame', 1));
  await channel.admit(replaceableSourceMessage('frame', 2));
  await channel.admit(reliableSourceMessage(10));
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(batches, [[10]]);

  host.clock.advance(15);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(batches, [[10]]);
  host.clock.advance(1);
  await new Promise((resolve) => setImmediate(resolve));
  await channel.close();

  assert.deepEqual(batches, [[10], [2]]);
  assert.equal(channel.metrics().replacements, 1);
  assert.equal(channel.metrics().cadenceFlushes, 1);
});

test('dispatch failure discards pending cadenced values and permanently fails the channel', async () => {
  const host = createMemoryTerminalHost();
  const failure = new Error('reliable dispatch failed');
  let dispatches = 0;
  const channel = createTuiSourceChannel({
    cadence: { intervalMs: 10, clock: host.clock },
    async dispatchMany() {
      dispatches += 1;
      throw failure;
    },
  });

  await channel.admit(replaceableSourceMessage('frame', 'pending'));
  await channel.admit(reliableSourceMessage('reliable'));
  await new Promise((resolve) => setImmediate(resolve));
  host.clock.advance(10);
  await new Promise((resolve) => setImmediate(resolve));

  await assert.rejects(channel.close(), (cause) => cause === failure);
  await assert.rejects(channel.admit(reliableSourceMessage('late')), (cause) => cause === failure);
  assert.equal(dispatches, 1);
});

test('cadence failure releases blocked reliable admissions with one stable failure', async () => {
  const failure = new Error('cadence clock failed');
  const clock = {
    monotonicNow: () => 0,
    wallNow: () => new Date(0),
    sleep: () => Promise.reject(failure),
  };
  const channel = createTuiSourceChannel({
    capacity: 1,
    cadence: { intervalMs: 10, clock },
    async dispatchMany() {},
  });

  await channel.admit(replaceableSourceMessage('frame', 'pending'));
  const blocked = channel.admit(reliableSourceMessage('blocked'));

  await assert.rejects(blocked, (cause) => cause === failure);
  await assert.rejects(channel.close(), (cause) => cause === failure);
  await assert.rejects(channel.close(), (cause) => cause === failure);
});

test('cancellation wins a dispatch-failure race and settles later operations consistently', async () => {
  const dispatch = deferred();
  const channel = createTuiSourceChannel({
    async dispatchMany() {
      await dispatch.promise;
      throw new Error('late dispatch failure');
    },
  });
  await channel.admit(reliableSourceMessage('active'));
  channel.cancel();
  dispatch.resolve();
  await new Promise((resolve) => setImmediate(resolve));

  let cancellation;
  await assert.rejects(channel.close(), (cause) => {
    cancellation = cause;
    return /cancelled/u.test(cause.message);
  });
  await assert.rejects(channel.close(), (cause) => cause === cancellation);
  await assert.rejects(channel.admit(reliableSourceMessage('late')), (cause) => cause === cancellation);
  channel.cancel();
});

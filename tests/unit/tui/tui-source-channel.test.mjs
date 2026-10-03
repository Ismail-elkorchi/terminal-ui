import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createTuiSourceChannel,
  reliableSourceMessage,
  replaceableSourceMessage,
} from '../../../dist/tui/lifecycle/source-channel.js';
import { TerminalUiError } from '../../../dist/errors.js';
import { createMemoryTerminalHost } from '../../../dist/host/index.js';

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
    capacity: 3,
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
    dispatchedBatches: 4,
    maximumBuffered: 3,
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
  const blocked = channel.admit(reliableSourceMessage('second'));
  gate.resolve();
  await assert.rejects(blocked, /dispatch failed/u);
  const closing = channel.close();
  assert.equal(channel.close(), closing);
  await assert.rejects(closing, /dispatch failed/u);
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
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(batches, []);

  host.clock.advance(15);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(batches, []);
  host.clock.advance(1);
  await new Promise((resolve) => setImmediate(resolve));
  await channel.close();

  assert.deepEqual(batches, [[2]]);
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

test('cadence failure releases blocked admissions with one stable failure', async () => {
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
  const blocked = channel.admit(replaceableSourceMessage('another-frame', 'blocked'));

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


test('reliable emissions seal same-key replaceable segments and commit individually', async () => {
  const gate = deferred();
  const batches = [];
  const channel = createTuiSourceChannel({
    capacity: 8,
    async dispatchMany(messages) {
      batches.push([...messages]);
      if (batches.length === 1) await gate.promise;
    },
  });
  await channel.admit(reliableSourceMessage('active'));
  await channel.admit(replaceableSourceMessage('frame', 'before-old'));
  await channel.admit(replaceableSourceMessage('frame', 'before-new'));
  await channel.admit(reliableSourceMessage('boundary-one'));
  await channel.admit(replaceableSourceMessage('frame', 'after-old'));
  await channel.admit(replaceableSourceMessage('frame', 'after-new'));
  await channel.admit(reliableSourceMessage('boundary-two'));
  await channel.admit(reliableSourceMessage('boundary-three'));
  gate.resolve();
  await channel.close();

  assert.deepEqual(batches, [
    ['active'], ['before-new'], ['boundary-one'], ['after-new'],
    ['boundary-two'], ['boundary-three'],
  ]);
  assert.equal(channel.metrics().replacements, 2);
});

test('reliable admissions flush earlier cadenced values before their own transaction', async () => {
  const host = createMemoryTerminalHost();
  const gate = deferred();
  const batches = [];
  const channel = createTuiSourceChannel({
    capacity: 4,
    cadence: { intervalMs: 16, clock: host.clock },
    async dispatchMany(messages) {
      batches.push([...messages]);
      if (batches.length === 1) await gate.promise;
    },
  });
  await channel.admit(replaceableSourceMessage('frame', 'before-old'));
  await channel.admit(replaceableSourceMessage('frame', 'before-new'));
  await channel.admit(reliableSourceMessage('boundary'));
  await channel.admit(replaceableSourceMessage('frame', 'after-old'));
  await channel.admit(replaceableSourceMessage('frame', 'after-new'));
  assert.deepEqual(batches, [['before-new']]);
  gate.resolve();
  await channel.close();

  assert.deepEqual(batches, [['before-new'], ['boundary'], ['after-new']]);
  assert.equal(channel.metrics().cadenceFlushes, 2);
});

test('a blocked reliable admission seals and flushes a full cadenced segment', async () => {
  const host = createMemoryTerminalHost();
  const gate = deferred();
  const batches = [];
  const channel = createTuiSourceChannel({
    capacity: 1,
    cadence: { intervalMs: 100, clock: host.clock },
    async dispatchMany(messages) {
      batches.push([...messages]);
      if (batches.length === 1) await gate.promise;
    },
  });
  await channel.admit(replaceableSourceMessage('frame', 'before'));
  let admitted = false;
  const reliable = channel.admit(reliableSourceMessage('boundary')).then(() => {
    admitted = true;
  });
  await assert.rejects(channel.admit(replaceableSourceMessage('frame', 'after')), {
    name: 'TerminalUiError', code: 'TUI_OVERLOAD', reason: 'source_blocked_emission',
  });
  assert.equal(admitted, false);
  assert.deepEqual(batches, [['before']]);
  gate.resolve();
  await reliable;
  await channel.close();
  assert.deepEqual(batches, [['before'], ['boundary']]);
  assert.equal(channel.metrics().maximumBuffered, 1);
});

test('capacity includes in-flight messages and admits at most one blocked emission', async () => {
  const gate = deferred();
  const batches = [];
  const channel = createTuiSourceChannel({
    capacity: 1,
    async dispatchMany(messages) {
      batches.push([...messages]);
      if (batches.length === 1) await gate.promise;
    },
  });
  await channel.admit(reliableSourceMessage('active'));
  let admitted = false;
  const blocked = channel.admit(reliableSourceMessage('waiting')).then(() => {
    admitted = true;
  });
  for (let index = 0; index < 100; index += 1) {
    await assert.rejects(channel.admit(reliableSourceMessage(index)), (cause) => {
      assert.ok(cause instanceof TerminalUiError);
      assert.equal(cause.code, 'TUI_OVERLOAD');
      assert.equal(cause.reason, 'source_blocked_emission');
      assert.equal(cause.limit, 1);
      assert.equal(cause.observed, 2);
      return true;
    });
  }
  assert.equal(admitted, false);
  assert.equal(channel.metrics().reliableAdmissions, 1);
  assert.equal(channel.metrics().maximumBuffered, 1);
  gate.resolve();
  await blocked;
  await channel.close();
  assert.deepEqual(batches, [['active'], ['waiting']]);
});

test('full-channel same-segment replacements do not consume the blocked emission slot', async () => {
  const gate = deferred();
  const batches = [];
  const channel = createTuiSourceChannel({
    capacity: 2,
    async dispatchMany(messages) {
      batches.push([...messages]);
      if (batches.length === 1) await gate.promise;
    },
  });
  await channel.admit(reliableSourceMessage('active'));
  await channel.admit(replaceableSourceMessage('frame', 'old'));
  const blocked = channel.admit(replaceableSourceMessage('other', 'waiting'));
  await channel.admit(replaceableSourceMessage('frame', 'new'));
  gate.resolve();
  await blocked;
  await channel.close();
  assert.deepEqual(batches, [['active'], ['new', 'waiting']]);
  assert.equal(channel.metrics().maximumBuffered, 2);
});

test('close shares one promise, rejects the blocked admission, and drains accepted work', async () => {
  const gate = deferred();
  const channel = createTuiSourceChannel({
    capacity: 1,
    async dispatchMany() {
      await gate.promise;
    },
  });
  await channel.admit(reliableSourceMessage('active'));
  const blocked = channel.admit(reliableSourceMessage('waiting'));
  const closing = channel.close();
  for (let index = 0; index < 100; index += 1) assert.equal(channel.close(), closing);
  await assert.rejects(blocked, { name: 'TerminalUiError', message: 'TUI source channel is closed.' });
  await assert.rejects(channel.admit(reliableSourceMessage('late')), TerminalUiError);
  gate.resolve();
  await closing;
  assert.equal(channel.close(), closing);
  assert.equal(channel.metrics().dispatchedMessages, 1);
});

test('cancel promptly settles blocked admission and the memoized close promise', async () => {
  const gate = deferred();
  const channel = createTuiSourceChannel({
    capacity: 1,
    async dispatchMany() {
      await gate.promise;
    },
  });
  await channel.admit(reliableSourceMessage('active'));
  const blocked = channel.admit(reliableSourceMessage('waiting'));
  channel.cancel();
  const closing = channel.close();
  assert.equal(channel.close(), closing);
  let cancellation;
  await assert.rejects(blocked, (cause) => {
    cancellation = cause;
    return cause instanceof TerminalUiError;
  });
  await assert.rejects(closing, (cause) => cause === cancellation);
  await assert.rejects(channel.admit(reliableSourceMessage('late')), (cause) => cause === cancellation);
  gate.resolve();
});

test('source dispatch batches remain within capacity including a downstream active batch', async () => {
  const gate = deferred();
  const batches = [];
  const channel = createTuiSourceChannel({
    capacity: 3,
    async dispatchMany(messages) {
      assert.ok(Object.isFrozen(messages));
      assert.ok(messages.length <= 3);
      batches.push([...messages]);
      if (batches.length === 1) await gate.promise;
    },
  });
  await channel.admit(reliableSourceMessage('active'));
  await channel.admit(replaceableSourceMessage('one', 1));
  await channel.admit(replaceableSourceMessage('two', 2));
  const blocked = channel.admit(replaceableSourceMessage('three', 3));
  assert.equal(channel.metrics().maximumBuffered, 3);
  gate.resolve();
  await blocked;
  await channel.close();
  assert.deepEqual(batches, [['active'], [1, 2, 3]]);
  assert.equal(channel.metrics().maximumBuffered, 3);
});

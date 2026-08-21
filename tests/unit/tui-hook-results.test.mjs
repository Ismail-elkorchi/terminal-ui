import assert from 'node:assert/strict';
import test from 'node:test';

import {
  decodeMessageResolution,
  decodeTuiEffectOutput,
  decodeTuiEventSources,
  decodeTuiUpdateResult
} from '../../dist/tui/hook-results.js';

test('TUI update results are admitted and owned at the update boundary', () => {
  assert.throws(() => decodeTuiUpdateResult(null), /update result must be an object/u);
  assert.throws(() => decodeTuiUpdateResult({ effects: [] }), /provide state/u);
  assert.throws(
    () => decodeTuiUpdateResult({ state: {}, focus: { kind: 'path', path: [] } }),
    /non-empty string segments/u
  );
  assert.throws(
    () => decodeTuiUpdateResult({ state: {}, effects: [{ id: 'load', concurrency: 'parallel' }] }),
    /run must be a function/u
  );

  const cancelEffects = ['load'];
  const result = decodeTuiUpdateResult({
    state: undefined,
    cancelEffects,
    effects: [{
      id: 'load',
      concurrency: 'replace',
      run: async () => ({ kind: 'none' })
    }],
    exit: { reason: 'done' }
  });
  cancelEffects.push('late');

  assert.deepEqual(result.cancelEffects, ['load']);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.effects), true);
});

test('TUI update results validate cancellation identities before publication', () => {
  assert.throws(
    () => decodeTuiUpdateResult({ state: {}, cancelEffects: [''] }),
    /Effect id must contain visible text/u
  );
  assert.throws(
    () => decodeTuiUpdateResult({ state: {}, cancelEffects: ['load\u0000late'] }),
    /Effect id must contain visible text/u
  );
});

test('effect outputs are decoded before runtime dispatch', () => {
  assert.throws(() => decodeTuiEffectOutput({ kind: 'message' }), /cannot be null or undefined/u);
  assert.throws(
    () => decodeTuiEffectOutput({ kind: 'messages', messages: [{} , undefined] }),
    /cannot contain null or undefined/u
  );
  assert.throws(() => decodeTuiEffectOutput({ kind: 'unknown' }), /kind is invalid/u);
  assert.deepEqual(decodeTuiEffectOutput({ kind: 'messages', messages: [1, 2] }), {
    kind: 'messages',
    messages: [1, 2]
  });
});

test('subscription descriptors and their executable results are decoded once', async () => {
  assert.throws(() => decodeTuiEventSources({}), /subscriptions result must be an array/u);
  assert.throws(
    () => decodeTuiEventSources([{ id: 'source', generation: Number.NaN, run() {} }]),
    /generation must be a string or finite number/u
  );

  const [source] = decodeTuiEventSources([{
    id: 'source',
    generation: 1,
    source: 'external',
    channel: { capacity: 4 },
    run: () => undefined,
    onLifecycle: () => undefined
  }]);
  await source.run({}, { emit: async () => undefined });
  assert.throws(() => source.onLifecycle({ kind: 'completed', id: 'source', generation: 1 }), /ignoreMessage/u);
  assert.throws(() => decodeMessageResolution(null, 'mapper'), /ignoreMessage/u);
});

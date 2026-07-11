import assert from 'node:assert/strict';
import test from 'node:test';

import { createMemoryTerminalHost } from '../../dist/host/index.js';
import { createTuiEffectManager } from '../../dist/tui/effects.js';

function manager(dispatch = async () => {}) {
  return createTuiEffectManager({
    host: createMemoryTerminalHost(),
    diagnostics: () => [],
    dispatch,
    reportDiagnostic: () => {}
  });
}

function gate() {
  let release;
  const promise = new Promise((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

test('parallel effects with one id both run', async () => {
  const started = [];
  const first = gate();
  const second = gate();
  const effects = manager();
  effects.start([
    { id: 'load', concurrency: 'parallel', run: async () => { started.push('first'); await first.promise; } },
    { id: 'load', concurrency: 'parallel', run: async () => { started.push('second'); await second.promise; } }
  ]);
  try {
    await waitUntil(() => started.length === 2);
    assert.deepEqual(started, ['first', 'second']);
  } finally {
    first.release();
    second.release();
    await effects.dispose();
  }
});

test('replace effects abort prior work with the same id', async () => {
  let firstSignal;
  const replacement = gate();
  const effects = manager();
  effects.start([{
    id: 'load',
    concurrency: 'replace',
    run: async ({ signal }) => {
      firstSignal = signal;
      await new Promise((resolve) => signal.addEventListener('abort', resolve, { once: true }));
    }
  }]);
  await waitUntil(() => firstSignal !== undefined);
  effects.start([{
    id: 'load',
    concurrency: 'replace',
    run: async () => replacement.promise
  }]);
  try {
    await waitUntil(() => firstSignal?.aborted === true);
    assert.equal(firstSignal?.aborted, true);
  } finally {
    replacement.release();
    await effects.dispose();
  }
});

test('enqueue effects run in order while keep-first ignores later starts explicitly', async () => {
  const started = [];
  const first = gate();
  const second = gate();
  const effects = manager();
  effects.start([{
    id: 'save',
    concurrency: 'enqueue',
    run: async () => { started.push('first'); await first.promise; }
  }]);
  effects.start([{
    id: 'save',
    concurrency: 'enqueue',
    run: async () => { started.push('second'); await second.promise; }
  }]);
  effects.start([{
    id: 'save',
    concurrency: 'keep-first',
    run: async () => { started.push('ignored'); }
  }]);
  try {
    await waitUntil(() => started.length === 1);
    assert.deepEqual(started, ['first']);
    first.release();
    await waitUntil(() => started.includes('second'));
    assert.deepEqual(started, ['first', 'second']);
  } finally {
    first.release();
    second.release();
    await effects.dispose();
  }
});

async function waitUntil(predicate) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  assert.fail('condition was not reached');
}

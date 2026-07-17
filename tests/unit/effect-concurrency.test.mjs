import assert from 'node:assert/strict';
import test from 'node:test';

import { createMemoryTerminalHost } from '../../dist/host/index.js';
import { createTuiEffectManager } from '../../dist/tui/effects.js';

function manager(dispatch = async () => {}, options = {}) {
  const host = options.host ?? createMemoryTerminalHost();
  const effects = createTuiEffectManager({
    clock: host.clock,
    context: options.context ?? (async () => ({
      host,
      viewport: host.getViewport(),
      capabilities: await host.getCapabilities(),
      diagnostics: [],
      clock: host.clock
    })),
    dispatch,
    reportDiagnostic: options.reportDiagnostic ?? (() => {}),
    ...(options.policy === undefined ? {} : { policy: options.policy })
  });
  return { effects, host };
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
  const { effects } = manager();
  effects.start([
    { id: 'load', concurrency: 'parallel', run: async () => { started.push('first'); await first.promise; return { kind: 'none' }; } },
    { id: 'load', concurrency: 'parallel', run: async () => { started.push('second'); await second.promise; return { kind: 'none' }; } }
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
  const { effects } = manager();
  effects.start([{
    id: 'load',
    concurrency: 'replace',
    run: async ({ signal }) => {
      firstSignal = signal;
      await new Promise((resolve) => signal.addEventListener('abort', resolve, { once: true }));
      return { kind: 'none' };
    }
  }]);
  await waitUntil(() => firstSignal !== undefined);
  effects.start([{
    id: 'load',
    concurrency: 'replace',
    run: async () => { await replacement.promise; return { kind: 'none' }; }
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
  const { effects } = manager();
  effects.start([{
    id: 'save',
    concurrency: 'enqueue',
    run: async () => { started.push('first'); await first.promise; return { kind: 'none' }; }
  }]);
  effects.start([{
    id: 'save',
    concurrency: 'enqueue',
    run: async () => { started.push('second'); await second.promise; return { kind: 'none' }; }
  }]);
  effects.start([{
    id: 'save',
    concurrency: 'keep-first',
    run: async () => { started.push('ignored'); return { kind: 'none' }; }
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

test('tagged effect output preserves array-shaped messages as one message', async () => {
  const dispatched = [];
  const { effects } = manager(async (messages) => { dispatched.push(...messages); });
  effects.start([{
    id: 'array-message',
    concurrency: 'parallel',
    run: async () => ({ kind: 'message', message: ['left', 'right'] })
  }]);

  await waitUntil(() => dispatched.length === 1);
  await effects.dispose();

  assert.deepEqual(dispatched, [['left', 'right']]);
});

test('effect execution policy bounds active and queued work with observable rejection', async () => {
  const diagnostics = [];
  const activeGate = gate();
  const { effects } = manager(async () => {}, {
    policy: {
      maxActive: 1,
      maxActivePerId: 1,
      maxQueued: 1,
      maxQueuedPerId: 1,
      replacementGracePeriodMs: 10
    },
    reportDiagnostic: (item) => diagnostics.push(item)
  });
  const hanging = (id, concurrency) => ({
    id,
    concurrency,
    run: async () => { await activeGate.promise; return { kind: 'none' }; }
  });

  effects.start([hanging('save', 'enqueue')]);
  effects.start([hanging('save', 'enqueue')]);
  effects.start([hanging('save', 'enqueue')]);
  effects.start([hanging('parallel', 'parallel')]);
  await waitUntil(() => effects.metrics().rejected === 2);

  assert.deepEqual(effects.metrics(), { active: 1, queued: 1, rejected: 2 });
  assert.deepEqual(
    diagnostics.map((item) => item.data?.reason).sort(),
    ['active_limit', 'queue_limit']
  );

  activeGate.release();
  await effects.dispose();
});

test('effect failures are enclosed across context run recovery and dispatch phases', async () => {
  const diagnostics = [];
  const host = createMemoryTerminalHost();
  const effects = createTuiEffectManager({
    clock: host.clock,
    context: async () => ({
      host,
      viewport: host.getViewport(),
      capabilities: await host.getCapabilities(),
      diagnostics: [],
      clock: host.clock
    }),
    dispatch: async () => { throw new Error('dispatch failed'); },
    reportDiagnostic: (item) => diagnostics.push(item)
  });
  effects.start([
    {
      id: 'run-failure',
      concurrency: 'parallel',
      run: async () => { throw new Error('run failed'); },
      onError: () => { throw new Error('mapper failed'); }
    },
    {
      id: 'dispatch-failure',
      concurrency: 'parallel',
      run: async () => ({ kind: 'message', message: 'done' })
    }
  ]);

  await waitUntil(() => diagnostics.length === 2);
  await effects.dispose();

  assert.deepEqual(
    diagnostics.map((item) => item.data?.phase).sort(),
    ['dispatch', 'onError']
  );
});

test('context acquisition failures are diagnosed and may recover through one atomic dispatch', async () => {
  const diagnostics = [];
  const dispatched = [];
  const { effects } = manager(async (messages) => { dispatched.push(messages); }, {
    context: async () => { throw new Error('context failed'); },
    reportDiagnostic: (item) => diagnostics.push(item)
  });
  effects.start([{
    id: 'context-failure',
    concurrency: 'parallel',
    run: async () => { assert.fail('effect run must not start'); },
    onError: ({ diagnostic }) => ({ kind: 'messages', messages: [diagnostic.code, diagnostic.data?.phase] })
  }]);

  await waitUntil(() => diagnostics.length === 1);
  await effects.dispose();

  assert.deepEqual(dispatched, [['TUI_EFFECT_FAILED', 'context']]);
  assert.equal(diagnostics[0].data?.phase, 'context');
});

test('cancellation during context acquisition prevents user effect code from starting', async () => {
  const contextGate = gate();
  let ran = false;
  const { effects } = manager(async () => {}, {
    context: async () => {
      await contextGate.promise;
      const host = createMemoryTerminalHost();
      return {
        host,
        viewport: host.getViewport(),
        capabilities: await host.getCapabilities(),
        diagnostics: [],
        clock: host.clock
      };
    }
  });
  effects.start([{
    id: 'pending-context',
    concurrency: 'parallel',
    run: async () => { ran = true; return { kind: 'none' }; }
  }]);

  effects.cancel();
  contextGate.release();
  await effects.dispose();

  assert.equal(ran, false);
});

test('replace rejects a successor when prior work ignores abort beyond the handoff deadline', async () => {
  const priorGate = gate();
  const diagnostics = [];
  let priorStarted = false;
  const { effects, host } = manager(async () => {}, {
    policy: {
      maxActive: 1,
      maxActivePerId: 1,
      maxQueued: 2,
      maxQueuedPerId: 2,
      replacementGracePeriodMs: 10
    },
    reportDiagnostic: (item) => diagnostics.push(item)
  });
  effects.start([{
    id: 'load',
    concurrency: 'replace',
    run: async () => {
      priorStarted = true;
      await priorGate.promise;
      return { kind: 'none' };
    }
  }]);
  await waitUntil(() => priorStarted);
  effects.start([{
    id: 'load',
    concurrency: 'replace',
    run: async () => { assert.fail('timed-out replacement must not start'); }
  }]);

  host.clock.advance(10);
  await waitUntil(() => effects.metrics().rejected === 1);
  assert.deepEqual(effects.metrics(), { active: 1, queued: 0, rejected: 1 });
  assert.equal(diagnostics[0].data?.reason, 'replacement_timeout');

  priorGate.release();
  await effects.dispose();
});

async function waitUntil(predicate) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  assert.fail('condition was not reached');
}

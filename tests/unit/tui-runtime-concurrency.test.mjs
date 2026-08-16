import assert from 'node:assert/strict';
import test from 'node:test';
import { createTuiRuntime, defineTui } from '../../dist/tui/index.js';
import {
  committedTerminalWrite,
  createMemoryTerminalHost,
  failedTerminalWrite,
  indeterminateTerminalWrite
} from '../../dist/host/index.js';
import { createTerminalHarness } from '../../dist/testing/index.js';
import { createTranscriptRecorder, validateTranscript } from '../../dist/transcript/index.js';
import { renderFramePlain } from '../../dist/renderer/index.js';
import { text, textInput as createTextInput } from '../../dist/components/index.js';
import { ignoreMessage } from '../../dist/component/index.js';
import { diagnostic } from '../../dist/diagnostics.js';
import { column, surface } from '../../dist/layout/index.js';
import { flushAsync, waitUntil } from '../helpers/async.ts';

function textInput(options) {
  return createTextInput(
    options.onAction !== undefined
      ? options
      : { onAction: () => ignoreMessage(), ...options }
  );
}

test('TUI runtime dispatch updates state and records incremental render diffs', async () => {
  const app = defineTui({
    id: 'counter',
    init: () => ({ count: 0 }),
    update: (state, message) => ({ state: { count: state.count + message.delta } }),
    view: (state) => surface(text({ content: `Count ${state.count}`, id: 'count' }), { id: 'counter-surface' })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 18, rows: 4 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  await runtime.dispatch({ delta: 2 });

  assert.deepEqual(runtime.state(), { count: 2 });
  assert.equal(harness.frames().length, 2);
  assert.equal(harness.diffs().length, 2);
  assert.equal(harness.diffs()[0].fullRewrite, true);
  assert.equal(harness.diffs()[1].fullRewrite, false);
  assert.match(renderFramePlain(runtime.frame()), /Count 2/);
});

test('dispatchMany reduces one ordered transaction and commits once', async () => {
  const observed = [];
  const transcript = createTranscriptRecorder({ id: 'dispatch-many', source: 'tui' });
  const app = defineTui({
    id: 'dispatch-many',
    init: () => ({ values: [] }),
    update: (state, message) => {
      observed.push(message.value);
      return message.exit === true
        ? { state: { values: [...state.values, message.value] }, exit: { reason: 'complete' } }
        : { state: { values: [...state.values, message.value] } };
    },
    view: (state) => text({ content: state.values.join(','), id: 'values' }),
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 20, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host, transcript });
  await runtime.start();
  const framesBefore = runtime.metrics().frameCommits;

  const result = await runtime.dispatchMany([
    { value: 'one' },
    { value: 'two' },
    { value: 'three', exit: true },
    { value: 'ignored' },
  ]);

  assert.deepEqual(result.values, ['one', 'two', 'three']);
  assert.deepEqual(observed, ['one', 'two', 'three']);
  assert.equal(runtime.metrics().frameCommits, framesBefore + 1);
  assert.deepEqual(
    transcript.snapshot().steps
      .filter((step) => step.kind === 'message')
      .map((step) => step.message.value),
    ['one', 'two', 'three'],
  );
  await runtime.dispose();
});

test('empty dispatchMany is an operational no-op', async () => {
  const initial = { count: 0 };
  const app = defineTui({
    id: 'empty-dispatch-many',
    init: () => initial,
    update: (state) => ({ state: { count: state.count + 1 } }),
    view: (state) => text({ content: String(state.count) }),
  });
  const runtime = createTuiRuntime({ app, host: createMemoryTerminalHost() });
  await runtime.start();
  const framesBefore = runtime.metrics().frameCommits;
  assert.equal(await runtime.dispatchMany([]), initial);
  assert.equal(runtime.metrics().frameCommits, framesBefore);
  assert.equal(runtime.metrics().dispatchedMessages, 0);
  await runtime.dispose();
});

test('direct and asynchronous dispatch paths share one non-null message domain', async () => {
  const app = defineTui({
    id: 'non-null-message-domain',
    init: () => ({ count: 0 }),
    update: (state) => ({ state: { count: state.count + 1 } }),
    view: (state) => text({ content: String(state.count) })
  });
  const runtime = createTuiRuntime({ app, host: createMemoryTerminalHost() });
  await runtime.start();

  await assert.rejects(runtime.dispatch(null), /cannot be null or undefined/u);
  await assert.rejects(runtime.dispatchMany([undefined]), /cannot contain null or undefined/u);
  assert.deepEqual(runtime.state(), { count: 0 });
  await runtime.dispose();
});

test('TUI runtime discards a candidate when output fails before publication', async () => {
  let subscriptionStarts = 0;
  const transcript = createTranscriptRecorder({ id: 'failed-candidate-transcript', source: 'tui' });
  const app = defineTui({
    id: 'failed-candidate',
    init: () => ({ count: 0 }),
    update: (state, message) => ({ state: { count: state.count + message.delta } }),
    subscriptions: (state) => [{
      id: 'state-generation',
      generation: state.count,
      async *messages(context) {
        subscriptionStarts += 1;
        await new Promise((resolve) => context.signal.addEventListener('abort', resolve, { once: true }));
      }
    }],
    view: (state) => text({ content: `Count ${String(state.count)}`, id: 'failed-candidate-count' })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 18, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host, transcript });

  const initialFrame = await runtime.start();
  const initialChange = await runtime.nextChange();
  await waitUntil(() => subscriptionStarts === 1);
  const write = harness.host.write.bind(harness.host);
  harness.host.write = async () => {
    throw new Error('candidate output failed');
  };

  await assert.rejects(() => runtime.dispatch({ delta: 1 }), /candidate output failed/u);

  const commits = transcript.snapshot().steps.filter((step) => step.kind === 'commit');
  assert.deepEqual(runtime.state(), { count: 0 });
  assert.deepEqual(runtime.frame(), initialFrame);
  assert.equal(runtime.exit(), undefined);
  assert.equal(subscriptionStarts, 1);
  assert.equal(harness.frames().length, 1);
  assert.equal(commits.length, 1);
  assert.equal(commits[0]?.commit.id, initialChange.commitId);
  assert.equal(commits[0]?.commit.stateVersion, initialChange.stateVersion);
  harness.host.write = write;
  await runtime.dispose();
});

test('a committed terminal write publishes render and application state despite concurrent disposal', async () => {
  const app = defineTui({
    id: 'committed-write-publication',
    init: () => ({ count: 0 }),
    update: (state) => ({ state: { count: state.count + 1 }, exit: { reason: 'done' } }),
    view: (state) => text({ content: `Count ${String(state.count)}`, id: 'committed-count' })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 18, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });
  await runtime.start();
  const writeStarted = deferred();
  const releaseWrite = deferred();
  harness.host.write = async () => {
    writeStarted.release();
    await releaseWrite.promise;
    return committedTerminalWrite();
  };

  const dispatching = runtime.dispatch({ kind: 'increment' });
  await writeStarted.promise;
  const disposing = runtime.dispose();
  releaseWrite.release();

  assert.deepEqual(await dispatching, { count: 1 });
  await disposing;
  assert.deepEqual(runtime.state(), { count: 1 });
  assert.match(renderFramePlain(runtime.frame()), /Count 1/u);
  assert.equal(harness.frames().length, 2);
  await assert.rejects(runtime.dispatch({ kind: 'late' }), /disposed/u);
});

test('invalid effect cancellation identities fail before output or state publication', async () => {
  const app = defineTui({
    id: 'invalid-effect-cancellation',
    init: () => ({ count: 0 }),
    update: (state) => ({ state: { count: state.count + 1 }, cancelEffects: [''] }),
    view: (state) => text({ content: `Count ${String(state.count)}`, id: 'invalid-cancel-count' })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 18, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });
  const initialFrame = await runtime.start();

  await assert.rejects(runtime.dispatch({ kind: 'increment' }), /Effect id must contain visible text/u);

  assert.deepEqual(runtime.state(), { count: 0 });
  assert.equal(runtime.frame(), initialFrame);
  assert.equal(harness.frames().length, 1);
  await runtime.dispose();
});

test('observer and transcript sink failures cannot reject committed runtime publication', async () => {
  const transcript = createTranscriptRecorder({
    id: 'failing-transcript-sink',
    source: 'tui',
    onStep() {
      throw new Error('transcript observer failed');
    }
  });
  const host = createMemoryTerminalHost({
    observer: {
      recordFrame() {
        throw new Error('frame observer failed');
      },
      recordDiff() {
        throw new Error('diff observer failed');
      }
    }
  });
  const app = defineTui({
    id: 'isolated-observers',
    init: () => ({ count: 0 }),
    update: (state) => ({ state: { count: state.count + 1 } }),
    view: (state) => text({ content: String(state.count), id: 'isolated-observer-count' })
  });
  const runtime = createTuiRuntime({ app, host, transcript });

  await runtime.start();
  assert.deepEqual(await runtime.dispatch({ kind: 'increment' }), { count: 1 });

  assert.equal(runtime.diagnostics().some((item) => item.diagnostic.code === 'TUI_RUNTIME_TASK_FAILED'), true);
  assert.equal(transcript.snapshot().diagnostics.some(
    (item) => item.diagnostic.code === 'TRANSCRIPT_SINK_FAILED'
  ), true);
  await runtime.dispose();
});

test('runtime diagnostics retain a bounded tail and expose omitted counts', async () => {
  const app = defineTui({
    id: 'bounded-runtime-diagnostics',
    init: () => ({ ready: true }),
    update: (state) => ({ state }),
    view: () => text({ content: 'ready' })
  });
  const runtime = createTuiRuntime({ app, host: createMemoryTerminalHost() });
  await runtime.start();
  for (let index = 0; index < 300; index += 1) {
    runtime.reportDiagnostic(diagnostic('INPUT_TIMEOUT', `timeout ${String(index)}`));
  }

  assert.equal(runtime.diagnostics().length, 256);
  assert.deepEqual(runtime.metrics().diagnostics, { retained: 256, omitted: 44 });
  await runtime.dispose();
});

test('TUI runtime preserves unchanged same-reference state when a focus render candidate fails', async () => {
  const initialState = { count: 0 };
  const app = defineTui({
    id: 'failed-same-reference-candidate',
    init: () => initialState,
    update: (state) => ({
      state,
      focus: { kind: 'element', elementId: 'second-same-reference-field' }
    }),
    view: () => column([
      textInput({
        id: 'first-same-reference-field',
        presentation: { value: 'first', cursor: 0 }
      }),
      textInput({
        id: 'second-same-reference-field',
        presentation: { value: 'second', cursor: 0 }
      })
    ])
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 18, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });
  const initialFrame = await runtime.start();
  harness.host.write = async () => {
    throw new Error('same-reference candidate output failed');
  };

  await assert.rejects(
    () => runtime.dispatch({ kind: 'refresh' }),
    /same-reference candidate output failed/u
  );

  assert.equal(runtime.state(), initialState);
  assert.equal(runtime.state().count, 0);
  assert.equal(runtime.frame(), initialFrame);
  assert.equal(runtime.metrics().frameCommits, 1);
  await runtime.dispose();
});

test('TUI runtime establishes a full baseline after an indeterminate frame write', async () => {
  const app = defineTui({
    id: 'indeterminate-frame-baseline',
    init: () => ({ count: 0 }),
    update: (state, message) => ({ state: { count: state.count + message.delta } }),
    view: (state) => text({ content: `Count ${String(state.count)}`, id: 'indeterminate-count' })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 18, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });
  await runtime.start();
  const write = harness.host.write.bind(harness.host);
  harness.host.write = async () => indeterminateTerminalWrite(
    'indeterminate-frame-test',
    new Error('frame outcome unknown')
  );

  await assert.rejects(() => runtime.dispatch({ delta: 1 }), /partially written/u);
  harness.host.write = write;
  await runtime.dispatch({ delta: 2 });

  assert.deepEqual(runtime.state(), { count: 2 });
  assert.equal(harness.diffs().length, 2);
  assert.equal(harness.diffs()[1].fullRewrite, true);
  await runtime.dispose();
});

test('a failed-before-write frame keeps the committed terminal baseline', async () => {
  const app = defineTui({
    id: 'rejected-frame-baseline',
    init: () => ({ count: 0 }),
    update: (state, message) => ({ state: { count: state.count + message.delta } }),
    view: (state) => text({ content: `Count ${String(state.count)}`, id: 'rejected-count' })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 18, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });
  await runtime.start();
  const write = harness.host.write.bind(harness.host);
  harness.host.write = async () => failedTerminalWrite(
    'rejected-frame-test',
    new Error('frame did not start')
  );

  await assert.rejects(() => runtime.dispatch({ delta: 1 }), /failed before the write started/u);
  harness.host.write = write;
  await runtime.dispatch({ delta: 2 });

  assert.deepEqual(runtime.state(), { count: 2 });
  assert.equal(harness.diffs().length, 2);
  assert.equal(harness.diffs()[1].fullRewrite, false);
  await runtime.dispose();
});

test('direct runtime resize coalesces an active request and retains only the latest queued terminal size', async () => {
  const app = defineTui({
    id: 'direct-resize-coalescing',
    init: () => ({ ready: true }),
    update: (state) => ({ state }),
    view: (_state, context) => text({ content: `columns:${String(context.terminalSize.columns)}`, id: 'resize-width' })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 20, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });
  await runtime.start();
  const write = harness.host.write.bind(harness.host);
  const firstResizeStarted = deferred();
  const releaseFirstResize = deferred();
  let blocked = false;
  harness.host.write = async (output, context) => {
    if (!blocked) {
      blocked = true;
      firstResizeStarted.release();
      await releaseFirstResize.promise;
    }
    return write(output, context);
  };

  const first = runtime.resize({ columns: 21, rows: 3 });
  await firstResizeStarted.promise;
  const second = runtime.resize({ columns: 22, rows: 3 });
  const third = runtime.resize({ columns: 24, rows: 3 });
  assert.equal(first, second);
  assert.equal(second, third);
  releaseFirstResize.release();
  const results = await Promise.all([first, second, third]);

  assert.deepEqual(harness.frames().map((frame) => frame.width), [20, 21, 24]);
  assert.deepEqual(results.map((frame) => frame.width), [24, 24, 24]);
  assert.match(renderFramePlain(runtime.frame()), /columns:24/u);
  await runtime.dispose();
});

test('TUI runtime start returns the committed initial frame', async () => {
  const app = defineTui({
    id: 'start-frame',
    init: () => ({ label: 'ready' }),
    update: (state) => ({ state }),
    view: (state) => text({ content: state.label, id: 'start-label' })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 18, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  const frame = await runtime.start();

  assert.equal(frame.accessibility.root.id, 'start-label');
  assert.equal(runtime.exit(), undefined);
  assert.deepEqual(runtime.frame(), frame);
});

test('TUI runtime consumes async subscription sources without duplicate restarts', async () => {
  let starts = 0;
  const app = defineTui({
    id: 'subscription-init',
    init: () => ({ count: 0 }),
    update: (state, message) => ({ state: { count: state.count + message.delta } }),
    subscriptions: () => [{
      id: 'timer-source',
      generation: 0,
      source: 'timer',
      async *messages() {
        starts += 1;
        yield { kind: 'reliable', message: { delta: 1 } };
      }
    }],
    view: (state) => text({ content: `Count ${state.count}`, id: 'subscription-count' })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 18, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  await waitUntil(() => runtime.state()?.count === 1);
  await runtime.dispatch({ delta: 1 });

  assert.deepEqual(runtime.state(), { count: 2 });
  assert.equal(starts, 1);
  assert.match(renderFramePlain(runtime.frame()), /Count 2/);
});

test('TUI runtime records subscription source failures and stops the failed source', async () => {
  let starts = 0;
  const app = defineTui({
    id: 'subscription-failure',
    init: () => ({ count: 0, status: 'active' }),
    update: (state, message) => message.kind === 'failed'
      ? { state: { ...state, status: 'failed' } }
      : { state: { ...state, count: state.count + message.delta } },
    subscriptions: () => [{
      id: 'failed-source',
      generation: 0,
      source: 'external',
      async *messages() {
        starts += 1;
        throw new Error('source failed');
      },
      onLifecycle: (event) => event.kind === 'failed' ? { kind: 'failed' } : undefined
    }],
    view: (state) => text({ content: `Count ${state.count}`, id: 'subscription-count' })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 18, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  await waitUntil(() => runtime.diagnostics().some((item) => item.diagnostic.code === 'TUI_SOURCE_FAILED'));
  await waitUntil(() => runtime.state()?.status === 'failed');
  await runtime.dispatch({ kind: 'increment', delta: 1 });

  assert.equal(starts, 1);
  assert.match(
    runtime.diagnostics().find((item) => item.diagnostic.code === 'TUI_SOURCE_FAILED')?.diagnostic.message ?? '',
    /failed-source/u
  );
});

test('keyed replaceable subscription emissions keep one pending value per key', async () => {
  const app = defineTui({
    id: 'latest-subscription',
    init: () => ({ values: [] }),
    update: (state, message) => ({ state: { values: [...state.values, message.value] } }),
    subscriptions: () => [{
      id: 'samples',
      generation: 0,
      channel: { capacity: 4 },
      async *messages() {
        for (let value = 1; value <= 100; value += 1) {
          yield { kind: 'replaceable', key: 'sample', message: { value } };
        }
      }
    }],
    view: (state) => text({ content: state.values.join(','), id: 'latest-values' })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 24, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  await waitUntil(() => runtime.state()?.values.at(-1) === 100);

  const values = runtime.state()?.values ?? [];
  assert.equal(values[0], 1);
  assert.equal(values.at(-1), 100);
  assert.ok(values.length < 100);
});

test('subscription generations replace completed and failed executions without duplicate active sources', async () => {
  const starts = [];
  const disposals = [];
  const app = defineTui({
    id: 'subscription-generations',
    init: () => ({ generation: 0, values: [] }),
    update: (state, message) => message.kind === 'advance'
      ? { state: { ...state, generation: state.generation + 1 } }
      : { state: { ...state, values: [...state.values, message.value] } },
    subscriptions: (state) => [{
      id: 'versioned-source',
      generation: state.generation,
      async *messages() {
        starts.push(state.generation);
        yield { kind: 'reliable', message: { kind: 'value', value: state.generation } };
      },
      dispose() {
        disposals.push(state.generation);
      }
    }],
    view: (state) => text({ content: state.values.join(','), id: 'subscription-generations-value' })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 18, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  await waitUntil(() => runtime.state().values.length === 1);
  await runtime.dispatch({ kind: 'advance' });
  await waitUntil(() => runtime.state().values.length === 2);
  await runtime.dispatch({ kind: 'value', value: 9 });

  assert.deepEqual(starts, [0, 1]);
  assert.deepEqual(disposals, [0, 1]);
  assert.deepEqual(runtime.state().values, [0, 1, 9]);
  await runtime.dispose();
});

test('duplicate subscription ids fail startup before publishing runtime state', async () => {
  const app = defineTui({
    id: 'duplicate-subscriptions',
    init: () => ({ ready: true }),
    update: (state) => ({ state }),
    subscriptions: () => [0, 1].map(() => ({
      id: 'duplicate',
      generation: 0,
      async *messages() {}
    })),
    view: () => text({ content: 'ready', id: 'duplicate-subscriptions-view' })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 18, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await assert.rejects(() => runtime.start(), /Duplicate TUI event source id/u);
  assert.equal(runtime.diagnostics().some((item) => item.diagnostic.code === 'TUI_SOURCE_DUPLICATE_ID'), true);
  assert.throws(() => runtime.state(), /does not have state/u);
  assert.equal(runtime.frame(), undefined);
  await runtime.dispose();
});

test('TUI runtime cancels subscription sources when they leave the definition', async () => {
  let sourceSignal;
  let disposeCount = 0;
  const app = defineTui({
    id: 'subscription-cancel',
    init: () => ({ enabled: true }),
    update: (_state, message) => ({ state: { enabled: message.enabled } }),
    subscriptions: (state) => state.enabled
      ? [{
          id: 'long-source',
          generation: 0,
          async *messages(context) {
            sourceSignal = context.signal;
            await new Promise(() => undefined);
          },
          dispose() {
            disposeCount += 1;
          }
        }]
      : [],
    view: (state) => text({ content: state.enabled ? 'enabled' : 'disabled', id: 'subscription-state' })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 18, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  await waitUntil(() => sourceSignal !== undefined);
  assert.equal(sourceSignal.aborted, false);

  await runtime.dispatch({ enabled: false });

  assert.equal(sourceSignal.aborted, true);
  assert.equal(disposeCount, 1);
  assert.match(renderFramePlain(runtime.frame()), /disabled/);
});

test('retired subscription output already queued behind its retirement is ignored', async () => {
  const sourceGate = deferred();
  let sourceStarted = false;
  const app = defineTui({
    id: 'retired-queued-source-output',
    init: () => ({ enabled: true, phase: 'idle', staleMessages: 0 }),
    update: (state, message) => {
      if (message.kind === 'block') return { state: { ...state, phase: 'blocking' } };
      if (message.kind === 'disable') return { state: { ...state, enabled: false, phase: 'disabled' } };
      return { state: { ...state, staleMessages: state.staleMessages + 1 } };
    },
    subscriptions: (state) => state.enabled ? [{
      id: 'retired-source',
      generation: 0,
      async *messages() {
        sourceStarted = true;
        await sourceGate.promise;
        yield { kind: 'reliable', message: { kind: 'stale-source-output' } };
      }
    }] : [],
    view: (state) => text({ content: `${state.phase}:${String(state.staleMessages)}`, id: 'source-admission-state' })
  });
  const host = createMemoryTerminalHost({ terminalSize: { columns: 24, rows: 3 } });
  const runtime = createTuiRuntime({ app, host });
  await runtime.start();
  await waitUntil(() => sourceStarted);

  const commitGate = deferred();
  let commitBlocked = false;
  const write = host.write.bind(host);
  host.write = async (output) => {
    if (!commitBlocked) {
      commitBlocked = true;
      await commitGate.promise;
    }
    return write(output);
  };
  const blocker = runtime.dispatch({ kind: 'block' });
  await waitUntil(() => commitBlocked);
  const retirement = runtime.dispatch({ kind: 'disable' });
  sourceGate.release();
  await flushAsync();
  commitGate.release();
  await Promise.all([blocker, retirement]);
  await flushAsync();

  assert.deepEqual(runtime.state(), { enabled: false, phase: 'disabled', staleMessages: 0 });
  assert.match(renderFramePlain(runtime.frame()), /disabled:0/u);
  await runtime.dispose();
});

test('TUI effects do not block later input or external dispatches', async () => {
  let releaseEffect;
  const gate = new Promise((resolve) => {
    releaseEffect = resolve;
  });
  const app = defineTui({
    id: 'async-effect',
    init: () => ({ count: 0, phase: 'idle' }),
    update: (state, message) => {
      if (message.kind === 'start') {
        return {
          state: { ...state, phase: 'loading' },
          effects: [{
            id: 'load',
            concurrency: 'replace',
            async run() {
              await gate;
              return { kind: 'message', message: { kind: 'finish' } };
            }
          }]
        };
      }
      if (message.kind === 'finish') return { state: { ...state, phase: 'done' } };
      return { state: { ...state, count: state.count + 1 } };
    },
    view: (state) => text({ content: `${state.phase}:${String(state.count)}`, id: 'effect-state' })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 18, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  await runtime.dispatch({ kind: 'start' });
  await runtime.dispatch({ kind: 'increment' });

  assert.deepEqual(runtime.state(), { count: 1, phase: 'loading' });
  assert.match(renderFramePlain(runtime.frame()), /loading:1/u);

  releaseEffect();
  await waitUntil(() => runtime.state()?.phase === 'done');
  assert.deepEqual(runtime.state(), { count: 1, phase: 'done' });
});

test('replaced effect output and recovery output already queued behind replacement are ignored', async () => {
  const outputGate = deferred();
  const failureGate = deferred();
  let effectsStarted = 0;
  const app = defineTui({
    id: 'replaced-queued-effect-output',
    init: () => ({ phase: 'idle', staleOutput: false, staleRecovery: false }),
    update: (state, message) => {
      if (message.kind === 'start') {
        return {
          state: { ...state, phase: 'running' },
          effects: [
            {
              id: 'replace-output',
              concurrency: 'replace',
              async run() {
                effectsStarted += 1;
                await outputGate.promise;
                return { kind: 'message', message: { kind: 'stale-output' } };
              }
            },
            {
              id: 'replace-error',
              concurrency: 'replace',
              async run() {
                effectsStarted += 1;
                await failureGate.promise;
                throw new Error('retired effect failure');
              },
              onError: () => ({ kind: 'message', message: { kind: 'stale-recovery' } })
            }
          ]
        };
      }
      if (message.kind === 'replace') {
        return {
          state: { ...state, phase: 'replaced' },
          effects: [
            { id: 'replace-output', concurrency: 'replace', run: async () => ({ kind: 'none' }) },
            { id: 'replace-error', concurrency: 'replace', run: async () => ({ kind: 'none' }) }
          ]
        };
      }
      if (message.kind === 'stale-output') return { state: { ...state, staleOutput: true } };
      if (message.kind === 'stale-recovery') return { state: { ...state, staleRecovery: true } };
      return { state: { ...state, phase: 'blocking' } };
    },
    view: (state) => text({ content: `${state.phase}:${String(state.staleOutput)}:${String(state.staleRecovery)}`, id: 'effect-admission-state' })
  });
  const host = createMemoryTerminalHost({ terminalSize: { columns: 32, rows: 3 } });
  const runtime = createTuiRuntime({ app, host });
  await runtime.start();
  await runtime.dispatch({ kind: 'start' });
  await waitUntil(() => effectsStarted === 2);

  const commitGate = deferred();
  let commitBlocked = false;
  const write = host.write.bind(host);
  host.write = async (output) => {
    if (!commitBlocked) {
      commitBlocked = true;
      await commitGate.promise;
    }
    return write(output);
  };
  const blocker = runtime.dispatch({ kind: 'block' });
  await waitUntil(() => commitBlocked);
  const replacement = runtime.dispatch({ kind: 'replace' });
  outputGate.release();
  failureGate.release();
  await flushAsync();
  commitGate.release();
  await Promise.all([blocker, replacement]);
  await flushAsync();

  assert.deepEqual(runtime.state(), { phase: 'replaced', staleOutput: false, staleRecovery: false });
  assert.equal(runtime.diagnostics().some((item) => item.diagnostic.code === 'TUI_EFFECT_FAILED'
    && item.diagnostic.target === 'replace-error'), false);
  await runtime.dispose();
});

test('multi-message effect output commits one atomic state transition', async () => {
  const release = deferred();
  const app = defineTui({
    id: 'effect-message-batch',
    init: () => ({ count: 0 }),
    update: (state, message) => message.kind === 'start'
      ? {
          state,
          effects: [{
            id: 'batch',
            concurrency: 'parallel',
            async run() {
              await release.promise;
              return {
                kind: 'messages',
                messages: [
                  { kind: 'increment' },
                  { kind: 'increment' },
                  { kind: 'increment' }
                ]
              };
            }
          }]
        }
      : { state: { count: state.count + 1 } },
    view: (state) => text({ content: `Count ${state.count}`, id: 'effect-message-batch-count' })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 18, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  await runtime.dispatch({ kind: 'start' });
  const commitsBeforeOutput = runtime.metrics().frameCommits;
  release.release();
  await waitUntil(() => runtime.state().count === 3);

  assert.equal(runtime.metrics().frameCommits, commitsBeforeOutput + 1);
  assert.equal(harness.frames().length, commitsBeforeOutput + 1);
  await runtime.dispose();
});

test('TUI updates cancel one effect id without cancelling unrelated or later effects', async () => {
  let navigationAborted = false;
  let unrelatedCompleted = false;
  let laterCompleted = false;
  const unrelated = deferred();
  const app = defineTui({
    id: 'selective-effect-cancellation',
    init: () => ({ phase: 'idle' }),
    update: (state, message) => {
      if (message.kind === 'start') {
        return {
          state: { phase: 'running' },
          effects: [
            {
              id: 'navigation:tab-1',
              concurrency: 'replace',
              async run({ signal }) {
                await new Promise((resolve) => signal.addEventListener('abort', resolve, { once: true }));
                navigationAborted = true;
                return { kind: 'none' };
              }
            },
            {
              id: 'download:1',
              concurrency: 'parallel',
              async run() {
                await unrelated.promise;
                unrelatedCompleted = true;
                return { kind: 'none' };
              }
            }
          ]
        };
      }
      if (message.kind === 'stop') {
        return {
          state: { phase: 'stopped' },
          cancelEffects: ['navigation:tab-1']
        };
      }
      if (message.kind === 'later') {
        return {
          state,
          effects: [{
            id: 'navigation:tab-2',
            concurrency: 'parallel',
            async run() {
              laterCompleted = true;
              return { kind: 'none' };
            }
          }]
        };
      }
      return { state };
    },
    view: (state) => text({ content: state.phase, id: 'selective-effect-state' })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 20, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  await runtime.dispatch({ kind: 'start' });
  await runtime.dispatch({ kind: 'stop' });
  await waitUntil(() => navigationAborted);
  assert.equal(unrelatedCompleted, false);

  await runtime.dispatch({ kind: 'later' });
  await waitUntil(() => laterCompleted);
  unrelated.release();
  await waitUntil(() => unrelatedCompleted);
  await runtime.dispose();
});

function deferred() {
  let release;
  const promise = new Promise((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

test('TUI effects may dispatch terminal exit without deadlocking disposal', async () => {
  const app = defineTui({
    id: 'effect-exit',
    init: () => ({ phase: 'idle' }),
    update: (state, message) => {
      if (message.kind === 'start') {
        return {
          state: { phase: 'running' },
          effects: [{
            id: 'complete-run',
            concurrency: 'parallel',
            async run() {
              return { kind: 'message', message: { kind: 'finish' } };
            }
          }]
        };
      }
      if (message.kind === 'finish') {
        return { state: { phase: 'done' }, exit: { reason: 'effect completed' } };
      }
      return { state };
    },
    view: (state) => text({ content: state.phase, id: 'effect-exit-state' })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 18, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  await runtime.dispatch({ kind: 'start' });
  await waitUntil(() => runtime.exit() !== undefined);
  await Promise.race([
    runtime.dispose(),
    new Promise((_, reject) => setTimeout(() => reject(new Error('effect disposal timed out')), 250))
  ]);

  assert.equal(runtime.exit()?.status, 'completed');
  assert.equal(runtime.exit()?.reason, 'effect completed');
});

test('TUI subscriptions may dispatch terminal exit without deadlocking disposal', async () => {
  let sourceCompleted;
  const sourceCompletion = new Promise((resolve) => {
    sourceCompleted = resolve;
  });
  const app = defineTui({
    id: 'subscription-exit',
    init: () => ({ phase: 'waiting' }),
    update: (_state, message) => message.kind === 'finish'
      ? { state: { phase: 'done' }, exit: { reason: 'subscription completed' } }
      : { state: { phase: 'waiting' } },
    subscriptions: () => [{
      id: 'exit-source',
      generation: 0,
      async *messages() {
        try {
          yield { kind: 'reliable', message: { kind: 'finish' } };
        } finally {
          sourceCompleted();
        }
      },
      async dispose() {
        await sourceCompletion;
      }
    }],
    view: (state) => text({ content: state.phase, id: 'subscription-exit-state' })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 18, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  await waitUntil(() => runtime.exit() !== undefined);
  await Promise.race([
    runtime.dispose(),
    new Promise((_, reject) => setTimeout(() => reject(new Error('subscription disposal timed out')), 250))
  ]);

  assert.equal(runtime.exit()?.status, 'completed');
  assert.equal(runtime.exit()?.reason, 'subscription completed');
});

test('TUI runtime records external dispatch messages in transcripts', async () => {
  const transcript = createTranscriptRecorder({ id: 'external-message-transcript', source: 'tui' });
  const app = defineTui({
    id: 'external-message',
    init: () => ({ count: 0 }),
    update: (state, message) => ({ state: { count: state.count + message.delta } }),
    view: (state) => text({ content: `Count ${state.count}`, id: 'external-count' })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 18, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host, transcript });

  await runtime.start();
  await runtime.dispatch({ delta: 4, callback: () => undefined, invalidNumber: Number.NaN });
  const snapshot = transcript.snapshot();
  const serialized = JSON.parse(JSON.stringify(snapshot));

  assert.equal(validateTranscript(snapshot).ok, true);
  assert.equal(validateTranscript(serialized).ok, true);
  assert.ok(snapshot.steps.some((step) => step.kind === 'message'
    && step.source === 'external'
    && step.message.delta === 4
    && step.message.callback === '[object Function]'
    && step.message.invalidNumber === 'NaN'));
  const messageIndex = snapshot.steps.findIndex((step) => step.kind === 'message' && step.source === 'external');
  const committedIndex = snapshot.steps.findIndex((step, index) => index > messageIndex
    && step.kind === 'commit'
    && step.commit.stateVersion === 1);
  assert.ok(messageIndex >= 0);
  assert.ok(committedIndex > messageIndex);
});

test('TUI runtime records resize input before the frame commit it causes', async () => {
  const transcript = createTranscriptRecorder({ id: 'resize-order-transcript', source: 'tui' });
  const app = defineTui({
    id: 'resize-order',
    init: () => ({ ready: true }),
    update: (state) => ({ state }),
    view: () => text({ content: 'ready', id: 'resize-order-content' })
  });
  const runtime = createTuiRuntime({
    app,
    host: createMemoryTerminalHost({ terminalSize: { columns: 10, rows: 2 } }),
    transcript
  });

  await runtime.start();
  await runtime.resize({ columns: 20, rows: 4 });
  const steps = transcript.snapshot().steps;
  const resizeIndex = steps.findIndex((step) => step.kind === 'input' && step.event.kind === 'resize');
  const resizedCommitIndex = steps.findIndex((step, index) => index > resizeIndex
    && step.kind === 'commit'
    && step.commit.frame.width === 20
    && step.commit.frame.height === 4);

  assert.ok(resizeIndex >= 0);
  assert.ok(resizedCommitIndex > resizeIndex);
  await runtime.dispose();
});

test('TUI runtime publishes a terminal transition frame before its exit', async () => {
  const app = defineTui({
    id: 'frame-before-exit',
    init: () => ({ status: 'waiting' }),
    update: () => ({ state: { status: 'finished' }, exit: { reason: 'done' } }),
    view: (state) => text({ content: state.status, id: 'terminal-status' })
  });
  const runtime = createTuiRuntime({ app, host: createMemoryTerminalHost() });
  await runtime.start();
  await runtime.nextChange();
  const nextChange = runtime.nextChange();

  await runtime.dispatch({ kind: 'finish' });

  const frame = await nextChange;
  const exit = await runtime.nextChange();
  assert.equal(frame.kind, 'frame');
  assert.match(renderFramePlain(frame.frame), /finished/u);
  assert.equal(exit.kind, 'exit');
  assert.equal(exit.exit.reason, 'done');
  await runtime.dispose();
});

test('TUI runtime coalesces unobserved frame changes', async () => {
  const app = defineTui({
    id: 'coalesced-frame-changes',
    init: () => ({ count: 0 }),
    update: (state, message) => ({ state: { count: state.count + message.delta } }),
    view: (state) => text({ content: `Count ${String(state.count)}`, id: 'count' })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 20, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  await runtime.dispatch({ delta: 1 });
  await runtime.dispatch({ delta: 1 });

  const latest = await runtime.nextChange();
  assert.equal(latest.kind, 'frame');
  assert.match(renderFramePlain(latest.frame), /Count 2/u);

  let resolved = false;
  const pending = runtime.nextChange().then((change) => {
    resolved = true;
    return change;
  });
  await Promise.resolve();
  assert.equal(resolved, false);

  await runtime.dispatch({ delta: 1 });
  const next = await pending;
  assert.equal(next.kind, 'frame');
  assert.match(renderFramePlain(next.frame), /Count 3/u);
});

test('TUI runtime does not render or advance state version for identity no-op messages', async () => {
  const initialState = { count: 0 };
  let viewCalls = 0;
  const app = defineTui({
    id: 'identity-noop-frame-changes',
    init: () => initialState,
    update: (state, message) => message.kind === 'noop'
      ? { state }
      : { state: { count: state.count + 1 } },
    view: (state) => {
      viewCalls += 1;
      return text({ content: `Count ${String(state.count)}`, id: 'count' });
    }
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 20, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  await runtime.nextChange();

  let resolved = false;
  const pending = runtime.nextChange().then((change) => {
    resolved = true;
    return change;
  });
  for (let index = 0; index < 100; index += 1) {
    await runtime.dispatch({ kind: 'noop' });
  }
  await Promise.resolve();
  assert.equal(resolved, false);
  assert.equal(viewCalls, 1);
  assert.equal(runtime.metrics().frameCommits, 1);

  await runtime.dispatch({ kind: 'increment' });
  const change = await pending;
  assert.equal(change.kind, 'frame');
  assert.equal(change.stateVersion, 1);
  assert.equal(viewCalls, 2);
  assert.equal(runtime.metrics().frameCommits, 2);
  assert.match(renderFramePlain(change.frame), /Count 1/u);
  await runtime.dispose();
});

test('TUI runtime reports effect failures and can map them to application messages', async () => {
  const app = defineTui({
    id: 'effect-failure',
    init: () => ({ status: 'idle' }),
    update: (state, message) => message.kind === 'start'
      ? {
          state: { status: 'loading' },
          effects: [{
            id: 'broken-load',
            concurrency: 'replace',
            async run() {
              throw new Error('load failed');
            },
            onError: () => ({ kind: 'message', message: { kind: 'failed' } })
          }]
        }
      : { state: { ...state, status: 'failed' } },
    view: (state) => text({ content: state.status, id: 'effect-status' })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 18, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  await runtime.dispatch({ kind: 'start' });
  await waitUntil(() => runtime.state()?.status === 'failed');

  assert.equal(runtime.diagnostics().some((item) => item.diagnostic.code === 'TUI_EFFECT_FAILED'), true);
  assert.match(renderFramePlain(runtime.frame()), /failed/u);
});

test('TUI runtime resize re-renders against the memory host terminal size', async () => {
  const app = defineTui({
    id: 'resizable',
    init: () => ({ label: 'Wide label' }),
    update: (state) => ({ state }),
    view: (state) => surface(text({ content: state.label, id: 'label' }), { id: 'surface' })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 20, rows: 4 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  await runtime.resize({ columns: 12, rows: 4 });

  assert.equal(runtime.frame().width, 12);
  assert.equal(harness.frames().length, 2);
  assert.equal(harness.diffs()[1].fullRewrite, true);
  assert.match(renderFramePlain(runtime.frame()), /Wide label/);
});

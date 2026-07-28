import assert from 'node:assert/strict';
import process from 'node:process';
import test from 'node:test';
import { createTuiRuntime, defineTui, runTui } from '../../dist/tui/index.js';
import { diagnostic } from '../../dist/diagnostics.js';
import { createMemoryTerminalHost } from '../../dist/host/index.js';
import { kittyKeyboardProfile } from '../../dist/protocol/index.js';
import { assertTerminalRestored, createTerminalHarness, runInteractionScript } from '../../dist/testing/index.js';
import { createTranscriptRecorder, validateTranscript } from '../../dist/transcript/index.js';
import { renderFramePlain } from '../../dist/renderer/index.js';
import { text, textInput } from '../../dist/components/index.js';
import { flushAsync, waitUntil } from '../helpers/async.ts';

test('runTui emits deterministic transcripts when enabled', async () => {
  const app = defineTui({
    id: 'transcript-tui',
    transcript: { enabled: true },
    init: () => ({ submitted: false }),
    update: (_state, message) => ({ state: { submitted: message.submitted }, exit: {} }),
    view: (state) => textInput({
      id: 'transcript-field',
      presentation: { value: state.submitted ? 'submitted' : 'waiting', cursor: 0 },
      onSubmit: () => ({ submitted: true })
    })
  });
  const host = createMemoryTerminalHost({ terminalSize: { columns: 20, rows: 3 } });
  host.input('\r');
  const exit = await runTui(app, host);

  assert.equal(exit.status, 'completed');
  assert.equal(exit.transcript?.source, 'tui');
  assert.equal(exit.transcript?.id, 'transcript-tui-transcript');
  assert.equal(validateTranscript(exit.transcript).ok, true);
  assert.equal(exit.transcript?.steps.filter((step) => step.kind === 'input').length, 1);
  assert.ok(exit.transcript?.steps.some((step) => step.kind === 'commit'));
  assert.ok(exit.transcript?.steps.some((step) => step.kind === 'restore'));
  assert.ok(exit.transcript?.steps.some((step) => step.kind === 'snapshot'));
});

test('runTui fails and records final diagnostics when terminal restoration is unsuccessful', async () => {
  const app = defineTui({
    id: 'failed-restoration',
    transcript: { enabled: true },
    init: () => ({ done: false }),
    update: () => ({ state: { done: true }, exit: {} }),
    view: () => textInput({
      id: 'failed-restoration-input',
      presentation: { value: '', cursor: 0 },
      onSubmit: () => ({ kind: 'exit' })
    })
  });
  const host = createMemoryTerminalHost();
  const write = host.writeRecovery.bind(host);
  host.writeRecovery = async (output, context) => {
    if (output.text === '\u001B[?1049l') throw new Error('alternate screen restore failed');
    return write(output, context);
  };
  host.input('\r');

  const exit = await runTui(app, host);

  assert.equal(exit.status, 'error');
  assert.equal(exit.diagnostics.some((item) => item.code === 'HOST_RESTORE_FAILED'), true);
  assert.equal(exit.transcript?.diagnostics.some((item) => item.code === 'HOST_RESTORE_FAILED'), true);
  assert.equal(exit.transcript?.steps.some((step) => step.kind === 'diagnostic'
    && step.diagnostic.code === 'HOST_RESTORE_FAILED'), true);
  assert.equal(exit.transcript?.steps.some((step) => step.kind === 'restore'
    && step.result.status !== 'restored'), true);
});

test('TUI runtime startup is one transactional terminal outcome', async () => {
  const app = defineTui({
    id: 'failed-start-tui',
    init: () => {
      throw new Error('initialization failed');
    },
    update: (state) => ({ state }),
    view: () => text('unreachable')
  });
  const runtime = createTuiRuntime({ app, host: createMemoryTerminalHost() });
  const first = runtime.start();
  const second = runtime.start();

  assert.equal(first, second);
  await assert.rejects(first, /initialization failed/u);
  assert.throws(() => runtime.state(), /does not have state/u);
  await assert.rejects(() => runtime.dispatch({ kind: 'ignored' }), /failed/u);
});

test('TUI runtime requires explicit startup before operational methods', async () => {
  const app = defineTui({
    id: 'explicit-startup',
    init: () => 0,
    update: (state, message) => ({ state: state + message }),
    view: (state) => text(String(state))
  });
  const runtime = createTuiRuntime({ app, host: createMemoryTerminalHost() });

  await Promise.all([
    assert.rejects(runtime.dispatch(1), /runtime is created/u),
    assert.rejects(runtime.resize({ columns: 20, rows: 4 }), /runtime is created/u),
    assert.rejects(runtime.handleInput({
      kind: 'key',
      key: 'enter',
      modifiers: { ctrl: false, alt: false, shift: false, meta: false },
      eventType: 'press',
      location: 'standard'
    }), /runtime is created/u),
    assert.rejects(runtime.handleInputChunk({ data: 'x' }), /runtime is created/u),
    assert.rejects(runtime.flushInput(), /runtime is created/u)
  ]);
  assert.throws(() => runtime.resetInput(), /runtime is created/u);
  assert.throws(() => runtime.nextChange(), /runtime is created/u);

  await runtime.start();
  assert.equal(await runtime.dispatch(1), 1);
  await runtime.dispose();
});

test('TUI runtime validates disposal options before changing runtime state', async () => {
  const app = defineTui({
    id: 'dispose-validation',
    init: () => 0,
    update: (state, message) => ({ state: state + message }),
    view: (state) => text(String(state))
  });
  const runtime = createTuiRuntime({ app, host: createMemoryTerminalHost() });
  await runtime.start();

  await assert.rejects(runtime.dispose({ timeoutMs: -1 }), /non-negative finite number/u);
  assert.equal(await runtime.dispatch(1), 1);
  await runtime.dispose();
});

test('TUI runtime does not publish state frame or transcript when the first host commit fails', async () => {
  const transcript = createTranscriptRecorder({ id: 'failed-first-commit', source: 'tui' });
  const host = createMemoryTerminalHost();
  host.write = async () => {
    throw new Error('first frame write failed');
  };
  const app = defineTui({
    id: 'failed-first-commit',
    init: () => ({ ready: true }),
    update: (state) => ({ state }),
    view: () => text('ready', { id: 'failed-first-commit-view' })
  });
  const runtime = createTuiRuntime({ app, host, transcript });

  await assert.rejects(() => runtime.start(), /first frame write failed/u);
  assert.throws(() => runtime.state(), /does not have state/u);
  assert.equal(runtime.frame(), undefined);
  assert.equal(transcript.snapshot().steps.some((step) => step.kind === 'commit'), false);
  await runtime.dispose();
});

test('TUI runtime attempts synchronized-output cleanup after a failed frame write', async () => {
  const host = createMemoryTerminalHost({
    capabilities: { overrides: { synchronizedOutput: true } }
  });
  const writes = [];
  const write = host.write.bind(host);
  host.write = async (output) => {
    writes.push(output.text ?? '');
    if (writes.length === 1) throw new Error('synchronized frame write failed');
    return write(output);
  };
  const app = defineTui({
    id: 'failed-synchronized-frame',
    init: () => ({ ready: true }),
    update: (state) => ({ state }),
    view: () => text('ready', { id: 'failed-synchronized-frame-view' })
  });
  const runtime = createTuiRuntime({ app, host });

  await assert.rejects(() => runtime.start(), /synchronized frame write failed/u);
  assert.equal(writes[0]?.startsWith('\u001B[?2026h'), true);
  assert.equal(writes[1], '\u001B[?2026l');
  assert.equal(runtime.frame(), undefined);
  await runtime.dispose();
});

test('TUI runtime supports undefined as an initialized application state', async () => {
  const app = defineTui({
    id: 'undefined-state-tui',
    init: () => undefined,
    update: () => ({ state: undefined }),
    view: () => text('undefined is state')
  });
  const runtime = createTuiRuntime({ app, host: createMemoryTerminalHost() });

  await runtime.start();
  assert.equal(runtime.state(), undefined);
  await runtime.dispatch(undefined);
  assert.equal(runtime.state(), undefined);
});

test('runTui reserves restoration time after a hanging exit handler', async () => {
  let exitHandlerStarted = false;
  const app = defineTui({
    id: 'bounded-exit-cleanup-tui',
    init: () => ({ done: false }),
    update: () => ({ state: { done: true }, exit: {} }),
    view: () => textInput({
      id: 'bounded-exit-field',
      presentation: { value: '', cursor: 0 },
      onSubmit: () => ({ kind: 'exit' })
    }),
    onExit: () => {
      exitHandlerStarted = true;
      return new Promise(() => undefined);
    }
  });
  const host = createMemoryTerminalHost();
  host.input('\r');
  const running = runTui(app, host, { lifecycle: { defaultTimeoutMs: 5 } });
  await waitUntil(() => exitHandlerStarted);
  host.clock.advance(5);
  const exit = await running;

  assert.equal(exit.status, 'error');
  assert.deepEqual(exit.state, { done: true });
  assert.equal(exit.diagnostics.some((item) => item.code === 'TUI_CLEANUP_TIMEOUT'), true);
  assert.equal(host.restores()[0]?.status, 'restored');
  assert.equal(host.stdin.isRawModeEnabled(), false);
});

test('runTui bounds an input iterator whose return operation never settles', async () => {
  let returnStarted = false;
  const app = defineTui({
    id: 'bounded-input-retirement',
    init: () => ({ done: false }),
    update: () => ({ state: { done: true }, exit: {} }),
    view: () => textInput({
      id: 'bounded-input-retirement-field',
      presentation: { value: '', cursor: 0 },
      onSubmit: () => ({ kind: 'exit' })
    })
  });
  const host = createMemoryTerminalHost();
  const originalRead = host.stdin.read.bind(host.stdin);
  host.stdin.read = (options) => {
    const iterator = originalRead(options)[Symbol.asyncIterator]();
    return {
      [Symbol.asyncIterator]() {
        return {
          next: () => iterator.next(),
          return: () => {
            returnStarted = true;
            return new Promise(() => undefined);
          }
        };
      }
    };
  };
  host.input('\r');
  const running = runTui(app, host, { lifecycle: { defaultTimeoutMs: 5 } });
  await waitUntil(() => returnStarted);
  host.clock.advance(5);

  const exit = await running;

  assert.equal(exit.status, 'error');
  assert.equal(exit.diagnostics.some((item) => item.code === 'TUI_CLEANUP_TIMEOUT'
    && item.data?.phase === 'input'), true);
  assert.equal(host.restores()[0]?.status, 'restored');
});

test('runTui bounds restoration that ignores cancellation without recording success', async () => {
  let restoreAttempts = 0;
  const app = defineTui({
    id: 'bounded-restore',
    init: () => ({ done: false }),
    update: () => ({ state: { done: true }, exit: {} }),
    view: () => textInput({
      id: 'bounded-restore-field',
      presentation: { value: '', cursor: 0 },
      onSubmit: () => ({ kind: 'exit' })
    })
  });
  const host = createMemoryTerminalHost();
  const beginSession = host.beginSession.bind(host);
  host.beginSession = async (options) => {
    const session = await beginSession(options);
    session.restore = () => {
      restoreAttempts += 1;
      return new Promise(() => undefined);
    };
    return session;
  };
  host.input('\r');
  const running = runTui(app, host, { lifecycle: { defaultTimeoutMs: 5 } });
  await waitUntil(() => restoreAttempts === 1);
  host.clock.advance(5);
  await waitUntil(() => restoreAttempts === 2);
  host.clock.advance(5);

  const exit = await running;

  assert.equal(exit.status, 'error');
  assert.equal(exit.diagnostics.some((item) => item.code === 'TUI_CLEANUP_TIMEOUT'
    && item.data?.phase === 'restore'), true);
  assert.equal(host.restores().length, 0);
  assert.equal(host.stdin.isRawModeEnabled(), true);
});

test('runTui bounds an output flush that ignores cancellation', async () => {
  let flushStarted = false;
  const app = defineTui({
    id: 'bounded-flush',
    init: () => ({ done: false }),
    update: () => ({ state: { done: true }, exit: {} }),
    view: () => textInput({
      id: 'bounded-flush-field',
      presentation: { value: '', cursor: 0 },
      onSubmit: () => ({ kind: 'exit' })
    })
  });
  const host = createMemoryTerminalHost();
  host.flush = () => {
    flushStarted = true;
    return new Promise(() => undefined);
  };
  host.input('\r');
  const running = runTui(app, host, { lifecycle: { defaultTimeoutMs: 5 } });
  await waitUntil(() => flushStarted);
  host.clock.advance(5);

  const exit = await running;

  assert.equal(exit.status, 'error');
  assert.equal(exit.diagnostics.some((item) => item.code === 'TUI_CLEANUP_TIMEOUT'
    && item.data?.phase === 'flush'), true);
  assert.equal(host.restores()[0]?.status, 'restored');
  assert.equal(host.stdin.isRawModeEnabled(), false);
});

test('runTui restores after non-cooperative effect cleanup times out', async () => {
  let effectStarted = false;
  let exitHandlerStarted = false;
  const app = defineTui({
    id: 'bounded-effect-cleanup-tui',
    init: () => ({ running: false }),
    update: (state, message) => message.kind === 'start'
      ? {
          state: { running: true },
          effects: [{
            id: 'non-cooperative',
            concurrency: 'parallel',
            run: () => {
              effectStarted = true;
              return new Promise(() => undefined);
            }
          }]
        }
      : { state, exit: {} },
    view: (state) => textInput({
      id: 'bounded-effect-field',
      presentation: { value: '', cursor: 0 },
      onSubmit: () => ({ kind: state.running ? 'exit' : 'start' })
    }),
    onExit: () => {
      exitHandlerStarted = true;
    }
  });
  const host = createMemoryTerminalHost();
  host.input('\r\r');
  const running = runTui(app, host, { lifecycle: { defaultTimeoutMs: 5 } });
  await waitUntil(() => effectStarted);
  host.clock.advance(5);
  await waitUntil(() => exitHandlerStarted);
  const exit = await running;

  assert.equal(exit.status, 'error');
  assert.equal(exit.diagnostics.some((item) => item.code === 'TUI_CLEANUP_TIMEOUT'
    && item.data?.phase === 'runtime'), true);
  assert.equal(host.restores()[0]?.status, 'restored');
  assert.equal(host.stdin.isRawModeEnabled(), false);
});

test('runTui restores after non-cooperative source cleanup times out', async () => {
  let sourceStarted = false;
  let exitHandlerStarted = false;
  const app = defineTui({
    id: 'bounded-source-cleanup-tui',
    init: () => ({ done: false }),
    update: () => ({ state: { done: true }, exit: {} }),
    subscriptions: () => [{
      id: 'non-cooperative',
      generation: 0,
      delivery: 'sequential',
      async *messages() {
        sourceStarted = true;
        await new Promise(() => undefined);
      }
    }],
    view: () => textInput({
      id: 'bounded-source-field',
      presentation: { value: '', cursor: 0 },
      onSubmit: () => ({ kind: 'exit' })
    }),
    onExit: () => {
      exitHandlerStarted = true;
    }
  });
  const host = createMemoryTerminalHost();
  host.input('\r');
  const running = runTui(app, host, { lifecycle: { defaultTimeoutMs: 5 } });
  await waitUntil(() => sourceStarted);
  host.clock.advance(5);
  await waitUntil(() => exitHandlerStarted);
  const exit = await running;

  assert.equal(exit.status, 'error');
  assert.equal(exit.diagnostics.some((item) => item.code === 'TUI_CLEANUP_TIMEOUT'
    && item.data?.phase === 'runtime'), true);
  assert.equal(host.restores()[0]?.status, 'restored');
  assert.equal(host.stdin.isRawModeEnabled(), false);
});

test('runTui reports capability and session acquisition failures as typed exits', async () => {
  const app = defineTui({
    id: 'host-acquisition-failure',
    init: () => ({ ready: true }),
    update: (state) => ({ state }),
    view: () => text('ready')
  });
  const capabilityHost = createMemoryTerminalHost();
  capabilityHost.getCapabilities = async () => {
    throw new Error('capability lookup failed');
  };
  const sessionHost = createMemoryTerminalHost();
  sessionHost.beginSession = async () => {
    throw new Error('session creation failed');
  };

  const capabilityExit = await runTui(app, capabilityHost);
  const sessionExit = await runTui(app, sessionHost);

  for (const exit of [capabilityExit, sessionExit]) {
    assert.equal(exit.status, 'error');
    assert.equal(exit.diagnostics.some((item) => item.code === 'TUI_STARTUP_FAILED'), true);
  }
  assert.equal(capabilityHost.restores().length, 0);
  assert.equal(sessionHost.restores().length, 0);
});

test('runTui restores earlier and uncertain mutations after partial setup failure', async () => {
  const app = defineTui({
    id: 'partial-session-setup',
    init: () => ({ ready: true }),
    update: (state) => ({ state }),
    view: () => text('unreachable')
  });
  const host = createMemoryTerminalHost();
  const setRawMode = host.stdin.setRawMode.bind(host.stdin);
  host.stdin.setRawMode = (enabled) => {
    setRawMode(enabled);
    if (enabled) throw new Error('raw input failed after mutation');
  };

  const exit = await runTui(app, host);

  assert.equal(exit.status, 'error');
  assert.equal(exit.diagnostics.some((item) => item.code === 'HOST_OUTPUT_INDETERMINATE'
    && item.data?.operation === 'rawInput'), true);
  assert.equal(host.stdin.isRawModeEnabled(), false);
  assert.equal(host.restores().length, 1);
  assert.match(host.output(), /\u001B\[\?1049h/u);
  assert.match(host.output(), /\u001B\[\?1049l/u);
  assert.match(host.output(), /\u001B\[\?2004h/u);
  assert.match(host.output(), /\u001B\[\?2004l/u);
});

test('runTui bounds a hanging source disposer and reports restoration truthfully', async () => {
  let disposerStarted = false;
  const app = defineTui({
    id: 'bounded-source-disposer',
    init: () => ({ done: false }),
    update: () => ({ state: { done: true }, exit: {} }),
    subscriptions: () => [{
      id: 'hanging-disposer',
      generation: 0,
      delivery: 'sequential',
      async *messages(context) {
        await new Promise((resolve) => context.signal.addEventListener('abort', resolve, { once: true }));
      },
      dispose() {
        disposerStarted = true;
        return new Promise(() => undefined);
      }
    }],
    view: () => textInput({
      id: 'bounded-disposer-field',
      presentation: { value: '', cursor: 0 },
      onSubmit: () => ({ kind: 'exit' })
    })
  });
  const host = createMemoryTerminalHost();
  host.input('\r');
  const running = runTui(app, host, { lifecycle: { defaultTimeoutMs: 5 } });
  await waitUntil(() => disposerStarted);
  host.clock.advance(5);

  const exit = await running;

  assert.equal(exit.status, 'error');
  assert.equal(exit.diagnostics.some((item) => item.code === 'TUI_CLEANUP_TIMEOUT'
    && item.data?.phase === 'runtime'), true);
  assert.equal(host.restores()[0]?.status, 'restored');
  assert.equal(host.stdin.isRawModeEnabled(), false);
});

test('interrupts preempt a hanging dispatch and report unconfirmed restoration within the deadline', async () => {
  const app = defineTui({
    id: 'interrupt-hanging-dispatch',
    init: () => ({ count: 0 }),
    update: (state) => ({ state: { count: state.count + 1 } }),
    view: (state) => textInput({
      id: 'interrupt-hanging-field',
      presentation: { value: String(state.count), cursor: 0 },
      onSubmit: () => ({ kind: 'increment' })
    })
  });
  let committedFrames = 0;
  const host = createMemoryTerminalHost({
    observer: { recordFrame: () => { committedFrames += 1; } }
  });
  const running = runTui(app, host, { lifecycle: { defaultTimeoutMs: 5 } });
  await waitUntil(() => committedFrames === 1);
  let blockedCommitStarted = false;
  let blockNextWrite = true;
  const blockedCommit = deferred();
  const write = host.write.bind(host);
  host.write = async (output) => {
    if (blockNextWrite) {
      blockNextWrite = false;
      blockedCommitStarted = true;
      await blockedCommit.promise;
    }
    return write(output);
  };
  host.input('\r');
  await waitUntil(() => blockedCommitStarted);
  let cleanupTimerStarted = false;
  const sleep = host.clock.sleep.bind(host.clock);
  host.clock.sleep = (ms, signal) => {
    if (ms === 5) cleanupTimerStarted = true;
    return sleep(ms, signal);
  };
  host.signals.emit('SIGTERM');
  await waitUntil(() => cleanupTimerStarted);
  host.clock.advance(5);

  const exit = await running;

  assert.equal(exit.status, 'error');
  assert.equal(exit.diagnostics.some((item) => item.code === 'TUI_CLEANUP_TIMEOUT'
    && item.data?.phase === 'runtime'), true);
  assert.equal(host.restores()[0]?.status, 'restored');
  assert.equal(host.stdin.isRawModeEnabled(), false);
  const framesAfterExit = committedFrames;
  blockedCommit.release();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(committedFrames, framesAfterExit);
});

test('runTui rejects non-TTY hosts deterministically before opening fullscreen protocols', async () => {
  const app = defineTui({
    id: 'non-tty-tui',
    init: () => ({ ready: true }),
    update: (state) => ({ state }),
    view: () => text('ready')
  });
  const host = createMemoryTerminalHost({ isTty: false });

  const exit = await runTui(app, host);

  assert.equal(exit.status, 'error');
  assert.equal(exit.diagnostics[0]?.code, 'HOST_CAPABILITY_UNAVAILABLE');
  assert.equal(exit.snapshot.source, 'tui');
  assert.equal(exit.snapshot.root.id, 'non-tty-tui');
  assert.equal(host.output(), '');
  assert.equal(host.restores().length, 0);
  assert.equal(host.stdin.isRawModeEnabled(), false);
});

test('runTui consumes and disposes its terminal host', async () => {
  const app = defineTui({
    id: 'caller-owned-host-tui',
    init: () => ({ ready: true }),
    update: (state) => ({ state }),
    view: () => text('ready')
  });
  const memoryHost = createMemoryTerminalHost({ isTty: false });
  let disposeCalls = 0;
  const host = {
    ...memoryHost,
    dispose: async () => {
      disposeCalls += 1;
      await memoryHost.dispose();
    }
  };

  const exit = await runTui(app, host);

  assert.equal(exit.status, 'error');
  assert.equal(exit.diagnostics[0]?.code, 'HOST_CAPABILITY_UNAVAILABLE');
  assert.equal(disposeCalls, 1);
});

test('TUI runtime exposes diagnostics to app views', async () => {
  const appDiagnostic = diagnostic('HOST_PROTOCOL_UNSUPPORTED', 'Mouse reporting unavailable.', {
    severity: 'warning',
    data: {
      operation: 'mouseReporting',
      target: 'drag'
    }
  });
  const app = defineTui({
    id: 'diagnostic-view',
    init: () => ({ ready: true }),
    update: (state) => ({ state }),
    view: (_state, context) => {
      const item = context.diagnostics[0];
      return text(`${item?.code ?? 'none'}:${item?.data?.operation ?? 'none'}:${item?.data?.target ?? 'none'}`);
    }
  });
  const host = createMemoryTerminalHost({ terminalSize: { columns: 48, rows: 3 } });
  const runtime = createTuiRuntime({ app, host, diagnostics: [appDiagnostic] });

  const frame = await runtime.start();

  assert.match(renderFramePlain(frame), /HOST_PROTOCOL_UNSUPPORTED:mouseReporting:drag/u);
});

test('TUI runtime exposes diagnostics to subscription sources', async () => {
  const appDiagnostic = diagnostic('HOST_PROTOCOL_SKIPPED', 'Terminal protocol operation skipped.', {
    severity: 'info',
    data: {
      operation: 'mouseReporting',
      target: 'none'
    }
  });
  let observed;
  const app = defineTui({
    id: 'diagnostic-subscription',
    init: () => ({ label: 'pending' }),
    update: (_state, message) => ({ state: { label: message.label } }),
    subscriptions: () => [{
      id: 'diagnostic-source',
      generation: 0,
      delivery: 'sequential',
      async *messages(context) {
        observed = `${context.diagnostics[0]?.code ?? 'none'}:${context.diagnostics[0]?.data?.operation ?? 'none'}`;
        yield { label: observed };
      }
    }],
    view: (state) => text(state.label, { id: 'diagnostic-label' })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 48, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host, diagnostics: [appDiagnostic] });

  await runtime.start();
  await waitUntil(() => observed !== undefined);
  await waitUntil(() => renderFramePlain(runtime.frame()).includes('HOST_PROTOCOL_SKIPPED:mouseReporting'));

  assert.equal(observed, 'HOST_PROTOCOL_SKIPPED:mouseReporting');
  assert.match(renderFramePlain(runtime.frame()), /HOST_PROTOCOL_SKIPPED:mouseReporting/u);
});

test('runTui exposes setup diagnostics to app views', async () => {
  const app = defineTui({
    id: 'setup-diagnostic-view',
    init: () => ({ ready: true }),
    update: (state) => ({ state }),
    view: (_state, context) => {
      const item = context.diagnostics[0];
      return text(`${item?.code ?? 'none'}:${item?.data?.operation ?? 'none'}:${item?.data?.target ?? 'none'}`);
    }
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 52, rows: 3 } });
  const running = runTui(app, harness.host, {
    sessionPolicy: {
      alternateScreen: 'disabled',
      rawInput: 'disabled',
      bracketedPaste: 'disabled',
      focusReporting: 'disabled',
      keyboard: { profile: { kind: 'legacy' }, requirement: 'disabled' },
      cursorVisibility: { state: 'hide', requirement: 'disabled' },
      mouseReporting: { mode: 'none', requirement: 'disabled' }
    }
  });

  await waitUntil(() => harness.frames().length === 1);
  assert.match(renderFramePlain(harness.frames()[0]), /HOST_PROTOCOL_SKIPPED:alternateScreen:true/u);

  harness.host.endInput();
  const exit = await running;

  assert.equal(exit.status, 'completed');
  assert.equal(exit.diagnostics.some((item) => item.code === 'HOST_PROTOCOL_SKIPPED'), true);
});

test('runTui decodes legacy input when optional Kitty setup was not applied', async () => {
  const app = defineTui({
    id: 'skipped-kitty-decoding',
    init: () => ({ decodedAsKitty: false }),
    inputBindings: [{
      id: 'kitty-a',
      triggers: [{ kind: 'key', key: 'a' }],
      message: { decodedAsKitty: true }
    }],
    update: (_state, message) => ({ state: message }),
    view: (state) => text(state.decodedAsKitty ? 'kitty' : 'legacy')
  });
  const harness = createTerminalHarness({
    terminalSize: { columns: 20, rows: 3 },
    capabilities: { probes: { keyboardProtocol: 'supported' } }
  });
  const write = harness.host.write.bind(harness.host);
  harness.host.write = async (output) => {
    if (output.text === '\u001B[>1u') throw new Error('keyboard setup unavailable');
    return write(output);
  };
  harness.host.input('\u001B[97u');
  harness.host.endInput();

  const exit = await runTui(app, harness.host, {
    sessionPolicy: {
      alternateScreen: 'disabled',
      rawInput: 'disabled',
      bracketedPaste: 'disabled',
      focusReporting: 'disabled',
      keyboard: { profile: kittyKeyboardProfile(1), requirement: 'optional' },
      cursorVisibility: { state: 'unchanged', requirement: 'disabled' },
      mouseReporting: { mode: 'none', requirement: 'disabled' }
    }
  });

  assert.equal(exit.status, 'completed');
  assert.deepEqual(exit.state, { decodedAsKitty: false });
  assert.equal(exit.diagnostics.some((item) => item.data?.operation === 'keyboardProfile'), true);
});

test('runTui restores terminal protocols on successful exit', async () => {
  const app = defineTui({
    id: 'restored-success',
    init: () => ({ ready: true }),
    update: (state) => ({ state }),
    view: () => textInput({ id: 'field', presentation: { value: 'ready', cursor: 0 } })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 16, rows: 3 } });
  harness.host.endInput();
  const exit = await runTui(app, harness.host);
  const result = { transcript: harness.transcript.snapshot(), output: harness.output(), snapshot: harness.snapshot() };

  assert.equal(exit.status, 'completed');
  assert.equal(harness.host.stdin.isRawModeEnabled(), false);
  assert.equal(harness.restores()[0]?.status, 'restored');
  assert.equal(harness.restores()[0]?.resultingState.rawInput, false);
  assert.equal(harness.restores()[0]?.resultingState.alternateScreen, false);
  assert.equal(harness.restores()[0]?.resultingState.cursorVisible, true);
  assert.match(harness.output(), /\u001B\[\?1049h/);
  assert.match(harness.output(), /\u001B\[\?1049l/);
  assert.match(harness.output(), /\u001B\[\?2004h/);
  assert.match(harness.output(), /\u001B\[\?2004l/);
  assert.match(harness.output(), /\u001B\[\?1006h\u001B\[\?1002h/);
  assert.match(harness.output(), /\u001B\[\?1003l\u001B\[\?1002l\u001B\[\?1000l\u001B\[\?1006l/);
  assert.match(harness.output(), /\u001B\[\?1004h/);
  assert.match(harness.output(), /\u001B\[\?1004l/);
  assert.match(harness.output(), /\u001B\[\?25l/);
  assert.match(harness.output(), /\u001B\[\?25h/);
  assertTerminalRestored(result);
  await runInteractionScript(harness, {
    id: 'restore-assertion',
    steps: [{ kind: 'assertRestore' }]
  });
});

test('runTui processes host input chunks until the app exits', async () => {
  const app = defineTui({
    id: 'run-loop-update',
    init: () => ({ submitted: false }),
    update: (_state, message) => ({ state: { submitted: message.submitted }, exit: {} }),
    view: (state) => textInput({
      id: 'submit-field',
      presentation: { value: state.submitted ? 'submitted' : 'waiting', cursor: 0 },
      onSubmit: () => ({ submitted: true })
    })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 20, rows: 3 } });
  harness.host.input('\r');
  const exit = await runTui(app, harness.host);

  assert.equal(exit.status, 'completed');
  assert.deepEqual(exit.state, { submitted: true });
  assert.equal(harness.frames().length, 2);
  assert.equal(harness.frames()[0].schemaVersion, 'terminal-ui.tui-frame.v2');
  assert.equal(harness.diffs()[0].schemaVersion, 'terminal-ui.render-diff.v3');
  assert.equal(harness.diffs()[0].fullRewrite, true);
  assert.equal(harness.diffs()[1].fullRewrite, false);
  assert.match(renderFramePlain(harness.frames()[1]), /submitted/);
  assert.equal(harness.restores().length, 1);
  assert.equal(harness.host.stdin.isRawModeEnabled(), false);
});

test('TUI effects can suspend the terminal for an external operation and resume with a full frame', async () => {
  const harness = createTerminalHarness({ terminalSize: { columns: 20, rows: 3 } });
  let rawModeDuringOperation;
  const app = defineTui({
    id: 'terminal-suspension',
    init: () => ({ phase: 'idle' }),
    update: (state, message) => {
      if (message.kind === 'start') {
        return {
          state: { phase: 'suspending' },
          effects: [{
            id: 'external-operation',
            concurrency: 'keep-first',
            async run(context) {
              await context.withTerminalSuspended(async () => {
                rawModeDuringOperation = harness.host.stdin.isRawModeEnabled();
                await harness.resize({ columns: 24, rows: 4 });
              });
              return { kind: 'message', message: { kind: 'done' } };
            }
          }]
        };
      }
      return { state: { phase: 'done' }, exit: { reason: 'done' } };
    },
    view: (state) => textInput({
      id: 'suspension-input',
      presentation: { value: state.phase, cursor: 0 },
      onSubmit: () => ({ kind: 'start' })
    })
  });

  const running = runTui(app, harness.host);
  await waitUntil(() => harness.frames().length > 0);
  await harness.input('\r');
  const exit = await running;

  assert.equal(exit.status, 'completed');
  assert.equal(rawModeDuringOperation, false);
  assert.equal(harness.restores().length, 2);
  assert.equal(harness.frames().at(-1)?.width, 24);
  assert.ok(harness.frames().length >= 3);
});

test('runTui preserves sanitized completed exit reasons', async () => {
  const app = defineTui({
    id: 'exit-reason',
    init: () => ({ submitted: false }),
    update: (_state, message) => ({
      state: { submitted: message.submitted },
      exit: { reason: 'Submitted \u001B[31mnow\u001B[0m' }
    }),
    view: (state) => textInput({
      id: 'reason-field',
      presentation: { value: state.submitted ? 'submitted' : 'waiting', cursor: 0 },
      onSubmit: () => ({ submitted: true })
    })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 20, rows: 3 } });
  harness.host.input('\r');
  const exit = await runTui(app, harness.host);

  assert.equal(exit.status, 'completed');
  assert.equal(exit.reason, 'Submitted now');
  assert.deepEqual(exit.state, { submitted: true });
  assert.equal(harness.restores().length, 1);
});

test('runTui lets apps own escape and ctrlC key bindings', async () => {
  const app = defineTui({
    id: 'run-loop-key-exit',
    init: () => ({ active: 'ready' }),
    update: (_state, message) => ({ state: { active: message.active }, exit: {} }),
    view: (state) => textInput({
      id: 'exit-field',
      presentation: { value: state.active, cursor: 0 },
      keys: {
        escape: () => ({ active: 'escape' }),
        triggers: [{
          trigger: { kind: 'key', key: 'c', modifiers: { ctrl: true } },
          onKey: () => ({ active: 'ctrlC' })
        }]
      }
    })
  });
  const escapeHarness = createTerminalHarness({ terminalSize: { columns: 20, rows: 3 } });
  const escapeRunning = runTui(app, escapeHarness.host, { input: { escapeDelayMs: 1 } });
  await waitUntil(() => escapeHarness.frames().length === 1);
  escapeHarness.host.input('\u001B');
  await flushAsync();
  escapeHarness.host.clock.advance(1);
  const escape = await escapeRunning;

  const ctrlCHarness = createTerminalHarness({ terminalSize: { columns: 20, rows: 3 } });
  ctrlCHarness.host.input('\u0003');
  const ctrlC = await runTui(app, ctrlCHarness.host);

  assert.equal(escape.status, 'completed');
  assert.equal(ctrlC.status, 'completed');
  assert.deepEqual(escape.state, { active: 'escape' });
  assert.deepEqual(ctrlC.state, { active: 'ctrlC' });
  assert.equal(escapeHarness.restores().length, 1);
  assert.equal(ctrlCHarness.restores().length, 1);
  assert.equal(escapeHarness.host.stdin.isRawModeEnabled(), false);
  assert.equal(ctrlCHarness.host.stdin.isRawModeEnabled(), false);
});

test('runTui re-renders when the host emits resize signals', async () => {
  const app = defineTui({
    id: 'run-loop-resize',
    init: () => ({ done: false }),
    update: (_state, message) => ({ state: { done: message.done }, exit: {} }),
    view: (_state, context) => textInput({
      id: 'resize-field',
      presentation: { value: `columns:${context.terminalSize.columns}`, cursor: 0 },
      onSubmit: () => ({ done: true })
    })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 20, rows: 3 } });
  const running = runTui(app, harness.host);

  await waitUntil(() => harness.frames().length === 1);
  harness.host.terminalSizeControl?.setTerminalSize({ columns: 12, rows: 3 });
  harness.host.signals.emit('resize');
  await waitUntil(() => harness.frames().length === 2);
  harness.host.input('\r');
  const exit = await running;

  assert.equal(exit.status, 'completed');
  assert.equal(harness.frames()[1].width, 12);
  assert.equal(harness.diffs()[1].fullRewrite, true);
  assert.match(renderFramePlain(harness.frames()[1]), /columns:12/);
  assert.equal(harness.frames()[1].accessibility.root.value, 'columns:12');
  assert.equal(harness.restores().length, 1);
});

test('runTui coalesces resize storms to one active and one latest commit', async () => {
  const app = defineTui({
    id: 'run-loop-resize-storm',
    init: () => ({ done: false }),
    update: (_state, message) => ({ state: { done: message.done }, exit: message.done ? {} : undefined }),
    view: (_state, context) => textInput({
      id: 'resize-storm-field',
      presentation: { value: `columns:${context.terminalSize.columns}`, cursor: 0 },
      onSubmit: () => ({ done: true })
    })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 20, rows: 3 } });
  const getTerminalSize = harness.host.getTerminalSize.bind(harness.host);
  let viewportReads = 0;
  harness.host.getTerminalSize = () => {
    viewportReads += 1;
    return getTerminalSize();
  };
  const signalSubscribed = deferred();
  const originalSubscribe = harness.host.signals.subscribe.bind(harness.host.signals);
  harness.host.signals.subscribe = (listener) => {
    const unsubscribe = originalSubscribe(listener);
    signalSubscribed.release();
    return unsubscribe;
  };
  const originalWrite = harness.host.write;
  const resizeStarted = deferred();
  const releaseResize = deferred();
  let blocked = false;
  harness.host.write = async (output) => {
    if (!blocked && harness.host.getTerminalSize().columns === 21) {
      blocked = true;
      resizeStarted.release();
      await releaseResize.promise;
    }
    return originalWrite(output);
  };
  const running = runTui(app, harness.host);

  await Promise.all([
    waitUntil(() => harness.frames().length === 1),
    signalSubscribed.promise
  ]);
  const initialViewportReads = viewportReads;
  await harness.host.terminalSizeControl?.setTerminalSize({ columns: 21, rows: 3 });
  harness.host.signals.emit('resize');
  await resizeStarted.promise;
  for (let columns = 22; columns <= 64; columns += 1) {
    await harness.host.terminalSizeControl?.setTerminalSize({ columns, rows: 3 });
    harness.host.signals.emit('resize');
  }
  releaseResize.release();
  await waitUntil(() => harness.frames().at(-1)?.width === 64);
  const resizeFrameWidths = harness.frames().map((frame) => frame.width);
  harness.host.input('\r');
  const exit = await running;

  assert.equal(exit.status, 'completed');
  assert.deepEqual(resizeFrameWidths, [20, 21, 64]);
  assert.equal(viewportReads - initialViewportReads, 6);
  assert.equal(harness.restores().length, 1);
});

test('runTui exits and restores when the host emits interruption signals', async () => {
  const app = defineTui({
    id: 'run-loop-signal',
    init: () => ({ ready: true }),
    update: (state) => ({ state }),
    view: () => textInput({ id: 'signal-field', presentation: { value: 'ready', cursor: 0 } })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 20, rows: 3 } });
  const running = runTui(app, harness.host);

  await waitUntil(() => harness.frames().length === 1);
  harness.host.signals.emit('SIGTERM');
  const exit = await running;

  assert.equal(exit.status, 'interrupted');
  assert.equal(harness.restores().length, 1);
  assert.equal(harness.host.stdin.isRawModeEnabled(), false);
});

test('runTui restores terminal protocols after initialization failure', async () => {
  const app = defineTui({
    id: 'restored-error',
    init: () => {
      throw new Error('boom');
    },
    update: (state) => ({ state }),
    view: () => textInput({ id: 'field', presentation: { value: 'unused', cursor: 0 } })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 16, rows: 3 } });
  const exit = await runTui(app, harness.host);

  assert.equal(exit.status, 'error');
  assert.equal(exit.diagnostics.some((item) => item.code === 'TUI_STARTUP_FAILED'), true);
  assert.equal(harness.host.stdin.isRawModeEnabled(), false);
  assert.equal(harness.restores().length, 1);
  assert.match(harness.output(), /\u001B\[\?1049h/);
  assert.match(harness.output(), /\u001B\[\?1049l/);
});


test('TUI runtime rejects operations after disposal and keeps disposal idempotent', async () => {
  const app = defineTui({
    id: 'disposed-runtime',
    init: () => ({ count: 0 }),
    update: (state, message) => ({ state: { count: state.count + message.delta } }),
    view: (state) => text(String(state.count), { id: 'disposed-count' })
  });
  const host = createMemoryTerminalHost();
  const runtime = createTuiRuntime({ app, host });
  await runtime.start();

  const firstDisposal = runtime.dispose();
  assert.equal(runtime.dispose(), firstDisposal);
  await firstDisposal;

  await assert.rejects(runtime.start(), /runtime is disposed/u);
  await assert.rejects(runtime.dispatch({ delta: 1 }), /runtime is disposed/u);
  await assert.rejects(runtime.resize({ columns: 30, rows: 6 }), /runtime is disposed/u);
  await assert.rejects(runtime.handleInput({ kind: 'key', key: 'enter', modifiers: { ctrl: false, alt: false, shift: false, meta: false }, eventType: 'press', location: 'standard' }), /runtime is disposed/u);
  await assert.rejects(runtime.handleInputChunk({ data: 'x' }), /runtime is disposed/u);
  await assert.rejects(runtime.flushInput(), /runtime is disposed/u);
  assert.throws(() => runtime.resetInput(), /runtime is disposed/u);
  assert.throws(() => runtime.nextChange(), /runtime is disposed/u);
});

test('TUI runtime disposal awaits aborted subscription pumps and source cleanup', async () => {
  let releasePump;
  const pumpCleanup = new Promise((resolve) => { releasePump = resolve; });
  let pumpAborted = false;
  let sourceDisposed = false;
  const app = defineTui({
    id: 'subscription-disposal-barrier',
    init: () => ({ ready: true }),
    update: (state) => ({ state }),
    subscriptions: () => [{
      id: 'blocking-source',
      generation: 0,
      delivery: 'sequential',
      async *messages(context) {
        await new Promise((resolve) => context.signal.addEventListener('abort', resolve, { once: true }));
        pumpAborted = true;
        await pumpCleanup;
      },
      dispose() {
        sourceDisposed = true;
      }
    }],
    view: () => text('ready')
  });
  const runtime = createTuiRuntime({ app, host: createMemoryTerminalHost() });
  await runtime.start();

  let disposed = false;
  const disposal = runtime.dispose().then(() => { disposed = true; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(pumpAborted, true);
  assert.equal(sourceDisposed, true);
  assert.equal(disposed, false);

  releasePump();
  await disposal;
  assert.equal(disposed, true);
});

test('TUI runtime disposal remains bounded when the cleanup clock rejects', async () => {
  let sourceStarted = false;
  const app = defineTui({
    id: 'runtime-disposal-clock-failure',
    init: () => ({ ready: true }),
    update: (state) => ({ state }),
    subscriptions: () => [{
      id: 'non-cooperative-clock-source',
      generation: 0,
      delivery: 'sequential',
      async *messages() {
        sourceStarted = true;
        await new Promise(() => undefined);
      }
    }],
    view: () => text('ready')
  });
  const host = createMemoryTerminalHost();
  const runtime = createTuiRuntime({ app, host });
  await runtime.start();
  await waitUntil(() => sourceStarted);
  host.clock.sleep = () => Promise.reject(new Error('runtime cleanup clock failed'));

  await assert.rejects(
    Promise.race([
      runtime.dispose({ timeoutMs: 5 }),
      new Promise((_resolve, reject) => setTimeout(() => reject(new Error('runtime disposal remained pending')), 100))
    ]),
    (error) => error instanceof Error
      && error.message === 'TUI runtime disposal clock failed.'
      && error.cause instanceof Error
      && error.cause.message === 'runtime cleanup clock failed'
  );
});

test('TUI runtime disposal preserves its timeout when a caller signal is supplied', async () => {
  let sourceStarted = false;
  const app = defineTui({
    id: 'runtime-disposal-signal-and-timeout',
    init: () => ({ ready: true }),
    update: (state) => ({ state }),
    subscriptions: () => [{
      id: 'non-cooperative-signal-and-timeout-source',
      generation: 0,
      delivery: 'sequential',
      async *messages() {
        sourceStarted = true;
        await new Promise(() => undefined);
      }
    }],
    view: () => text('ready')
  });
  const host = createMemoryTerminalHost();
  const runtime = createTuiRuntime({ app, host });
  await runtime.start();
  await waitUntil(() => sourceStarted);
  let requestedTimeout;
  host.clock.sleep = async (timeoutMs) => {
    requestedTimeout = timeoutMs;
  };
  const caller = new globalThis.AbortController();

  await assert.rejects(
    runtime.dispose({ signal: caller.signal, timeoutMs: 7 }),
    /TUI runtime disposal timed out/u
  );
  assert.equal(requestedTimeout, 7);
  assert.equal(caller.signal.aborted, false);
});

test('pre-aborted TUI runtime disposal still observes later cleanup failures', async () => {
  const releaseCleanup = deferred();
  let sourceStarted = false;
  const app = defineTui({
    id: 'pre-aborted-disposal-cleanup',
    init: () => ({ ready: true }),
    update: (state) => ({ state }),
    subscriptions: () => [{
      id: 'late-cleanup-failure',
      generation: 0,
      delivery: 'sequential',
      async *messages(context) {
        sourceStarted = true;
        await new Promise((resolve) => context.signal.addEventListener('abort', resolve, { once: true }));
      },
      async dispose() {
        await releaseCleanup.promise;
        throw new Error('late source cleanup failed');
      }
    }],
    view: () => text('ready')
  });
  const runtime = createTuiRuntime({ app, host: createMemoryTerminalHost() });
  await runtime.start();
  await waitUntil(() => sourceStarted);
  const controller = new globalThis.AbortController();
  controller.abort(new Error('caller already cancelled'));
  const unhandled = [];
  const recordUnhandled = (reason) => { unhandled.push(reason); };
  process.on('unhandledRejection', recordUnhandled);
  try {
    await assert.rejects(
      runtime.dispose({ signal: controller.signal }),
      (error) => error instanceof Error
        && error.message === 'TUI runtime disposal was cancelled.'
        && error.cause instanceof Error
        && error.cause.message === 'caller already cancelled'
    );
    releaseCleanup.release();
    await flushAsync();
    await flushAsync();
    assert.deepEqual(unhandled, []);
  } finally {
    process.off('unhandledRejection', recordUnhandled);
  }
});

test('runTui restores terminal state after runtime and exit-handler cleanup failures', async () => {
  const app = defineTui({
    id: 'cleanup-failure-restore',
    init: () => ({ done: false }),
    update: () => ({ state: { done: true }, exit: { reason: 'done' } }),
    subscriptions: () => [{
      id: 'cleanup-failure-source',
      generation: 0,
      delivery: 'sequential',
      async *messages() {},
      dispose() {
        throw new Error('source cleanup failed');
      }
    }],
    onExit() {
      throw new Error('exit cleanup failed');
    },
    view: () => textInput({ id: 'cleanup-submit', presentation: { value: '', cursor: 0 }, onSubmit: () => ({ kind: 'submit' }) })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 20, rows: 4 } });
  harness.input('\r');

  const exit = await runTui(app, harness.host);

  assert.equal(exit.status, 'error');
  assert.deepEqual(exit.state, { done: true });
  assert.equal(exit.diagnostics.filter((item) => item.code === 'TUI_CLEANUP_FAILED').length, 2);
  assert.equal(harness.restores().length, 1);
  assert.equal(harness.host.stdin.isRawModeEnabled(), false);
});


function deferred() {
  let release;
  const promise = new Promise((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

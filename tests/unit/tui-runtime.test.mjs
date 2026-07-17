import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createTuiRuntime,
  defineTui,
  runTui
} from '../../dist/tui/index.js';
import {
  createScrollState,
  applyScrollEvent,
  pointerPresentationReducer,
  treeScrollablePresentation,
  treeReducer
} from '../../dist/behavior/index.js';
import {
  diagnostic } from '../../dist/diagnostics.js';
import { createMemoryTerminalHost } from '../../dist/host/index.js';
import { ignoreMessage } from '../../dist/interaction/index.js';
import { kittyKeyboardProfile } from '../../dist/protocol/index.js';
import { validateAccessibleSnapshot } from '../../dist/accessibility/index.js';
import {
  assertTerminalRestored,
  createTerminalHarness,
  runInteractionScript
} from '../../dist/testing/index.js';
import { createTranscriptRecorder,
  validateTranscript } from '../../dist/transcript/index.js';
import {
  diffFrames,
  renderDiffAnsi,
  renderFrameDebug,
  renderFramePlain,
  renderElementFrame
} from '../../dist/renderer/index.js';
import {
  button,
  contextMenu,
  dialog,
  dropdownMenu,
  textInput,
  list,
  notificationStack,
  progressBar,
  richText,
  spinner,
  statusBar,
  table,
  tabs,
  text,
  textArea,
  tree
} from '../../dist/components/index.js';
import { custom } from '../../dist/renderer/index.js';
import {
  overlay,
  row,
  column,
  surface,
  viewport
} from '../../dist/layout/index.js';
import { flushAsync, waitUntil } from '../helpers/async.mjs';

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
  const host = createMemoryTerminalHost({ viewport: { columns: 20, rows: 3 } });
  host.input('\r');
  const exit = await runTui(app, host);

  assert.equal(exit.status, 'completed');
  assert.equal(exit.transcript?.source, 'tui');
  assert.equal(exit.transcript?.id, 'transcript-tui-transcript');
  assert.equal(validateTranscript(exit.transcript).ok, true);
  assert.equal(exit.transcript?.steps.filter((step) => step.kind === 'input').length, 1);
  assert.ok(exit.transcript?.steps.some((step) => step.kind === 'frame'));
  assert.ok(exit.transcript?.steps.some((step) => step.kind === 'diff'));
  assert.ok(exit.transcript?.steps.some((step) => step.kind === 'restore'));
  assert.ok(exit.transcript?.steps.some((step) => step.kind === 'snapshot'));
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
  assert.equal(transcript.snapshot().steps.some((step) => step.kind === 'frame'), false);
  await runtime.dispose();
});

test('TUI runtime attempts synchronized-output cleanup after a failed frame write', async () => {
  const host = createMemoryTerminalHost({
    capabilities: { overrides: { synchronizedOutput: true } }
  });
  const writes = [];
  host.write = async (output) => {
    writes.push(output.text ?? '');
    if (writes.length === 1) throw new Error('synchronized frame write failed');
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

test('runTui restores the terminal after a bounded hanging exit handler', async () => {
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
  const running = runTui(app, host, { cleanup: { gracePeriodMs: 5 } });
  await waitUntil(() => exitHandlerStarted);
  host.clock.advance(5);
  const exit = await running;

  assert.equal(exit.status, 'error');
  assert.deepEqual(exit.state, { done: true });
  assert.equal(exit.diagnostics.some((item) => item.code === 'TUI_CLEANUP_TIMEOUT'), true);
  assert.equal(host.restores().length, 1);
  assert.equal(host.stdin.isRawModeEnabled(), false);
});

test('runTui restores the terminal after bounded non-cooperative effect cleanup', async () => {
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
  const running = runTui(app, host, { cleanup: { gracePeriodMs: 5 } });
  await waitUntil(() => effectStarted);
  host.clock.advance(5);
  await waitUntil(() => exitHandlerStarted);
  const exit = await running;

  assert.equal(exit.status, 'error');
  assert.equal(exit.diagnostics.some((item) => item.code === 'TUI_CLEANUP_TIMEOUT'
    && item.data?.phase === 'runtime'), true);
  assert.equal(host.restores().length, 1);
  assert.equal(host.stdin.isRawModeEnabled(), false);
});

test('runTui restores the terminal after bounded non-cooperative source cleanup', async () => {
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
  const running = runTui(app, host, { cleanup: { gracePeriodMs: 5 } });
  await waitUntil(() => sourceStarted);
  host.clock.advance(5);
  await waitUntil(() => exitHandlerStarted);
  const exit = await running;

  assert.equal(exit.status, 'error');
  assert.equal(exit.diagnostics.some((item) => item.code === 'TUI_CLEANUP_TIMEOUT'
    && item.data?.phase === 'runtime'), true);
  assert.equal(host.restores().length, 1);
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
    assert.equal(exit.diagnostics.some((item) => item.code === 'TUI_RUN_FAILED'), true);
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
  assert.equal(exit.diagnostics.some((item) => item.code === 'HOST_PROTOCOL_UNSUPPORTED'
    && item.data?.operation === 'rawInput'), true);
  assert.equal(host.stdin.isRawModeEnabled(), false);
  assert.equal(host.restores().length, 1);
  assert.match(host.output(), /\u001B\[\?1049h/u);
  assert.match(host.output(), /\u001B\[\?1049l/u);
  assert.match(host.output(), /\u001B\[\?2004h/u);
  assert.match(host.output(), /\u001B\[\?2004l/u);
});

test('runTui bounds a hanging source disposer before restoring protocols', async () => {
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
  const running = runTui(app, host, { cleanup: { gracePeriodMs: 5 } });
  await waitUntil(() => disposerStarted);
  host.clock.advance(5);

  const exit = await running;

  assert.equal(exit.status, 'error');
  assert.equal(exit.diagnostics.some((item) => item.code === 'TUI_CLEANUP_TIMEOUT'
    && item.data?.phase === 'runtime'), true);
  assert.equal(host.restores().length, 1);
  assert.equal(host.stdin.isRawModeEnabled(), false);
});

test('interrupts preempt a hanging dispatch commit and restore within the cleanup bound', async () => {
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
  const running = runTui(app, host, { cleanup: { gracePeriodMs: 5 } });
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
      return;
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
  assert.equal(host.restores().length, 1);
  assert.equal(host.stdin.isRawModeEnabled(), false);
  const framesAfterExit = committedFrames;
  blockedCommit.release();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(committedFrames, framesAfterExit);
});

test('TUI tabs expose clickable tab hit targets', async () => {
  const app = defineTui({
    id: 'tabs-click-tui',
    init: () => ({ selected: 'left' }),
    update: (_state, message) => ({ state: { selected: message.selected } }),
    view: (state) => tabs({
      id: 'click-tabs',
      selected: state.selected,
      tabs: [
        { id: 'left', label: 'Left', panel: text('left panel') },
        { id: 'right', label: 'Right', panel: text('right panel') }
      ],
      onAction: (action) => action.kind === 'select' ? { selected: action.id } : { selected: state.selected }
    })
  });
  const host = createMemoryTerminalHost({ viewport: { columns: 32, rows: 4 } });
  const runtime = createTuiRuntime({ app, host });
  const frame = await runtime.start();
  const target = frame.hitTargets?.find((item) => item.id === 'click-tabs:tab:right');
  assert.notEqual(target, undefined);

  await runtime.handleInputChunk({ data: `\u001B[<0;${String(target.bounds.column)};${String(target.bounds.row)}M` });
  await runtime.handleInputChunk({ data: `\u001B[<0;${String(target.bounds.column)};${String(target.bounds.row)}m` });

  assert.equal(runtime.state()?.selected, 'right');
});

test('TUI pointer presses focus the declared target before application actions', async () => {
  const app = defineTui({
    id: 'pointer-focus-tui',
    init: () => ({ pointerActions: 0 }),
    update: (state, message) => message.kind === 'pointer'
      ? { state: { ...state, pointerActions: state.pointerActions + 1 } }
      : { state },
    view: (state) => row([
      textInput({
        id: 'first-field',
        presentation: { value: `first ${String(state.pointerActions)}`, cursor: 0 },
        onAction: () => ({ kind: 'pointer' })
      }),
      textInput({
        id: 'second-field',
        presentation: { value: 'second', cursor: 0 },
        onAction: () => ({ kind: 'pointer' })
      })
    ], { id: 'pointer-focus-fields', sizes: [{ kind: 'fill' }, { kind: 'fill' }] })
  });
  const host = createMemoryTerminalHost({ viewport: { columns: 30, rows: 2 } });
  const runtime = createTuiRuntime({ app, host });
  const first = await runtime.start();
  const secondTarget = first.hitTargets?.find((target) => target.focus?.kind === 'focus'
    && target.focus.path.includes('second-field')
    && target.accepts?.includes('pointerDown') === true);

  assert.deepEqual(first.focusPath, ['pointer-focus-fields', 'first-field']);
  assert.notEqual(secondTarget, undefined);
  assert.deepEqual(secondTarget.focus, { kind: 'focus', path: ['pointer-focus-fields', 'second-field'] });

  const result = await runtime.handleInput({
    kind: 'mouse',
    sequence: '',
    encoding: 'sgr',
    action: 'press',
    button: 'left',
    row: secondTarget.bounds.row,
    column: secondTarget.bounds.column,
    rawCode: 0,
    modifiers: { shift: false, alt: false, ctrl: false }
  });

  assert.equal(result.handled, true);
  assert.equal(runtime.state()?.pointerActions, 1);
  assert.deepEqual(result.frame.focusPath, ['pointer-focus-fields', 'second-field']);
});

test('TUI wheel input preserves the current focus path', async () => {
  const app = defineTui({
    id: 'wheel-preserves-focus-tui',
    init: () => ({ scrolls: 0 }),
    update: (state) => ({ state: { scrolls: state.scrolls + 1 } }),
    view: () => textArea({
      id: 'wheel-field',
      presentation: { value: 'one\ntwo\nthree\nfour', cursor: 0, scroll: createScrollState({ contentRows: 4, viewportRows: 2 }) },
      onAction: () => ({ kind: 'scroll' })
    })
  });
  const host = createMemoryTerminalHost({ viewport: { columns: 20, rows: 2 } });
  const runtime = createTuiRuntime({ app, host });
  const frame = await runtime.start();
  const target = frame.hitTargets?.find((item) => item.accepts?.includes('scroll') === true);

  assert.notEqual(target, undefined);
  await runtime.handleInput({
    kind: 'mouse',
    sequence: '',
    encoding: 'sgr',
    action: 'wheel',
    button: 'wheelDown',
    deltaRows: 1,
    deltaColumns: 0,
    row: target.bounds.row,
    column: target.bounds.column,
    rawCode: 65,
    modifiers: { shift: false, alt: false, ctrl: false }
  });

  assert.deepEqual(runtime.frame()?.focusPath, frame.focusPath);
});

test('TUI runtime routes mouse input through the committed render cache', async () => {
  let viewCalls = 0;
  const app = defineTui({
    id: 'cached-routing-tui',
    init: () => ({ count: 0 }),
    update: (state) => ({ state: { count: state.count + 1 } }),
    view: (state) => {
      viewCalls += 1;
      return button({ id: 'cached-button', label: `Count ${state.count}`, onPress: () => ({ kind: 'click' }) });
    }
  });
  const host = createMemoryTerminalHost({ viewport: { columns: 24, rows: 3 } });
  const runtime = createTuiRuntime({ app, host });
  const frame = await runtime.start();
  const target = frame.hitTargets?.find((item) => item.id.startsWith('cached-button'));

  assert.equal(viewCalls, 1);
  assert.notEqual(target, undefined);
  await runtime.handleInputChunk({ data: `\u001B[<0;${String(target.bounds.column)};${String(target.bounds.row)}M` });
  assert.equal(runtime.state()?.count, 0);
  assert.equal(viewCalls, 1);
  await runtime.handleInputChunk({ data: `\u001B[<0;${String(target.bounds.column)};${String(target.bounds.row)}m` });

  assert.equal(runtime.state()?.count, 1);
  assert.equal(viewCalls, 2);
});

test('TUI runtime uses committed hit targets without recomputing renderer hit targets', async () => {
  let hitTargetCalls = 0;
  const renderer = {
    render({ bounds, buffer }) {
      buffer.write(bounds.row, bounds.column, [{ text: 'cached hit' }]);
    },
    accessibility({ id }) {
      return { id, role: 'button', label: 'cached hit' };
    },
    hitTargets({ bounds }) {
      hitTargetCalls += 1;
      return [{ id: 'cached-region-hit:press', bounds, message: () => ({ clicked: true }), cursor: 'pointer' }];
    }
  };
  const app = defineTui({
    id: 'committed-hit-target-routing-tui',
    init: () => ({ clicked: false }),
    update: (_state, message) => ({ state: { clicked: message.clicked } }),
    view: () => custom({
      id: 'cached-region-hit',
      renderer
    })
  });
  const host = createMemoryTerminalHost({ viewport: { columns: 24, rows: 3 } });
  const runtime = createTuiRuntime({ app, host });
  const frame = await runtime.start();
  const target = frame.hitTargets?.find((item) => item.id === 'cached-region-hit:press');

  assert.equal(hitTargetCalls, 1);
  assert.notEqual(target, undefined);
  assert.equal('message' in target, false);
  await runtime.handleInputChunk({ data: `\u001B[<0;${String(target.bounds.column)};${String(target.bounds.row)}M` });
  await runtime.handleInputChunk({ data: `\u001B[<0;${String(target.bounds.column)};${String(target.bounds.row)}m` });

  assert.deepEqual(runtime.state(), { clicked: true });
  assert.equal(hitTargetCalls, 2);
});

test('TUI runtime keeps command focus when contained overlays close under passive notifications', async () => {
  const app = defineTui({
    id: 'overlay-focus-return-tui',
    init: () => ({ command: '', paletteOpen: false, notifications: [] }),
    update: (state, message) => {
      if (message.kind === 'text') {
        return { state: { ...state, command: `${state.command}${message.text}` } };
      }
      if (message.kind === 'open') {
        return { state: { ...state, paletteOpen: true } };
      }
      if (message.kind === 'accept') {
        return {
          state: {
            ...state,
            paletteOpen: false,
            notifications: [{ id: 'accepted', title: 'Accepted', tone: 'success' }]
          }
        };
      }
      return { state };
    },
    view: (state) => overlay([
      column([
        textInput({
          id: 'command',
          presentation: { value: state.command, cursor: 0 },
          keys: { enter: () => ({ kind: 'open' }) },
          onAction: ({ operation }) => ({
            kind: 'text',
            text: operation.kind === 'insert' ? operation.text : ''
          })
        })
      ], { id: 'base' }),
      ...(state.paletteOpen
        ? [
            surface(button({
              id: 'accept',
              label: 'Accept',
              onPress: () => ({ kind: 'accept' })
            }), {
    id: 'palette-surface',
    meta: {
        layer: {
            zIndex: 20
        },
        focus: { scope: { kind: 'contain' } }
    }
})
          ]
        : []),
      notificationStack({
    id: 'notices',
    presentation: { kind: 'live', items: state.notifications },
    meta: {
        layer: {
            zIndex: 30
        }
    }
})
    ], { id: 'root' })
  });
  const host = createMemoryTerminalHost({ viewport: { columns: 48, rows: 8 } });
  const runtime = createTuiRuntime({
    app,
    host,
    initialFocus: { kind: 'path', path: ['root', 'base', 'command'] }
  });

  await runtime.start();
  await runtime.handleInput({ kind: 'text', text: 'a' });
  await runtime.handleInput({ kind: 'key', key: 'enter', modifiers: { ctrl: false, alt: false, shift: false, meta: false }, eventType: 'press', location: 'standard' });
  assert.deepEqual(runtime.frame().focusPath, ['root', 'palette-surface', 'accept']);

  await runtime.handleInput({ kind: 'key', key: 'enter', modifiers: { ctrl: false, alt: false, shift: false, meta: false }, eventType: 'press', location: 'standard' });
  assert.equal(runtime.state()?.notifications.length, 1);
  assert.notDeepEqual(runtime.frame().focusPath, ['root', 'notices']);

  await runtime.handleInput({ kind: 'text', text: 'b' });

  assert.equal(runtime.state()?.command, 'ab');
});

test('TUI runtime unwinds nested contained overlay focus to the original field', async () => {
  const app = defineTui({
    id: 'nested-overlay-focus-return-tui',
    init: () => ({ command: '', modal: 'none' }),
    update: (state, message) => {
      if (message.kind === 'text') {
        return { state: { ...state, command: `${state.command}${message.text}` } };
      }
      if (message.kind === 'openA') return { state: { ...state, modal: 'a' } };
      if (message.kind === 'openB') return { state: { ...state, modal: 'b' } };
      if (message.kind === 'closeB') return { state: { ...state, modal: 'a' } };
      if (message.kind === 'closeA') return { state: { ...state, modal: 'none' } };
      return { state };
    },
    view: (state) => overlay([
      column([
        textInput({
          id: 'command',
          presentation: { value: state.command, cursor: 0 },
          keys: { enter: () => ({ kind: 'openA' }) },
          onAction: ({ operation }) => ({
            kind: 'text',
            text: operation.kind === 'insert' ? operation.text : ''
          })
        })
      ], { id: 'base' }),
      ...(state.modal === 'a' || state.modal === 'b'
        ? [
            surface(column([
              button({ id: 'open-b', label: 'Open B', onPress: () => ({ kind: 'openB' }) }),
              button({ id: 'close-a', label: 'Close A', onPress: () => ({ kind: 'closeA' }) })
            ], { id: 'modal-a-actions' }), {
    id: 'modal-a',
    meta: {
        layer: {
            zIndex: 10
        },
        focus: { scope: { kind: 'contain' } }
    }
})
          ]
        : []),
      ...(state.modal === 'b'
        ? [
            surface(button({
              id: 'close-b',
              label: 'Close B',
              onPress: () => ({ kind: 'closeB' })
            }), {
    id: 'modal-b',
    meta: {
        layer: {
            zIndex: 20
        },
        focus: { scope: { kind: 'contain' } }
    }
})
          ]
        : [])
    ], { id: 'root' })
  });
  const host = createMemoryTerminalHost({ viewport: { columns: 48, rows: 10 } });
  const runtime = createTuiRuntime({
    app,
    host,
    initialFocus: { kind: 'path', path: ['root', 'base', 'command'] }
  });

  await runtime.start();
  await runtime.handleInput({ kind: 'key', key: 'enter', modifiers: { ctrl: false, alt: false, shift: false, meta: false }, eventType: 'press', location: 'standard' });
  assert.deepEqual(runtime.frame().focusPath, ['root', 'modal-a', 'modal-a-actions', 'open-b']);

  await runtime.handleInput({ kind: 'key', key: 'enter', modifiers: { ctrl: false, alt: false, shift: false, meta: false }, eventType: 'press', location: 'standard' });
  assert.deepEqual(runtime.frame().focusPath, ['root', 'modal-b', 'close-b']);

  await runtime.handleInput({ kind: 'key', key: 'enter', modifiers: { ctrl: false, alt: false, shift: false, meta: false }, eventType: 'press', location: 'standard' });
  assert.deepEqual(runtime.frame().focusPath, ['root', 'modal-a', 'modal-a-actions', 'open-b']);

  await runtime.handleInput({ kind: 'key', key: 'tab', modifiers: { ctrl: false, alt: false, shift: false, meta: false }, eventType: 'press', location: 'standard' });
  assert.deepEqual(runtime.frame().focusPath, ['root', 'modal-a', 'modal-a-actions', 'close-a']);

  await runtime.handleInput({ kind: 'key', key: 'enter', modifiers: { ctrl: false, alt: false, shift: false, meta: false }, eventType: 'press', location: 'standard' });
  assert.deepEqual(runtime.frame().focusPath, ['root', 'base', 'command']);

  await runtime.handleInput({ kind: 'text', text: 'z' });
  assert.equal(runtime.state()?.command, 'z');
});

test('renderFrameDebug emits cursor-addressed control-sequence output', () => {
  const frame = renderElementFrame(textInput({ id: 'addressed-field', presentation: { value: 'Go', cursor: 0 } }), { columns: 8, rows: 2 });
  const output = renderFrameDebug(frame);

  assert.match(output, /^\u001B\[H›/u);
  assert.match(output, /\u001B\[1;4HG/u);
  assert.match(output, /\u001B\[1;5Ho/u);
  assert.match(output, new RegExp(`\\u001B\\[${String(frame.cursor?.row)};${String(frame.cursor?.column)}H$`, 'u'));
  assert.equal(renderFramePlain(frame), '›[ Go ]');
});

test('TUI frame rendering positions wide graphemes by terminal cells', () => {
  const frame = renderElementFrame(text('A🙂B', { id: 'wide-text' }), { columns: 8, rows: 2 });
  const output = renderFramePlain(frame);
  const addressed = renderFrameDebug(frame);

  assert.equal(output, 'A🙂B');
  assert.deepEqual(frame.cells.slice(0, 4).map((cell) => [cell.column, cell.text, cell.width, cell.continuation === true]), [
    [1, 'A', 1, false],
    [2, '🙂', 2, false],
    [3, '', 0, true],
    [4, 'B', 1, false]
  ]);
  assert.match(addressed, /\u001B\[1;2H🙂/u);
  assert.match(addressed, /\u001B\[1;4HB/u);
});

test('TUI frame cursor follows the selected visible list item', () => {
  const items = Array.from({ length: 10 }, (_value, index) => `Item ${index}`);
  const frame = renderElementFrame(list({
    id: 'cursor-list',
    items,
    projectItem: (item) => ({ id: item, label: item }),
    selectedId: 'Item 6'
  }), { columns: 16, rows: 5 });
  const output = renderFramePlain(frame);
  const addressed = renderFrameDebug(frame);

  assert.deepEqual(frame.focusPath, ['cursor-list']);
  assert.deepEqual(frame.cursor, { row: 3, column: 1 });
  assert.match(output, /› Item 6/);
  assert.match(addressed, /\u001B\[3H$/u);
});

test('TUI status, progress, and spinner widgets render accessible status state', () => {
  const frame = renderElementFrame(column([
    statusBar({ id: 'status', leading: [{ id: 'ready', kind: 'status', text: 'Ready', status: 'success' }] }),
    progressBar({ id: 'progress', label: 'Sync', mode: { kind: 'determinate', value: 150, max: 100 } }),
    progressBar({ id: 'pending', label: 'Waiting', mode: { kind: 'indeterminate' } }),
    spinner({ id: 'spinner', label: 'Working' })
  ]), { columns: 32, rows: 8 });
  const output = renderFramePlain(frame);
  const [statusNode, progressNode, pendingNode, spinnerNode] = frame.accessibility.root.children;

  assert.match(output, /Ready/);
  assert.match(output, /Sync \[██████████\] 100\/100/);
  assert.match(output, /Waiting \[████░░░░░░\]/);
  assert.match(output, /⠋ Working/);
  assert.deepEqual([statusNode?.role, statusNode?.value], ['status', 'Ready']);
  assert.deepEqual([progressNode?.role, progressNode?.label, progressNode?.progress], [
    'progressbar',
    'Sync',
    { value: 100, max: 100 }
  ]);
  assert.deepEqual([pendingNode?.role, pendingNode?.label, pendingNode?.progress], [
    'progressbar',
    'Waiting',
    { indeterminate: true }
  ]);
  assert.deepEqual([spinnerNode?.role, spinnerNode?.value], ['status', 'Working (running)']);
  assert.deepEqual([statusNode?.live, progressNode?.live, pendingNode?.live, spinnerNode?.live], ['polite', 'polite', 'polite', 'polite']);
  assert.equal(validateAccessibleSnapshot(frame.accessibility).ok, true);
});

test('renderDiffAnsi serializes clear, write, and structural cursor state', () => {
  const previous = renderElementFrame(text('Longer text', { id: 'before' }), { columns: 16, rows: 2 });
  const next = renderElementFrame(textInput({ id: 'after', presentation: { value: 'Go', cursor: 0 } }), { columns: 16, rows: 2 });
  const diff = diffFrames(previous, next);
  const output = renderDiffAnsi(diff);

  assert.ok(diff.operations.some((operation) => operation.kind === 'clearRect'));
  assert.ok(diff.operations.some((operation) => operation.kind === 'write'));
  assert.deepEqual(diff.cursor, next.cursor);
  assert.match(output, /\u001B\[H {11}/u);
  assert.match(output, /\u001B\[H›\[ Go \]/u);
  assert.doesNotMatch(output, /\u001B\[\?25[hl]/u);
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

test('runTui reports a typed diagnostic when no host is provided', async () => {
  const app = defineTui({
    id: 'missing-host-tui',
    init: () => ({ ready: true }),
    update: (state) => ({ state }),
    view: () => text('ready')
  });

  const exit = await runTui(app);

  assert.equal(exit.status, 'error');
  assert.equal(exit.diagnostics[0]?.code, 'HOST_CAPABILITY_UNAVAILABLE');
  assert.equal(exit.diagnostics[0]?.target, 'missing-host-tui');
  assert.equal(exit.snapshot.source, 'tui');
  assert.equal(exit.snapshot.root.id, 'missing-host-tui');
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
  const host = createMemoryTerminalHost({ viewport: { columns: 48, rows: 3 } });
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
  const harness = createTerminalHarness({ viewport: { columns: 48, rows: 3 } });
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
  const harness = createTerminalHarness({ viewport: { columns: 52, rows: 3 } });
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

  harness.host.stdin.close();
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
    viewport: { columns: 20, rows: 3 },
    capabilities: { probes: { keyboardProtocol: true } }
  });
  const write = harness.host.write.bind(harness.host);
  harness.host.write = async (output) => {
    if (output.text === '\u001B[>1u') throw new Error('keyboard setup unavailable');
    await write(output);
  };
  harness.host.input('\u001B[97u');
  harness.host.stdin.close();

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
  const harness = createTerminalHarness({ viewport: { columns: 16, rows: 3 } });
  harness.host.stdin.close();
  const exit = await runTui(app, harness.host);
  const result = { transcript: harness.transcript.snapshot(), output: harness.output(), snapshot: harness.snapshot() };

  assert.equal(exit.status, 'completed');
  assert.equal(harness.host.stdin.isRawModeEnabled(), false);
  assert.deepEqual(harness.restores()[0], {
    rawInput: false,
    alternateScreen: false,
    bracketedPaste: false,
    mouseReporting: 'none',
    focusReporting: false,
    keyboardProfile: { kind: 'legacy' },
    cursorVisible: true
  });
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
  const harness = createTerminalHarness({ viewport: { columns: 20, rows: 3 } });
  harness.host.input('\r');
  const exit = await runTui(app, harness.host);

  assert.equal(exit.status, 'completed');
  assert.deepEqual(exit.state, { submitted: true });
  assert.equal(harness.frames().length, 2);
  assert.equal(harness.frames()[0].schemaVersion, 'terminal-ui.tui-frame.v1');
  assert.equal(harness.diffs()[0].schemaVersion, 'terminal-ui.render-diff.v2');
  assert.equal(harness.diffs()[0].fullRewrite, true);
  assert.equal(harness.diffs()[1].fullRewrite, false);
  assert.match(renderFramePlain(harness.frames()[1]), /submitted/);
  assert.equal(harness.restores().length, 1);
  assert.equal(harness.host.stdin.isRawModeEnabled(), false);
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
  const harness = createTerminalHarness({ viewport: { columns: 20, rows: 3 } });
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
        modified: [{
          trigger: { kind: 'key', key: 'c', modifiers: { ctrl: true } },
          onKey: () => ({ active: 'ctrlC' })
        }]
      }
    })
  });
  const escapeHarness = createTerminalHarness({ viewport: { columns: 20, rows: 3 } });
  const escapeRunning = runTui(app, escapeHarness.host, { input: { escapeDelayMs: 1 } });
  await waitUntil(() => escapeHarness.frames().length === 1);
  escapeHarness.host.input('\u001B');
  await flushAsync();
  escapeHarness.host.clock.advance(1);
  const escape = await escapeRunning;

  const ctrlCHarness = createTerminalHarness({ viewport: { columns: 20, rows: 3 } });
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
      presentation: { value: `columns:${context.viewport.columns}`, cursor: 0 },
      onSubmit: () => ({ done: true })
    })
  });
  const harness = createTerminalHarness({ viewport: { columns: 20, rows: 3 } });
  const running = runTui(app, harness.host);

  await waitUntil(() => harness.frames().length === 1);
  harness.host.viewportControl?.setViewport({ columns: 12, rows: 3 });
  harness.host.signals.emit('resize');
  await waitUntil(() => harness.frames().length === 2);
  harness.host.input('\r');
  const exit = await running;

  assert.equal(exit.status, 'completed');
  assert.equal(harness.frames()[1].width, 12);
  assert.equal(harness.diffs()[1].fullRewrite, true);
  assert.match(renderFramePlain(harness.frames()[1]), /column…/);
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
      presentation: { value: `columns:${context.viewport.columns}`, cursor: 0 },
      onSubmit: () => ({ done: true })
    })
  });
  const harness = createTerminalHarness({ viewport: { columns: 20, rows: 3 } });
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
    if (!blocked && harness.host.getViewport().columns === 21) {
      blocked = true;
      resizeStarted.release();
      await releaseResize.promise;
    }
    await originalWrite(output);
  };
  const running = runTui(app, harness.host);

  await Promise.all([
    waitUntil(() => harness.frames().length === 1),
    signalSubscribed.promise
  ]);
  await harness.host.viewportControl?.setViewport({ columns: 21, rows: 3 });
  harness.host.signals.emit('resize');
  await resizeStarted.promise;
  for (const columns of [22, 23, 24]) {
    await harness.host.viewportControl?.setViewport({ columns, rows: 3 });
    harness.host.signals.emit('resize');
  }
  releaseResize.release();
  await waitUntil(() => harness.frames().at(-1)?.width === 24);
  const resizeFrameWidths = harness.frames().map((frame) => frame.width);
  harness.host.input('\r');
  const exit = await running;

  assert.equal(exit.status, 'completed');
  assert.deepEqual(resizeFrameWidths, [20, 21, 24]);
  assert.equal(harness.restores().length, 1);
});

test('runTui exits and restores when the host emits interruption signals', async () => {
  const app = defineTui({
    id: 'run-loop-signal',
    init: () => ({ ready: true }),
    update: (state) => ({ state }),
    view: () => textInput({ id: 'signal-field', presentation: { value: 'ready', cursor: 0 } })
  });
  const harness = createTerminalHarness({ viewport: { columns: 20, rows: 3 } });
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
  const harness = createTerminalHarness({ viewport: { columns: 16, rows: 3 } });
  const exit = await runTui(app, harness.host);

  assert.equal(exit.status, 'error');
  assert.equal(exit.diagnostics.some((item) => item.code === 'TUI_RUN_FAILED'), true);
  assert.equal(harness.host.stdin.isRawModeEnabled(), false);
  assert.equal(harness.restores().length, 1);
  assert.match(harness.output(), /\u001B\[\?1049h/);
  assert.match(harness.output(), /\u001B\[\?1049l/);
});

test('TUI runtime dispatch updates state and records incremental render diffs', async () => {
  const app = defineTui({
    id: 'counter',
    init: () => ({ count: 0 }),
    update: (state, message) => ({ state: { count: state.count + message.delta } }),
    view: (state) => surface(text(`Count ${state.count}`, { id: 'count' }), { id: 'counter-surface' })
  });
  const harness = createTerminalHarness({ viewport: { columns: 18, rows: 4 } });
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

test('TUI runtime start returns the committed initial frame', async () => {
  const app = defineTui({
    id: 'start-frame',
    init: () => ({ label: 'ready' }),
    update: (state) => ({ state }),
    view: (state) => text(state.label, { id: 'start-label' })
  });
  const harness = createTerminalHarness({ viewport: { columns: 18, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  const frame = await runtime.start();

  assert.equal(frame.schemaVersion, 'terminal-ui.tui-frame.v1');
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
      delivery: 'sequential',
      async *messages() {
        starts += 1;
        yield { delta: 1 };
      }
    }],
    view: (state) => text(`Count ${state.count}`, { id: 'subscription-count' })
  });
  const harness = createTerminalHarness({ viewport: { columns: 18, rows: 3 } });
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
      delivery: 'sequential',
      async *messages() {
        starts += 1;
        throw new Error('source failed');
      },
      onLifecycle: (event) => event.kind === 'failed' ? { kind: 'failed' } : undefined
    }],
    view: (state) => text(`Count ${state.count}`, { id: 'subscription-count' })
  });
  const harness = createTerminalHarness({ viewport: { columns: 18, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  await waitUntil(() => runtime.diagnostics().some((item) => item.code === 'TUI_SOURCE_FAILED'));
  await waitUntil(() => runtime.state()?.status === 'failed');
  await runtime.dispatch({ kind: 'increment', delta: 1 });

  assert.equal(starts, 1);
  assert.match(
    runtime.diagnostics().find((item) => item.code === 'TUI_SOURCE_FAILED')?.message ?? '',
    /failed-source/u
  );
});

test('latest subscription delivery keeps one replaceable pending message', async () => {
  const app = defineTui({
    id: 'latest-subscription',
    init: () => ({ values: [] }),
    update: (state, message) => ({ state: { values: [...state.values, message.value] } }),
    subscriptions: () => [{
      id: 'samples',
      generation: 0,
      delivery: 'latest',
      async *messages() {
        for (let value = 1; value <= 100; value += 1) yield { value };
      }
    }],
    view: (state) => text(state.values.join(','), { id: 'latest-values' })
  });
  const harness = createTerminalHarness({ viewport: { columns: 24, rows: 3 } });
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
      delivery: 'sequential',
      async *messages() {
        starts.push(state.generation);
        yield { kind: 'value', value: state.generation };
      },
      dispose() {
        disposals.push(state.generation);
      }
    }],
    view: (state) => text(state.values.join(','), { id: 'subscription-generations-value' })
  });
  const harness = createTerminalHarness({ viewport: { columns: 18, rows: 3 } });
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
      delivery: 'sequential',
      async *messages() {}
    })),
    view: () => text('ready', { id: 'duplicate-subscriptions-view' })
  });
  const harness = createTerminalHarness({ viewport: { columns: 18, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await assert.rejects(() => runtime.start(), /Duplicate TUI event source id/u);
  assert.equal(runtime.diagnostics().some((item) => item.code === 'TUI_SOURCE_DUPLICATE_ID'), true);
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
          delivery: 'sequential',
          async *messages(context) {
            sourceSignal = context.signal;
            await new Promise(() => undefined);
          },
          dispose() {
            disposeCount += 1;
          }
        }]
      : [],
    view: (state) => text(state.enabled ? 'enabled' : 'disabled', { id: 'subscription-state' })
  });
  const harness = createTerminalHarness({ viewport: { columns: 18, rows: 3 } });
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
      delivery: 'sequential',
      async *messages() {
        sourceStarted = true;
        await sourceGate.promise;
        yield { kind: 'stale-source-output' };
      }
    }] : [],
    view: (state) => text(`${state.phase}:${String(state.staleMessages)}`, { id: 'source-admission-state' })
  });
  const host = createMemoryTerminalHost({ viewport: { columns: 24, rows: 3 } });
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
    await write(output);
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
    view: (state) => text(`${state.phase}:${String(state.count)}`, { id: 'effect-state' })
  });
  const harness = createTerminalHarness({ viewport: { columns: 18, rows: 3 } });
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
    view: (state) => text(
      `${state.phase}:${String(state.staleOutput)}:${String(state.staleRecovery)}`,
      { id: 'effect-admission-state' }
    )
  });
  const host = createMemoryTerminalHost({ viewport: { columns: 32, rows: 3 } });
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
    await write(output);
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
  assert.equal(runtime.diagnostics().some((item) => item.code === 'TUI_EFFECT_FAILED'
    && item.target === 'replace-error'), false);
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
    view: (state) => text(`Count ${state.count}`, { id: 'effect-message-batch-count' })
  });
  const harness = createTerminalHarness({ viewport: { columns: 18, rows: 3 } });
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
    view: (state) => text(state.phase, { id: 'effect-exit-state' })
  });
  const harness = createTerminalHarness({ viewport: { columns: 18, rows: 3 } });
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
      delivery: 'sequential',
      async *messages() {
        try {
          yield { kind: 'finish' };
        } finally {
          sourceCompleted();
        }
      },
      async dispose() {
        await sourceCompletion;
      }
    }],
    view: (state) => text(state.phase, { id: 'subscription-exit-state' })
  });
  const harness = createTerminalHarness({ viewport: { columns: 18, rows: 3 } });
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
    view: (state) => text(`Count ${state.count}`, { id: 'external-count' })
  });
  const harness = createTerminalHarness({ viewport: { columns: 18, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host, transcript });

  await runtime.start();
  await runtime.dispatch({ delta: 4 });
  const snapshot = transcript.snapshot();

  assert.equal(validateTranscript(snapshot).ok, true);
  assert.ok(snapshot.steps.some((step) => step.kind === 'message'
    && step.source === 'external'
    && step.message.delta === 4));
});

test('TUI runtime coalesces unobserved frame changes', async () => {
  const app = defineTui({
    id: 'coalesced-frame-changes',
    init: () => ({ count: 0 }),
    update: (state, message) => ({ state: { count: state.count + message.delta } }),
    view: (state) => text(`Count ${String(state.count)}`, { id: 'count' })
  });
  const harness = createTerminalHarness({ viewport: { columns: 20, rows: 3 } });
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

test('TUI runtime does not publish frames for identity no-op updates', async () => {
  const app = defineTui({
    id: 'identity-noop-frame-changes',
    init: () => ({ count: 0 }),
    update: (state, message) => message.kind === 'noop'
      ? { state }
      : { state: { count: state.count + 1 } },
    view: (state) => text(`Count ${String(state.count)}`, { id: 'count' })
  });
  const harness = createTerminalHarness({ viewport: { columns: 20, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  await runtime.nextChange();

  let resolved = false;
  const pending = runtime.nextChange().then((change) => {
    resolved = true;
    return change;
  });
  await runtime.dispatch({ kind: 'noop' });
  await Promise.resolve();
  assert.equal(resolved, false);

  await runtime.dispatch({ kind: 'increment' });
  const change = await pending;
  assert.equal(change.kind, 'frame');
  assert.match(renderFramePlain(change.frame), /Count 1/u);
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
    view: (state) => text(state.status, { id: 'effect-status' })
  });
  const harness = createTerminalHarness({ viewport: { columns: 18, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  await runtime.dispatch({ kind: 'start' });
  await waitUntil(() => runtime.state()?.status === 'failed');

  assert.equal(runtime.diagnostics().some((item) => item.code === 'TUI_EFFECT_FAILED'), true);
  assert.match(renderFramePlain(runtime.frame()), /failed/u);
});

test('TUI runtime resize re-renders against the memory host viewport', async () => {
  const app = defineTui({
    id: 'resizable',
    init: () => ({ label: 'Wide label' }),
    update: (state) => ({ state }),
    view: (state) => surface(text(state.label, { id: 'label' }), { id: 'surface' })
  });
  const harness = createTerminalHarness({ viewport: { columns: 20, rows: 4 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  await runtime.resize({ columns: 12, rows: 4 });

  assert.equal(runtime.frame().width, 12);
  assert.equal(harness.frames().length, 2);
  assert.equal(harness.diffs()[1].fullRewrite, true);
  assert.match(renderFramePlain(runtime.frame()), /Wide label/);
});

test('anonymous container focus identity survives terminal resize', async () => {
  const app = defineTui({
    id: 'structural-focus-resize',
    init: () => ({ value: '' }),
    update: (state) => ({ state }),
    view: (state) => column([
      textInput({ id: 'first', presentation: { value: state.value, cursor: 0 } }),
      textInput({ id: 'second', presentation: { value: state.value, cursor: 0 } })
    ])
  });
  const harness = createTerminalHarness({ viewport: { columns: 40, rows: 6 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  await runtime.handleInput({
    kind: 'key',
    key: 'tab',
    modifiers: { ctrl: false, alt: false, shift: false, meta: false },
    eventType: 'press',
    location: 'standard'
  });
  const focusBeforeResize = runtime.frame().focusPath;
  await runtime.resize({ columns: 18, rows: 4 });

  assert.deepEqual(focusBeforeResize, ['column:0', 'second']);
  assert.deepEqual(runtime.frame().focusPath, focusBeforeResize);
});

test('TUI runtime routes key events through focused widget keymaps', async () => {
  const app = defineTui({
    id: 'keymap-routing',
    init: () => ({ active: 'none' }),
    update: (_state, message) => ({ state: { active: message.active } }),
    view: (state) => column([
      textInput({ id: 'first', presentation: { value: state.active, cursor: 0 }, keys: { enter: () => ({ active: 'first' }) } }),
      textInput({ id: 'second', presentation: { value: state.active, cursor: 0 }, keys: { enter: () => ({ active: 'second' }) } })
    ])
  });
  const harness = createTerminalHarness({ viewport: { columns: 20, rows: 4 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  const first = await runtime.handleInput({ kind: 'key', key: 'enter', modifiers: { ctrl: false, alt: false, shift: false, meta: false }, eventType: 'press', location: 'standard' });
  const tab = await runtime.handleInput({ kind: 'key', key: 'tab', modifiers: { ctrl: false, alt: false, shift: false, meta: false }, eventType: 'press', location: 'standard' });
  const second = await runtime.handleInput({ kind: 'key', key: 'enter', modifiers: { ctrl: false, alt: false, shift: false, meta: false }, eventType: 'press', location: 'standard' });

  assert.equal(first.handled, true);
  assert.equal(tab.handled, true);
  assert.equal(second.handled, true);
  assert.deepEqual(runtime.state(), { active: 'second' });
  assert.deepEqual(runtime.frame().focusPath, ['column:0', 'second']);
  assert.equal(harness.frames().length, 4);
  assert.equal(harness.diffs()[0].fullRewrite, true);
  assert.match(renderFramePlain(runtime.frame()), /second/);
});

test('TUI runtime lets focused widgets handle tab before focus traversal', async () => {
  const app = defineTui({
    id: 'tab-keymap-routing',
    init: () => ({ active: 'none' }),
    update: (_state, message) => ({ state: { active: message.active } }),
    view: (state) => column([
      textInput({ id: 'first', presentation: { value: state.active, cursor: 0 }, keys: { tab: () => ({ active: 'accepted' }) } }),
      textInput({ id: 'second', presentation: { value: state.active, cursor: 0 }, keys: { enter: () => ({ active: 'second' }) } })
    ])
  });
  const harness = createTerminalHarness({ viewport: { columns: 24, rows: 4 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  const focusBefore = runtime.frame().focusPath;
  const handled = await runtime.handleInput({ kind: 'key', key: 'tab', modifiers: { ctrl: false, alt: false, shift: false, meta: false }, eventType: 'press', location: 'standard' });

  assert.equal(handled.handled, true);
  assert.deepEqual(runtime.state(), { active: 'accepted' });
  assert.deepEqual(runtime.frame().focusPath, focusBefore);
  assert.match(renderFramePlain(runtime.frame()), /accepted/);
});

test('TUI runtime routes default app key bindings after focused widgets', async () => {
  const app = defineTui({
    id: 'app-key-binding-after-focus',
    init: () => ({ active: 'open' }),
    inputBindings: [
      { id: 'close', triggers: [{ kind: 'key', key: 'escape' }], message: { active: 'closed' } }
    ],
    update: (_state, message) => ({ state: { active: message.active } }),
    view: (state) => textInput({ id: 'field', presentation: { value: state.active, cursor: 0 } })
  });
  const harness = createTerminalHarness({ viewport: { columns: 24, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  const handled = await runtime.handleInput({
    kind: 'key',
    key: 'escape',
    sequence: '\u001B',
    modifiers: { ctrl: false, alt: false, shift: false, meta: false },
    eventType: 'press',
    location: 'standard'
  });

  assert.equal(handled.handled, true);
  assert.deepEqual(runtime.state(), { active: 'closed' });
  assert.match(renderFramePlain(runtime.frame()), /closed/);
});

test('TUI runtime lets focused widgets override after-focus app bindings', async () => {
  const app = defineTui({
    id: 'app-key-binding-focused-wins',
    init: () => ({ active: 'open' }),
    inputBindings: [
      { id: 'global-close', triggers: [{ kind: 'key', key: 'escape' }], message: { active: 'global' } }
    ],
    update: (_state, message) => ({ state: { active: message.active } }),
    view: (state) => textInput({
      id: 'field',
      presentation: { value: state.active, cursor: 0 },
      keys: { escape: () => ({ active: 'local' }) }
    })
  });
  const harness = createTerminalHarness({ viewport: { columns: 24, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  await runtime.handleInput({
    kind: 'key',
    key: 'escape',
    sequence: '\u001B',
    modifiers: { ctrl: false, alt: false, shift: false, meta: false },
    eventType: 'press',
    location: 'standard'
  });

  assert.deepEqual(runtime.state(), { active: 'local' });
  assert.match(renderFramePlain(runtime.frame()), /local/);
});

test('TUI runtime lets before-focus app bindings intentionally preempt widgets', async () => {
  const app = defineTui({
    id: 'app-key-binding-before-focus',
    init: () => ({ active: 'open' }),
    inputBindings: [
      { id: 'priority-enter', triggers: [{ kind: 'key', key: 'enter' }], phase: 'beforeFocus', message: { active: 'global' } }
    ],
    update: (_state, message) => ({ state: { active: message.active } }),
    view: (state) => textInput({
      id: 'field',
      presentation: { value: state.active, cursor: 0 },
      keys: { enter: () => ({ active: 'local' }) }
    })
  });
  const harness = createTerminalHarness({ viewport: { columns: 24, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  await runtime.handleInput({ kind: 'key', key: 'enter', modifiers: { ctrl: false, alt: false, shift: false, meta: false }, eventType: 'press', location: 'standard' });

  assert.deepEqual(runtime.state(), { active: 'global' });
  assert.match(renderFramePlain(runtime.frame()), /global/);
});

test('TUI runtime does not steal printable text for default app bindings', async () => {
  const app = defineTui({
    id: 'app-key-binding-printable-after-focus',
    init: () => ({ value: '' }),
    inputBindings: [
      { id: 'quit', triggers: [{ kind: 'text', text: 'q' }], message: { value: 'quit' } }
    ],
    update: (state, message) => ({ state: { value: `${state.value}${message.value}` } }),
    view: (state) => textInput({
      id: 'field',
          presentation: { value: state.value, cursor: 0 },
          onAction: ({ operation }) => ({ value: operation.kind === 'insert' ? operation.text : '' })
    })
  });
  const harness = createTerminalHarness({ viewport: { columns: 24, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  await runtime.handleInput({ kind: 'text', text: 'q' });

  assert.deepEqual(runtime.state(), { value: 'q' });
  assert.match(renderFramePlain(runtime.frame()), /q/);
});

test('TUI runtime routes committed text before after-focus app bindings', async () => {
  const app = defineTui({
    id: 'committed-text-before-app-binding',
    init: () => ({ value: '' }),
    inputBindings: [{
      id: 'global-space',
      triggers: [{ kind: 'text', text: ' ' }],
      message: { value: 'global' }
    }],
    update: (state, message) => ({ state: { value: `${state.value}${message.value}` } }),
    view: (state) => textInput({
      id: 'field',
      presentation: { value: state.value, cursor: state.value.length },
      onAction: ({ operation }) => ({ value: operation.kind === 'insert' ? operation.text : '' })
    })
  });
  const harness = createTerminalHarness({ viewport: { columns: 24, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  await runtime.handleInput({
    kind: 'key',
    key: 'space',
    committedText: ' ',
    modifiers: { ctrl: false, alt: false, shift: false, meta: false },
    eventType: 'press',
    location: 'standard'
  });

  assert.deepEqual(runtime.state(), { value: ' ' });
});

test('TUI runtime routes committed text through app text bindings', async () => {
  const app = defineTui({
    id: 'committed-text-app-binding',
    init: () => ({ value: 'idle' }),
    inputBindings: [{
      id: 'quit',
      triggers: [{ kind: 'text', text: 'q' }],
      message: { value: 'quit' }
    }],
    update: (_state, message) => ({ state: message }),
    view: (state) => textInput({
      id: 'field',
      presentation: { value: state.value, cursor: 0 }
    })
  });
  const runtime = createTuiRuntime({
    app,
    host: createMemoryTerminalHost({ viewport: { columns: 24, rows: 3 } })
  });

  await runtime.start();
  const handled = await runtime.handleInput({
    kind: 'key',
    key: 'q',
    committedText: 'q',
    modifiers: { ctrl: false, alt: false, shift: false, meta: false },
    eventType: 'press',
    location: 'standard'
  });

  assert.equal(handled.handled, true);
  assert.deepEqual(runtime.state(), { value: 'quit' });
});

test('TUI runtime routes committed text through component text key bindings', async () => {
  const app = defineTui({
    id: 'committed-text-component-binding',
    init: () => ({ value: 'idle' }),
    update: (_state, message) => ({ state: message }),
    view: (state) => textInput({
      id: 'field',
      presentation: { value: state.value, cursor: 0 },
      keys: { text: { q: () => ({ value: 'component' }) } }
    })
  });
  const runtime = createTuiRuntime({
    app,
    host: createMemoryTerminalHost({ viewport: { columns: 24, rows: 3 } })
  });

  await runtime.start();
  const handled = await runtime.handleInput({
    kind: 'key',
    key: 'q',
    committedText: 'q',
    modifiers: { ctrl: false, alt: false, shift: false, meta: false },
    eventType: 'press',
    location: 'standard'
  });

  assert.equal(handled.handled, true);
  assert.deepEqual(runtime.state(), { value: 'component' });
});

test('TUI runtime evaluates app key binding predicates and dynamic messages', async () => {
  const app = defineTui({
    id: 'app-key-binding-dynamic',
    init: () => ({ active: 'blocked', enabled: false }),
    inputBindings: [
      {
        id: 'dynamic-help',
        triggers: [{ kind: 'key', key: 'q', modifiers: { ctrl: true } }],
        enabled: ({ state }) => state.enabled,
        toMessage: ({ focusPath }) => ({ active: focusPath?.join('/') ?? 'none', enabled: true })
      }
    ],
    update: (_state, message) => ({ state: message }),
    view: (state) => textInput({
      id: 'field',
      presentation: { value: state.active, cursor: 0 },
      keys: { enter: () => ({ active: 'ready', enabled: true }) }
    })
  });
  const harness = createTerminalHarness({ viewport: { columns: 32, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  const disabled = await runtime.handleInput({ kind: 'key', key: 'q', modifiers: { ctrl: true, alt: false, shift: false, meta: false }, eventType: 'press', location: 'standard' });
  await runtime.handleInput({ kind: 'key', key: 'enter', modifiers: { ctrl: false, alt: false, shift: false, meta: false }, eventType: 'press', location: 'standard' });
  const enabled = await runtime.handleInput({ kind: 'key', key: 'q', modifiers: { ctrl: true, alt: false, shift: false, meta: false }, eventType: 'press', location: 'standard' });

  assert.equal(disabled.handled, false);
  assert.equal(enabled.handled, true);
  assert.deepEqual(runtime.state(), { active: 'field', enabled: true });
});

test('TUI runtime keeps scanning app key bindings when earlier matches decline', async () => {
  const app = defineTui({
    id: 'app-key-binding-declined-fallback',
    init: () => ({ active: 'open' }),
    inputBindings: [
      {
        id: 'contextual-help',
        triggers: [{ kind: 'key', key: 'q', modifiers: { ctrl: true } }],
        toMessage: ignoreMessage
      },
      {
        id: 'fallback-help',
        triggers: [{ kind: 'key', key: 'q', modifiers: { ctrl: true } }],
        message: { active: 'fallback' }
      }
    ],
    update: (_state, message) => ({ state: { active: message.active } }),
    view: (state) => textInput({ id: 'field', presentation: { value: state.active, cursor: 0 } })
  });
  const harness = createTerminalHarness({ viewport: { columns: 32, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  const handled = await runtime.handleInput({ kind: 'key', key: 'q', modifiers: { ctrl: true, alt: false, shift: false, meta: false }, eventType: 'press', location: 'standard' });

  assert.equal(handled.handled, true);
  assert.deepEqual(runtime.state(), { active: 'fallback' });
});

test('TUI runtime routes escape through focused widget keymaps', async () => {
  const app = defineTui({
    id: 'escape-keymap-routing',
    init: () => ({ active: 'open' }),
    update: (_state, message) => ({ state: { active: message.active } }),
    view: (state) => textInput({
      id: 'dialog-field',
      presentation: { value: state.active, cursor: 0 },
      keys: { escape: () => ({ active: 'closed' }) }
    })
  });
  const harness = createTerminalHarness({ viewport: { columns: 24, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  const handled = await runtime.handleInput({
    kind: 'key',
    key: 'escape',
    sequence: '\u001B',
    modifiers: { ctrl: false, alt: false, shift: false, meta: false },
    eventType: 'press',
    location: 'standard'
  });

  assert.equal(handled.handled, true);
  assert.equal(handled.exit, undefined);
  assert.equal(runtime.exit(), undefined);
  assert.deepEqual(runtime.state(), { active: 'closed' });
  assert.match(renderFramePlain(runtime.frame()), /closed/);
});

test('TUI runtime routes focused text and paste through one edit-operation channel', async () => {
  const app = defineTui({
    id: 'input-map-routing',
    init: () => ({ value: '' }),
    update: (state, message) => ({
      state: {
        value: message.operation.kind === 'insert'
          ? `${state.value}${message.operation.text}`
          : state.value
      }
    }),
    view: (state) => textInput({
      id: 'field',
      presentation: { value: state.value, cursor: 0 },
      onAction: ({ operation }) => ({ operation })
    })
  });
  const harness = createTerminalHarness({ viewport: { columns: 30, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  const typed = await runtime.handleInput({ kind: 'text', text: 'a' });
  const pasted = await runtime.handleInput({ kind: 'paste', text: 'bc' });

  assert.equal(typed.handled, true);
  assert.equal(pasted.handled, true);
  assert.deepEqual(runtime.state(), { value: 'abc' });
  assert.match(renderFramePlain(runtime.frame()), /abc/);
});

test('TUI runtime routes single-space input chunks as text for editable focused widgets', async () => {
  const app = defineTui({
    id: 'space-input-routing',
    init: () => ({ value: '' }),
    update: (state, message) => ({ state: { value: `${state.value}${message.text}` } }),
    view: (state) => textInput({
      id: 'field',
      presentation: { value: state.value, cursor: 0 },
      onAction: ({ operation }) => ({ text: operation.kind === 'insert' ? operation.text : '' })
    })
  });
  const harness = createTerminalHarness({ viewport: { columns: 30, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  await runtime.handleInputChunk({ data: '/folder' });
  const space = await runtime.handleInputChunk({ data: ' ' });
  await runtime.handleInputChunk({ data: 'src' });

  assert.equal(space.results.some((result) => result.handled), true);
  assert.deepEqual(runtime.state(), { value: '/folder src' });
  assert.match(renderFramePlain(runtime.frame()), /\/folder src/u);
});

test('TUI runtime lets focused space key bindings override text insertion', async () => {
  const app = defineTui({
    id: 'space-key-routing',
    init: () => ({ value: '' }),
    update: (_state, message) => ({ state: { value: message.text } }),
    view: (state) => textInput({
      id: 'field',
      presentation: { value: state.value, cursor: 0 },
      keys: { space: () => ({ text: 'space-key' }) },
      onAction: ({ operation }) => ({ text: operation.kind === 'insert' ? operation.text : '' })
    })
  });
  const harness = createTerminalHarness({ viewport: { columns: 30, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  const space = await runtime.handleInputChunk({ data: ' ' });

  assert.equal(space.results.some((result) => result.handled), true);
  assert.deepEqual(runtime.state(), { value: 'space-key' });
});

test('TUI runtime decodes input chunks through the configured input pipeline', async () => {
  const app = defineTui({
    id: 'input-pipeline-routing',
    init: () => ({ value: '' }),
    update: (state, message) => ({ state: { value: `${state.value}${message.text}` } }),
    view: (state) => textInput({
      id: 'pipeline-field',
      presentation: { value: state.value, cursor: 0 },
      onAction: ({ operation }) => ({ text: operation.kind === 'insert' ? operation.text : '' })
    })
  });
  const harness = createTerminalHarness({ viewport: { columns: 30, rows: 3 } });
  const runtime = createTuiRuntime({
    app,
    host: harness.host,
    input: { bracketedPaste: false }
  });

  await runtime.start();
  const results = await runtime.handleInputChunk({ data: '\u001B[200~pasted\ntext\u001B[201~' });

  assert.equal(results.results.some((result) => result.handled), true);
  assert.deepEqual(runtime.state(), { value: 'pastedtext' });
  assert.match(renderFramePlain(runtime.frame()), /pastedtext/);
});

test('runTui accepts an initial focus path', async () => {
  const app = defineTui({
    id: 'run-focus-restore',
    init: () => ({ active: 'idle' }),
    update: (_state, message) => ({ state: { active: message.active }, exit: {} }),
    view: (state) => column([
      textInput({ id: 'first', presentation: { value: state.active, cursor: 0 }, keys: { enter: () => ({ active: 'first' }) } }),
      textInput({ id: 'second', presentation: { value: state.active, cursor: 0 }, keys: { enter: () => ({ active: 'second' }) } })
    ])
  });
  const host = createMemoryTerminalHost({ viewport: { columns: 20, rows: 4 } });
  host.input('\r');

  const exit = await runTui(app, host, { initialFocus: { kind: 'path', path: ['column:0', 'second'] } });

  assert.equal(exit.status, 'completed');
  assert.deepEqual(exit.state, { active: 'second' });
});

test('runTui accepts a state-derived theme', async () => {
  const app = defineTui({
    id: 'run-state-theme',
    init: () => ({ active: false }),
    inputBindings: [{ id: 'activate-theme', triggers: [{ kind: 'key', key: 'enter' }], message: { active: true } }],
    update: () => ({ state: { active: true }, exit: {} }),
    view: () => richText({
      id: 'theme-label',
      segments: [{ kind: 'text', text: 'theme', style: { fg: { kind: 'theme', token: 'accent.primary' } } }]
    })
  });
  const host = createMemoryTerminalHost({ viewport: { columns: 12, rows: 2 } });
  host.input('\r');

  const exit = await runTui(app, host, {
    theme: (state) => ({
      tokens: {
        colors: {
          'accent.primary': state.active
            ? { kind: 'ansi', value: 2 }
            : { kind: 'ansi', value: 1 }
        }
      }
    })
  });

  assert.equal(exit.status, 'completed');
  assert.match(host.output(), /\u001B\[31m/u);
  assert.match(host.output(), /\u001B\[32m/u);
});

test('TUI runtime restores a serialized focus path when it still exists', async () => {
  const app = defineTui({
    id: 'focus-restore',
    init: () => ({ active: 'idle' }),
    update: (_state, message) => ({ state: { active: message.active } }),
    view: (state) => column([
      textInput({ id: 'first', presentation: { value: state.active, cursor: 0 }, keys: { enter: () => ({ active: 'first' }) } }),
      textInput({ id: 'second', presentation: { value: state.active, cursor: 0 }, keys: { enter: () => ({ active: 'second' }) } })
    ])
  });
  const firstHarness = createTerminalHarness({ viewport: { columns: 20, rows: 4 } });
  const firstRuntime = createTuiRuntime({ app, host: firstHarness.host });
  await firstRuntime.start();
  await firstRuntime.handleInput({ kind: 'key', key: 'tab', modifiers: { ctrl: false, alt: false, shift: false, meta: false }, eventType: 'press', location: 'standard' });
  const restoredPath = firstRuntime.frame().focusPath;

  const restoredHarness = createTerminalHarness({ viewport: { columns: 20, rows: 4 } });
  const restoredRuntime = createTuiRuntime({
    app,
    host: restoredHarness.host,
    initialFocus: { kind: 'path', path: restoredPath }
  });
  await restoredRuntime.start();
  const committed = await restoredRuntime.handleInput({
    kind: 'key',
    key: 'enter',
    modifiers: { ctrl: false, alt: false, shift: false, meta: false },
    eventType: 'press',
    location: 'standard'
  });

  assert.deepEqual(restoredPath, ['column:0', 'second']);
  assert.deepEqual(restoredRuntime.frame().focusPath, restoredPath);
  assert.equal(committed.handled, true);
  assert.deepEqual(restoredRuntime.state(), { active: 'second' });
});

test('TUI runtime falls back when restored focus path is stale', async () => {
  const app = defineTui({
    id: 'stale-focus-restore',
    init: () => ({ active: 'idle' }),
    update: (_state, message) => ({ state: { active: message.active } }),
    view: (state) => column([
      textInput({ id: 'first', presentation: { value: state.active, cursor: 0 }, keys: { enter: () => ({ active: 'first' }) } }),
      textInput({ id: 'second', presentation: { value: state.active, cursor: 0 }, keys: { enter: () => ({ active: 'second' }) } })
    ])
  });
  const harness = createTerminalHarness({ viewport: { columns: 20, rows: 4 } });
  const runtime = createTuiRuntime({
    app,
    host: harness.host,
    initialFocus: { kind: 'path', path: ['column:0', 'missing'] }
  });

  await runtime.start();
  const committed = await runtime.handleInput({
    kind: 'key',
    key: 'enter',
    modifiers: { ctrl: false, alt: false, shift: false, meta: false },
    eventType: 'press',
    location: 'standard'
  });

  assert.deepEqual(runtime.frame().focusPath, ['column:0', 'first']);
  assert.equal(committed.handled, true);
  assert.deepEqual(runtime.state(), { active: 'first' });
});

test('ambiguous initial element focus is diagnosed instead of selecting an arbitrary match', async () => {
  const app = defineTui({
    id: 'ambiguous-initial-focus',
    init: () => ({ active: 'idle' }),
    update: (_state, message) => ({ state: { active: message.active } }),
    view: (state) => column([
      textInput({ id: 'duplicate', presentation: { value: state.active, cursor: 0 }, keys: { enter: () => ({ active: 'first' }) } }),
      textInput({ id: 'duplicate', presentation: { value: state.active, cursor: 0 }, keys: { enter: () => ({ active: 'second' }) } })
    ])
  });
  const harness = createTerminalHarness({ viewport: { columns: 20, rows: 4 } });
  const runtime = createTuiRuntime({
    app,
    host: harness.host,
    initialFocus: { kind: 'element', elementId: 'duplicate' }
  });

  await runtime.start();

  assert.equal(runtime.diagnostics().some((item) => item.code === 'TUI_FOCUS_SELECTION_INVALID'
    && item.data?.reason === 'ambiguous'
    && item.data.paths.length === 2), true);
  assert.deepEqual(runtime.frame().focusPath, ['column:0', 'duplicate']);
  await runtime.dispose();
});

test('TUI runtime traverses focus backward with shifted tab', async () => {
  const app = defineTui({
    id: 'reverse-focus',
    init: () => ({ active: 'idle' }),
    update: (_state, message) => ({ state: { active: message.active } }),
    view: (state) => column([
      textInput({ id: 'first', presentation: { value: state.active, cursor: 0 }, keys: { enter: () => ({ active: 'first' }) } }),
      textInput({ id: 'second', presentation: { value: state.active, cursor: 0 }, keys: { enter: () => ({ active: 'second' }) } })
    ])
  });
  const harness = createTerminalHarness({ viewport: { columns: 20, rows: 4 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  const forward = await runtime.handleInput({ kind: 'key', key: 'tab', modifiers: { ctrl: false, alt: false, shift: false, meta: false }, eventType: 'press', location: 'standard' });
  const backward = await runtime.handleInput({ kind: 'key', key: 'tab', modifiers: { ctrl: false, alt: false, shift: true, meta: false }, eventType: 'press', location: 'standard' });
  const committed = await runtime.handleInput({ kind: 'key', key: 'enter', modifiers: { ctrl: false, alt: false, shift: false, meta: false }, eventType: 'press', location: 'standard' });

  assert.equal(forward.handled, true);
  assert.equal(backward.handled, true);
  assert.equal(committed.handled, true);
  assert.deepEqual(runtime.state(), { active: 'first' });
  assert.deepEqual(runtime.frame().focusPath, ['column:0', 'first']);
});

test('TUI runtime respects explicit focus order and disabled focus targets', async () => {
  const app = defineTui({
    id: 'ordered-focus',
    init: () => ({ active: 'idle' }),
    update: (_state, message) => ({ state: { active: message.active } }),
    view: (state) => column([
      textInput({
    id: 'disabled',
    presentation: { value: state.active, cursor: 0 },
    keys: { enter: () => ({ active: 'disabled' }) },
    meta: {
        focus: { disabled: true, order: 0 }
    }
}),
      textInput({
    id: 'later',
    presentation: { value: state.active, cursor: 0 },
    keys: { enter: () => ({ active: 'later' }) },
    meta: {
        focus: { order: 2 }
    }
}),
      textInput({
    id: 'first',
    presentation: { value: state.active, cursor: 0 },
    keys: { enter: () => ({ active: 'first' }) },
    meta: {
        focus: { order: 1 }
    }
})
    ])
  });
  const harness = createTerminalHarness({ viewport: { columns: 24, rows: 6 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  const first = await runtime.handleInput({ kind: 'key', key: 'enter', modifiers: { ctrl: false, alt: false, shift: false, meta: false }, eventType: 'press', location: 'standard' });
  const tab = await runtime.handleInput({ kind: 'key', key: 'tab', modifiers: { ctrl: false, alt: false, shift: false, meta: false }, eventType: 'press', location: 'standard' });
  const second = await runtime.handleInput({ kind: 'key', key: 'enter', modifiers: { ctrl: false, alt: false, shift: false, meta: false }, eventType: 'press', location: 'standard' });

  assert.equal(first.handled, true);
  assert.equal(tab.handled, true);
  assert.equal(second.handled, true);
  assert.deepEqual(runtime.frame().focusPath, ['column:0', 'later']);
  assert.deepEqual(runtime.state(), { active: 'later' });
});

test('TUI runtime traps focus inside modal and scoped popover widgets', async () => {
  const modalApp = defineTui({
    id: 'modal-focus-scope',
    init: () => ({ active: 'idle' }),
    update: (_state, message) => ({ state: { active: message.active } }),
    view: (state) => column([
      textInput({ id: 'background', presentation: { value: state.active, cursor: 0 }, keys: { enter: () => ({ active: 'background' }) } }),
      dialog(textInput({ id: 'dialog-field', presentation: { value: state.active, cursor: 0 }, keys: { enter: () => ({ active: 'dialog' }) } }), {
        id: 'dialog',
        modal: true,
        focusPolicy: { returnFocus: 'restore' },
        width: 20,
        height: 4
      })
    ])
  });
  const modalHarness = createTerminalHarness({ viewport: { columns: 30, rows: 8 } });
  const modalRuntime = createTuiRuntime({ app: modalApp, host: modalHarness.host });

  await modalRuntime.start();
  const modalTab = await modalRuntime.handleInput({ kind: 'key', key: 'tab', modifiers: { ctrl: false, alt: false, shift: false, meta: false }, eventType: 'press', location: 'standard' });
  const modalEnter = await modalRuntime.handleInput({ kind: 'key', key: 'enter', modifiers: { ctrl: false, alt: false, shift: false, meta: false }, eventType: 'press', location: 'standard' });

  assert.equal(modalTab.handled, true);
  assert.equal(modalEnter.handled, true);
  assert.deepEqual(modalRuntime.frame().focusPath, ['column:0', 'dialog', 'dialog-field']);
  assert.deepEqual(modalRuntime.frame().accessibility.root.children?.[1]?.scope, {
    kind: 'modal',
    trapsFocus: true,
    obscuresBackground: true
  });
  assert.deepEqual(modalRuntime.state(), { active: 'dialog' });

  const popoverApp = defineTui({
    id: 'popover-focus-scope',
    init: () => ({ active: 'idle' }),
    update: (_state, message) => ({ state: { active: message.active } }),
    view: (state) => column([
      textInput({ id: 'page-field', presentation: { value: state.active, cursor: 0 }, keys: { enter: () => ({ active: 'page' }) } }),
      surface(textInput({ id: 'popover-field', presentation: { value: state.active, cursor: 0 }, keys: { enter: () => ({ active: 'popover' }) } }), {
    id: 'popover',
    meta: {
        layer: {
            zIndex: 10
        },
        focus: { scope: { kind: 'contain' } }
    }
})
    ])
  });
  const popoverHarness = createTerminalHarness({ viewport: { columns: 30, rows: 8 } });
  const popoverRuntime = createTuiRuntime({ app: popoverApp, host: popoverHarness.host });

  await popoverRuntime.start();
  const popoverEnter = await popoverRuntime.handleInput({ kind: 'key', key: 'enter', modifiers: { ctrl: false, alt: false, shift: false, meta: false }, eventType: 'press', location: 'standard' });

  assert.equal(popoverEnter.handled, true);
  assert.deepEqual(popoverRuntime.frame().focusPath, ['column:0', 'popover', 'popover-field']);
  assert.deepEqual(popoverRuntime.frame().accessibility.root.children?.[1]?.scope, {
    kind: 'popover',
    trapsFocus: true
  });
  assert.deepEqual(popoverRuntime.state(), { active: 'popover' });
});

test('dialog owns escape dismissal, initial focus, and focus restoration', async () => {
  const app = defineTui({
    id: 'dialog-lifecycle',
    init: () => ({ open: false, dismissedBy: undefined }),
    update: (state, message) => {
      if (message.kind === 'open') return { state: { ...state, open: true } };
      if (message.kind === 'dismiss') {
        return { state: { open: false, dismissedBy: message.reason } };
      }
      return { state };
    },
    view: (state) => column([
      textInput({
        id: 'dialog-launcher',
        presentation: { value: '', cursor: 0 },
        keys: { enter: () => ({ kind: 'open' }) }
      }),
      ...(state.open
        ? [dialog(column([
            surface(textInput({ id: 'nested-dialog-field', presentation: { value: '', cursor: 0 } }), {
              id: 'preferred-dialog-field'
            }),
            textInput({ id: 'first-dialog-field', presentation: { value: '', cursor: 0 } }),
            textInput({ id: 'preferred-dialog-field', presentation: { value: '', cursor: 0 } })
          ]), {
            id: 'lifecycle-dialog',
            modal: true,
            focusPolicy: {
              initialFocus: { kind: 'element', elementId: 'preferred-dialog-field' },
              returnFocus: 'restore'
            },
            dismissal: {
              escape: true,
              outsidePress: true,
              onDismiss: (reason) => ({ kind: 'dismiss', reason })
            },
            width: 24,
            height: 6
          })]
        : [])
    ])
  });
  const harness = createTerminalHarness({ viewport: { columns: 40, rows: 10 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  assert.deepEqual(runtime.frame().focusPath, ['column:0', 'dialog-launcher']);
  await runtime.handleInput({ kind: 'key', key: 'enter', modifiers: { ctrl: false, alt: false, shift: false, meta: false }, eventType: 'press', location: 'standard' });
  assert.deepEqual(runtime.frame().focusPath, [
    'column:0',
    'lifecycle-dialog',
    'column:0',
    'preferred-dialog-field'
  ]);
  await runtime.handleInput({ kind: 'key', key: 'escape', modifiers: { ctrl: false, alt: false, shift: false, meta: false }, eventType: 'press', location: 'standard' });

  assert.deepEqual(runtime.state(), { open: false, dismissedBy: 'escape' });
  assert.deepEqual(runtime.frame().focusPath, ['column:0', 'dialog-launcher']);
});

test('TUI runtime focuses top-layer context menus and open dropdownMenus', async () => {
  const contextMenuApp = defineTui({
    id: 'context-menu-focus',
    init: () => ({ active: 'idle' }),
    update: (_state, message) => ({ state: { active: message.active } }),
    view: (state) => overlay([
      textInput({ id: 'page-field', presentation: { value: state.active, cursor: 0 }, keys: { enter: () => ({ active: 'page' }) } }),
      contextMenu({
    id: 'actions-menu',
    title: 'Actions',
    presentation: {
      kind: 'open',
      anchor: { kind: 'cursor', row: 1, column: 1 },
      menu: {
        activePath: ['copy'],
        items: [
          { kind: 'action', id: 'copy', label: 'Copy' },
          { kind: 'action', id: 'paste', label: 'Paste' }
        ]
      }
    },
    onAction: (action) => ({
      active: action.kind === 'menu' && action.action.kind === 'activate' && action.action.id === 'copy'
        ? 'context-menu'
        : action.kind
    }),
    meta: {
        layer: {
            zIndex: 10
        }
    }
})
    ], {
      id: 'context-menu-root'
    })
  });
  const contextMenuRuntime = createTuiRuntime({
    app: contextMenuApp,
    host: createTerminalHarness({ viewport: { columns: 24, rows: 5 } }).host
  });

  await contextMenuRuntime.start();
  const contextResult = await contextMenuRuntime.handleInput({ kind: 'key', key: 'enter', modifiers: { ctrl: false, alt: false, shift: false, meta: false }, eventType: 'press', location: 'standard' });

  assert.equal(contextResult.handled, true);
  assert.deepEqual(contextMenuRuntime.frame().focusPath, ['context-menu-root', 'actions-menu']);
  assert.deepEqual(contextMenuRuntime.state(), { active: 'context-menu' });

  const dropdownMenuApp = defineTui({
    id: 'dropdownMenu-focus',
    init: () => ({ active: 'idle' }),
    update: (_state, message) => ({ state: { active: message.active } }),
    view: (state) => overlay([
      textInput({ id: 'page-field', presentation: { value: state.active, cursor: 0 }, keys: { enter: () => ({ active: 'page' }) } }),
      dropdownMenu({
    id: 'theme-dropdownMenu',
    label: 'Theme',
    presentation: {
      kind: 'open',
      active: 'dark',
      menu: {
        activePath: ['dark'],
        items: [
          { kind: 'action', id: 'light', label: 'Light' },
          { kind: 'action', id: 'dark', label: 'Dark' }
        ]
      }
    },
    items: [
        { kind: 'action', id: 'light', label: 'Light' },
        { kind: 'action', id: 'dark', label: 'Dark' }
    ],
    onAction: (action) => ({
      active: action.kind === 'menu' && action.action.kind === 'activate' && action.action.id === 'dark'
        ? 'dropdownMenu'
        : action.kind
    }),
    meta: {
        layer: {
            zIndex: 10
        }
    }
})
    ], {
      id: 'dropdownMenu-root'
    })
  });
  const dropdownMenuRuntime = createTuiRuntime({
    app: dropdownMenuApp,
    host: createTerminalHarness({ viewport: { columns: 24, rows: 5 } }).host
  });

  await dropdownMenuRuntime.start();
  const dropdownMenuResult = await dropdownMenuRuntime.handleInput({ kind: 'key', key: 'enter', modifiers: { ctrl: false, alt: false, shift: false, meta: false }, eventType: 'press', location: 'standard' });

  assert.equal(dropdownMenuResult.handled, true);
  assert.deepEqual(dropdownMenuRuntime.frame().focusPath, ['dropdownMenu-root', 'theme-dropdownMenu']);
  assert.deepEqual(dropdownMenuRuntime.state(), { active: 'dropdownMenu' });
});

test('TUI runtime traverses multiple custom focus targets within one widget', async () => {
  const renderer = {
    render({ buffer, bounds }) {
      buffer.write(bounds.row, bounds.column, [{ text: 'AB' }]);
    },
    accessibility({ id, focused }) {
      return {
        id,
        role: 'application',
        label: 'Custom focus regions',
        ...(focused ? { focused } : {})
      };
    },
    focusTargets({ bounds }) {
      return [
        {
          id: 'left',
          bounds: { row: bounds.row, column: bounds.column, width: 1, height: 1 },
          order: 2
        },
        {
          id: 'right',
          bounds: { row: bounds.row, column: bounds.column + 1, width: 1, height: 1 },
          order: 1
        }
      ];
    }
  };
  const app = defineTui({
    id: 'custom-focus-targets',
    init: () => ({}),
    update: (state) => ({ state }),
    view: () => custom({ id: 'custom-board', renderer })
  });
  const harness = createTerminalHarness({ viewport: { columns: 10, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  assert.deepEqual(runtime.frame().focusPath, ['custom-board', 'right']);

  await runtime.handleInput({ kind: 'key', key: 'tab', modifiers: { ctrl: false, alt: false, shift: false, meta: false }, eventType: 'press', location: 'standard' });
  assert.deepEqual(runtime.frame().focusPath, ['custom-board', 'left']);
});

test('TUI frame accessibility uses widget metadata and marks only the active focus target', async () => {
  const app = defineTui({
    id: 'a11y-frame',
    init: () => ({ active: 'idle' }),
    update: (_state, message) => ({ state: { active: message.active } }),
    view: (state) => column([
      textInput({
    id: 'first-field',
    presentation: { value: state.active, cursor: 0 },
    onSubmit: () => ({ active: 'first' }),
    meta: {
        accessibility: {
            id: 'first-field',
            role: 'textbox',
            label: 'First field',
            description: 'Primary input'
        }
    }
}),
      list({
        projectItem: (item) => ({ id: String(item), label: String(item) }),
        id: 'choices',
        items: ['Alpha', 'Beta'],
        selectedId: 'Beta',
        onAction: (action) => ({ active: ['alpha', 'beta'][action.index] ?? 'none' })
      }),
      table({ id: 'grid', rows: [['A1', 'B1']], getRowId: (_row, index) => String(index) })
    ])
  });
  const harness = createTerminalHarness({ viewport: { columns: 24, rows: 8 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  await runtime.handleInput({ kind: 'key', key: 'tab', modifiers: { ctrl: false, alt: false, shift: false, meta: false }, eventType: 'press', location: 'standard' });
  const snapshot = runtime.frame().accessibility;
  const first = snapshot.root.children[0];
  const choices = snapshot.root.children[1];
  const tableNode = snapshot.root.children[2];

  assert.equal(snapshot.source, 'tui');
  assert.deepEqual(snapshot.focusPath, ['column:0', 'choices']);
  assert.equal(first?.label, 'First field');
  assert.equal(first?.description, 'Primary input');
  assert.equal(first?.focused, undefined);
  assert.equal(choices?.role, 'listbox');
  assert.equal(choices?.focused, true);
  assert.deepEqual(choices?.children?.map((node) => [node.role, node.label, node.selected]), [
    ['option', 'Alpha', false],
    ['option', 'Beta', true]
  ]);
  assert.equal(tableNode?.role, 'table');
  assert.equal(tableNode?.children?.[0]?.children?.[1]?.value, 'B1');
});

test('TUI runtime uses app-level accessibility descriptions for frames and exits', async () => {
  const app = defineTui({
    id: 'custom-a11y',
    init: () => ({ label: 'ready' }),
    update: (state) => ({ state, exit: {} }),
    view: (state) => textInput({ id: 'custom-field', presentation: { value: state.label, cursor: 0 }, onSubmit: () => ({ done: true }) }),
    accessibility: {
      describe: (state) => ({
        schemaVersion: 'terminal-ui.accessible-snapshot.v1',
        source: 'tui',
        title: 'Custom \u001B[31maccessibility\u001B[0m',
        root: {
          id: 'custom-root',
          role: 'application',
          label: `Accessible \u001B[31m${state.label}\u001B[0m`,
          children: [{ id: 'custom-status', role: 'status', label: state.label }]
        },
        focusPath: ['custom-root', 'custom-status'],
        diagnostics: []
      })
    }
  });
  const harness = createTerminalHarness({ viewport: { columns: 20, rows: 3 } });
  const running = runTui(app, harness.host);

  await waitUntil(() => harness.frames().length === 1);
  assert.match(renderFramePlain(harness.frames()[0]), /ready/);
  assert.equal(harness.frames()[0].accessibility.title, 'Custom accessibility');
  assert.equal(harness.frames()[0].accessibility.root.id, 'custom-root');
  assert.equal(harness.frames()[0].accessibility.root.label, 'Accessible ready');
  assert.deepEqual(harness.frames()[0].accessibility.focusPath, ['custom-root', 'custom-status']);
  assert.equal(validateAccessibleSnapshot(harness.frames()[0].accessibility).ok, true);

  harness.host.input('\r');
  const exit = await running;

  assert.equal(exit.status, 'completed');
  assert.equal(exit.snapshot.root.id, 'custom-root');
  assert.equal(exit.snapshot.root.label, 'Accessible ready');
});

test('TUI runtime falls back when app-level accessibility is structurally invalid', async () => {
  const app = defineTui({
    id: 'invalid-custom-a11y',
    init: () => ({ label: 'ready' }),
    update: (state) => ({ state }),
    view: (state) => textInput({ id: 'safe-field', presentation: { value: state.label, cursor: 0 } }),
    accessibility: {
      describe: () => ({
        schemaVersion: 'terminal-ui.accessible-snapshot.v1',
        source: 'tui',
        root: { id: 'custom-root', role: 'application', label: 'Custom root' },
        focusPath: ['missing-root'],
        diagnostics: []
      })
    }
  });
  const harness = createTerminalHarness({ viewport: { columns: 20, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  const snapshot = runtime.frame().accessibility;

  assert.equal(snapshot.root.id, 'safe-field');
  assert.equal(snapshot.diagnostics[0]?.code, 'ACCESSIBLE_SNAPSHOT_INVALID');
  assert.equal(validateAccessibleSnapshot(snapshot).ok, true);
});

test('TUI rendering windows large list and table widgets to visible height', () => {
  const manyItems = Array.from({ length: 1000 }, (_value, index) => `Item ${index}`);
  const frame = renderElementFrame(column([
    list({ id: 'many-items', items: manyItems, projectItem: (item) => ({ id: item, label: item }), selectedId: 'Item 990' }),
    table({ id: 'many-rows', rows: manyItems.map((item) => [item, 'value']), getRowId: (_row, index) => String(index) })
  ]), { columns: 24, rows: 8 });
  const output = renderFramePlain(frame);
  const listNode = frame.accessibility.root.children[0];
  const tableNode = frame.accessibility.root.children[1];

  assert.match(output, /Item 990/);
  assert.doesNotMatch(output, /Item 0\n Item 1\n Item 2\n Item 3\n Item 4\n Item 5\n Item 6\n Item 7\n Item 8/);
  assert.ok(frame.cells.length <= frame.width * frame.height);
  assert.equal(listNode?.children?.length, 4);
  assert.equal(tableNode?.children?.length, 4);
  assert.equal(listNode?.description, 'Showing 989-992 of 1000 items.');
  assert.equal(tableNode?.description, 'Showing 1-4 of 1000 rows.');
});

test('viewport widgets render a clipped scrolled window into child content', () => {
  const frame = renderElementFrame(viewport(
    text('row-0\nrow-1\nrow-2\nrow-3', { id: 'viewport-text' }),
    {
      id: 'viewport',
      scrollRow: 1,
      scrollColumn: 2,
      contentRows: 4,
      contentColumns: 8
    }
  ), { columns: 5, rows: 2 });
  const output = renderFramePlain(frame);
  const rightMarker = frame.cells.find((cell) => cell.source?.ownerKind === 'viewport' && cell.source.label === 'clip-right');

  assert.equal(output, 'w-1 →\nw-2');
  assert.equal(rightMarker?.text, '→');
  assert.equal(
    frame.accessibility.root.description,
    'Showing rows 2-3 of 4, columns 3-7 of 8.'
  );
});

test('viewport widgets keep offscreen content from leaking into neighboring layout', () => {
  const frame = renderElementFrame(row([
    viewport(
      text('left-0\nleft-1\nleft-2', { id: 'left-content' }),
      { id: 'left-window', scrollRow: 2, contentRows: 3 }
    ),
    text('right', { id: 'right-content' })
  ]), { columns: 12, rows: 1 });
  const output = renderFramePlain(frame);

  assert.match(output, /^left-2right$/u);
  assert.doesNotMatch(output, /left-0|left-1/u);
});

test('viewport widgets expose empty virtual content without rendering child content', () => {
  const frame = renderElementFrame(viewport(
    text('hidden child', { id: 'empty-content' }),
    { id: 'empty-window', contentRows: 0, contentColumns: 8 }
  ), { columns: 5, rows: 3 });
  const output = renderFramePlain(frame);
  const emptyMarker = frame.cells.find((cell) => cell.source?.ownerKind === 'viewport' && cell.source.label === 'empty');

  assert.doesNotMatch(output, /hidden child/u);
  assert.equal(emptyMarker?.text, '∅');
  assert.equal(frame.accessibility.root.description, 'Empty viewport content.');
});

test('viewport clipped-edge indicators do not overwrite visible content cells', () => {
  const frame = renderElementFrame(viewport(
    text('\n\n\n', { id: 'blank-content' }),
    {
      id: 'blank-window',
      scrollRow: 1,
      scrollColumn: 1,
      contentRows: 5,
      contentColumns: 5
    }
  ), { columns: 3, rows: 3 });
  const labels = new Set(frame.cells
    .map((cell) => cell.source?.label)
    .filter((label) => label !== undefined));

  assert.ok(labels.has('clip-top'));
  assert.ok(labels.has('clip-bottom'));
  assert.ok(labels.has('clip-left'));
  assert.ok(labels.has('clip-right'));
});

test('TUI runtime does not reserve escape or ctrlC key events', async () => {
  const app = defineTui({
    id: 'unreserved-keys',
    init: () => ({ ready: true }),
    update: (state) => ({ state }),
    view: () => textInput({ id: 'exit-field', presentation: { value: 'ready', cursor: 0 } })
  });
  const harness = createTerminalHarness({ viewport: { columns: 20, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  const escape = await runtime.handleInput({
    kind: 'key',
    key: 'escape',
    sequence: '\u001B',
    modifiers: { ctrl: false, alt: false, shift: false, meta: false },
    eventType: 'press',
    location: 'standard'
  });
  const ctrlC = await runtime.handleInput({
    kind: 'key',
    key: 'c',
    sequence: '\u0003',
    modifiers: { ctrl: true, alt: false, shift: false, meta: false },
    eventType: 'press',
    location: 'standard'
  });

  assert.equal(escape.handled, false);
  assert.equal(ctrlC.handled, false);
  assert.equal(escape.exit, undefined);
  assert.equal(ctrlC.exit, undefined);
  assert.equal(harness.frames().length, 1);
});

test('TUI runtime decodes input chunks before routing them', async () => {
  const app = defineTui({
    id: 'chunk-input',
    init: () => ({ committed: false }),
    update: (_state, message) => ({ state: { committed: message.committed } }),
    view: (state) => textInput({
      id: 'commit-field',
      presentation: { value: state.committed ? 'committed' : 'pending', cursor: 0 },
      onSubmit: () => ({ committed: true })
    })
  });
  const harness = createTerminalHarness({ viewport: { columns: 20, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  const results = await runtime.handleInputChunk({ data: '\r' });

  assert.equal(results.results.length, 1);
  assert.equal(results.results[0].handled, true);
  assert.deepEqual(runtime.state(), { committed: true });
  assert.match(renderFramePlain(runtime.frame()), /committed/);
});

test('TUI runtime buffers split input chunks before routing them', async () => {
  const app = defineTui({
    id: 'split-chunk-input',
    init: () => ({ committed: false }),
    update: (_state, message) => ({ state: { committed: message.committed } }),
    view: (state) => textInput({
      id: 'split-commit-field',
      presentation: { value: state.committed ? 'committed' : 'pending', cursor: 0 },
      onSubmit: () => ({ committed: true })
    })
  });
  const harness = createTerminalHarness({ viewport: { columns: 20, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  const first = await runtime.handleInputChunk({ data: '\u001B[200~clip' });
  const second = await runtime.handleInputChunk({ data: '\u001B[201~\r' });

  assert.equal(first.results.length, 0);
  assert.equal(second.results.length, 2);
  assert.equal(second.results[0]?.handled, false);
  assert.equal(second.results[1]?.handled, true);
  assert.deepEqual(runtime.state(), { committed: true });
  assert.match(renderFramePlain(runtime.frame()), /committed/);
});

test('TUI runtime ignores non-command paste, focus, and mouse events without corrupting state', async () => {
  const app = defineTui({
    id: 'protocol-input',
    init: () => ({ committed: false }),
    update: (_state, message) => ({ state: { committed: message.committed } }),
    view: (state) => textInput({
      id: 'protocol-field',
      presentation: { value: state.committed ? 'committed' : 'pending', cursor: 0 },
      onSubmit: () => ({ committed: true })
    })
  });
  const harness = createTerminalHarness({ viewport: { columns: 20, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  const ignored = await runtime.handleInputChunk({
    data: '\u001B[200~clip\u001B[201~\u001B[I\u001B[<0;4;5M'
  });
  const committed = await runtime.handleInputChunk({ data: '\r' });

  assert.equal(ignored.results.length, 3);
  assert.equal(ignored.results.every((result) => result.handled === false), true);
  assert.equal(committed.results[0]?.handled, true);
  assert.deepEqual(runtime.state(), { committed: true });
});

test('TUI runtime routes mouse events to widgets under the pointer', async () => {
  const app = defineTui({
    id: 'mouse-routing',
    init: () => ({ clicked: false }),
    update: (_state, message) => ({ state: { clicked: message.clicked } }),
    view: (state) => button({
      id: 'mouse-field',
      label: state.clicked ? 'clicked' : 'idle',
      onPress: () => ({ clicked: true })
    })
  });
  const harness = createTerminalHarness({ viewport: { columns: 20, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  assert.deepEqual(runtime.frame().hitTargets?.[0], {
    id: 'mouse-field:control',
    bounds: { row: 1, column: 1, width: 20, height: 3 },
    focus: { kind: 'focus', path: ['mouse-field'] },
    cursor: 'pointer',
    zIndex: 0
  });
  const press = await runtime.handleInputChunk({ data: '\u001B[<0;1;1M' });
  const release = await runtime.handleInputChunk({ data: '\u001B[<0;1;1m' });

  assert.equal(press.results[0]?.handled, false);
  assert.equal(release.results[0]?.handled, true);
  assert.deepEqual(runtime.state(), { clicked: true });
  assert.match(renderFramePlain(runtime.frame()), /clicked/);
});

test('TUI pointer click activates once on left release and ignores right click or wheel', async () => {
  const app = defineTui({
    id: 'pointer-router-events',
    init: () => ({ clicks: 0 }),
    update: (state, message) => ({ state: { clicks: state.clicks + message.clicks } }),
    view: (state) => button({
      id: 'pointer-field',
      label: `clicks ${state.clicks}`,
      onPress: () => ({ clicks: 1 })
    })
  });
  const harness = createTerminalHarness({ viewport: { columns: 20, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  const leftPress = await runtime.handleInputChunk({ data: '\u001B[<0;1;1M' });
  const release = await runtime.handleInputChunk({ data: '\u001B[<0;1;1m' });
  const rightPress = await runtime.handleInputChunk({ data: '\u001B[<2;1;1M' });
  const wheel = await runtime.handleInputChunk({ data: '\u001B[<64;1;1M' });

  assert.equal(leftPress.results[0]?.handled, false);
  assert.equal(release.results[0]?.handled, true);
  assert.equal(rightPress.results[0]?.handled, false);
  assert.notEqual(wheel.pending, undefined);
  const wheelResults = await runtime.flushInput();
  assert.equal(wheelResults[0]?.handled, false);
  assert.deepEqual(runtime.state(), { clicks: 1 });
});

test('built-in controls expose controlled pointer presentation without duplicate activation', async () => {
  const app = defineTui({
    id: 'controlled-pointer-presentation',
    init: () => ({ pointer: {}, activations: 0 }),
    update: (state, message) => message.kind === 'pointer'
      ? { state: { ...state, pointer: pointerPresentationReducer(state.pointer, message.action) } }
      : { state: { ...state, activations: state.activations + 1 } },
    view: (state) => button({
      id: 'controlled-button',
      label: 'Run',
      onPress: () => ({ kind: 'activate' }),
      pointer: {
        state: state.pointer,
        onAction: (action) => ({ kind: 'pointer', action })
      }
    })
  });
  const harness = createTerminalHarness({ viewport: { columns: 18, rows: 2 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  await runtime.handleInputChunk({ data: '\u001B[<35;2;1M' });
  assert.deepEqual(runtime.state().pointer, { hoveredTargetId: 'controlled-button:control' });

  await runtime.handleInputChunk({ data: '\u001B[<0;2;1M' });
  assert.deepEqual(runtime.state().pointer, {
    hoveredTargetId: 'controlled-button:control',
    pressedTargetId: 'controlled-button:control'
  });

  await runtime.handleInputChunk({ data: '\u001B[<0;2;1m' });
  assert.deepEqual(runtime.state(), {
    pointer: { hoveredTargetId: 'controlled-button:control' },
    activations: 1
  });

  await runtime.handleInputChunk({ data: '\u001B[<35;20;2M' });
  assert.deepEqual(runtime.state().pointer, {});
});

test('disabled controls expose neither activation nor synthetic pointer lifecycle targets', async () => {
  const app = defineTui({
    id: 'disabled-pointer-presentation',
    init: () => ({ events: [] }),
    update: (state, message) => ({ state: { events: [...state.events, message] } }),
    view: (state) => button({
      id: 'disabled-button',
      label: 'Disabled',
      disabled: true,
      onPress: () => ({ kind: 'activate' }),
      pointer: {
        state: {},
        onAction: (action) => ({ kind: 'pointer', action, count: state.events.length })
      }
    })
  });
  const harness = createTerminalHarness({ viewport: { columns: 18, rows: 2 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  assert.deepEqual(runtime.frame().hitTargets ?? [], []);
  await runtime.handleInputChunk({ data: '\u001B[<0;2;1M' });
  await runtime.handleInputChunk({ data: '\u001B[<0;2;1m' });
  assert.deepEqual(runtime.state(), { events: [] });
});

test('TUI pointer targets receive pointerDown and pointerUp lifecycle messages', async () => {
  const renderer = {
    render({ bounds, buffer }) {
      buffer.write(bounds.row, bounds.column, [{ text: 'pointer lifecycle' }]);
    },
    accessibility({ id }) {
      return { id, role: 'button', label: 'pointer lifecycle' };
    },
    hitTargets({ bounds }) {
      return [{
        id: 'lifecycle-hit',
        bounds,
        accepts: ['pointerDown', 'pointerUp'],
        message: (event) => ({
          kind: event.kind,
          button: event.button,
          targetId: event.targetId,
          capturedTargetId: event.capturedTargetId,
          localColumn: event.localColumn
        }),
        cursor: 'pointer'
      }];
    }
  };
  const app = defineTui({
    id: 'pointer-lifecycle-tui',
    init: () => ({ events: [] }),
    update: (state, message) => ({ state: { events: [...state.events, message] } }),
    view: () => custom({ id: 'pointer-lifecycle', renderer })
  });
  const harness = createTerminalHarness({ viewport: { columns: 24, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  const press = await runtime.handleInputChunk({ data: '\u001B[<0;2;1M' });
  const release = await runtime.handleInputChunk({ data: '\u001B[<0;2;1m' });

  assert.equal(press.results[0]?.handled, true);
  assert.equal(release.results[0]?.handled, true);
  assert.deepEqual(runtime.state(), {
    events: [
      {
        kind: 'pointerDown',
        button: 'left',
        targetId: 'lifecycle-hit',
        capturedTargetId: 'lifecycle-hit',
        localColumn: 2
      },
      {
        kind: 'pointerUp',
        button: 'left',
        targetId: 'lifecycle-hit',
        capturedTargetId: 'lifecycle-hit',
        localColumn: 2
      }
    ]
  });
});

test('TUI pointer click counts use clock, stable target identity, and cross-target reset', async () => {
  const renderer = {
    render({ bounds, buffer }) {
      buffer.write(bounds.row, bounds.column, [{ text: 'left right' }]);
    },
    accessibility({ id }) {
      return { id, role: 'group', label: 'click targets' };
    },
    hitTargets({ bounds }) {
      return [
        {
          id: 'left-click',
          bounds: { ...bounds, width: 4 },
          accepts: ['click'],
          message: (event) => ({ target: 'left', clickCount: event.clickCount })
        },
        {
          id: 'right-click',
          bounds: { ...bounds, column: bounds.column + 5, width: 5 },
          accepts: ['click'],
          message: (event) => ({ target: 'right', clickCount: event.clickCount })
        }
      ];
    }
  };
  const app = defineTui({
    id: 'pointer-click-counts',
    init: () => ({ events: [] }),
    update: (state, message) => ({ state: { events: [...state.events, message] } }),
    view: () => custom({ id: 'pointer-click-count-targets', renderer })
  });
  const harness = createTerminalHarness({ viewport: { columns: 20, rows: 2 } });
  const runtime = createTuiRuntime({ app, host: harness.host });
  const click = async (column) => {
    await runtime.handleInput({
      kind: 'mouse', sequence: '', encoding: 'sgr', action: 'press', button: 'left',
      row: 1, column, rawCode: 0, modifiers: { shift: false, alt: false, ctrl: false }
    });
    await runtime.handleInput({
      kind: 'mouse', sequence: '', encoding: 'sgr', action: 'release', button: 'none',
      row: 1, column, rawCode: 0, modifiers: { shift: false, alt: false, ctrl: false }
    });
  };

  await runtime.start();
  await click(1);
  await click(6);
  await click(1);
  harness.clock.advance(501);
  await click(1);
  await click(1);

  assert.deepEqual(runtime.state().events, [
    { target: 'left', clickCount: 1 },
    { target: 'right', clickCount: 1 },
    { target: 'left', clickCount: 1 },
    { target: 'left', clickCount: 1 },
    { target: 'left', clickCount: 2 }
  ]);
});

test('TUI pointer hover emits enter leave and hover when crossing targets', async () => {
  const renderer = {
    render({ bounds, buffer }) {
      buffer.write(bounds.row, bounds.column, [{ text: 'left  right' }]);
    },
    accessibility({ id }) {
      return { id, role: 'group', label: 'hover lifecycle' };
    },
    hitTargets({ bounds }) {
      const accepts = ['enter', 'leave', 'hover'];
      return [
        {
          id: 'left-hit',
          bounds: { ...bounds, width: 5 },
          accepts,
          message: (event) => ({
            kind: event.kind,
            targetId: event.targetId,
            localColumn: event.localColumn
          }),
          cursor: 'pointer'
        },
        {
          id: 'right-hit',
          bounds: { ...bounds, column: bounds.column + 6, width: 5 },
          accepts,
          message: (event) => ({
            kind: event.kind,
            targetId: event.targetId,
            localColumn: event.localColumn
          }),
          cursor: 'pointer'
        }
      ];
    }
  };
  const app = defineTui({
    id: 'hover-lifecycle-tui',
    init: () => ({ events: [] }),
    update: (state, message) => ({ state: { events: [...state.events, message] } }),
    view: () => custom({ id: 'hover-lifecycle', renderer })
  });
  const harness = createTerminalHarness({ viewport: { columns: 24, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  const moveLeft = await runtime.handleInputChunk({ data: '\u001B[<35;2;1M' });
  const moveRight = await runtime.handleInputChunk({ data: '\u001B[<35;8;1M' });
  const moveOutside = await runtime.handleInputChunk({ data: '\u001B[<35;20;1M' });

  assert.equal(moveLeft.results[0]?.handled, true);
  assert.equal(moveRight.results[0]?.handled, true);
  assert.equal(moveOutside.results[0]?.handled, true);
  assert.deepEqual(runtime.state(), {
    events: [
      { kind: 'enter', targetId: 'left-hit', localColumn: 2 },
      { kind: 'hover', targetId: 'left-hit', localColumn: 2 },
      { kind: 'leave', targetId: 'left-hit', localColumn: 8 },
      { kind: 'enter', targetId: 'right-hit', localColumn: 2 },
      { kind: 'hover', targetId: 'right-hit', localColumn: 2 },
      { kind: 'leave', targetId: 'right-hit', localColumn: 14 }
    ]
  });
});

test('TUI pointer targets receive event-aware messages and horizontal wheel deltas', async () => {
  const renderer = {
    render({ bounds, buffer }) {
      buffer.write(bounds.row, bounds.column, [{ text: 'pointer target' }]);
    },
    accessibility({ id }) {
      return { id, role: 'button', label: 'pointer target' };
    },
    hitTargets({ bounds }) {
      return [{
        id: 'event-aware-hit',
        bounds,
        accepts: ['contextMenu', 'scroll'],
        message: (event) => ({
          kind: event.kind,
          button: event.button,
          deltaRows: event.deltaRows,
          deltaColumns: event.deltaColumns,
          localRow: event.localRow,
          localColumn: event.localColumn
        }),
        cursor: 'pointer'
      }];
    }
  };
  const app = defineTui({
    id: 'event-aware-pointer-tui',
    init: () => ({ events: [] }),
    update: (state, message) => ({ state: { events: [...state.events, message] } }),
    view: () => custom({ id: 'event-aware-pointer', renderer })
  });
  const harness = createTerminalHarness({ viewport: { columns: 20, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  const rightPress = await runtime.handleInputChunk({ data: '\u001B[<2;2;1M' });
  const wheelRight = await runtime.handleInputChunk({ data: '\u001B[<67;3;1M' });

  assert.equal(rightPress.results[0]?.handled, true);
  assert.notEqual(wheelRight.pending, undefined);
  const wheelRightResults = await runtime.flushInput();
  assert.equal(wheelRightResults[0]?.handled, true);
  assert.deepEqual(runtime.state(), {
    events: [
      { kind: 'contextMenu', button: 'right', deltaRows: 0, deltaColumns: 0, localRow: 1, localColumn: 2 },
      { kind: 'scroll', button: 'wheelRight', deltaRows: 0, deltaColumns: 1, localRow: 1, localColumn: 3 }
    ]
  });
});

test('TUI wheel routing skips non-scroll child targets and reaches scroll owner', async () => {
  const renderer = {
    render({ bounds, buffer }) {
      buffer.write(bounds.row, bounds.column, [{ text: 'child inside scroll owner' }]);
    },
    accessibility({ id }) {
      return { id, role: 'group', label: 'scroll owner' };
    },
    hitTargets({ bounds }) {
      return [
        {
          id: 'scroll-owner',
          bounds,
          accepts: ['scroll'],
          message: (event) => ({
            kind: 'scroll',
            targetId: event.targetId,
            localColumn: event.localColumn
          }),
          cursor: 'grab'
        },
        {
          id: 'child-button',
          bounds: { ...bounds, width: 8 },
          accepts: ['click'],
          message: () => ({ kind: 'child-click' }),
          cursor: 'pointer',
          zIndex: 1
        }
      ];
    }
  };
  const app = defineTui({
    id: 'wheel-scroll-owner-tui',
    init: () => ({ events: [] }),
    update: (state, message) => ({ state: { events: [...state.events, message] } }),
    view: () => custom({ id: 'wheel-scroll-owner', renderer })
  });
  const harness = createTerminalHarness({ viewport: { columns: 28, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  const wheel = await runtime.handleInputChunk({ data: '\u001B[<65;3;1M' });
  const release = await runtime.handleInputChunk({ data: '\u001B[<0;3;1m' });

  assert.equal(wheel.results.length, 0);
  assert.equal(release.results[0]?.handled, true);
  assert.equal(release.results[1]?.handled, false);
  assert.deepEqual(runtime.state(), {
    events: [
      { kind: 'scroll', targetId: 'scroll-owner', localColumn: 3 }
    ]
  });
});

test('TUI press routing keeps scroll-only content targets from swallowing text pointer targets', async () => {
  const app = defineTui({
    id: 'scroll-content-text-pointer-tui',
    init: () => ({
      scroll: createScrollState({ contentRows: 2, viewportRows: 1 }),
      events: []
    }),
    update: (state, message) => {
      if (message.kind === 'scroll') {
        return {
          state: {
            ...state,
            scroll: applyScrollEvent(state.scroll, message.event),
            events: [...state.events, message]
          }
        };
      }
      return { state: { ...state, events: [...state.events, message] } };
    },
    view: (state) => textArea({
      id: 'scrolling-text-pointer',
      presentation: { value: 'alpha\nbeta', cursor: 0, scroll: state.scroll },
      scrollbar: { visible: 'always' },
      onAction: (action) => action.kind === 'scroll'
        ? { kind: 'scroll', event: action.event }
        : { kind: 'text', action }
    })
  });
  const harness = createTerminalHarness({ viewport: { columns: 16, rows: 4 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  const contentTarget = targetById(runtime, 'scrolling-text-pointer:scroll:content');
  const press = await runtime.handleInput({
    kind: 'mouse',
    sequence: '',
    encoding: 'sgr',
    action: 'press',
    button: 'left',
    row: contentTarget.bounds.row,
    column: contentTarget.bounds.column + 4,
    rawCode: 0,
    modifiers: { shift: false, alt: false, ctrl: false }
  });

  assert.equal(press.handled, true);
  assert.equal(runtime.state().events.length, 1);
  assert.equal(runtime.state().events[0].kind, 'text');
  assert.deepEqual(runtime.state().events[0].action, {
    kind: 'pointer',
    action: { kind: 'placeCaret', offset: 2 }
  });
});

test('TUI wheel routing keeps scroll content hits in their overlay region layer', async () => {
  const backgroundValue = Array.from({ length: 20 }, (_, index) => `background ${String(index + 1)}`).join('\n');
  const foregroundContent = column(
    Array.from({ length: 20 }, (_, index) => text(`foreground ${String(index + 1)}`, { id: `foreground-${String(index)}` })),
    { id: 'foreground-column' }
  );
  const app = defineTui({
    id: 'scroll-layer-routing-tui',
    init: () => ({
      background: createScrollState({ contentRows: 20, viewportRows: 1 }),
      foreground: createScrollState({ contentRows: 20, viewportRows: 1 }),
      events: []
    }),
    update: (state, message) => ({
      state: {
        ...state,
        [message.owner]: applyScrollEvent(state[message.owner], message.event),
        events: [...state.events, `${message.owner}:${message.event.target}`]
      }
    }),
    view: (state) => overlay([
      textArea({
        id: 'background-scroll',
        presentation: { value: backgroundValue, cursor: 0, scroll: state.background },
        scrollbar: { visible: 'always' },
        onAction: (action) => ({ owner: 'background', event: action.event })
      }),
      viewport(foregroundContent, {
        id: 'foreground-scroll',
        contentRows: 20,
        scroll: state.foreground,
        onScroll: (event) => ({ owner: 'foreground', event })
      })
    ], { id: 'scroll-layer-root' })
  });
  const harness = createTerminalHarness({ viewport: { columns: 24, rows: 5 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  const backgroundTrack = targetById(runtime, 'background-scroll:scrollbar:vertical:track');
  const result = await runtime.handleInput({
    kind: 'mouse',
    sequence: '',
    encoding: 'sgr',
    action: 'wheel',
    button: 'wheelDown',
    deltaRows: 1,
    deltaColumns: 0,
    row: backgroundTrack.bounds.row,
    column: backgroundTrack.bounds.column,
    rawCode: 65,
    modifiers: { shift: false, alt: false, ctrl: false }
  });

  assert.equal(result.handled, true);
  assert.deepEqual(runtime.state().events, ['foreground:content']);
  assert.equal(runtime.state().foreground.offsetRow, 3);
  assert.equal(runtime.state().background.offsetRow, 0);
});

test('TUI pointer scrolling and scrollbar track input route to controlled text areas', async () => {
  const value = Array.from({ length: 40 }, (_, index) => `line ${String(index + 1).padStart(2, '0')}`).join('\n');
  const app = defineTui({
    id: 'text-area-scroll-pointer-tui',
    init: () => ({
      scroll: createScrollState({ contentRows: 40, viewportRows: 1 }),
      events: []
    }),
    update: (state, message) => ({
      state: {
        scroll: applyScrollEvent(state.scroll, message.event),
        events: [...state.events, `${message.event.source}:${message.event.target}`]
      }
    }),
    view: (state) => textArea({
      id: 'scroll-editor',
presentation: { value, cursor: 0, scroll: state.scroll },
      scrollbar: { visible: 'always' },
      onAction: (action) => ({ event: action.event })
    })
  });
  const harness = createTerminalHarness({ viewport: { columns: 20, rows: 6 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  const contentTarget = targetById(runtime, 'scroll-editor:scroll:content');
  const wheel = await runtime.handleInput({
    kind: 'mouse',
    sequence: '',
    encoding: 'sgr',
    action: 'wheel',
    button: 'wheelDown',
    deltaRows: 1,
    deltaColumns: 0,
    row: contentTarget.bounds.row,
    column: contentTarget.bounds.column,
    rawCode: 64,
    modifiers: { shift: false, alt: false, ctrl: false }
  });
  const wheelUpTarget = targetById(runtime, 'scroll-editor:scroll:content');
  const wheelUp = await runtime.handleInput({
    kind: 'mouse',
    sequence: '',
    encoding: 'sgr',
    action: 'wheel',
    button: 'wheelUp',
    deltaRows: -1,
    deltaColumns: 0,
    row: wheelUpTarget.bounds.row,
    column: wheelUpTarget.bounds.column,
    rawCode: 64,
    modifiers: { shift: false, alt: false, ctrl: false }
  });
  const trackTarget = targetById(runtime, 'scroll-editor:scrollbar:vertical:track');
  const trackPress = await runtime.handleInput({
    kind: 'mouse',
    sequence: '',
    encoding: 'sgr',
    action: 'press',
    button: 'left',
    row: trackTarget.bounds.row + trackTarget.bounds.height - 1,
    column: trackTarget.bounds.column,
    rawCode: 0,
    modifiers: { shift: false, alt: false, ctrl: false }
  });
  const trackDrag = await runtime.handleInput({
    kind: 'mouse',
    sequence: '',
    encoding: 'sgr',
    action: 'drag',
    button: 'left',
    row: trackTarget.bounds.row + trackTarget.bounds.height - 1,
    column: trackTarget.bounds.column,
    rawCode: 32,
    modifiers: { shift: false, alt: false, ctrl: false }
  });

  assert.equal(wheel.handled, true);
  assert.equal(wheelUp.handled, true);
  assert.equal(wheelUp.state.scroll.offsetRow, 0);
  assert.equal(trackPress.handled, true);
  assert.equal(trackDrag.handled, true);
  assert.deepEqual(runtime.state().events, [
    'wheel:content',
    'wheel:content',
    'pointerDown:verticalScrollbarTrack',
    'dragStart:verticalScrollbarTrack'
  ]);
  assert.equal(runtime.state().scroll.offsetRow, 35);
  assert.match(renderFramePlain(runtime.frame()), /line 40/u);
});

test('TUI scrollbar thumb drag preserves the press anchor', async () => {
  const value = Array.from({ length: 40 }, (_, index) => `line ${String(index + 1).padStart(2, '0')}`).join('\n');
  const app = defineTui({
    id: 'text-area-thumb-scroll-pointer-tui',
    init: () => ({
      scroll: createScrollState({ offsetRow: 12, contentRows: 40, viewportRows: 1 }),
      events: []
    }),
    update: (state, message) => ({
      state: {
        scroll: applyScrollEvent(state.scroll, message.event),
        events: [...state.events, `${message.event.source}:${message.event.target}:${message.event.action.kind}`]
      }
    }),
    view: (state) => textArea({
      id: 'thumb-editor',
presentation: { value, cursor: 0, scroll: state.scroll },
      scrollbar: { visible: 'always' },
      onAction: (action) => ({ event: action.event })
    })
  });
  const harness = createTerminalHarness({ viewport: { columns: 20, rows: 10 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  const thumbTarget = targetById(runtime, 'thumb-editor:scrollbar:vertical:thumb');
  const pressRow = thumbTarget.bounds.row + 1;
  const press = await runtime.handleInput({
    kind: 'mouse',
    sequence: '',
    encoding: 'sgr',
    action: 'press',
    button: 'left',
    row: pressRow,
    column: thumbTarget.bounds.column,
    rawCode: 0,
    modifiers: { shift: false, alt: false, ctrl: false }
  });
  const drag = await runtime.handleInput({
    kind: 'mouse',
    sequence: '',
    encoding: 'sgr',
    action: 'drag',
    button: 'left',
    row: pressRow + 4,
    column: thumbTarget.bounds.column,
    rawCode: 32,
    modifiers: { shift: false, alt: false, ctrl: false }
  });

  assert.equal(press.handled, true);
  assert.equal(drag.handled, true);
  assert.deepEqual(runtime.state().events, [
    'pointerDown:verticalScrollbarThumb:setOffset',
    'dragStart:verticalScrollbarThumb:setOffset'
  ]);
  assert.equal(runtime.state().scroll.offsetRow, 27);
});

test('TUI scrollbar thumb routing stays above its track inside elevated regions', async () => {
  const value = Array.from({ length: 40 }, (_, index) => `line ${String(index + 1).padStart(2, '0')}`).join('\n');
  const app = defineTui({
    id: 'elevated-thumb-scroll-pointer-tui',
    init: () => ({
      scroll: createScrollState({ offsetRow: 12, contentRows: 40, viewportRows: 1 }),
      events: []
    }),
    update: (state, message) => ({
      state: {
        scroll: applyScrollEvent(state.scroll, message.event),
        events: [...state.events, `${message.event.source}:${message.event.target}`]
      }
    }),
    view: (state) => textArea({
    id: 'elevated-thumb-editor',
presentation: { value, cursor: 0, scroll: state.scroll },
    scrollbar: { visible: 'always' },
    onAction: (action) => ({ event: action.event }),
    meta: {
        layer: {
            zIndex: 10
        }
    }
})
  });
  const harness = createTerminalHarness({ viewport: { columns: 20, rows: 10 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  const thumbTarget = targetById(runtime, 'elevated-thumb-editor:scrollbar:vertical:thumb');
  const press = await runtime.handleInput({
    kind: 'mouse',
    sequence: '',
    encoding: 'sgr',
    action: 'press',
    button: 'left',
    row: thumbTarget.bounds.row,
    column: thumbTarget.bounds.column,
    rawCode: 0,
    modifiers: { shift: false, alt: false, ctrl: false }
  });

  assert.equal(press.handled, true);
  assert.deepEqual(runtime.state().events, ['pointerDown:verticalScrollbarThumb']);
});

test('TUI runtime batches decoded wheel bursts into one accelerated frame update', async () => {
  const value = Array.from({ length: 80 }, (_, index) => `line ${String(index + 1).padStart(2, '0')}`).join('\n');
  const app = defineTui({
    id: 'text-area-scroll-burst-tui',
    init: () => ({
      scroll: createScrollState({ contentRows: 80, viewportRows: 1 })
    }),
    update: (state, message) => ({
      state: {
        scroll: applyScrollEvent(state.scroll, message.event)
      }
    }),
    view: (state) => textArea({
      id: 'scroll-editor',
presentation: { value, cursor: 0, scroll: state.scroll },
      scrollbar: { visible: 'always' },
      onAction: (action) => ({ event: action.event })
    })
  });
  const harness = createTerminalHarness({ viewport: { columns: 20, rows: 6 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  const contentTarget = targetById(runtime, 'scroll-editor:scroll:content');
  const wheelDown = `\u001B[<65;${String(contentTarget.bounds.column)};${String(contentTarget.bounds.row)}M`;
  const batch = await runtime.handleInputChunk({ data: wheelDown.repeat(3) });
  assert.notEqual(batch.pending, undefined);
  const results = await runtime.flushInput();

  assert.equal(batch.results.length, 0);
  assert.equal(results.length, 1);
  assert.equal(results.every((result) => result.handled), true);
  assert.equal(runtime.state().scroll.offsetRow, 9);
  assert.equal(harness.frames().length, 2);
  assert.match(renderFramePlain(runtime.frame()), /line 10/u);
});

test('TUI runtime coalesces compatible wheel packets across terminal reads', async () => {
  const value = Array.from({ length: 80 }, (_, index) => `line ${String(index + 1).padStart(2, '0')}`).join('\n');
  const app = defineTui({
    id: 'cross-read-wheel-batch-tui',
    init: () => ({ scroll: createScrollState({ contentRows: 80, viewportRows: 1 }) }),
    update: (state, message) => ({ state: { scroll: applyScrollEvent(state.scroll, message.event) } }),
    view: (state) => textArea({
      id: 'cross-read-editor',
      presentation: { value, cursor: 0, scroll: state.scroll },
      scrollbar: { visible: 'always' },
      onAction: (action) => ({ event: action.event })
    })
  });
  const harness = createTerminalHarness({ viewport: { columns: 20, rows: 6 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  const contentTarget = targetById(runtime, 'cross-read-editor:scroll:content');
  const wheelDown = `\u001B[<65;${String(contentTarget.bounds.column)};${String(contentTarget.bounds.row)}M`;
  const first = await runtime.handleInputChunk({ data: wheelDown });
  const second = await runtime.handleInputChunk({ data: wheelDown });
  const third = await runtime.handleInputChunk({ data: wheelDown });

  assert.equal(first.results.length, 0);
  assert.equal(second.results.length, 0);
  assert.equal(third.results.length, 0);
  assert.equal(third.pending, first.pending);
  assert.deepEqual(runtime.metrics(), {
    decodedInputEvents: 3,
    wheelPackets: 3,
    dispatchedMessages: 0,
    stateUpdates: 0,
    frameCommits: 1,
    effects: { active: 0, queued: 0, rejected: 0 }
  });

  harness.clock.advance(8);
  const results = await third.pending;

  assert.equal(results?.length, 1);
  assert.equal(results?.[0]?.handled, true);
  assert.equal(runtime.state().scroll.offsetRow, 9);
  assert.deepEqual(runtime.metrics(), {
    decodedInputEvents: 3,
    wheelPackets: 3,
    dispatchedMessages: 1,
    stateUpdates: 1,
    frameCommits: 2,
    effects: { active: 0, queued: 0, rejected: 0 }
  });
  assert.equal(harness.frames().length, 2);
});

test('TUI runtime flushes pending wheel input before keyboard input', async () => {
  const value = Array.from({ length: 40 }, (_, index) => `line ${String(index + 1).padStart(2, '0')}`).join('\n');
  const app = defineTui({
    id: 'wheel-key-barrier-tui',
    init: () => ({ scroll: createScrollState({ contentRows: 40, viewportRows: 1 }), keys: 0 }),
    update: (state, message) => message.kind === 'scroll'
      ? { state: { ...state, scroll: applyScrollEvent(state.scroll, message.event) } }
      : { state: { ...state, keys: state.keys + 1 } },
    inputBindings: [{
      id: 'count-key',
      phase: 'beforeFocus',
      triggers: [{ kind: 'key', key: 'enter' }],
      message: { kind: 'key' }
    }],
    view: (state) => textArea({
      id: 'barrier-editor',
      presentation: { value, cursor: 0, scroll: state.scroll },
      onAction: (action) => action.kind === 'scroll' ? { kind: 'scroll', event: action.event } : undefined
    })
  });
  const harness = createTerminalHarness({ viewport: { columns: 20, rows: 6 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  const contentTarget = targetById(runtime, 'barrier-editor:scroll:content');
  await runtime.handleInputChunk({
    data: `\u001B[<65;${String(contentTarget.bounds.column)};${String(contentTarget.bounds.row)}M`
  });
  const key = await runtime.handleInputChunk({ data: '\r' });

  assert.equal(key.results.length, 2);
  assert.equal(key.results.every((result) => result.handled), true);
  assert.equal(runtime.state().scroll.offsetRow, 3);
  assert.equal(runtime.state().keys, 1);
  assert.deepEqual(runtime.metrics(), {
    decodedInputEvents: 2,
    wheelPackets: 1,
    dispatchedMessages: 2,
    stateUpdates: 2,
    frameCommits: 3,
    effects: { active: 0, queued: 0, rejected: 0 }
  });
});

test('TUI routed wheel events honor widget scroll policy line steps', async () => {
  const value = Array.from({ length: 40 }, (_, index) =>
    `line ${String(index + 1).padStart(2, '0')} ${'x'.repeat(60)}`
  ).join('\n');
  const app = defineTui({
    id: 'text-area-scroll-policy-lines-tui',
    init: () => ({
      scroll: createScrollState({ contentRows: 40, contentColumns: 80, viewportRows: 1, viewportColumns: 1 }),
      event: undefined
    }),
    update: (state, message) => ({
      state: {
        scroll: applyScrollEvent(state.scroll, message.event),
        event: message.event
      }
    }),
    view: (state) => textArea({
      id: 'scroll-editor',
presentation: { value, cursor: 0, scroll: state.scroll },
      scrollbar: { visible: 'always' },
      scrollPolicy: { wheel: { rows: 8, columns: 5 } },
      onAction: (action) => ({ event: action.event })
    })
  });
  const harness = createTerminalHarness({ viewport: { columns: 22, rows: 6 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  const contentTarget = targetById(runtime, 'scroll-editor:scroll:content');
  const down = await runtime.handleInput({
    kind: 'mouse',
    sequence: '',
    encoding: 'sgr',
    action: 'wheel',
    button: 'wheelDown',
    deltaRows: 1,
    deltaColumns: 0,
    row: contentTarget.bounds.row,
    column: contentTarget.bounds.column,
    rawCode: 65,
    modifiers: { shift: false, alt: false, ctrl: false }
  });
  const right = await runtime.handleInput({
    kind: 'mouse',
    sequence: '',
    encoding: 'sgr',
    action: 'wheel',
    button: 'wheelRight',
    deltaRows: 0,
    deltaColumns: 1,
    row: contentTarget.bounds.row,
    column: contentTarget.bounds.column,
    rawCode: 67,
    modifiers: { shift: false, alt: false, ctrl: false }
  });

  assert.equal(down.handled, true);
  assert.equal(right.handled, true);
  assert.deepEqual(runtime.state().event.action, { kind: 'scrollLines', columns: 5 });
  assert.equal(runtime.state().scroll.offsetRow, 8);
  assert.equal(runtime.state().scroll.offsetColumn, 5);
  assert.match(renderFramePlain(runtime.frame()), /09 x/u);
});

test('TUI routed horizontal text area scroll uses the editable viewport after gutters', async () => {
  const value = '01234567890123456789';
  const app = defineTui({
    id: 'text-area-horizontal-gutter-scroll-tui',
    init: () => ({
      scroll: createScrollState({}),
      event: undefined
    }),
    update: (state, message) => ({
      state: {
        scroll: applyScrollEvent(state.scroll, message.event),
        event: message.event
      }
    }),
    view: (state) => textArea({
      id: 'horizontal-gutter-editor',
      lineNumbers: true,
      presentation: { value, cursor: 0, scroll: state.scroll },
      scrollbar: { visible: 'always', axis: 'both' },
      scrollPolicy: { wheel: { rows: 1, columns: 1 } },
      onAction: (action) => ({ event: action.event })
    })
  });
  const harness = createTerminalHarness({ viewport: { columns: 14, rows: 4 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  const contentTarget = targetById(runtime, 'horizontal-gutter-editor:scroll:content');
  const editableViewportColumns = contentTarget.bounds.width - 5;
  for (let index = 0; index < 20; index += 1) {
    await runtime.handleInput({
      kind: 'mouse',
      sequence: '',
      encoding: 'sgr',
      action: 'wheel',
      button: 'wheelRight',
      deltaRows: 0,
      deltaColumns: 1,
      row: contentTarget.bounds.row,
      column: contentTarget.bounds.column + 1,
      rawCode: 67,
      modifiers: { shift: false, alt: false, ctrl: false }
    });
  }

  assert.equal(runtime.state().event.scroll.viewportColumns, editableViewportColumns);
  assert.equal(runtime.state().scroll.offsetColumn, value.length - editableViewportColumns);
});

test('TUI routed wheel events support page-based widget scroll policy', async () => {
  const value = Array.from({ length: 40 }, (_, index) => `line ${String(index + 1).padStart(2, '0')}`).join('\n');
  const app = defineTui({
    id: 'text-area-scroll-policy-pages-tui',
    init: () => ({
      scroll: createScrollState({ contentRows: 40, viewportRows: 1 })
    }),
    update: (state, message) => ({
      state: {
        scroll: applyScrollEvent(state.scroll, message.event)
      }
    }),
    view: (state) => textArea({
      id: 'scroll-editor',
presentation: { value, cursor: 0, scroll: state.scroll },
      scrollbar: { visible: 'always' },
      scrollPolicy: { wheel: { unit: 'page', rows: 1 } },
      onAction: (action) => ({ event: action.event })
    })
  });
  const harness = createTerminalHarness({ viewport: { columns: 20, rows: 6 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  const contentTarget = targetById(runtime, 'scroll-editor:scroll:content');
  const down = await runtime.handleInput({
    kind: 'mouse',
    sequence: '',
    encoding: 'sgr',
    action: 'wheel',
    button: 'wheelDown',
    deltaRows: 1,
    deltaColumns: 0,
    row: contentTarget.bounds.row,
    column: contentTarget.bounds.column,
    rawCode: 65,
    modifiers: { shift: false, alt: false, ctrl: false }
  });

  assert.equal(down.handled, true);
  assert.equal(runtime.state().scroll.offsetRow, 5);
  assert.match(renderFramePlain(runtime.frame()), /line 06/u);
});

test('TUI routed tree scroll events carry normalized rendered viewport metrics', async () => {
  const nodes = Array.from({ length: 6 }, (_value, index) => ({
    id: `node-${String(index)}`,
    label: `Node ${String(index + 1)}`,
    kind: 'leaf'
  }));
  const app = defineTui({
    id: 'tree-scroll-pointer-tui',
    init: () => ({
      tree: { nodes, scroll: createScrollState({}) },
      event: undefined
    }),
    update: (state, message) => ({
      state: {
        tree: treeReducer(state.tree, message.action),
        event: message.action.kind === 'scroll' ? message.action.event : state.event
      }
    }),
    view: (state) => tree({
      id: 'tree-scroll',
      ...treeScrollablePresentation(state.tree),
      scrollbar: { visible: 'always' },
      onAction: (action) => ({ action })
    })
  });
  const harness = createTerminalHarness({ viewport: { columns: 18, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  const contentTarget = targetById(runtime, 'tree-scroll:scroll:content');
  const result = await runtime.handleInput({
    kind: 'mouse',
    sequence: '',
    encoding: 'sgr',
    action: 'wheel',
    button: 'wheelDown',
    deltaRows: 1,
    deltaColumns: 0,
    row: contentTarget.bounds.row,
    column: contentTarget.bounds.column,
    rawCode: 64,
    modifiers: { shift: false, alt: false, ctrl: false }
  });

  assert.equal(result.handled, true);
  assert.equal(runtime.state().event.scroll.contentRows, nodes.length);
  assert.equal(runtime.state().event.scroll.viewportRows, 3);
  assert.equal(runtime.state().tree.scroll.offsetRow, 3);
  assert.match(renderFramePlain(runtime.frame()), /Node 4/u);
});

test('TUI routed context menu scroll events use fixed title chrome and shared scroll policy', async () => {
  const items = Array.from({ length: 8 }, (_value, index) => ({
    kind: 'action',
    id: `item-${String(index + 1)}`,
    label: `Item ${String(index + 1)}`
  }));
  const app = defineTui({
    id: 'context-menu-scroll-pointer-tui',
    init: () => ({
      scroll: createScrollState({ contentRows: items.length, viewportRows: 1 }),
      event: undefined
    }),
    update: (state, message) => ({
      state: {
        scroll: message.action.kind === 'scroll' ? applyScrollEvent(state.scroll, message.action.event) : state.scroll,
        event: message.action.kind === 'scroll' ? message.action.event : state.event
      }
    }),
    view: (state) => contextMenu({
      id: 'context-scroll',
      title: 'Actions',
      presentation: {
        kind: 'open',
        anchor: { kind: 'cursor', row: 1, column: 1 },
        menu: { activePath: ['item-1'], items, scroll: state.scroll }
      },
      scrollbar: { visible: 'always' },
      scrollPolicy: { wheel: { rows: 2 } },
      onAction: (action) => ({ action: action.kind === 'menu' ? action.action : action })
    })
  });
  const harness = createTerminalHarness({ viewport: { columns: 20, rows: 4 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  const contentTarget = targetById(runtime, 'context-scroll:popup:menu:scroll:content');
  const result = await runtime.handleInput({
    kind: 'mouse',
    sequence: '',
    encoding: 'sgr',
    action: 'wheel',
    button: 'wheelDown',
    deltaRows: 1,
    deltaColumns: 0,
    row: contentTarget.bounds.row,
    column: contentTarget.bounds.column,
    rawCode: 65,
    modifiers: { shift: false, alt: false, ctrl: false }
  });

  assert.equal(result.handled, true);
  assert.equal(runtime.state().event.scroll.viewportRows, 2);
  assert.equal(runtime.state().scroll.offsetRow, 2);
  const frame = renderFramePlain(runtime.frame());
  assert.match(frame, /Actions/u);
  assert.match(frame, /Item 3/u);
});

test('TUI pointer drag routes to the captured origin target', async () => {
  const renderer = {
    render({ bounds, buffer }) {
      buffer.write(bounds.row, bounds.column, [{ text: 'drag target' }]);
    },
    accessibility({ id }) {
      return { id, role: 'button', label: 'drag target' };
    },
    hitTargets({ bounds }) {
      return [{
        id: 'drag-hit',
        bounds: { ...bounds, width: 4 },
        accepts: ['dragStart', 'dragEnd'],
        message: (event) => ({
          kind: event.kind,
          targetId: event.targetId,
          capturedTargetId: event.capturedTargetId,
          localColumn: event.localColumn
        }),
        cursor: 'pointer'
      }];
    }
  };
  const app = defineTui({
    id: 'drag-pointer-tui',
    init: () => ({ events: [] }),
    update: (state, message) => ({ state: { events: [...state.events, message] } }),
    view: () => custom({ id: 'drag-pointer', renderer })
  });
  const harness = createTerminalHarness({ viewport: { columns: 20, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  const press = await runtime.handleInputChunk({ data: '\u001B[<0;1;1M' });
  const drag = await runtime.handleInputChunk({ data: '\u001B[<32;10;1M' });
  const release = await runtime.handleInputChunk({ data: '\u001B[<0;10;1m' });

  assert.equal(press.results[0]?.handled, false);
  assert.equal(drag.results[0]?.handled, true);
  assert.equal(release.results[0]?.handled, true);
  assert.deepEqual(runtime.state(), {
    events: [
      { kind: 'dragStart', targetId: 'drag-hit', capturedTargetId: 'drag-hit', localColumn: 10 },
      { kind: 'dragEnd', targetId: 'drag-hit', capturedTargetId: 'drag-hit', localColumn: 10 }
    ]
  });
});

test('TUI runtime routes tree row hit targets to node messages', async () => {
  const app = defineTui({
    id: 'tree-mouse-routing',
    init: () => ({ selected: 'none' }),
    update: (_state, message) => ({ state: { selected: message.id } }),
    view: (state) => tree({
      id: 'tree',
      selected: state.selected,
      nodes: [
        { id: 'root', label: 'Root', kind: 'branch', expanded: true, children: [{ id: 'child', label: 'Child', kind: 'leaf' }] }
      ],
      onAction: (action) => action.kind === 'select' ? { id: action.id } : undefined
    })
  });
  const harness = createTerminalHarness({ viewport: { columns: 20, rows: 4 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  const press = await runtime.handleInputChunk({ data: '\u001B[<0;1;2M' });
  const release = await runtime.handleInputChunk({ data: '\u001B[<0;1;2m' });

  assert.equal(press.results[0]?.handled, false);
  assert.equal(release.results[0]?.handled, true);
  assert.deepEqual(runtime.state(), { selected: 'child' });
  assert.match(renderFramePlain(runtime.frame()), /Child/);
});

test('TUI runtime routes tree disclosure and body hit targets separately', async () => {
  const app = defineTui({
    id: 'tree-disclosure-routing',
    init: () => ({ events: [] }),
    update: (state, message) => ({ state: { events: [...state.events, message] } }),
    view: () => tree({
      id: 'tree',
      selected: 'root',
      nodes: [
        { id: 'root', label: 'Root', kind: 'branch', expanded: true, children: [{ id: 'child', label: 'Child', kind: 'leaf' }] }
      ],
      onAction: (action) => ({ kind: 'tree', action })
    })
  });
  const harness = createTerminalHarness({ viewport: { columns: 20, rows: 4 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  await runtime.handleInputChunk({ data: '\u001B[<0;3;1M' });
  const disclosureRelease = await runtime.handleInputChunk({ data: '\u001B[<0;3;1m' });
  await runtime.handleInputChunk({ data: '\u001B[<0;5;1M' });
  const bodyRelease = await runtime.handleInputChunk({ data: '\u001B[<0;5;1m' });

  assert.equal(disclosureRelease.results[0]?.handled, true);
  assert.equal(bodyRelease.results[0]?.handled, true);
  assert.deepEqual(runtime.state(), {
    events: [
      { kind: 'tree', action: { kind: 'toggle', id: 'root' } },
      { kind: 'tree', action: { kind: 'select', id: 'root' } }
    ]
  });
});

test('TUI runtime routes overlapping mouse events to the topmost layer', async () => {
  const app = defineTui({
    id: 'layered-mouse-routing',
    init: () => ({ clicked: 'none' }),
    update: (_state, message) => ({ state: { clicked: message.clicked } }),
    view: () => overlay([
      button({
    id: 'lower-mouse-field',
    label: 'lower',
    onPress: () => ({ clicked: 'lower' }),
    meta: {
        layer: {
            zIndex: 0
        }
    }
}),
      button({
    id: 'upper-mouse-field',
    label: 'upper',
    onPress: () => ({ clicked: 'upper' }),
    meta: {
        layer: {
            zIndex: 20
        }
    }
})
    ], {
      id: 'mouse-layer-root'
    })
  });
  const harness = createTerminalHarness({ viewport: { columns: 20, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  assert.deepEqual(runtime.frame().hitTargets?.map((target) => [target.id, target.zIndex]), [
    ['lower-mouse-field:control', 0],
    ['upper-mouse-field:control', 20]
  ]);
  const press = await runtime.handleInputChunk({ data: '\u001B[<0;1;1M' });
  const release = await runtime.handleInputChunk({ data: '\u001B[<0;1;1m' });

  assert.equal(press.results[0]?.handled, false);
  assert.equal(release.results[0]?.handled, true);
  assert.deepEqual(runtime.state(), { clicked: 'upper' });
});

test('TUI runtime routes same-layer overlay mouse events to the last visible child', async () => {
  const app = defineTui({
    id: 'overlay-same-layer-mouse-routing',
    init: () => ({ clicked: 'none' }),
    update: (_state, message) => ({ state: { clicked: message.clicked } }),
    view: () => overlay([
      button({
        id: 'lower-overlay-field',
        label: 'lower',
        onPress: () => ({ clicked: 'lower' })
      }),
      button({
        id: 'upper-overlay-field',
        label: 'upper',
        onPress: () => ({ clicked: 'upper' })
      })
    ], { id: 'same-layer-overlay' })
  });
  const harness = createTerminalHarness({ viewport: { columns: 20, rows: 3 } });
  const runtime = createTuiRuntime({ app, host: harness.host });

  await runtime.start();
  assert.deepEqual(runtime.frame().hitTargets?.map((target) => target.id), [
    'lower-overlay-field:control',
    'upper-overlay-field:control'
  ]);
  const press = await runtime.handleInputChunk({ data: '\u001B[<0;1;1M' });
  const release = await runtime.handleInputChunk({ data: '\u001B[<0;1;1m' });

  assert.equal(press.results[0]?.handled, false);
  assert.equal(release.results[0]?.handled, true);
  assert.deepEqual(runtime.state(), { clicked: 'upper' });
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
  const harness = createTerminalHarness({ viewport: { columns: 20, rows: 4 } });
  harness.input('\r');

  const exit = await runTui(app, harness.host);

  assert.equal(exit.status, 'error');
  assert.deepEqual(exit.state, { done: true });
  assert.equal(exit.diagnostics.filter((item) => item.code === 'TUI_CLEANUP_FAILED').length, 2);
  assert.equal(harness.restores().length, 1);
  assert.equal(harness.host.stdin.isRawModeEnabled(), false);
});

function targetById(runtime, id) {
  const target = runtime.frame()?.hitTargets?.find((item) => item.id === id);
  if (target === undefined) throw new Error(`Missing hit target ${id}`);
  return target;
}

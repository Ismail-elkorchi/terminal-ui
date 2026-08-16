import assert from 'node:assert/strict';
import test from 'node:test';
import { diagnostic } from '../../dist/diagnostics.js';

import {
  createSessionProtocolPlan,
  defaultSessionProtocolPolicy
} from '../../dist/tui/index.js';
import {
  createBunTerminalHost,
  createNodeTerminalHost,
  resolveTerminalCapabilities,
  createDenoTerminalHost,
  createMemoryTerminalHost,
  restoreTerminalState
} from '../../dist/host/index.js';
import {
  LEGACY_KEYBOARD_PROFILE,
  createProtocolWriter,
  kittyKeyboardProfile,
  decodeMouseReportingState
} from '../../dist/protocol/index.js';
import { applySessionProtocolPolicy } from '../../dist/tui/index.js';

const kittyEvents = kittyKeyboardProfile(3);

function hostFacts(overrides = {}) {
  return {
    runtime: 'node',
    inputIsTty: true,
    outputIsTty: true,
    supportsRawInput: true,
    supportsResizeEvents: true,
    supportsTerminalProtocols: true,
    ...overrides
  };
}

test('memory host captures output and exposes capabilities', async () => {
  const host = createMemoryTerminalHost();
  await host.write({ text: 'hello' });
  assert.equal(host.output(), 'hello');
  assert.equal((await host.getCapabilities()).runtime, 'memory');
});

test('memory host validates the public option fields it consumes', () => {
  assert.doesNotThrow(() => createMemoryTerminalHost({ unknownOption: true }));
  assert.throws(() => createMemoryTerminalHost(null), /options must be an object/u);
  assert.throws(
    () => createMemoryTerminalHost({ supportsClipboardWrite: 'yes' }),
    /supportsClipboardWrite must be a boolean/u
  );
  assert.throws(
    () => createMemoryTerminalHost({ terminalSize: { columns: 0, rows: 1 } }),
    /positive integers/u
  );
  assert.throws(() => createMemoryTerminalHost({ isTty: 'yes' }), /isTty must be a boolean/u);
  assert.throws(() => createMemoryTerminalHost({ env: { TERM: 1 } }), /env values must be strings/u);
  assert.throws(
    () => createMemoryTerminalHost({ observer: { recordFrame: true } }),
    /observer\.recordFrame must be a function/u
  );
});

test('host capability helper distinguishes input and output protocol support', () => {
  const capabilities = resolveTerminalCapabilities({
    host: {
      runtime: 'node',
      inputIsTty: true,
      outputIsTty: true,
      supportsRawInput: false,
      supportsResizeEvents: false,
      supportsTerminalProtocols: true,
      columns: 80
    }
  });

  assert.equal(capabilities.isTty, true);
  assert.equal(capabilities.rawInput.support, 'supported');
  assert.equal(capabilities.rawInput.availability, 'unavailable');
  assert.equal(capabilities.rawInput.diagnostics[0]?.code, 'HOST_CAPABILITY_UNAVAILABLE');
  assert.equal(capabilities.alternateScreen.support, 'unknown');
  assert.equal(capabilities.alternateScreen.availability, 'available');
  assert.equal(capabilities.synchronizedOutput.support, 'unknown');
  assert.equal(capabilities.synchronizedOutput.availability, 'available');
});

test('capability resolution distinguishes support, adapter availability, and environment evidence', () => {
  const detached = resolveTerminalCapabilities({ host: hostFacts({ inputIsTty: false, outputIsTty: false }) });
  assert.equal(detached.isTty, false);
  assert.equal(detached.color.depth, 0);
  assert.deepEqual(
    [detached.alternateScreen.support, detached.alternateScreen.availability],
    ['unsupported', 'unavailable']
  );

  const unknown = resolveTerminalCapabilities({ host: hostFacts({ supportsResizeEvents: false }) });
  assert.deepEqual([unknown.alternateScreen.support, unknown.alternateScreen.availability], ['unknown', 'available']);
  assert.deepEqual([unknown.resize.support, unknown.resize.availability], ['supported', 'unavailable']);

  const dumb = resolveTerminalCapabilities({
    host: hostFacts(),
    environment: { variables: { TERM: 'dumb' } }
  });
  assert.equal(dumb.alternateScreen.support, 'unsupported');
  assert.equal(dumb.alternateScreen.diagnostics[0]?.code, 'HOST_CAPABILITY_UNSUPPORTED');
  assert.equal(dumb.color.depth, 0);

  const xterm = resolveTerminalCapabilities({
    host: hostFacts(),
    environment: { variables: { TERM: 'xterm-256color', TERM_PROGRAM: 'vscode' } }
  });
  assert.equal(xterm.color.depth, 8);
  assert.equal(xterm.alternateScreen.support, 'supported');
  assert.equal(xterm.hyperlinks.support, 'supported');
  assert.equal(xterm.scrollRegion.support, 'unknown');
  assert.equal(xterm.hyperlinks.facts.some((fact) => fact.kind === 'environment'), true);

  const screen = resolveTerminalCapabilities({
    host: hostFacts(),
    environment: { variables: { TERM: 'screen-256color' } }
  });
  assert.equal(screen.alternateScreen.support, 'unknown');

  const misleading = resolveTerminalCapabilities({
    host: hostFacts(),
    environment: { variables: { TERM: 'vendor-terminal', TERM_PROGRAM: 'unknown-program' } }
  });
  assert.equal(misleading.alternateScreen.support, 'unknown');
  assert.equal(misleading.bracketedPaste.support, 'unknown');

  const linux = resolveTerminalCapabilities({
    host: hostFacts(),
    environment: { variables: { TERM: 'linux' } }
  });
  assert.equal(linux.alternateScreen.support, 'supported');
  assert.equal(linux.cursorVisibility.support, 'supported');
  assert.equal(linux.bracketedPaste.support, 'unknown');

  const truecolor = resolveTerminalCapabilities({
    host: hostFacts(),
    environment: { variables: { TERM: 'xterm', COLORTERM: 'truecolor' } }
  });
  assert.equal(truecolor.color.depth, 24);

  const wideAmbiguous = resolveTerminalCapabilities({
    host: hostFacts(),
    widthProfile: { emoji: 'narrow', ambiguous: 'wide' }
  });
  assert.deepEqual(wideAmbiguous.unicode.widthProfile, { emoji: 'narrow', ambiguous: 'wide' });
});

test('color and protocol evidence follow explicit override precedence', () => {
  const emptyNoColor = resolveTerminalCapabilities({
    host: hostFacts(),
    environment: { variables: { TERM: 'xterm-256color', NO_COLOR: '' } }
  });
  const disabledColor = resolveTerminalCapabilities({
    host: hostFacts(),
    environment: { variables: { TERM: 'xterm-256color', NO_COLOR: '1' } }
  });
  const explicitColor = resolveTerminalCapabilities({
    host: hostFacts(),
    environment: { variables: { NO_COLOR: '1' } },
    colorDepth: 24
  });
  const protocol = resolveTerminalCapabilities({
    host: hostFacts(),
    probes: { synchronizedOutput: 'supported' },
    overrides: { synchronizedOutput: false }
  });

  assert.equal(emptyNoColor.color.depth, 8);
  assert.equal(disabledColor.color.depth, 0);
  assert.equal(explicitColor.color.depth, 24);
  assert.equal(protocol.synchronizedOutput.support, 'unsupported');
  assert.equal(protocol.synchronizedOutput.diagnostics[0]?.code, 'HOST_CAPABILITY_UNSUPPORTED');
  assert.deepEqual(protocol.synchronizedOutput.facts.slice(-2).map((fact) => fact.kind), ['probe', 'override']);
});

test('Node capability resolution uses native color depth without overriding explicit configuration', async () => {
  const injectedEnvironment = { COLORTERM: 'truecolor' };
  const detectedEnvironments = [];
  const output = {
    isTTY: true,
    columns: 80,
    rows: 24,
    getColorDepth: (environment) => {
      detectedEnvironments.push(environment);
      return 8;
    },
    write(_chunk, callback) {
      callback();
      return true;
    },
    once() {},
    off() {}
  };
  const detected = createNodeTerminalHost({
    stdin: runtimeInput([]),
    stdout: output,
    stderr: output,
    env: injectedEnvironment
  });
  const explicit = createNodeTerminalHost({
    stdin: runtimeInput([]),
    stdout: output,
    stderr: output,
    capabilities: { colorDepth: 24 }
  });

  assert.equal((await detected.getCapabilities()).color.depth, 8);
  assert.equal((await explicit.getCapabilities()).color.depth, 24);
  assert.equal(detectedEnvironments[0], injectedEnvironment);
  await detected.dispose();
  await explicit.dispose();
});

test('synchronized output requires an explicit probe or override', () => {
  const host = {
    runtime: 'node',
    inputIsTty: true,
    outputIsTty: true,
    supportsRawInput: true,
    supportsResizeEvents: true,
    supportsTerminalProtocols: true
  };
  const probed = resolveTerminalCapabilities({ host, probes: { synchronizedOutput: 'supported' } });
  const forced = resolveTerminalCapabilities({ host, overrides: { synchronizedOutput: true } });

  assert.equal(probed.synchronizedOutput.support, 'supported');
  assert.equal(probed.synchronizedOutput.availability, 'available');
  assert.equal(probed.synchronizedOutput.facts.at(-1)?.kind, 'probe');
  assert.equal(forced.synchronizedOutput.support, 'supported');
  assert.equal(forced.synchronizedOutput.facts.at(-1)?.kind, 'override');
  assert.equal(probed.synchronizedOutput.requiresSessionOperation, false);
});

test('active Kitty discovery consumes only its split response and replays unrelated input', async () => {
  const host = createMemoryTerminalHost();
  host.input('before\u001B[?');
  host.input('7uafter');

  const capabilities = await host.getCapabilities({
    activeProbes: ['keyboardProtocol'],
    probeTimeoutMs: 10
  });
  const input = host.stdin.read()[Symbol.asyncIterator]();
  const first = await input.next();
  const second = await input.next();
  await input.return?.();

  assert.equal(capabilities.keyboardProtocol.support, 'supported');
  assert.equal(capabilities.keyboardProtocol.facts.at(-1)?.kind, 'probe');
  assert.equal(inputText(first.value?.data) + inputText(second.value?.data), 'beforeafter');
  assert.equal(host.output(), '\u001B[?u\u001B[c');
  assert.equal(host.restores().at(-1)?.status, 'restored');
});

test('Kitty discovery records inherited flags and a legacy session establishes its own frame', async () => {
  const host = createMemoryTerminalHost();
  host.input('\u001B[?3u');

  await host.getCapabilities({ activeProbes: ['keyboardProtocol'] });
  const session = await host.beginSession({ id: 'nested-legacy-keyboard' });
  assert.deepEqual(session.initialState.keyboardProfile, kittyEvents);
  assert.equal(session.initialState.provenance.keyboardProfile, 'observed');

  const applied = await session.enableKeyboardProfile(LEGACY_KEYBOARD_PROFILE);
  assert.equal(applied.status, 'applied');
  assert.deepEqual((await session.currentState()).keyboardProfile, LEGACY_KEYBOARD_PROFILE);
  const restored = await session.restore('success');

  assert.equal(restored.status, 'restored');
  assert.match(host.output(), /\u001B\[>0u\u001B\[<u$/u);
  assert.deepEqual(restored.resultingState.keyboardProfile, kittyEvents);
});

test('an assumed legacy keyboard profile is established inside an owned stack frame', async () => {
  const host = createMemoryTerminalHost();
  const session = await host.beginSession({ id: 'assumed-legacy-keyboard' });

  const applied = await session.enableKeyboardProfile(LEGACY_KEYBOARD_PROFILE);
  const restored = await session.restore('success');

  assert.equal(applied.status, 'applied');
  assert.equal(applied.assurance, 'sent');
  assert.equal(host.output(), '\u001B[>0u\u001B[<u');
  assert.equal(Object.isFrozen(restored), true);
  assert.equal(Object.isFrozen(restored.completed), true);
  assert.equal(Object.isFrozen(restored.completed[0]), true);
  assert.deepEqual(restored.completed, [{
    kind: 'keyboardProfile',
    state: LEGACY_KEYBOARD_PROFILE,
    assurance: 'sent'
  }]);
});

test('main-screen keyboard observations cannot suppress alternate-screen frame ownership', async () => {
  const host = createMemoryTerminalHost({
    capabilities: {
      probes: { keyboardProtocol: 'supported' },
      overrides: { alternateScreen: true }
    },
    initialState: { keyboardProfile: kittyEvents }
  });
  const session = await host.beginSession({ id: 'screen-keyboard-ownership' });

  const alternate = await session.enableAlternateScreen();
  const keyboard = await session.enableKeyboardProfile(kittyEvents);

  assert.equal(alternate.status, 'applied');
  assert.equal(keyboard.status, 'applied');
  assert.equal(host.output(), '\u001B[?1049h\u001B[>3u');

  const restored = await session.restore('success');
  assert.equal(restored.status, 'restored');
  assert.equal(host.output(), '\u001B[?1049h\u001B[>3u\u001B[<u\u001B[?1049l');
  assert.deepEqual(restored.resultingState.keyboardProfile, kittyEvents);
});

test('one lease owns and restores independent keyboard frames on both terminal screens', async () => {
  const host = createMemoryTerminalHost({
    capabilities: { probes: { keyboardProtocol: 'supported' } }
  });
  const session = await host.beginSession({ id: 'two-screen-keyboard-frames' });

  await session.enableKeyboardProfile(kittyEvents);
  await session.enableAlternateScreen();
  await session.enableKeyboardProfile(LEGACY_KEYBOARD_PROFILE);
  const restored = await session.restore('success');

  assert.equal(restored.status, 'restored');
  assert.equal(
    host.output(),
    '\u001B[>3u\u001B[?1049h\u001B[>0u\u001B[<u\u001B[?1049l\u001B[<u'
  );
  assert.deepEqual(
    restored.completed.map((operation) => operation.kind),
    ['keyboardProfile', 'alternateScreen', 'keyboardProfile']
  );
});

test('nested leases push and pop keyboard frames on the active screen independently', async () => {
  const host = createMemoryTerminalHost({
    capabilities: { probes: { keyboardProtocol: 'supported' } }
  });
  const outer = await host.beginSession({ id: 'outer-screen-frame' });
  await outer.enableAlternateScreen();
  await outer.enableKeyboardProfile(kittyEvents);

  const inner = await host.beginSession({ id: 'inner-screen-frame' });
  await inner.enableKeyboardProfile(kittyEvents);
  await inner.restore('success');
  await outer.restore('success');

  assert.equal(
    host.output(),
    '\u001B[?1049h\u001B[>3u\u001B[>3u\u001B[<u\u001B[<u\u001B[?1049l'
  );
});

test('active Kitty discovery uses primary device attributes as an unsupported fence', async () => {
  const host = createMemoryTerminalHost();
  host.input('before\u001B[?1;2cafter');

  const capabilities = await host.getCapabilities({
    activeProbes: ['keyboardProtocol'],
    probeTimeoutMs: 10
  });
  const input = host.stdin.read()[Symbol.asyncIterator]();
  const first = await input.next();
  const second = await input.next();
  await input.return?.();

  assert.equal(capabilities.keyboardProtocol.support, 'unsupported');
  assert.equal(inputText(first.value?.data) + inputText(second.value?.data), 'beforeafter');
  assert.equal(host.output(), '\u001B[?u\u001B[c');
});

test('active Kitty discovery is bounded and replays buffered user input after timeout', async () => {
  const host = createMemoryTerminalHost();
  host.input('typed while probing');
  const detection = host.getCapabilities({
    activeProbes: ['keyboardProtocol'],
    probeTimeoutMs: 25
  });
  for (let attempt = 0; attempt < 50 && !host.output().includes('\u001B[?u'); attempt += 1) {
    await Promise.resolve();
  }
  assert.equal(host.output().includes('\u001B[?u'), true);
  host.clock.advance(25);

  const capabilities = await detection;
  const input = host.stdin.read()[Symbol.asyncIterator]();
  const replayed = await input.next();
  await input.return?.();

  assert.equal(capabilities.keyboardProtocol.support, 'unknown');
  assert.equal(capabilities.keyboardProtocol.facts.at(-1)?.kind, 'probe');
  assert.equal(inputText(replayed.value?.data), 'typed while probing');
  assert.equal(host.restores().at(-1)?.status, 'restored');
});

test('a refreshed Kitty probe receives a full timeout budget after response quarantine', async () => {
  const host = createMemoryTerminalHost();
  const firstDetection = host.getCapabilities({
    activeProbes: ['keyboardProtocol'],
    probeTimeoutMs: 25
  });
  for (
    let attempt = 0;
    attempt < 50 && (host.output().match(/\u001B\[\?u/gu)?.length ?? 0) < 1;
    attempt += 1
  ) {
    await Promise.resolve();
  }
  assert.equal(host.output().match(/\u001B\[\?u/gu)?.length, 1);
  host.clock.advance(25);
  const first = await firstDetection;
  assert.equal(first.keyboardProtocol.support, 'unknown');

  const refreshedDetection = host.getCapabilities({
    activeProbes: ['keyboardProtocol'],
    probeTimeoutMs: 25,
    refresh: true
  });
  await Promise.resolve();
  await Promise.resolve();
  host.clock.advance(100);
  for (
    let attempt = 0;
    attempt < 50 && (host.output().match(/\u001B\[\?u/gu)?.length ?? 0) < 2;
    attempt += 1
  ) {
    await Promise.resolve();
  }
  assert.equal(host.output().match(/\u001B\[\?u/gu)?.length, 2);
  host.input('\u001B[?3u');
  const refreshed = await refreshedDetection;

  assert.equal(refreshed.keyboardProtocol.support, 'supported');
  const session = await host.beginSession({ id: 'refreshed-kitty-probe' });
  assert.deepEqual(session.initialState.keyboardProfile, kittyEvents);
  await session.restore('success');
});

test('an inconclusive refreshed Kitty probe cannot retain the previous endpoint profile', async () => {
  const host = createMemoryTerminalHost();
  host.input('\u001B[?3u');
  await host.getCapabilities({ activeProbes: ['keyboardProtocol'], probeTimeoutMs: 25 });

  const refreshedDetection = host.getCapabilities({
    activeProbes: ['keyboardProtocol'],
    probeTimeoutMs: 25,
    refresh: true,
  });
  for (
    let attempt = 0;
    attempt < 50 && (host.output().match(/\u001B\[\?u/gu)?.length ?? 0) < 2;
    attempt += 1
  ) await Promise.resolve();
  host.clock.advance(25);
  const refreshed = await refreshedDetection;
  const session = await host.beginSession({ id: 'inconclusive-refreshed-kitty' });

  assert.equal(refreshed.keyboardProtocol.support, 'unknown');
  assert.deepEqual(session.initialState.keyboardProfile, { kind: 'legacy' });
  assert.equal(session.initialState.provenance.keyboardProfile, 'assumed');
  await session.restore('success');
});

test('terminal mode discovery observes outer state and enables only safely owned features', async () => {
  const host = createMemoryTerminalHost();
  const reports = [
    '\u001B[?25;2$y',
    '\u001B[?1000;2$y',
    '\u001B[?1002;1$y',
    '\u001B[?1003;2$y',
    '\u001B[?1004;1$y',
    '\u001B[?1006;2$y',
    '\u001B[?1049;1$y',
    '\u001B[?2004;1$y',
    '\u001B[?2026;2$y',
    '\u001B[?2027;2$y',
    '\u001B[?1;2c'
  ].join('');
  host.input(`before${reports}after`);

  const capabilities = await host.getCapabilities({ activeProbes: ['terminalModes'] });
  const session = await host.beginSession({ id: 'observed-modes' });
  const input = host.stdin.read()[Symbol.asyncIterator]();
  const replayedBefore = await input.next();
  const replayedAfter = await input.next();
  await input.return?.();

  assert.equal(capabilities.synchronizedOutput.support, 'supported');
  assert.equal(capabilities.unicodeGraphemeMode.support, 'supported');
  assert.equal(capabilities.mouseReporting.support, 'supported');
  assert.equal(inputText(replayedBefore.value?.data) + inputText(replayedAfter.value?.data), 'beforeafter');
  assert.equal(session.initialState.cursorVisible, false);
  assert.equal(session.initialState.alternateScreen, true);
  assert.equal(session.initialState.bracketedPaste, true);
  assert.equal(session.initialState.focusReporting, true);
  assert.deepEqual(session.initialState.mouseReporting, { tracking: 'drag', encoding: 'default' });
  assert.equal(session.initialState.provenance.mouseReporting, 'observed');
  assert.equal(session.initialState.provenance.cursorVisible, 'observed');
  assert.match(host.output(), /\u001B\[\?25\$p/u);
  assert.match(host.output(), /\u001B\[c/u);
  await session.restore('success');
});

test('a refreshed mode observation replaces omitted values from the previous terminal', async () => {
  const host = createMemoryTerminalHost();
  host.input('\u001B[?2027;1$y\u001B[?1;2c');
  const first = await host.getCapabilities({ activeProbes: ['terminalModes'] });
  assert.equal(first.unicodeGraphemeMode.support, 'supported');

  host.input('\u001B[?1;2c');
  const refreshed = await host.getCapabilities({
    activeProbes: ['terminalModes'],
    refresh: true
  });
  const session = await host.beginSession({ id: 'refreshed-terminal-modes' });

  assert.equal(refreshed.unicodeGraphemeMode.support, 'unknown');
  assert.equal(session.initialState.unicodeGraphemeMode, false);
  assert.equal(session.initialState.provenance.unicodeGraphemeMode, 'assumed');
  await session.restore('success');
});

test('capability refresh is rejected while an application terminal lease is active', async () => {
  const host = createMemoryTerminalHost();
  const session = await host.beginSession({ id: 'active-during-refresh' });

  await assert.rejects(
    host.getCapabilities({ refresh: true }),
    /cannot be refreshed while a terminal session is active/u,
  );
  await session.restore('success');
});

test('active terminal capability probes own their complete temporary sessions', async () => {
  const host = createMemoryTerminalHost();
  host.input([
    '\u001B[?25;2$y',
    '\u001B[?1000;2$y',
    '\u001B[?1002;2$y',
    '\u001B[?1003;2$y',
    '\u001B[?1004;2$y',
    '\u001B[?1006;2$y',
    '\u001B[?1049;2$y',
    '\u001B[?2004;2$y',
    '\u001B[?2026;2$y',
    '\u001B[?2027;2$y',
    '\u001B[?3u',
    '\u001B[?1;2c'
  ].join(''));

  const results = await Promise.allSettled([
    host.getCapabilities({ activeProbes: ['terminalModes'] }),
    host.getCapabilities({ activeProbes: ['keyboardProtocol'] })
  ]);

  assert.deepEqual(results.map((result) => result.status), ['fulfilled', 'fulfilled']);
  assert.equal((await host.getCapabilities()).keyboardProtocol.support, 'supported');
  assert.equal(host.restores().length, 2);
  assert.equal(host.restores().every((restore) => restore.status === 'restored'), true);
});

test('cancelling the creator of a capability probe retires its terminal operation', async () => {
  const host = createMemoryTerminalHost();
  const controller = new globalThis.AbortController();
  const detection = host.getCapabilities({
    activeProbes: ['terminalModes'],
    probeTimeoutMs: 10_000,
    signal: controller.signal
  });
  for (let attempt = 0; attempt < 10 && !host.stdin.isRawModeEnabled(); attempt += 1) {
    await Promise.resolve();
  }
  assert.equal(host.stdin.isRawModeEnabled(), true);

  controller.abort(new Error('startup cancelled'));
  await assert.rejects(detection, /startup cancelled/u);
  for (let attempt = 0; attempt < 20 && host.restores().length === 0; attempt += 1) {
    await Promise.resolve();
  }

  assert.equal(host.stdin.isRawModeEnabled(), false);
  assert.equal(host.restores().at(-1)?.status, 'restored');
  const session = await host.beginSession({ id: 'after-cancelled-capability-probe' });
  await session.restore('success');
});

for (const [report, initial, acceptedOperation, rejectedOperation] of [
  ['\u001B[?25;3$y', true, 'show', 'hide'],
  ['\u001B[?25;4$y', false, 'hide', 'show']
]) {
  test(`permanent cursor mode ${report.endsWith('3$y') ? 'set' : 'reset'} permits only its current state`, async () => {
    const host = createMemoryTerminalHost();
    host.input(`${report}\u001B[?1;2c`);
    const capabilities = await host.getCapabilities({ activeProbes: ['terminalModes'] });
    const session = await host.beginSession({ id: `permanent-cursor-${acceptedOperation}` });
    const accepted = acceptedOperation === 'show'
      ? await session.showCursor()
      : await session.hideCursor();
    const rejected = rejectedOperation === 'show'
      ? await session.showCursor()
      : await session.hideCursor();

    assert.equal(capabilities.cursorVisibility.support, 'unsupported');
    assert.equal(session.initialState.cursorVisible, initial);
    assert.equal(accepted.status, 'applied');
    assert.equal(accepted.assurance, 'observed');
    assert.equal(rejected.status, 'rejected');
    assert.doesNotMatch(host.output(), rejectedOperation === 'show' ? /\u001B\[\?25h/u : /\u001B\[\?25l/u);
    await session.restore('success');
  });
}

test('permanent mouse modes reject only transitions that conflict with the fixed state', async () => {
  const host = createMemoryTerminalHost();
  host.input([
    '\u001B[?1000;3$y',
    '\u001B[?1002;2$y',
    '\u001B[?1003;2$y',
    '\u001B[?1006;2$y',
    '\u001B[?1;2c'
  ].join(''));
  const capabilities = await host.getCapabilities({ activeProbes: ['terminalModes'] });
  const session = await host.beginSession({ id: 'permanent-mouse-click' });

  const compatible = await session.enableMouseReporting('click');
  const incompatible = await session.enableMouseReporting('drag');

  assert.equal(capabilities.mouseReporting.support, 'supported');
  assert.equal(compatible.status, 'applied');
  assert.equal(incompatible.status, 'rejected');
  assert.match(incompatible.diagnostic.message, /mode 1000 is permanent/u);
  assert.doesNotMatch(host.output(), /\u001B\[\?1002h/u);
  await session.restore('success');
});

test('partial mouse mode evidence does not claim the complete state was observed', async () => {
  const host = createMemoryTerminalHost();
  host.input('\u001B[?1006;1$y\u001B[?1;2c');

  await host.getCapabilities({ activeProbes: ['terminalModes'] });
  const session = await host.beginSession({ id: 'partial-mouse-evidence' });

  assert.deepEqual(session.initialState.mouseReporting, { tracking: 'none', encoding: 'default' });
  assert.equal(session.initialState.provenance.mouseReporting, 'assumed');
  await session.restore('success');
});

test('injected capability evidence avoids active terminal queries', async () => {
  const host = createMemoryTerminalHost({
    capabilities: { probes: { keyboardProtocol: 'unsupported' } }
  });

  const capabilities = await host.getCapabilities({ activeProbes: ['keyboardProtocol'] });

  assert.equal(capabilities.keyboardProtocol.support, 'unsupported');
  assert.equal(host.output(), '');
  assert.deepEqual(host.restores(), []);
});

test('protocol writer emits typed mouse mode and sanitized title sequences', async () => {
  const host = createMemoryTerminalHost();
  const protocol = createProtocolWriter(protocolSink(host));

  await protocol.setMouseReporting({ tracking: 'drag', encoding: 'sgr' });
  await protocol.setMouseReporting({ tracking: 'none', encoding: 'default' });
  await protocol.pushKeyboardProfile(kittyEvents);
  await protocol.setKeyboardProfile(kittyKeyboardProfile(7));
  await protocol.popKeyboardProfile();
  await protocol.setTitle('Build\t\r\n\u001B[31m');

  assert.match(host.output(), /^\u001B\[\?1003l\u001B\[\?1002l\u001B\[\?1000l\u001B\[\?1006h\u001B\[\?1002h/u);
  assert.match(host.output(), /\u001B\[\?1003l\u001B\[\?1002l\u001B\[\?1000l\u001B\[\?1006l/u);
  assert.match(host.output(), /\u001B\[>3u\u001B\[=7u\u001B\[<u/u);
  assert.equal(host.output().includes('\u001B]0;Build\u0007'), true);
  assert.doesNotMatch(host.output(), /\u001B\[31m/u);
  await assert.rejects(() => protocol.setTitle('x'.repeat(4097)), /must not exceed 4096 code units/u);
});

test('mouse protocol writing keeps tracking and encoding independent', async () => {
  const states = [
    { tracking: 'none', encoding: 'default' },
    { tracking: 'none', encoding: 'sgr' },
    { tracking: 'click', encoding: 'default' },
    { tracking: 'click', encoding: 'sgr' },
    { tracking: 'drag', encoding: 'default' },
    { tracking: 'drag', encoding: 'sgr' },
    { tracking: 'all', encoding: 'default' },
    { tracking: 'all', encoding: 'sgr' }
  ];
  const expected = (state) => [
    '\u001B[?1003l\u001B[?1002l\u001B[?1000l',
    state.encoding === 'sgr' ? '\u001B[?1006h' : '\u001B[?1006l',
    state.tracking === 'none'
      ? ''
      : `\u001B[?${state.tracking === 'click' ? '1000' : state.tracking === 'drag' ? '1002' : '1003'}h`
  ].join('');

  for (const state of states) {
    const writes = [];
    const protocol = createProtocolWriter({ write: (sequence) => { writes.push(sequence); } });
    await protocol.setMouseReporting(state);
    assert.equal(writes.join(''), expected(state));

    const host = createMemoryTerminalHost({
      capabilities: { overrides: { mouseReporting: true } },
      initialState: { mouseReporting: state }
    });
    const session = await host.beginSession({ id: `restore-${state.tracking}-${state.encoding}` });
    await session.enableMouseReporting(state.tracking === 'all' ? 'click' : 'all');
    const restored = await session.restore('success');
    assert.equal(restored.status, 'restored');
    assert.equal(host.output().endsWith(expected(state)), true);
  }
});

test('protocol writer rejects invalid typed protocol parameters', async () => {
  const host = createMemoryTerminalHost();
  const protocol = createProtocolWriter(protocolSink(host));

  await assert.rejects(() => protocol.moveCursor(0, 1), /row must be a positive integer/u);
  await assert.rejects(() => protocol.moveCursor(1, Number.NaN), /column must be a positive integer/u);
  await assert.rejects(
    () => protocol.setMouseReporting({ tracking: 'hover', encoding: 'sgr' }),
    /mouse reporting mode/u
  );
  assert.equal(host.output(), '');
});

test('mouse-reporting normalization preserves canonical state identity', () => {
  const source = { tracking: 'drag', encoding: 'sgr' };
  const canonical = decodeMouseReportingState(source);

  assert.notEqual(canonical, source);
  assert.equal(decodeMouseReportingState(canonical), canonical);
  assert.equal(Object.isFrozen(canonical), true);
});

test('default session protocol requests drag mouse reporting for pointer capture', () => {
  assert.deepEqual(defaultSessionProtocolPolicy.mouseReporting, {
    mode: 'drag',
    requirement: 'optional'
  });
});

test('terminal sessions restore state in protocol-safe order', async () => {
  const snapshot = {
    rawInput: false,
    alternateScreen: false,
    bracketedPaste: false,
    mouseReporting: { tracking: 'none', encoding: 'default' },
    focusReporting: false,
    unicodeGraphemeMode: false,
    keyboardProfile: LEGACY_KEYBOARD_PROFILE,
    cursorVisible: true
  };
  const expectedOperations = [
    'cursorVisible',
    'focusReporting',
    'mouseReporting',
    'bracketedPaste',
    'alternateScreen',
    'rawInput'
  ];

  const host = createMemoryTerminalHost();
  const session = await host.beginSession({ id: 'restore-plan-test' });
  await session.enableRawInput();
  await session.enableAlternateScreen();
  await session.enableBracketedPaste();
  await session.enableMouseReporting('all');
  await session.enableFocusReporting();
  await session.hideCursor();
  const result = await session.restore('success');

  assert.equal(result.status, 'restored');
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.attempted), true);
  assert.equal(Object.isFrozen(result.completed), true);
  assert.equal(result.completed.every((operation) => operation.assurance === 'sent'), true);
  assert.deepEqual(result.completed.map((operation) => operation.kind), expectedOperations);
  assert.deepEqual(withoutProvenance(host.restores()[0]?.requested), snapshot);
});

function protocolSink(host) {
  return { write: (sequence) => host.write({ text: sequence }) };
}

test('session protocol policies plan and apply only requested operations', async () => {
  const host = createMemoryTerminalHost();
  const session = await host.beginSession({ id: 'policy-apply-session' });
  const policy = {
    alternateScreen: 'disabled',
    rawInput: 'required',
    bracketedPaste: 'disabled',
    focusReporting: 'disabled',
    unicodeGraphemeMode: 'disabled',
    keyboard: { profile: LEGACY_KEYBOARD_PROFILE, requirement: 'disabled' },
    cursorVisibility: { visibility: 'hide', requirement: 'disabled' },
    mouseReporting: { mode: 'drag', requirement: 'optional' }
  };

  const plan = createSessionProtocolPlan(policy);
  const result = await applySessionProtocolPolicy(session, policy);

  assert.equal(plan.length, 8);
  assert.equal(result.status, 'ready');
  assert.deepEqual(result.applied.map((item) => item.kind), [
    'rawInput',
    'keyboardProfile',
    'mouseReporting'
  ]);
  assert.equal(result.resultingState.rawInput, true);
  assert.deepEqual(result.resultingState.mouseReporting, { tracking: 'drag', encoding: 'sgr' });
  assert.deepEqual(result.skipped.map((item) => item.kind), [
    'alternateScreen',
    'bracketedPaste',
    'unicodeGraphemeMode',
    'focusReporting',
    'cursorVisibility'
  ]);
  assert.equal(result.diagnostics.some((item) => item.code === 'HOST_PROTOCOL_SKIPPED'), true);
  assert.match(host.output(), /\u001B\[\?1002h/u);
  assert.doesNotMatch(host.output(), /\u001B\[\?1049h/u);
});

test('disabled keyboard enhancement still owns a legacy frame on the alternate screen', async () => {
  const host = createMemoryTerminalHost({
    initialState: { keyboardProfile: kittyEvents }
  });
  const session = await host.beginSession({ id: 'alternate-legacy-keyboard-frame' });
  const result = await applySessionProtocolPolicy(session, {
    alternateScreen: 'required',
    rawInput: 'disabled',
    bracketedPaste: 'disabled',
    focusReporting: 'disabled',
    unicodeGraphemeMode: 'disabled',
    keyboard: { profile: kittyEvents, requirement: 'disabled' },
    cursorVisibility: { visibility: 'unchanged', requirement: 'disabled' },
    mouseReporting: { mode: 'none', requirement: 'disabled' }
  });

  assert.equal(result.status, 'ready');
  assert.deepEqual(result.resultingState.keyboardProfile, LEGACY_KEYBOARD_PROFILE);
  assert.equal(host.output(), '\u001B[?1049h\u001B[>0u');

  const restored = await session.restore('success');
  assert.equal(restored.status, 'restored');
  assert.equal(host.output(), '\u001B[?1049h\u001B[>0u\u001B[<u\u001B[?1049l');
  assert.deepEqual(restored.resultingState.keyboardProfile, kittyEvents);
});

test('session protocol policies fail only required unavailable operations', async () => {
  const host = createDenoTerminalHost({
    stdin: { source: runtimeInput([]), isTty: true },
    stdout: { write: () => {}, isTty: true }
  });
  const session = await host.beginSession({ id: 'policy-required-unavailable' });
  const result = await applySessionProtocolPolicy(session, {
    alternateScreen: 'disabled',
    rawInput: 'required',
    bracketedPaste: 'disabled',
    focusReporting: 'disabled',
    unicodeGraphemeMode: 'disabled',
    keyboard: { profile: LEGACY_KEYBOARD_PROFILE, requirement: 'disabled' },
    cursorVisibility: { visibility: 'hide', requirement: 'disabled' },
    mouseReporting: { mode: 'none', requirement: 'disabled' }
  });

  assert.equal(result.status, 'failed');
  assert.deepEqual(result.applied, [{
    kind: 'keyboardProfile',
    state: LEGACY_KEYBOARD_PROFILE
  }]);
  assert.deepEqual(result.skipped.map((item) => item.kind), [
    'alternateScreen',
    'bracketedPaste',
    'rawInput',
    'unicodeGraphemeMode',
    'mouseReporting',
    'focusReporting',
    'cursorVisibility'
  ]);
  assert.equal(result.diagnostics.some((item) => item.code === 'HOST_PROTOCOL_UNSUPPORTED'), true);
});

test('session protocol diagnostics preserve requested operation and mouse mode', async () => {
  const host = createDenoTerminalHost({
    stdin: { source: runtimeInput([]), isTty: true },
    stdout: { write: () => {}, isTty: false }
  });
  const session = await host.beginSession({ id: 'policy-mouse-unavailable' });
  const result = await applySessionProtocolPolicy(session, {
    alternateScreen: 'disabled',
    rawInput: 'disabled',
    bracketedPaste: 'disabled',
    focusReporting: 'disabled',
    unicodeGraphemeMode: 'disabled',
    keyboard: { profile: LEGACY_KEYBOARD_PROFILE, requirement: 'disabled' },
    cursorVisibility: { visibility: 'hide', requirement: 'disabled' },
    mouseReporting: { mode: 'drag', requirement: 'optional' }
  });

  assert.equal(result.status, 'ready');
  assert.deepEqual(result.applied, [{
    kind: 'keyboardProfile',
    state: LEGACY_KEYBOARD_PROFILE
  }]);
  assert.deepEqual(result.skipped.map((item) => item.kind), [
    'alternateScreen',
    'bracketedPaste',
    'rawInput',
    'unicodeGraphemeMode',
    'mouseReporting',
    'focusReporting',
    'cursorVisibility'
  ]);
  const diagnostic = result.diagnostics.find((item) => item.code === 'HOST_PROTOCOL_UNSUPPORTED');
  assert.equal(diagnostic?.data?.capability, 'mouseReporting');
  assert.equal(diagnostic?.data?.operation, 'mouseReporting');
  assert.equal(diagnostic?.data?.requirement, 'optional');
  assert.equal(diagnostic?.data?.target, 'drag');
});

test('session setup rejects an inherited active mouse encoding the decoder cannot consume', async () => {
  const host = createMemoryTerminalHost({
    initialState: { mouseReporting: { tracking: 'drag', encoding: 'default' } }
  });
  const session = await host.beginSession({ id: 'unsupported-inherited-mouse' });
  const result = await applySessionProtocolPolicy(session, {
    alternateScreen: 'disabled',
    rawInput: 'disabled',
    bracketedPaste: 'disabled',
    focusReporting: 'disabled',
    unicodeGraphemeMode: 'disabled',
    keyboard: { profile: LEGACY_KEYBOARD_PROFILE, requirement: 'disabled' },
    cursorVisibility: { visibility: 'unchanged', requirement: 'disabled' },
    mouseReporting: { mode: 'none', requirement: 'disabled' }
  });

  assert.equal(result.status, 'failed');
  assert.equal(result.diagnostics.at(-1)?.code, 'HOST_PROTOCOL_UNSUPPORTED');
  assert.deepEqual(result.resultingState.mouseReporting, { tracking: 'drag', encoding: 'default' });
  await session.restore('success');
});

test('terminal sessions preserve raw input state that existed before the session', async () => {
  const host = createMemoryTerminalHost();
  host.stdin.setRawMode(true);
  const session = await host.beginSession({ id: 'restore-existing-raw' });

  await session.enableRawInput();
  const result = await session.restore('success');

  assert.equal(result.status, 'restored');
  assert.equal(host.stdin.isRawModeEnabled(), true);
  assert.equal(result.completed.some((operation) => operation.kind === 'rawInput'), false);
  host.stdin.setRawMode(false);
});

test('raw input is observed after mutation before the session reports success', async () => {
  const host = createDenoTerminalHost({
    stdin: {
      source: runtimeInput([]),
      isTty: true,
      setRawMode: () => {},
      isRawModeEnabled: () => false
    },
    stdout: { write: () => {}, isTty: true }
  });
  const session = await host.beginSession({ id: 'raw-input-verification' });

  const result = await session.enableRawInput();

  assert.equal(result.status, 'rejected');
  assert.equal(result.diagnostic.code, 'HOST_PROTOCOL_UNSUPPORTED');
  assert.equal(session.initialState.rawInput, false);
  await session.restore('success');
});

test('Node sessions preserve raw input state observed from the native stream', async () => {
  const changes = [];
  const stdin = Object.assign(runtimeInput([]), {
    isTTY: true,
    isRaw: true,
    setRawMode(enabled) {
      changes.push(enabled);
      this.isRaw = enabled;
    }
  });
  const output = {
    isTTY: true,
    columns: 80,
    rows: 24,
    write(_chunk, callback) {
      callback();
      return true;
    },
    once() {},
    off() {}
  };
  const host = createNodeTerminalHost({ stdin, stdout: output, stderr: output });
  const session = await host.beginSession({ id: 'native-raw-state' });

  assert.equal(session.initialState.rawInput, true);
  await session.enableRawInput();
  const restored = await session.restore('success');

  assert.equal(restored.status, 'restored');
  assert.deepEqual(changes, []);
  assert.equal(stdin.isRaw, true);
  await host.dispose();
});

test('restoration reports observed assurance only for adapter-confirmed raw input', async () => {
  const stdin = Object.assign(runtimeInput([]), {
    isTTY: true,
    isRaw: false,
    setRawMode(enabled) {
      this.isRaw = enabled;
    }
  });
  const output = {
    isTTY: true,
    columns: 80,
    rows: 24,
    write(_chunk, callback) {
      callback();
      return true;
    },
    once() {},
    off() {}
  };
  const host = createNodeTerminalHost({ stdin, stdout: output, stderr: output });
  const session = await host.beginSession({ id: 'observed-raw-restoration' });

  await session.enableRawInput();
  const restored = await session.restore('success');

  assert.deepEqual(restored.completed, [{
    kind: 'rawInput',
    state: false,
    assurance: 'observed'
  }]);
  await host.dispose();
});

test('Node sessions reject a native raw-mode setter that does not change observed state', async () => {
  const changes = [];
  const stdin = Object.assign(runtimeInput([]), {
    isTTY: true,
    isRaw: false,
    setRawMode(enabled) {
      changes.push(enabled);
    }
  });
  const output = {
    isTTY: true,
    columns: 80,
    rows: 24,
    write(_chunk, callback) {
      callback();
      return true;
    },
    once() {},
    off() {}
  };
  const host = createNodeTerminalHost({ stdin, stdout: output, stderr: output });
  const session = await host.beginSession({ id: 'no-op-native-raw-setter' });
  const enabled = await session.enableRawInput();

  assert.equal(enabled.status, 'rejected');
  assert.equal(enabled.diagnostic.code, 'HOST_PROTOCOL_UNSUPPORTED');
  assert.equal((await session.currentState()).rawInput, false);
  assert.deepEqual(changes, [true]);
  assert.equal((await session.restore('success')).status, 'restored');
  assert.deepEqual(changes, [true]);
  await host.dispose();
});

test('nested terminal leases restore to the outer lease state', async () => {
  const host = createMemoryTerminalHost();
  const outer = await host.beginSession({ id: 'outer-lease' });
  await outer.enableAlternateScreen();
  await outer.hideCursor();
  const inner = await host.beginSession({ id: 'inner-lease' });

  assert.equal(inner.initialState.alternateScreen, true);
  assert.equal(inner.initialState.cursorVisible, false);
  assert.equal(inner.initialState.provenance.alternateScreen, 'library_known');
  const inactiveRestore = await outer.restore('success');

  assert.equal(inactiveRestore.status, 'failed');
  assert.equal(inactiveRestore.diagnostics[0]?.code, 'HOST_PROTOCOL_LEASE_INACTIVE');
  assert.equal(host.restores().length, 1);
  assert.equal(host.restores()[0]?.status, 'failed');
  await inner.enableBracketedPaste();
  const innerRestore = await inner.restore('success');

  assert.equal(innerRestore.status, 'restored');
  assert.deepEqual(innerRestore.completed.map((item) => item.kind), ['bracketedPaste']);
  assert.equal(innerRestore.resultingState.alternateScreen, true);
  assert.equal(innerRestore.resultingState.cursorVisible, false);

  const outerRestore = await outer.restore('success');
  assert.equal(outerRestore.status, 'restored');
  assert.deepEqual(outerRestore.completed.map((item) => item.kind), ['cursorVisible', 'alternateScreen']);
  assert.deepEqual(host.restores().map((item) => item.status), ['failed', 'restored', 'restored']);
});

test('emergency recovery completes the recovered session lease', async () => {
  const host = createMemoryTerminalHost();
  const session = await host.beginSession({ id: 'emergency-recovery-session' });
  await session.hideCursor();
  const restoreStarted = Promise.withResolvers();
  const writeRecovery = host.writeRecovery.bind(host);
  let recoveryWrites = 0;
  host.writeRecovery = (output, context) => {
    recoveryWrites += 1;
    if (recoveryWrites === 1) {
      restoreStarted.resolve();
      return new Promise(() => undefined);
    }
    return writeRecovery(output, context);
  };
  const blockedRestore = session.restore('success');
  void blockedRestore.catch(() => undefined);
  await restoreStarted.promise;

  const recovered = await host.recoverTerminalState('error');
  const repeated = await session.restore('success');

  assert.equal(recoveryWrites, 2);
  assert.equal(recovered.status, 'restored');
  assert.equal(repeated.status, 'restored');
  assert.equal(repeated.reason, 'error');
  assert.deepEqual(repeated.diagnostics, []);
  await host.dispose();
});

test('explicit initial terminal facts retain explicit provenance', async () => {
  const host = createMemoryTerminalHost({
    initialState: { alternateScreen: true, cursorVisible: false }
  });
  const session = await host.beginSession({ id: 'explicit-initial-state' });

  assert.equal(session.initialState.alternateScreen, true);
  assert.equal(session.initialState.cursorVisible, false);
  assert.equal(session.initialState.provenance.alternateScreen, 'explicit');
  assert.equal(session.initialState.provenance.cursorVisible, 'explicit');
  assert.equal(Object.isFrozen(session.initialState), true);
  assert.equal(Object.isFrozen(session.initialState.mouseReporting), true);
  assert.equal(Object.isFrozen(session.initialState.keyboardProfile), true);
  assert.equal(Object.isFrozen(session.initialState.provenance), true);
  assert.throws(() => { session.initialState.cursorVisible = true; }, TypeError);
  await session.restore('success');
});

test('explicit raw input state outranks a runtime adapter fallback', async () => {
  const rawModes = [];
  const host = createBunTerminalHost({
    stdin: {
      source: runtimeInput([]),
      isTty: true,
      setRawMode: (enabled) => rawModes.push(enabled)
    },
    stdout: { write: () => {}, isTty: true },
    initialState: { rawInput: true }
  });
  const session = await host.beginSession({ id: 'explicit-raw-input' });

  assert.equal(session.initialState.rawInput, true);
  assert.equal(session.initialState.provenance.rawInput, 'explicit');
  await session.enableRawInput();
  const restored = await session.restore('success');

  assert.equal(restored.status, 'restored');
  assert.deepEqual(rawModes, []);
});

test('session policy enables and restores a supported Kitty keyboard profile', async () => {
  const host = createMemoryTerminalHost({
    capabilities: { probes: { keyboardProtocol: 'supported' } }
  });
  const session = await host.beginSession({ id: 'enhanced-keyboard-session' });
  const result = await applySessionProtocolPolicy(session, {
    alternateScreen: 'disabled',
    rawInput: 'disabled',
    bracketedPaste: 'disabled',
    focusReporting: 'disabled',
    unicodeGraphemeMode: 'disabled',
    keyboard: { profile: kittyEvents, requirement: 'required' },
    cursorVisibility: { visibility: 'unchanged', requirement: 'disabled' },
    mouseReporting: { mode: 'none', requirement: 'disabled' }
  });

  assert.equal(result.status, 'ready');
  assert.deepEqual(result.applied, [{ kind: 'keyboardProfile', state: kittyEvents }]);
  assert.match(host.output(), /\u001B\[>3u/u);

  const restored = await session.restore('success');
  assert.equal(restored.status, 'restored');
  assert.deepEqual(restored.completed, [{
    kind: 'keyboardProfile',
    state: LEGACY_KEYBOARD_PROFILE,
    assurance: 'sent'
  }]);
  assert.match(host.output(), /\u001B\[>3u\u001B\[<u/u);
});

test('stream hosts verify the Kitty flags accepted by the terminal', async () => {
  const output = [];
  const host = createBunTerminalHost({
    stdin: { source: runtimeInput(['\u001B[?3u']), isTty: true },
    stdout: {
      write: (chunk) => output.push(String(chunk)),
      recoveryWrite: (chunk) => output.push(String(chunk)),
      isTty: true
    },
    capabilities: { probes: { keyboardProtocol: 'supported' } }
  });
  const session = await host.beginSession({ id: 'verified-kitty-profile' });

  const result = await session.enableKeyboardProfile(kittyEvents);

  assert.equal(result.status, 'applied');
  assert.equal(result.assurance, 'observed');
  assert.equal(output.join(''), '\u001B[>3u\u001B[?u\u001B[c');
  await session.restore('success');
  await host.dispose();
});

test('stream hosts revert to legacy input when requested Kitty flags are not verified', async () => {
  const output = [];
  const host = createBunTerminalHost({
    stdin: { source: runtimeInput(['\u001B[?1u']), isTty: true },
    stdout: {
      write: (chunk) => output.push(String(chunk)),
      recoveryWrite: (chunk) => output.push(String(chunk)),
      isTty: true
    },
    capabilities: { probes: { keyboardProtocol: 'supported' } }
  });
  const session = await host.beginSession({ id: 'mismatched-kitty-profile' });

  const result = await session.enableKeyboardProfile(kittyEvents);

  assert.equal(result.status, 'rejected');
  assert.equal(result.diagnostic.code, 'HOST_CAPABILITY_UNAVAILABLE');
  assert.equal(output.join(''), '\u001B[>3u\u001B[?u\u001B[c\u001B[=0u');
  const restored = await session.restore('error');
  assert.equal(restored.status, 'restored');
  await host.dispose();
});

test('failed alternate-screen keyboard verification restores its screen-local frame', async () => {
  const output = [];
  const inheritedMain = kittyKeyboardProfile(5);
  const host = createBunTerminalHost({
    stdin: { source: runtimeInput(['\u001B[?1u']), isTty: true },
    stdout: {
      write: (chunk) => output.push(String(chunk)),
      recoveryWrite: (chunk) => output.push(String(chunk)),
      isTty: true
    },
    capabilities: {
      probes: { keyboardProtocol: 'supported' },
      overrides: { alternateScreen: true }
    },
    initialState: { keyboardProfile: inheritedMain }
  });
  const session = await host.beginSession({ id: 'alternate-verification-failure' });

  await session.enableAlternateScreen();
  const result = await session.enableKeyboardProfile(kittyEvents);

  assert.equal(result.status, 'rejected');
  assert.deepEqual((await session.currentState()).keyboardProfile, LEGACY_KEYBOARD_PROFILE);
  const restored = await session.restore('error');
  assert.equal(restored.status, 'restored');
  assert.deepEqual(restored.resultingState.keyboardProfile, inheritedMain);
  assert.equal(
    output.join(''),
    '\u001B[?1049h\u001B[>3u\u001B[?u\u001B[c\u001B[=0u\u001B[<u\u001B[?1049l'
  );
  await host.dispose();
});

test('session setup uses the authoritative profile restored after Kitty verification fails', async () => {
  const output = [];
  const inherited = kittyKeyboardProfile(5);
  const host = createBunTerminalHost({
    stdin: { source: runtimeInput(['\u001B[?1u']), isTty: true },
    stdout: {
      write: (chunk) => output.push(String(chunk)),
      recoveryWrite: (chunk) => output.push(String(chunk)),
      isTty: true
    },
    capabilities: { probes: { keyboardProtocol: 'supported' } },
    initialState: { keyboardProfile: inherited }
  });
  const session = await host.beginSession({ id: 'authoritative-keyboard-fallback' });
  const result = await applySessionProtocolPolicy(session, {
    alternateScreen: 'disabled',
    rawInput: 'disabled',
    bracketedPaste: 'disabled',
    focusReporting: 'disabled',
    unicodeGraphemeMode: 'disabled',
    keyboard: { profile: kittyEvents, requirement: 'optional' },
    cursorVisibility: { visibility: 'unchanged', requirement: 'disabled' },
    mouseReporting: { mode: 'none', requirement: 'disabled' }
  });

  assert.equal(result.status, 'ready');
  assert.deepEqual(result.resultingState.keyboardProfile, inherited);
  assert.equal(result.resultingState.provenance.keyboardProfile, 'library_known');
  assert.match(output.join(''), /\u001B\[=5u/u);
  await session.restore('error');
  await host.dispose();
});

test('failed Kitty fallback is indeterminate after a committed profile push', async () => {
  const output = [];
  const host = createBunTerminalHost({
    stdin: { source: runtimeInput(['\u001B[?1u']), isTty: true },
    stdout: {
      write: (chunk) => output.push(String(chunk)),
      recoveryWrite: (chunk) => output.push(String(chunk)),
      isTty: true
    },
    capabilities: { probes: { keyboardProtocol: 'supported' } }
  });
  const write = host.write;
  host.write = (chunk, context) => chunk.text === '\u001B[=0u'
    ? Promise.resolve({
        status: 'failed_before_write',
        diagnostic: diagnostic('HOST_STREAM_CLOSED', 'fallback rejected before write')
      })
    : write(chunk, context);
  const session = await host.beginSession({ id: 'indeterminate-keyboard-fallback' });

  const result = await session.enableKeyboardProfile(kittyEvents);

  assert.equal(result.status, 'indeterminate');
  assert.equal((await session.currentState()).provenance.keyboardProfile, 'indeterminate');
  assert.match(output.join(''), /^\u001B\[>3u\u001B\[\?u\u001B\[c/u);
  await session.restore('error');
  await host.dispose();
});

test('terminal sessions update one Kitty profile without growing the terminal stack', async () => {
  const host = createMemoryTerminalHost({
    capabilities: { probes: { keyboardProtocol: 'supported' } }
  });
  const session = await host.beginSession({ id: 'keyboard-profile-stack' });

  await session.enableKeyboardProfile(kittyEvents);
  await session.enableKeyboardProfile(kittyKeyboardProfile(3));
  await session.enableKeyboardProfile(kittyKeyboardProfile(7));

  assert.equal(host.output(), '\u001B[>3u\u001B[=7u');

  const restored = await session.restore('success');

  assert.equal(restored.status, 'restored');
  assert.equal(host.output(), '\u001B[>3u\u001B[=7u\u001B[<u');
  assert.deepEqual(restored.completed, [{
    kind: 'keyboardProfile',
    state: LEGACY_KEYBOARD_PROFILE,
    assurance: 'sent'
  }]);
});

test('terminal sessions pop their frame when restoring an explicit Kitty profile', async () => {
  const host = createMemoryTerminalHost({
    capabilities: { probes: { keyboardProtocol: 'supported' } },
    initialState: { keyboardProfile: kittyEvents }
  });
  const session = await host.beginSession({ id: 'explicit-kitty-profile' });

  await session.enableKeyboardProfile(kittyKeyboardProfile(7));
  const restored = await session.restore('success');

  assert.equal(restored.status, 'restored');
  assert.equal(host.output(), '\u001B[>7u\u001B[<u');
  assert.deepEqual(restored.resultingState.keyboardProfile, kittyEvents);
});

test('terminal sessions apply legacy input inside an owned Kitty stack frame', async () => {
  const host = createMemoryTerminalHost({
    capabilities: { probes: { keyboardProtocol: 'supported' } }
  });
  const session = await host.beginSession({ id: 'keyboard-profile-legacy' });

  await session.enableKeyboardProfile(kittyEvents);
  await session.enableKeyboardProfile(LEGACY_KEYBOARD_PROFILE);
  await session.enableKeyboardProfile(LEGACY_KEYBOARD_PROFILE);

  assert.equal(host.output(), '\u001B[>3u\u001B[=0u');

  const restored = await session.restore('success');

  assert.equal(restored.status, 'restored');
  assert.equal(host.output(), '\u001B[>3u\u001B[=0u\u001B[<u');
  assert.deepEqual(restored.completed, [{
    kind: 'keyboardProfile',
    state: LEGACY_KEYBOARD_PROFILE,
    assurance: 'sent'
  }]);
});

test('terminal sessions continue restoring later state after one restore operation fails', async () => {
  const host = createMemoryTerminalHost();
  const originalWrite = host.writeRecovery.bind(host);
  const session = await host.beginSession({ id: 'restore-best-effort' });
  await session.enableRawInput();
  await session.enableAlternateScreen();
  host.writeRecovery = async (output) => {
    if (output.text === '\u001B[?1049l') throw new Error('alternate screen restore failed');
    return originalWrite(output);
  };

  const result = await session.restore('error');

  assert.notEqual(result.status, 'restored');
  assert.equal(result.diagnostics[0]?.code, 'HOST_RESTORE_FAILED');
  assert.equal(result.diagnostics[0]?.data?.operation, 'alternateScreen');
  assert.deepEqual(result.completed.map((operation) => operation.kind), ['rawInput']);
  assert.equal(host.stdin.isRawModeEnabled(), false);
  assert.equal(host.restores()[0]?.resultingState.alternateScreen, true);
  assert.equal(host.restores()[0]?.resultingState.rawInput, false);
  assert.equal(host.restores()[0]?.resultingState.provenance.alternateScreen, 'indeterminate');
});

test('terminal sessions retry restoration after an unsuccessful completed attempt', async () => {
  const host = createMemoryTerminalHost();
  const originalWrite = host.writeRecovery.bind(host);
  const session = await host.beginSession({ id: 'restore-retry' });
  await session.enableRawInput();
  await session.enableAlternateScreen();
  let remainingFailures = 1;
  host.writeRecovery = async (output, context) => {
    if (output.text === '\u001B[?1049l' && remainingFailures > 0) {
      remainingFailures -= 1;
      throw new Error('transient alternate screen restore failure');
    }
    return originalWrite(output, context);
  };

  const first = await session.restore('error');
  const second = await session.restore('error');

  assert.equal(first.status, 'partial');
  assert.equal(second.status, 'restored');
  assert.deepEqual(second.completed.map((operation) => operation.kind), ['alternateScreen']);
  assert.equal(host.stdin.isRawModeEnabled(), false);
});

test('terminal restoration checks cancellation between protocol operations and remains retryable', async () => {
  const host = createMemoryTerminalHost();
  const write = host.writeRecovery.bind(host);
  const session = await host.beginSession({ id: 'restore-operation-cancellation' });
  await session.enableAlternateScreen();
  await session.hideCursor();
  const controller = new globalThis.AbortController();
  host.writeRecovery = async (output, context) => {
    const receipt = await write(output, context);
    if (output.text === '\u001B[?25h') controller.abort(new Error('restore deadline expired'));
    return receipt;
  };

  const cancelled = await session.restore('error', { operationSignal: controller.signal });

  assert.equal(cancelled.status, 'partial');
  assert.deepEqual(cancelled.completed.map((operation) => operation.kind), ['cursorVisible']);
  assert.equal(cancelled.diagnostics[0]?.data?.cancelled, true);
  assert.equal(cancelled.diagnostics[0]?.data?.operation, 'cursorVisible');
  assert.doesNotMatch(host.output(), /\u001B\[\?1049l/u);

  host.writeRecovery = write;
  const retried = await session.restore('error');
  assert.equal(retried.status, 'restored');
  assert.deepEqual(retried.completed.map((operation) => operation.kind), ['alternateScreen']);
});

test('concurrent terminal session restores share one authority operation across caller contexts', async () => {
  const host = createMemoryTerminalHost();
  const originalWrite = host.writeRecovery.bind(host);
  const session = await host.beginSession({ id: 'coalesced-restore' });
  await session.enableAlternateScreen();
  const restoreStarted = deferred();
  const releaseRestore = deferred();
  host.writeRecovery = async (output, context) => {
    if (output.text === '\u001B[?1049l') {
      restoreStarted.resolve();
      await releaseRestore.promise;
    }
    return originalWrite(output, context);
  };
  const firstController = new globalThis.AbortController();
  const secondController = new globalThis.AbortController();

  const first = session.restore('success', { waitSignal: firstController.signal });
  await restoreStarted.promise;
  const second = session.restore('success', { waitSignal: secondController.signal });
  releaseRestore.resolve();
  const [firstResult, secondResult] = await Promise.all([first, second]);

  assert.equal(firstResult.status, 'restored');
  assert.equal(secondResult.status, 'restored');
  assert.equal(host.restores().length, 1);
  assert.equal(host.output().match(/\u001B\[\?1049l/gu)?.length, 1);
});

test('terminal sessions restore protocol mutations whose writes apply and then reject', async () => {
  const host = createMemoryTerminalHost();
  const write = host.write.bind(host);
  const session = await host.beginSession({ id: 'uncertain-protocol-mutation' });
  host.write = async (output) => {
    await write(output);
    if (output.text === '\u001B[?1049h') throw new Error('write rejected after applying alternate screen');
  };

  const outcome = await session.enableAlternateScreen();
  assert.equal(outcome.status, 'indeterminate');
  host.write = write;
  const restored = await session.restore('error');

  assert.equal(restored.status, 'restored');
  assert.deepEqual(restored.completed.map((operation) => operation.kind), ['alternateScreen']);
  assert.match(host.output(), /\u001B\[\?1049h\u001B\[\?1049l/u);
});

test('terminal sessions conservatively restore every uncertain protocol mutation', async () => {
  const cases = [
    { id: 'alternate', enable: (session) => session.enableAlternateScreen(), sequence: '\u001B[?1049h', kind: 'alternateScreen' },
    { id: 'paste', enable: (session) => session.enableBracketedPaste(), sequence: '\u001B[?2004h', kind: 'bracketedPaste' },
    {
      id: 'mouse',
      enable: (session) => session.enableMouseReporting('drag'),
      sequence: '\u001B[?1006h\u001B[?1002h',
      kind: 'mouseReporting'
    },
    { id: 'focus', enable: (session) => session.enableFocusReporting(), sequence: '\u001B[?1004h', kind: 'focusReporting' },
    {
      id: 'kitty-keyboard',
      hostOptions: { capabilities: { probes: { keyboardProtocol: 'supported' } } },
      enable: (session) => session.enableKeyboardProfile(kittyEvents),
      sequence: '\u001B[>3u',
      kind: 'keyboardProfile'
    },
    { id: 'cursor', enable: (session) => session.hideCursor(), sequence: '\u001B[?25l', kind: 'cursorVisible' }
  ];

  for (const item of cases) {
    const host = createMemoryTerminalHost(item.hostOptions);
    const write = host.write.bind(host);
    const session = await host.beginSession({ id: `uncertain-${item.id}` });
    host.write = async (output) => {
      await write(output);
      if (output.text === item.sequence) throw new Error(`${item.id} rejected after applying`);
    };

    const outcome = await item.enable(session);
    assert.equal(outcome.status, 'indeterminate', item.id);
    host.write = write;
    const restored = await session.restore('error');

    assert.equal(restored.status, 'restored', item.id);
    assert.deepEqual(restored.completed.map((operation) => operation.kind), [item.kind], item.id);
    if (item.kind === 'keyboardProfile') {
      assert.equal(host.output(), '\u001B[>3u\u001B[<u');
    }
  }
});

test('terminal sessions restore uncertain raw mode after the host mutates and rejects', async () => {
  const host = createMemoryTerminalHost();
  const setRawMode = host.stdin.setRawMode.bind(host.stdin);
  const session = await host.beginSession({ id: 'uncertain-raw-mutation' });
  host.stdin.setRawMode = (enabled) => {
    setRawMode(enabled);
    if (enabled) throw new Error('raw mode rejected after mutation');
  };

  const outcome = await session.enableRawInput();
  assert.equal(outcome.status, 'indeterminate');
  host.stdin.setRawMode = setRawMode;
  const restored = await session.restore('error');

  assert.equal(restored.status, 'restored');
  assert.equal(host.stdin.isRawModeEnabled(), false);
  assert.deepEqual(restored.completed.map((operation) => operation.kind), ['rawInput']);
});

test('restoreTerminalState restores active sessions instead of opening a fresh no-op session', async () => {
  const host = createMemoryTerminalHost();
  const session = await host.beginSession({ id: 'active-restore' });
  await session.enableRawInput();
  await session.enableAlternateScreen();
  await session.enableBracketedPaste();
  await session.hideCursor();

  const result = await restoreTerminalState(host);
  const second = await restoreTerminalState(host);

  assert.equal(result.status, 'restored');
  assert.equal(result.reason, 'disposed');
  assert.deepEqual(result.completed.map((operation) => operation.kind), [
    'cursorVisible',
    'bracketedPaste',
    'alternateScreen',
    'rawInput'
  ]);
  assert.equal(host.stdin.isRawModeEnabled(), false);
  assert.match(host.output(), /\u001B\[\?1049h/u);
  assert.match(host.output(), /\u001B\[\?1049l/u);
  assert.match(host.output(), /\u001B\[\?2004h/u);
  assert.match(host.output(), /\u001B\[\?2004l/u);
  assert.match(host.output(), /\u001B\[\?25l/u);
  assert.match(host.output(), /\u001B\[\?25h/u);
  assert.equal(second.status, 'restored');
  assert.deepEqual(second.completed, []);
});

test('shared terminal restoration is independent from each caller cancellation context', async () => {
  const host = createMemoryTerminalHost();
  const session = await host.beginSession({ id: 'shared-restore-cancellation' });
  await session.enableAlternateScreen();
  const restoreStarted = deferred();
  const releaseRestore = deferred();
  const write = host.writeRecovery.bind(host);
  host.writeRecovery = async (output, context) => {
    if (output.text === '\u001B[?1049l') {
      restoreStarted.resolve();
      await Promise.race([
        releaseRestore.promise,
        new Promise((_resolve, reject) => {
          context?.signal?.addEventListener('abort', () => reject(context.signal.reason), { once: true });
        })
      ]);
    }
    return write(output, context);
  };

  const cancelledCaller = new globalThis.AbortController();
  const first = session.restore('error', { waitSignal: cancelledCaller.signal });
  await restoreStarted.promise;
  const second = session.restore('error');
  cancelledCaller.abort(new Error('caller stopped waiting'));

  await assert.rejects(first, /caller stopped waiting/u);
  releaseRestore.resolve();
  const restored = await second;

  assert.equal(restored.status, 'restored');
  assert.deepEqual(restored.completed.map((operation) => operation.kind), ['alternateScreen']);
  assert.match(host.output(), /\u001B\[\?1049h\u001B\[\?1049l/u);
});

test('terminal lease creation waits for in-flight restoration to commit', async () => {
  const host = createMemoryTerminalHost();
  const first = await host.beginSession({ id: 'restoring-lease' });
  await first.enableAlternateScreen();
  const restoreStarted = deferred();
  const releaseRestore = deferred();
  const write = host.writeRecovery.bind(host);
  host.writeRecovery = async (output, context) => {
    if (output.text === '\u001B[?1049l') {
      restoreStarted.resolve();
      await releaseRestore.promise;
    }
    return write(output, context);
  };

  const restoring = first.restore('success');
  await restoreStarted.promise;
  let secondCreated = false;
  const creating = host.beginSession({ id: 'next-lease' }).then((session) => {
    secondCreated = true;
    return session;
  });
  await Promise.resolve();

  assert.equal(secondCreated, false);
  releaseRestore.resolve();
  assert.equal((await restoring).status, 'restored');
  const second = await creating;
  assert.equal(secondCreated, true);
  assert.equal((await second.enableBracketedPaste()).status, 'applied');
  assert.equal((await second.restore('success')).status, 'restored');
  assert.equal((await restoreTerminalState(host)).status, 'restored');
});

test('memory host disposal restores active terminal sessions before closing input', async () => {
  const host = createMemoryTerminalHost();
  const session = await host.beginSession({ id: 'memory-dispose-restore' });
  await session.enableRawInput();
  await session.enableAlternateScreen();
  await session.enableBracketedPaste();
  await session.hideCursor();

  await host.dispose();
  const afterDisposeRestore = await restoreTerminalState(host);
  const chunks = await readInputChunks(host);

  assert.equal(host.stdin.isRawModeEnabled(), false);
  assert.match(host.output(), /\u001B\[\?1049h/u);
  assert.match(host.output(), /\u001B\[\?1049l/u);
  assert.match(host.output(), /\u001B\[\?2004h/u);
  assert.match(host.output(), /\u001B\[\?2004l/u);
  assert.match(host.output(), /\u001B\[\?25l/u);
  assert.match(host.output(), /\u001B\[\?25h/u);
  assert.equal(host.restores().at(-1)?.resultingState.rawInput, false);
  assert.deepEqual(afterDisposeRestore.completed, []);
  assert.deepEqual(chunks, []);
});

test('stream host disposal restores active terminal sessions', async () => {
  const output = [];
  const rawModes = [];
  const host = createDenoTerminalHost({
    id: 'stream-dispose-restore',
    capabilities: {
      overrides: {
        alternateScreen: true,
        bracketedPaste: true,
        cursorVisibility: true
      }
    },
    stdin: {
      source: runtimeInput([]),
      isTty: true,
      setRawMode: (enabled) => rawModes.push(enabled)
    },
    stdout: {
      write: (chunk) => output.push(String(chunk)),
      recoveryWrite: (chunk) => output.push(String(chunk)),
      isTty: true
    }
  });
  const session = await host.beginSession({ id: 'stream-dispose-session' });
  const rawInput = await session.enableRawInput();
  await session.enableAlternateScreen();
  await session.enableBracketedPaste();
  await session.hideCursor();

  await host.dispose();
  const afterDisposeRestore = await restoreTerminalState(host);

  assert.deepEqual(rawModes, [true, false]);
  assert.equal(rawInput.status, 'applied');
  assert.equal(rawInput.assurance, 'sent');
  assert.match(output.join(''), /\u001B\[\?1049h/u);
  assert.match(output.join(''), /\u001B\[\?1049l/u);
  assert.match(output.join(''), /\u001B\[\?2004h/u);
  assert.match(output.join(''), /\u001B\[\?2004l/u);
  assert.match(output.join(''), /\u001B\[\?25l/u);
  assert.match(output.join(''), /\u001B\[\?25h/u);
  assert.deepEqual(afterDisposeRestore.completed, []);
});

test('stream host restoration uses recovery output while normal output is blocked', async () => {
  const normalWrites = [];
  const recoveryWrites = [];
  const blocked = deferred();
  const release = deferred();
  const host = createDenoTerminalHost({
    id: 'stream-recovery-restore',
    capabilities: { overrides: { alternateScreen: true } },
    stdout: {
      isTty: true,
      async write(chunk) {
        normalWrites.push(String(chunk));
        if (chunk === 'blocked-frame') {
          blocked.resolve();
          await release.promise;
        }
      },
      recoveryWrite: (chunk) => { recoveryWrites.push(String(chunk)); }
    }
  });
  const session = await host.beginSession({ id: 'stream-recovery-session' });
  assert.equal((await session.enableAlternateScreen()).status, 'applied');
  const normalWrite = host.write({ text: 'blocked-frame' });
  await blocked.promise;

  const restored = await session.restore('error');

  assert.equal(restored.status, 'restored');
  assert.deepEqual(recoveryWrites, ['\u001B[?1049l']);
  assert.equal(normalWrites.includes('blocked-frame'), true);
  release.resolve();
  assert.equal((await normalWrite).status, 'committed');
  await host.dispose();
});

test('Deno and Bun host adapters work with explicit runtime streams', async () => {
  const denoOutput = [];
  const deno = createDenoTerminalHost({
    id: 'deno-test',
    stdin: { source: runtimeInput(['deno-input']), isTty: true },
    stdout: {
      write: (chunk) => denoOutput.push(String(chunk)),
      isTty: true,
      columns: 100,
      rows: 30
    },
    env: { DENO_ENV: 'test' }
  });
  await deno.write({ text: 'hello-deno' });
  const [denoInput] = await readInputChunks(deno);

  assert.equal(deno.runtime, 'deno');
  assert.equal((await deno.getCapabilities()).runtime, 'deno');
  assert.equal(deno.getTerminalSize().columns, 100);
  assert.equal(deno.env.get('DENO_ENV'), 'test');
  assert.deepEqual(denoOutput, ['hello-deno']);
  assert.equal(denoInput, 'deno-input');

  const bunOutput = [];
  const bun = createBunTerminalHost({
    id: 'bun-test',
    stdin: { source: runtimeInput(['bun-input']), isTty: false },
    stdout: {
      write: (chunk) => bunOutput.push(String(chunk)),
      isTty: false,
      columns: 90,
      rows: 20
    }
  });
  await bun.write({ text: 'hello-bun' });
  const [bunInput] = await readInputChunks(bun);

  assert.equal(bun.runtime, 'bun');
  assert.equal((await bun.getCapabilities()).runtime, 'bun');
  assert.equal(bun.getTerminalSize().rows, 20);
  assert.deepEqual(bunOutput, ['hello-bun']);
  assert.equal(bunInput, 'bun-input');
});

test('runtime stream hosts only advertise raw input when a raw-mode setter exists', async () => {
  const withoutRawSetter = createDenoTerminalHost({
    stdin: { source: runtimeInput([]), isTty: true },
    stdout: { write: () => {}, isTty: true }
  });
  const unsupportedCapabilities = await withoutRawSetter.getCapabilities();
  const unsupportedSession = await withoutRawSetter.beginSession({ id: 'unsupported-raw' });
  const unsupportedRaw = await unsupportedSession.enableRawInput();

  assert.equal(unsupportedCapabilities.isTty, true);
  assert.equal(unsupportedCapabilities.rawInput.support, 'supported');
  assert.equal(unsupportedCapabilities.rawInput.availability, 'unavailable');
  assert.equal(unsupportedRaw.status, 'rejected');
  assert.equal(unsupportedRaw.diagnostic.code, 'HOST_PROTOCOL_UNSUPPORTED');

  const rawModes = [];
  const withRawSetter = createBunTerminalHost({
    stdin: {
      source: runtimeInput([]),
      isTty: true,
      setRawMode: (enabled) => rawModes.push(enabled)
    },
    stdout: { write: () => {}, isTty: true }
  });
  const supportedCapabilities = await withRawSetter.getCapabilities();
  const supportedSession = await withRawSetter.beginSession({ id: 'supported-raw' });
  const supportedRaw = await supportedSession.enableRawInput();
  await supportedSession.restore('success');

  assert.equal(supportedCapabilities.rawInput.support, 'supported');
  assert.equal(supportedCapabilities.rawInput.availability, 'available');
  assert.equal(supportedRaw.status, 'applied');
  assert.deepEqual(rawModes, [true, false]);
});

async function* asyncIterable(values) {
  for (const value of values) yield value;
}

function runtimeInput(values) {
  return { read: () => asyncIterable(values) };
}

async function readInputChunks(host) {
  const chunks = [];
  for await (const chunk of host.stdin.read()) {
    chunks.push(typeof chunk.data === 'string' ? chunk.data : new TextDecoder().decode(chunk.data));
  }
  return chunks;
}

function inputText(data) {
  return typeof data === 'string' ? data : new TextDecoder().decode(data);
}

function withoutProvenance(state) {
  if (state === undefined) return undefined;
  return Object.fromEntries(Object.entries(state).filter(([key]) => key !== 'provenance'));
}

function deferred() {
  let resolve;
  const promise = new Promise((complete) => { resolve = complete; });
  return { promise, resolve };
}

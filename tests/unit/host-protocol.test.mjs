import assert from 'node:assert/strict';
import test from 'node:test';

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
  kittyKeyboardProfile
} from '../../dist/protocol/index.js';
import { applySessionProtocolPolicy } from '../../dist/tui/index.js';

const kittyEvents = kittyKeyboardProfile(3);

function hostFacts(overrides = {}) {
  return {
    runtime: 'node',
    inputIsTty: true,
    outputIsTty: true,
    rawInput: true,
    resizeEvents: true,
    terminalProtocols: true,
    ...overrides
  };
}

test('memory host captures output and exposes capabilities', async () => {
  const host = createMemoryTerminalHost();
  await host.write({ text: 'hello' });
  assert.equal(host.output(), 'hello');
  assert.equal((await host.getCapabilities()).runtime, 'memory');
});

test('host capability helper distinguishes input and output protocol support', () => {
  const capabilities = resolveTerminalCapabilities({
    host: {
      runtime: 'node',
      inputIsTty: true,
      outputIsTty: true,
      rawInput: false,
      resizeEvents: false,
      terminalProtocols: true,
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

  const unknown = resolveTerminalCapabilities({ host: hostFacts({ resizeEvents: false }) });
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
  assert.equal(xterm.hyperlinks.facts.some((fact) => fact.kind === 'environment'), true);

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
  const output = {
    isTTY: true,
    columns: 80,
    rows: 24,
    getColorDepth: () => 8,
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
    env: { COLORTERM: 'truecolor' }
  });
  const explicit = createNodeTerminalHost({
    stdin: runtimeInput([]),
    stdout: output,
    stderr: output,
    capabilities: { colorDepth: 24 }
  });

  assert.equal((await detected.getCapabilities()).color.depth, 8);
  assert.equal((await explicit.getCapabilities()).color.depth, 24);
  await detected.dispose();
  await explicit.dispose();
});

test('synchronized output requires an explicit probe or override', () => {
  const host = {
    runtime: 'node',
    inputIsTty: true,
    outputIsTty: true,
    rawInput: true,
    resizeEvents: true,
    terminalProtocols: true
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
  assert.equal(host.output(), '\u001B[?u');
  assert.equal(host.restores().at(-1)?.status, 'restored');
});

test('active Kitty discovery is bounded and replays buffered user input after timeout', async () => {
  const host = createMemoryTerminalHost();
  host.input('typed while probing');
  const detection = host.getCapabilities({
    activeProbes: ['keyboardProtocol'],
    probeTimeoutMs: 25
  });
  await Promise.resolve();
  await Promise.resolve();
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

  await protocol.enableMouseReporting('drag');
  await protocol.disableMouseReporting();
  await protocol.pushKeyboardProfile(kittyEvents);
  await protocol.setKeyboardProfile(kittyKeyboardProfile(7));
  await protocol.popKeyboardProfile();
  await protocol.setTitle('Build\u001B[31m');

  assert.match(host.output(), /^\u001B\[\?1006h\u001B\[\?1002h/u);
  assert.match(host.output(), /\u001B\[\?1003l\u001B\[\?1002l\u001B\[\?1000l\u001B\[\?1006l/u);
  assert.match(host.output(), /\u001B\[>3u\u001B\[=7u\u001B\[<u/u);
  assert.equal(host.output().includes('\u001B]0;Build\u0007'), true);
  assert.doesNotMatch(host.output(), /\u001B\[31m/u);
});

test('protocol writer rejects invalid typed protocol parameters', async () => {
  const host = createMemoryTerminalHost();
  const protocol = createProtocolWriter(protocolSink(host));

  await assert.rejects(() => protocol.moveCursor(0, 1), /row must be a positive integer/u);
  await assert.rejects(() => protocol.moveCursor(1, Number.NaN), /column must be a positive integer/u);
  await assert.rejects(() => protocol.enableMouseReporting('hover'), /mouse reporting mode/u);
  assert.equal(host.output(), '');
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
    mouseReporting: 'none',
    focusReporting: false,
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
  assert.deepEqual(result.confirmed.map((operation) => operation.kind), expectedOperations);
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
    keyboard: { profile: LEGACY_KEYBOARD_PROFILE, requirement: 'disabled' },
    cursorVisibility: { state: 'hide', requirement: 'disabled' },
    mouseReporting: { mode: 'drag', requirement: 'optional' }
  };

  const plan = createSessionProtocolPlan(policy);
  const result = await applySessionProtocolPolicy(session, policy);

  assert.equal(plan.length, 7);
  assert.equal(result.ok, true);
  assert.deepEqual(result.applied.map((item) => item.kind), ['rawInput', 'mouseReporting']);
  assert.deepEqual(result.skipped.map((item) => item.kind), [
    'alternateScreen',
    'bracketedPaste',
    'keyboardProfile',
    'focusReporting',
    'cursorVisibility'
  ]);
  assert.equal(result.diagnostics.some((item) => item.code === 'HOST_PROTOCOL_SKIPPED'), true);
  assert.match(host.output(), /\u001B\[\?1002h/u);
  assert.doesNotMatch(host.output(), /\u001B\[\?1049h/u);
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
    keyboard: { profile: LEGACY_KEYBOARD_PROFILE, requirement: 'disabled' },
    cursorVisibility: { state: 'hide', requirement: 'disabled' },
    mouseReporting: { mode: 'none', requirement: 'disabled' }
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.applied, []);
  assert.deepEqual(result.skipped.map((item) => item.kind), [
    'alternateScreen',
    'bracketedPaste',
    'rawInput',
    'keyboardProfile',
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
    keyboard: { profile: LEGACY_KEYBOARD_PROFILE, requirement: 'disabled' },
    cursorVisibility: { state: 'hide', requirement: 'disabled' },
    mouseReporting: { mode: 'drag', requirement: 'optional' }
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.applied, []);
  assert.deepEqual(result.skipped.map((item) => item.kind), [
    'alternateScreen',
    'bracketedPaste',
    'rawInput',
    'keyboardProfile',
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

test('terminal sessions preserve raw input state that existed before the session', async () => {
  const host = createMemoryTerminalHost();
  host.stdin.setRawMode(true);
  const session = await host.beginSession({ id: 'restore-existing-raw' });

  await session.enableRawInput();
  const result = await session.restore('success');

  assert.equal(result.status, 'restored');
  assert.equal(host.stdin.isRawModeEnabled(), true);
  assert.equal(result.confirmed.some((operation) => operation.kind === 'rawInput'), false);
  host.stdin.setRawMode(false);
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

test('Node sessions trust raw mode set through streams with snapshot isRaw fields', async () => {
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
  const outer = await host.beginSession({ id: 'snapshot-raw-outer' });
  await outer.enableRawInput();
  const inner = await host.beginSession({ id: 'snapshot-raw-inner' });

  assert.equal(inner.initialState.rawInput, true);
  assert.equal((await inner.restore('success')).status, 'restored');
  assert.deepEqual(changes, [true]);
  assert.equal((await outer.restore('success')).status, 'restored');
  assert.deepEqual(changes, [true, false]);
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
  assert.deepEqual(innerRestore.confirmed.map((item) => item.kind), ['bracketedPaste']);
  assert.equal(innerRestore.resultingState.alternateScreen, true);
  assert.equal(innerRestore.resultingState.cursorVisible, false);

  const outerRestore = await outer.restore('success');
  assert.equal(outerRestore.status, 'restored');
  assert.deepEqual(outerRestore.confirmed.map((item) => item.kind), ['cursorVisible', 'alternateScreen']);
  assert.deepEqual(host.restores().map((item) => item.status), ['failed', 'restored', 'restored']);
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
    keyboard: { profile: kittyEvents, requirement: 'required' },
    cursorVisibility: { state: 'unchanged', requirement: 'disabled' },
    mouseReporting: { mode: 'none', requirement: 'disabled' }
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.applied, [{ kind: 'keyboardProfile', enabled: kittyEvents }]);
  assert.match(host.output(), /\u001B\[>3u/u);

  const restored = await session.restore('success');
  assert.equal(restored.status, 'restored');
  assert.deepEqual(restored.confirmed, [{ kind: 'keyboardProfile', enabled: LEGACY_KEYBOARD_PROFILE }]);
  assert.match(host.output(), /\u001B\[>3u\u001B\[<u/u);
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
  assert.deepEqual(restored.confirmed, [{ kind: 'keyboardProfile', enabled: LEGACY_KEYBOARD_PROFILE }]);
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
  assert.deepEqual(restored.confirmed, [{ kind: 'keyboardProfile', enabled: LEGACY_KEYBOARD_PROFILE }]);
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
  assert.deepEqual(result.confirmed.map((operation) => operation.kind), ['rawInput']);
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
  assert.deepEqual(second.confirmed.map((operation) => operation.kind), ['alternateScreen']);
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
  assert.deepEqual(cancelled.confirmed.map((operation) => operation.kind), ['cursorVisible']);
  assert.equal(cancelled.diagnostics[0]?.data?.cancelled, true);
  assert.equal(cancelled.diagnostics[0]?.data?.operation, 'cursorVisible');
  assert.doesNotMatch(host.output(), /\u001B\[\?1049l/u);

  host.writeRecovery = write;
  const retried = await session.restore('error');
  assert.equal(retried.status, 'restored');
  assert.deepEqual(retried.confirmed.map((operation) => operation.kind), ['alternateScreen']);
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
  assert.deepEqual(restored.confirmed.map((operation) => operation.kind), ['alternateScreen']);
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
    assert.deepEqual(restored.confirmed.map((operation) => operation.kind), [item.kind], item.id);
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
  assert.deepEqual(restored.confirmed.map((operation) => operation.kind), ['rawInput']);
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
  assert.deepEqual(result.confirmed.map((operation) => operation.kind), [
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
  assert.deepEqual(second.confirmed, []);
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
  assert.deepEqual(restored.confirmed.map((operation) => operation.kind), ['alternateScreen']);
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
  assert.deepEqual(afterDisposeRestore.confirmed, []);
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
  await session.enableRawInput();
  await session.enableAlternateScreen();
  await session.enableBracketedPaste();
  await session.hideCursor();

  await host.dispose();
  const afterDisposeRestore = await restoreTerminalState(host);

  assert.deepEqual(rawModes, [true, false]);
  assert.match(output.join(''), /\u001B\[\?1049h/u);
  assert.match(output.join(''), /\u001B\[\?1049l/u);
  assert.match(output.join(''), /\u001B\[\?2004h/u);
  assert.match(output.join(''), /\u001B\[\?2004l/u);
  assert.match(output.join(''), /\u001B\[\?25l/u);
  assert.match(output.join(''), /\u001B\[\?25h/u);
  assert.deepEqual(afterDisposeRestore.confirmed, []);
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

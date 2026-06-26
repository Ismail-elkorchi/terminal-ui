const entrypoints = [
  ['root', '../dist/index.js'],
  ['host', '../dist/host/index.js'],
  ['input', '../dist/input/index.js'],
  ['protocol', '../dist/protocol/index.js'],
  ['text', '../dist/text/index.js'],
  ['theme', '../dist/theme/index.js'],
  ['prompts', '../dist/prompts/index.js'],
  ['shell', '../dist/shell/index.js'],
  ['tui', '../dist/tui/index.js'],
  ['widgets', '../dist/widgets/index.js'],
  ['accessibility', '../dist/accessibility/index.js'],
  ['transcript', '../dist/transcript/index.js'],
  ['testing', '../dist/testing/index.js'],
  ['schemas', '../dist/schemas/index.js']
];

const runtime = detectRuntime();

for (const [name, path] of entrypoints) {
  const module = await import(new URL(path, import.meta.url).href);
  assertObject(module, `${runtime}:${name}`);
}

const root = await import(new URL('../dist/index.js', import.meta.url).href);
assertFunction(root.createTerminalHost, `${runtime}:createTerminalHost`);
assertFunction(root.createDenoTerminalHost, `${runtime}:createDenoTerminalHost`);
assertFunction(root.createBunTerminalHost, `${runtime}:createBunTerminalHost`);
assertFunction(root.runPrompt, `${runtime}:runPrompt`);
assertFunction(root.createShell, `${runtime}:createShell`);
assertFunction(root.defineTui, `${runtime}:defineTui`);
assertArray(root.terminalUiPackage.runtimeTargets, `${runtime}:runtimeTargets`);

const host = root.createTerminalHost({ runtime: 'memory', id: `${runtime}-smoke` });
assertEqual(host.runtime, 'memory', `${runtime}:memoryHostRuntime`);
assertEqual((await host.getCapabilities()).schemaVersion, 'terminal-ui.terminal-capabilities.v1', `${runtime}:capabilitiesSchema`);

const defaultHost = root.createTerminalHost({ id: `${runtime}-default-smoke` });
assertEqual(defaultHost.runtime, runtime, `${runtime}:defaultHostRuntime`);

console.log(`terminal-ui runtime smoke passed: ${runtime}`);

function detectRuntime() {
  if ('Deno' in globalThis) return 'deno';
  if ('Bun' in globalThis) return 'bun';
  return 'node';
}

function assertObject(value, label) {
  if (typeof value !== 'object' || value === null) {
    throw new Error(`Expected object for ${label}.`);
  }
}

function assertFunction(value, label) {
  if (typeof value !== 'function') {
    throw new Error(`Expected function for ${label}.`);
  }
}

function assertArray(value, label) {
  if (!Array.isArray(value)) {
    throw new Error(`Expected array for ${label}.`);
  }
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`Expected ${label} to be ${expected}, got ${actual}.`);
  }
}

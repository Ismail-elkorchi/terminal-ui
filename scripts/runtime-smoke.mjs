const runtime = detectRuntime();

const root = await import(new URL('../dist/index.js', import.meta.url).href);
const hostModule = await import(new URL('../dist/host/index.js', import.meta.url).href);
const promptsModule = await import(new URL('../dist/prompts/index.js', import.meta.url).href);
assertObject(root, `${runtime}:root`);
assertObject(hostModule, `${runtime}:host`);
assertObject(promptsModule, `${runtime}:prompts`);
assertFunction(root.createTerminalHost, `${runtime}:createTerminalHost`);
assertFunction(root.defineTui, `${runtime}:defineTui`);
assertFunction(hostModule.createDenoTerminalHost, `${runtime}:createDenoTerminalHost`);
assertFunction(hostModule.createBunTerminalHost, `${runtime}:createBunTerminalHost`);
assertFunction(promptsModule.runPrompt, `${runtime}:runPrompt`);

const host = root.createTerminalHost({ runtime: 'memory', id: `${runtime}-smoke` });
assertEqual(host.runtime, 'memory', `${runtime}:memoryHostRuntime`);

const defaultHost = root.createTerminalHost();
assertEqual(defaultHost.runtime, runtime, `${runtime}:defaultHostRuntime`);

let deepCause = { leaf: true };
for (let depth = 0; depth < 2_000; depth += 1) deepCause = { next: deepCause };
assertEqual(
  root.diagnostic('TUI_RUN_FAILED', 'deep cause', { cause: deepCause }).fingerprint,
  'diagnostic:sha256:a7728c5f5f4103e767e19d8831f25d08f7ff0e004c05c320c7b65cce88b069d0',
  `${runtime}:boundedDiagnosticFingerprint`
);

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

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`Expected ${label} to be ${expected}, got ${actual}.`);
  }
}

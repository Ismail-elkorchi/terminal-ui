import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const entrypoints = [
  '.',
  './host',
  './input',
  './protocol',
  './text',
  './theme',
  './prompts',
  './shell',
  './tui',
  './widgets',
  './accessibility',
  './transcript',
  './testing',
  './schemas'
];

test('all public entrypoints import from built package', async () => {
  for (const entrypoint of entrypoints) {
    const module = await import(`@ismail-elkorchi/terminal-ui${entrypoint === '.' ? '' : entrypoint.slice(1)}`);
    assert.equal(typeof module, 'object', entrypoint);
  }
});

test('root exposes the primary vertical path', async () => {
  const terminalUi = await import('@ismail-elkorchi/terminal-ui');
  assert.equal(terminalUi.terminalUiPackage.schemaVersion, 'terminal-ui.v1');
  assert.deepEqual(terminalUi.terminalUiPackage.runtimeTargets, ['node', 'deno', 'bun', 'memory']);
  assert.ok(terminalUi.terminalDiagnosticCodes.includes('INPUT_CANCELLED'));
  assert.ok(terminalUi.accessibleRoles.includes('application'));
  assert.ok(terminalUi.accessibleSources.includes('tui'));
  assert.equal(typeof terminalUi.createDenoTerminalHost, 'function');
  assert.equal(typeof terminalUi.createBunTerminalHost, 'function');
  assert.equal(typeof terminalUi.createMemoryTerminalHost, 'function');
  assert.equal(typeof terminalUi.createPtyTerminalHost, 'function');
  assert.equal(typeof terminalUi.runPrompt, 'function');
  assert.equal(typeof terminalUi.createProgress, 'function');
  assert.equal(typeof terminalUi.confirm, 'function');
  assert.equal(typeof terminalUi.input, 'function');
  assert.equal(typeof terminalUi.password, 'function');
  assert.equal(typeof terminalUi.select, 'function');
  assert.equal(typeof terminalUi.createShell, 'function');
  assert.equal(typeof terminalUi.createCliCoreCommandSource, 'function');
  assert.equal(typeof terminalUi.createCommandPalette, 'function');
  assert.equal(typeof terminalUi.defineTui, 'function');
  assert.equal(typeof terminalUi.createTuiRuntime, 'function');
  assert.equal(typeof terminalUi.layoutWidget, 'function');
  assert.equal(typeof terminalUi.renderWidgetFrame, 'function');
  assert.equal(typeof terminalUi.diffFrames, 'function');
  assert.equal(typeof terminalUi.renderFrame, 'function');
  assert.equal(typeof terminalUi.createTerminalHarness, 'function');
  assert.equal(typeof terminalUi.runInteractionScript, 'function');
  assert.equal(typeof terminalUi.findAccessibleNode, 'function');
  assert.equal(typeof terminalUi.validateAccessibleSnapshot, 'function');
  assert.equal(typeof terminalUi.validateTranscript, 'function');
});

test('transcript entrypoint exposes replay against a structural harness target', async () => {
  const { replayTranscript } = await import('@ismail-elkorchi/terminal-ui/transcript');
  const { createTerminalHarness } = await import('@ismail-elkorchi/terminal-ui/testing');
  const harness = createTerminalHarness();

  const result = await replayTranscript(harness, {
    schemaVersion: 'terminal-ui.interaction-transcript.v1',
    id: 'entrypoint-replay',
    source: 'test',
    steps: [{ kind: 'input', event: { kind: 'text', text: 'x', paste: false } }],
    diagnostics: [],
    redactions: []
  });

  assert.equal(typeof replayTranscript, 'function');
  assert.equal(result.transcript.steps[0]?.kind, 'input');
});

test('testing harness declaration exposes captured output', async () => {
  const declaration = await readFile(new URL('../../dist/testing/types.d.ts', import.meta.url), 'utf8');

  assert.match(declaration, /output\(\): string;/u);
  assert.match(declaration, /readonly clock: ControlledTerminalClock;/u);
});

test('root declaration exposes primary public type contracts', async () => {
  const declaration = await readFile(new URL('../../dist/index.d.ts', import.meta.url), 'utf8');
  const publicTypes = [
    'InputEvent',
    'KeyEvent',
    'TextEditBuffer',
    'TextEditOperation',
    'TerminalTheme',
    'StyledText',
    'Widget',
    'WidgetKind',
    'PromptChoice',
    'NonTtyPromptPolicy',
    'ShellArgvParser',
    'ShellEvent',
    'ShellState',
    'ShellTranscript',
    'TuiContext',
    'TuiInit',
    'TuiUpdateResult',
    'AccessibleValue',
    'InteractionResult',
    'TranscriptReplayTarget',
    'InteractionScript'
  ];

  for (const typeName of publicTypes) {
    assert.match(declaration, new RegExp(`\\b${typeName}\\b`, 'u'), typeName);
  }
});

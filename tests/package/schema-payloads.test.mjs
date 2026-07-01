import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { defineCli, describeCli } from '@ismail-elkorchi/cli-core';
import Ajv2020 from 'ajv/dist/2020.js';

import { accessibleRoles, accessibleSources } from '../../dist/accessibility/index.js';
import { diagnostic, terminalDiagnosticCodes } from '../../dist/diagnostics.js';
import { createMemoryTerminalHost } from '../../dist/host/index.js';
import { input, runPrompt } from '../../dist/prompts/index.js';
import { createShell, runShell } from '../../dist/shell/index.js';
import { createTerminalHarness } from '../../dist/testing/index.js';
import { defineTui, diffFrames, renderWidgetFrame } from '../../dist/tui/index.js';
import { inputField, text } from '../../dist/widgets/index.js';

const schemaFiles = [
  'accessible-snapshot.schema.json',
  'interaction-transcript.schema.json',
  'terminal-capabilities.schema.json',
  'terminal-diagnostic.schema.json',
  'prompt-result.schema.json',
  'shell-transcript.schema.json',
  'tui-frame.schema.json',
  'render-diff.schema.json'
];

function parsedInvocation(input) {
  const argv = input.split(/\s+/u).filter(Boolean);
  return {
    schemaVersion: 'cli-core.invocation.v1',
    ok: true,
    argv,
    command: undefined,
    commandPath: argv.slice(0, 1),
    usedAlias: undefined,
    options: { values: {}, present: {}, unknown: [], issues: [] },
    positionals: {},
    positionalList: argv.slice(1),
    passThrough: [],
    diagnostics: []
  };
}

test('schemas validate payloads emitted by public runtime APIs', async () => {
  const { ajv, validators } = await loadSchemaValidators();

  const harness = createTerminalHarness({ viewport: { columns: 20, rows: 4 } });
  const app = defineTui({
    id: 'schema-payloads',
    init: () => ({ ready: true }),
    update: (state) => ({ state }),
    view: () => inputField({ id: 'schema-field', value: 'ready' })
  });
  const frame = renderWidgetFrame(app.definition.view({ ready: true }, {
    host: harness.host,
    viewport: harness.host.getViewport(),
    capabilities: await harness.host.getCapabilities(),
    clock: harness.clock,
    dispatch: () => {}
  }), harness.host.getViewport());
  const nextFrame = renderWidgetFrame(text('changed', { id: 'changed' }), harness.host.getViewport());
  const diff = diffFrames(frame, nextFrame);
  harness.host.recordFrame(frame);
  harness.host.recordDiff(diff);

  const shell = createShell({
    prompt: '$ ',
    transcript: { enabled: true },
    commands: {
      kind: 'adapter',
      adapter: {
        describe: () => describeCli(defineCli({ name: 'schema-test', commands: [{ name: 'echo' }] })),
        parse: ({ input }) => ({ ok: true, value: parsedInvocation(input) }),
        run: async () => ({
          schemaVersion: 'cli-core.run-result.v1',
          runId: 'schema-shell-run',
          mode: 'apply',
          invocation: parsedInvocation('echo hi'),
          ok: true,
          exitKind: 'ok',
          exitStatus: 0,
          events: [],
          effects: [],
          artifacts: [],
          diagnostics: []
        })
      }
    }
  });
  const shellHost = createMemoryTerminalHost();
  const runningShell = runShell(shell, shellHost);
  shellHost.input('echo hi\r\u0004');
  shellHost.stdin.close();
  const shellResult = await runningShell;

  const promptResult = await runPrompt(input({
    label: 'Name',
    nonTty: { mode: 'provided_value', value: 'Ada' }
  }));

  const payloads = new Map([
    ['accessible-snapshot.schema.json', frame.accessibility],
    ['interaction-transcript.schema.json', harness.transcript.snapshot()],
    ['terminal-capabilities.schema.json', await harness.host.getCapabilities()],
    ['terminal-diagnostic.schema.json', diagnostic('INPUT_CANCELLED', 'Cancelled.', { cause: new Error('user input') })],
    ['prompt-result.schema.json', promptResult],
    ['shell-transcript.schema.json', shellResult.transcript],
    ['tui-frame.schema.json', frame],
    ['render-diff.schema.json', diff]
  ]);

  for (const [file, payload] of payloads) {
    assert.notEqual(payload, undefined, file);
    const validate = validators.get(file);
    assert.equal(validate(payload), true, `${file}: ${ajv.errorsText(validate.errors)}`);
  }
});

test('terminal diagnostic schema code enum matches runtime diagnostic codes', async () => {
  const schema = JSON.parse(
    await readFile(new URL('../../dist/schemas/terminal-diagnostic.schema.json', import.meta.url), 'utf8')
  );

  assert.deepEqual(schema.properties.code.enum, [...terminalDiagnosticCodes]);
});

test('accessible snapshot schema enums match runtime accessibility constants', async () => {
  const accessibleSchema = JSON.parse(
    await readFile(new URL('../../dist/schemas/accessible-snapshot.schema.json', import.meta.url), 'utf8')
  );
  const transcriptSchema = JSON.parse(
    await readFile(new URL('../../dist/schemas/interaction-transcript.schema.json', import.meta.url), 'utf8')
  );

  assert.deepEqual(accessibleSchema.properties.source.enum, [...accessibleSources]);
  assert.deepEqual(accessibleSchema.$defs.accessibleNode.properties.role.enum, [...accessibleRoles]);
  assert.deepEqual(transcriptSchema.$defs.accessibleSnapshot.properties.source.enum, [...accessibleSources]);
  assert.deepEqual(transcriptSchema.$defs.accessibleNode.properties.role.enum, [...accessibleRoles]);
});

test('prompt result schema enforces submitted and aborted result shapes', async () => {
  const { ajv, validators } = await loadSchemaValidators();
  const validate = validators.get('prompt-result.schema.json');
  const snapshot = {
    schemaVersion: 'terminal-ui.accessible-snapshot.v1',
    source: 'prompt',
    root: { id: 'prompt-input', role: 'textbox', label: 'Name' },
    focusPath: [],
    diagnostics: []
  };
  const diagnosticPayload = diagnostic('PROMPT_NON_TTY_DENIED', 'Denied.');

  assert.equal(validate({
    schemaVersion: 'terminal-ui.prompt-result.v1',
    status: 'submitted',
    value: 'Ada',
    diagnostics: [],
    snapshot
  }), true, ajv.errorsText(validate.errors));

  assert.equal(validate({
    schemaVersion: 'terminal-ui.prompt-result.v1',
    status: 'aborted',
    reason: 'non_tty_denied',
    diagnostics: [diagnosticPayload],
    snapshot
  }), true, ajv.errorsText(validate.errors));

  assert.equal(validate({
    schemaVersion: 'terminal-ui.prompt-result.v1',
    status: 'submitted',
    reason: 'timeout',
    value: 'Ada',
    diagnostics: [],
    snapshot
  }), false);

  assert.equal(validate({
    schemaVersion: 'terminal-ui.prompt-result.v1',
    status: 'submitted',
    diagnostics: [],
    snapshot
  }), false);

  assert.equal(validate({
    schemaVersion: 'terminal-ui.prompt-result.v1',
    status: 'aborted',
    reason: 'timeout',
    value: 'Ada',
    diagnostics: [diagnosticPayload],
    snapshot
  }), false);

  assert.equal(validate({
    schemaVersion: 'terminal-ui.prompt-result.v1',
    status: 'submitted',
    value: 'Ada',
    diagnostics: [],
    snapshot: { role: 'textbox' }
  }), false);
});

test('schemas reject malformed nested public payloads', async () => {
  const { validators } = await loadSchemaValidators();

  assert.equal(validators.get('tui-frame.schema.json')({
    schemaVersion: 'terminal-ui.tui-frame.v1',
    width: 1,
    height: 1,
    cells: [],
    accessibility: { root: { id: 'bad', role: 'text' } }
  }), false);

  assert.equal(validators.get('shell-transcript.schema.json')({
    schemaVersion: 'terminal-ui.shell-transcript.v1',
    id: 'shell',
    commands: [{ input: 'run', status: 'failed', diagnostics: [{}] }],
    diagnostics: []
  }), false);

  assert.equal(validators.get('terminal-capabilities.schema.json')({
    schemaVersion: 'terminal-ui.terminal-capabilities.v1',
    runtime: 'memory',
    isTty: true,
    color: { depth: 0, hasBasicColors: false, has256Colors: false, hasTrueColor: false },
    unicode: { graphemeClusters: true, eastAsianWidth: 'ambiguous-narrow', emojiWidth: 'wide', bidi: 'stable-fallback' },
    rawInput: capabilitySupport('supported'),
    resize: capabilitySupport('supported'),
    hyperlinks: capabilitySupport('unavailable'),
    enhancedKeyboard: capabilitySupport('unavailable'),
    bracketedPaste: capabilitySupport('supported'),
    mouseReporting: capabilitySupport('supported'),
    alternateScreen: capabilitySupport('supported'),
    focusReporting: capabilitySupport('supported'),
    cursorVisibility: capabilitySupport('supported'),
    title: capabilitySupport('supported'),
    bell: capabilitySupport('supported'),
    clipboard: capabilitySupport('unavailable'),
    diagnostics: [{}]
  }), false);

  assert.equal(validators.get('terminal-diagnostic.schema.json')({
    schemaVersion: 'terminal-ui.terminal-diagnostic.v1',
    code: 'UNKNOWN_DIAGNOSTIC',
    severity: 'error',
    message: 'Unknown code should not satisfy the public diagnostic contract.'
  }), false);
});

function capabilitySupport(status) {
  return {
    status,
    confidence: status === 'supported' ? 'assumed' : 'unavailable',
    facts: [{ kind: 'host', name: 'test', value: true }],
    diagnostics: [],
    requiresSessionOperation: false
  };
}

async function loadSchemaValidators() {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const schemas = new Map();
  for (const file of schemaFiles) {
    const schema = JSON.parse(await readFile(new URL(`../../dist/schemas/${file}`, import.meta.url), 'utf8'));
    schemas.set(file, schema);
    ajv.addSchema(schema);
  }

  const validators = new Map();
  for (const [file, schema] of schemas) {
    const validate = ajv.getSchema(schema.$id);
    assert.notEqual(validate, undefined, file);
    validators.set(file, validate);
  }

  return { ajv, validators };
}

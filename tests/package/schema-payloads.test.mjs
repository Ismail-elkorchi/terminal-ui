import assert from 'node:assert/strict';
import {
  readFile } from 'node:fs/promises';
import test from 'node:test';

import Ajv2020 from 'ajv/dist/2020.js';

import { accessibleRoles,
  accessibleSources } from '../../dist/accessibility/index.js';
import { diagnostic,
  terminalDiagnosticCodes } from '../../dist/diagnostics.js';
import { input,
  runPrompt } from '../../dist/prompts/index.js';
import { createTerminalHarness } from '../../dist/testing/index.js';
import { defineTui } from '../../dist/tui/index.js';
import {
  diffFrames,
  renderElementFrame
} from '../../dist/renderer/index.js';
import {
  textInput,
  text
} from '../../dist/components/index.js';

const schemaFiles = [
  'accessible-snapshot.schema.json',
  'interaction-transcript.schema.json',
  'terminal-capabilities.schema.json',
  'terminal-diagnostic.schema.json',
  'prompt-result.schema.json',
  'tui-frame.schema.json',
  'render-diff.schema.json'
];

test('schemas validate payloads emitted by public runtime APIs', async () => {
  const { ajv, validators } = await loadSchemaValidators();

  const harness = createTerminalHarness({ viewport: { columns: 20, rows: 4 } });
  const app = defineTui({
    id: 'schema-payloads',
    init: () => ({ ready: true }),
    update: (state) => ({ state }),
    view: () => textInput({ id: 'schema-field', presentation: { value: 'ready', cursor: 0 } })
  });
  const frame = renderElementFrame(app.definition.view({ ready: true }, {
    host: harness.host,
    viewport: harness.host.getViewport(),
    capabilities: await harness.host.getCapabilities(),
    clock: harness.clock,
    dispatch: () => {}
  }), harness.host.getViewport());
  const nextFrame = renderElementFrame(text('changed', { id: 'changed' }), harness.host.getViewport());
  const diff = diffFrames(frame, nextFrame);
  harness.host.observer?.recordFrame?.(frame);
  harness.host.observer?.recordDiff?.(diff);

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
  assert.deepEqual(
    Object.keys(accessibleSchema.$defs.accessibleNode.properties.window.properties),
    ['startIndex', 'endIndexExclusive', 'totalCount', 'omittedBefore', 'omittedAfter']
  );
  assert.deepEqual(
    Object.keys(accessibleSchema.$defs.accessibleNode.properties.position.properties),
    ['positionInSet', 'setSize', 'level', 'rowIndex', 'rowCount', 'columnIndex', 'columnCount', 'columnLabel', 'group']
  );
  assert.deepEqual(
    transcriptSchema.$defs.accessibleNode.properties.window,
    accessibleSchema.$defs.accessibleNode.properties.window
  );
  assert.deepEqual(
    transcriptSchema.$defs.accessibleNode.properties.position,
    accessibleSchema.$defs.accessibleNode.properties.position
  );
});

test('accessible snapshot schema accepts current names and rejects removed names', async () => {
  const { ajv, validators } = await loadSchemaValidators();
  const validate = validators.get('accessible-snapshot.schema.json');
  const current = {
    schemaVersion: 'terminal-ui.accessible-snapshot.v1',
    source: 'renderer',
    root: {
      id: 'items',
      role: 'listbox',
      window: { startIndex: 0, endIndexExclusive: 1, totalCount: 1 },
      children: [{
        id: 'item',
        role: 'option',
        position: { positionInSet: 1, setSize: 1 }
      }]
    },
    focusPath: [],
    diagnostics: []
  };

  assert.equal(validate(current), true, ajv.errorsText(validate.errors));
  assert.equal(validate({ ...current, source: 'widget' }), false);
  assert.equal(validate({
    ...current,
    root: { ...current.root, window: { start: 0, end: 1, total: 1 } }
  }), false);
  assert.equal(validate({
    ...current,
    root: {
      ...current.root,
      children: [{ id: 'item', role: 'option', position: { itemNumber: 1, itemCount: 1 } }]
    }
  }), false);
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
  const { ajv, validators } = await loadSchemaValidators();
  const frameValidator = validators.get('tui-frame.schema.json');
  const transcriptValidator = validators.get('interaction-transcript.schema.json');

  assert.equal(frameValidator({
    schemaVersion: 'terminal-ui.tui-frame.v1',
    width: 1,
    height: 1,
    widthProfile: { emoji: 'wide', ambiguous: 'narrow' },
    cells: [{
      row: 1,
      column: 1,
      text: 'x',
      width: 1,
      source: {
        ownerId: 'owner',
        ownerKind: 'text',
        family: 'text',
        role: 'text',
        part: 'body',
        partKind: 'segment',
        itemId: 'item',
        itemIndex: 0,
        state: 'selected',
        label: 'Body'
      }
    }],
    accessibility: {
      schemaVersion: 'terminal-ui.accessible-snapshot.v1',
      source: 'tui',
      root: { id: 'ok', role: 'text' },
      focusPath: [],
      diagnostics: []
    }
  }), true, ajv.errorsText(frameValidator.errors));

  assert.equal(frameValidator({
    schemaVersion: 'terminal-ui.tui-frame.v1',
    width: 1,
    height: 1,
    widthProfile: { emoji: 'wide', ambiguous: 'narrow' },
    cells: [{ row: 1, column: 1, text: 'x', width: 1, source: { id: 'legacy', kind: 'old' } }],
    accessibility: { root: { id: 'bad-source', role: 'text' } }
  }), false);

  assert.equal(validators.get('tui-frame.schema.json')({
    schemaVersion: 'terminal-ui.tui-frame.v1',
    width: 1,
    height: 1,
    widthProfile: { emoji: 'wide', ambiguous: 'narrow' },
    cells: [],
    accessibility: { root: { id: 'bad', role: 'text' } }
  }), false);

  assert.equal(validators.get('terminal-capabilities.schema.json')({
    schemaVersion: 'terminal-ui.terminal-capabilities.v1',
    runtime: 'memory',
    isTty: true,
    color: { depth: 0, hasBasicColors: false, has256Colors: false, hasTrueColor: false },
    unicode: { graphemeClusters: true, widthProfile: { emoji: 'wide', ambiguous: 'narrow' }, bidi: 'stable-fallback' },
    rawInput: capabilitySupport('supported'),
    resize: capabilitySupport('supported'),
    hyperlinks: capabilitySupport('unavailable'),
    keyboardProtocol: capabilitySupport('unsupported'),
    bracketedPaste: capabilitySupport('supported'),
    mouseReporting: capabilitySupport('supported'),
    alternateScreen: capabilitySupport('supported'),
    focusReporting: capabilitySupport('supported'),
    cursorVisibility: capabilitySupport('supported'),
    synchronizedOutput: capabilitySupport('unavailable'),
    scrollRegion: capabilitySupport('unavailable'),
    title: capabilitySupport('supported'),
    bell: capabilitySupport('supported'),
    clipboard: capabilitySupport('unavailable'),
    diagnostics: [{}]
  }), false);

  assert.equal(validators.get('terminal-diagnostic.schema.json')({
    schemaVersion: 'terminal-ui.terminal-diagnostic.v1',
    fingerprint: 'diagnostic:unknown',
    code: 'UNKNOWN_DIAGNOSTIC',
    severity: 'error',
    message: 'Unknown code should not satisfy the public diagnostic contract.'
  }), false);

  const keyTranscript = (alternateCodePoints) => ({
    schemaVersion: 'terminal-ui.interaction-transcript.v2',
    id: 'key-transcript',
    source: 'test',
    steps: [{
      kind: 'input',
      event: {
        kind: 'key',
        key: 'a',
        modifiers: { ctrl: false, alt: false, shift: false, meta: false },
        eventType: 'press',
        location: 'standard',
        alternateCodePoints
      }
    }],
    diagnostics: [],
    redactions: []
  });

  assert.equal(transcriptValidator(keyTranscript({ shifted: 65 })), true, ajv.errorsText(transcriptValidator.errors));
  assert.equal(transcriptValidator(keyTranscript({ baseLayout: 97 })), true, ajv.errorsText(transcriptValidator.errors));
  assert.equal(transcriptValidator(keyTranscript({})), false);

  const transcriptWithKeyboardFlags = (flags) => ({
    schemaVersion: 'terminal-ui.interaction-transcript.v2',
    id: 'keyboard-flags',
    source: 'test',
    steps: [{
      kind: 'restore',
      result: {
        status: 'restored',
        reason: 'success',
        requested: terminalStateWithKeyboardFlags(flags),
        attempted: [],
        confirmed: [],
        resultingState: terminalStateWithKeyboardFlags(flags),
        diagnostics: []
      }
    }],
    diagnostics: [],
    redactions: []
  });

  assert.equal(transcriptValidator(transcriptWithKeyboardFlags(24)), true, ajv.errorsText(transcriptValidator.errors));
  assert.equal(transcriptValidator(transcriptWithKeyboardFlags(16)), false);
});

function terminalStateWithKeyboardFlags(flags) {
  return {
    rawInput: false,
    alternateScreen: false,
    bracketedPaste: false,
    mouseReporting: 'none',
    focusReporting: false,
    keyboardProfile: { kind: 'kitty', flags },
    cursorVisible: true,
    provenance: {
      rawInput: 'observed',
      alternateScreen: 'assumed',
      bracketedPaste: 'assumed',
      mouseReporting: 'assumed',
      focusReporting: 'assumed',
      keyboardProfile: 'library_known',
      cursorVisible: 'assumed'
    }
  };
}

function capabilitySupport(support) {
  return {
    support,
    availability: 'available',
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

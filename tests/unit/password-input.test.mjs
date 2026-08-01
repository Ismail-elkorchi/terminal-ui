import assert from 'node:assert/strict';
import test from 'node:test';

import { textInputReducer } from '../../dist/behavior/index.js';
import { passwordInput } from '../../dist/components/index.js';
import { createMemoryTerminalHost } from '../../dist/host/index.js';
import { renderElementFrame, renderFramePlain } from '../../dist/renderer/index.js';
import { renderElementRegions } from '../../dist/renderer/internal/render.js';
import { createTranscriptRecorder } from '../../dist/transcript/index.js';
import { createTuiRuntime, defineTui } from '../../dist/tui/index.js';

test('passwordInput masks graphemes and omits its value from accessibility', () => {
  const secret = 'a🙂e\u0301';
  const frame = renderElementFrame(passwordInput({
    id: 'secret',
    presentation: { value: secret, cursor: secret.length },
    onAction: (action) => action
  }), { columns: 16, rows: 1 });

  assert.equal(renderFramePlain(frame), '› •••');
  assert.doesNotMatch(JSON.stringify(frame), /a🙂/u);
  assert.equal(frame.accessibility.root.role, 'textbox');
  assert.equal('value' in frame.accessibility.root, false);
  assert.match(frame.accessibility.root.description, /Password input/u);
});

test('passwordInput maps masked pointer offsets back to source grapheme boundaries', () => {
  const regions = renderElementRegions(passwordInput({
    id: 'secret-pointer',
    presentation: { value: 'a🙂e\u0301', cursor: 0 },
    onAction: (action) => action
  }), { columns: 16, rows: 1 });
  const target = regions.flatMap((region) => region.hitTargets)
    .find((candidate) => candidate.id === 'secret-pointer:text');
  assert.ok(target);

  const message = target.message(pointerEvent(5));
  assert.deepEqual(message, {
    kind: 'pointer',
    action: { kind: 'placeCaret', offset: 3 }
  });
});

test('passwordInput redacts typed secrets from TUI transcripts', async () => {
  const transcript = createTranscriptRecorder({ id: 'password-input', source: 'tui' });
  const app = defineTui({
    id: 'password-app',
    init: () => ({ buffer: { text: '', cursor: 0 } }),
    update: (state, action) => ({ state: { buffer: textInputReducer(state.buffer, action) } }),
    view: (state) => passwordInput({
      id: 'password',
      presentation: { value: state.buffer.text, cursor: state.buffer.cursor },
      onAction: (action) => action
    }),
    transcript: true
  });
  const runtime = createTuiRuntime({
    app,
    host: createMemoryTerminalHost(),
    transcript
  });

  await runtime.start();
  await runtime.handleInput({ kind: 'text', text: 'hunter2', paste: false });
  const recorded = JSON.stringify(transcript.snapshot());

  assert.equal(runtime.state().buffer.text, 'hunter2');
  assert.doesNotMatch(recorded, /hunter2/u);
  assert.match(recorded, /\[redacted\]/u);
  await runtime.dispose();
});

function pointerEvent(localColumn) {
  return {
    kind: 'pointerDown',
    source: 'mouse',
    row: 1,
    column: localColumn,
    localRow: 1,
    localColumn,
    button: 'left',
    modifiers: { shift: false, alt: false, ctrl: false },
    deltaRows: 0,
    deltaColumns: 0,
    targetId: 'secret-pointer:text',
    raw: {
      kind: 'mouse',
      sequence: '',
      encoding: 'sgr',
      action: 'press',
      button: 'left',
      row: 1,
      column: localColumn,
      rawCode: 0,
      modifiers: { shift: false, alt: false, ctrl: false }
    }
  };
}

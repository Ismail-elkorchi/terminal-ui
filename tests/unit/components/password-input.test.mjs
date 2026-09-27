import assert from 'node:assert/strict';
import test from 'node:test';

import { textInputReducer } from '../../../dist/behavior/index.js';
import { passwordInput } from '../../../dist/components/index.js';
import { createMemoryTerminalHost } from '../../../dist/host/index.js';
import { renderElementFrame, renderFramePlain } from '../../../dist/renderer/index.js';
import { renderElementRegions } from '../../../dist/renderer/internal/render-element.js';
import { createTranscriptRecorder } from '../../../dist/transcript/index.js';
import { createTuiRuntime, defineTui } from '../../../dist/tui/index.js';

test('passwordInput masks graphemes and omits its value from accessibility', () => {
  const secret = 'a🙂e\u0301';
  const frame = renderElementFrame(passwordInput({ meta: { accessibleName: "Password input" },
    id: 'secret',
    state: { text: secret, cursor: secret.length },
    onTransition: (action) => action
  }), { columns: 16, rows: 1 });

  assert.equal(renderFramePlain(frame), '› •••');
  assert.doesNotMatch(JSON.stringify(frame), /a🙂/u);
  assert.equal(frame.accessibility.root.role, 'textbox');
  assert.equal('value' in frame.accessibility.root, false);
  assert.match(frame.accessibility.root.description, /Password input/u);
});

test('passwordInput maps masked pointer offsets back to source grapheme boundaries', () => {
  const regions = renderElementRegions(passwordInput({ meta: { accessibleName: "Password input" },
    id: 'secret-pointer',
    state: { text: 'a🙂e\u0301', cursor: 0 },
    onTransition: (action) => action
  }), { columns: 16, rows: 1 });
  const target = regions.flatMap((region) => region.hitTargets)
    .find((candidate) => candidate.id === 'secret-pointer:text');
  assert.ok(target);

  const message = target.message(pointerEvent(5));
  assert.deepEqual(message, {
    kind: 'pointer',
    transition: { kind: 'placeCaret', offset: 3 }
  });
});

test('passwordInput redacts typed secrets from TUI transcripts', async () => {
  const transcript = createTranscriptRecorder({ id: 'password-input', source: 'tui' });
  const app = defineTui({
    id: 'password-app',
    init: () => ({ state: ({ buffer: { text: '', cursor: 0 } }) }),
    update: (state, action) => ({ state: { buffer: textInputReducer(state.buffer, action) } }),
    view: (state) => passwordInput({ meta: { accessibleName: "Password input" },
      id: 'password',
      state: { text: state.buffer.text, cursor: state.buffer.cursor },
      onTransition: (action) => action
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
  await runtime.handleInput({
    kind: 'key',
    key: 'unknown',
    keyCodePoint: 233,
    sequence: '\u001B[233;3;233u',
    modifiers: { ctrl: false, alt: true, shift: false, meta: false },
    eventType: 'press',
    location: 'standard',
    committedText: 'é'
  });
  const recorded = JSON.stringify(transcript.snapshot());

  assert.equal(runtime.state().buffer.text, 'hunter2é');
  assert.doesNotMatch(recorded, /hunter2/u);
  assert.doesNotMatch(recorded, /é/u);
  assert.match(recorded, /\[redacted\]/u);
  await runtime.dispose();
});

test('password submission and its effect retain sensitive origin through Enter', async () => {
  const secret = 'submission-secret';
  const steps = [];
  const transcript = createTranscriptRecorder({
    id: 'password-submit', source: 'tui', onStep: (step) => steps.push(step),
  });
  let resolveDerived;
  const derived = new Promise((resolve) => { resolveDerived = resolve; });
  const app = defineTui({
    id: 'password-submit-app',
    init: () => ({ state: { buffer: { text: secret, cursor: secret.length } } }),
    update: (state, message) => {
      if (message.kind === 'submit') return {
        state,
        effects: [{
          id: 'derived-secret', concurrency: 'keep-first',
          run: async () => ({ kind: 'message', message: { kind: 'derived', value: message.value } }),
        }],
      };
      if (message.kind === 'derived') resolveDerived();
      return { state };
    },
    view: (state) => passwordInput({
      id: 'password', meta: { accessibleName: 'Password input' }, state: state.buffer,
      onTransition: (transition) => ({ kind: 'edit', transition }),
      onSubmit: (event) => ({ kind: 'submit', value: event.value }),
    }),
  });
  const runtime = createTuiRuntime({ app, host: createMemoryTerminalHost(), transcript });
  await runtime.start();
  await runtime.handleInput({
    kind: 'key', key: 'enter', sequence: '\r', eventType: 'press', location: 'standard',
    modifiers: { ctrl: false, alt: false, shift: false, meta: false },
  });
  await derived;
  await runtime.dispatch({ kind: 'ordinary', value: 'public' });
  const recorded = JSON.stringify({ snapshot: transcript.snapshot(), steps });
  assert.doesNotMatch(recorded, /submission-secret/u);
  assert.match(recorded, /\[redacted\]/u);
  assert.match(recorded, /public/u);
  await runtime.dispose();
});

test('password pointer context messages are redacted even before the field owns focus', async () => {
  const secret = 'pointer-secret';
  const transcript = createTranscriptRecorder({ id: 'password-pointer', source: 'tui' });
  const app = defineTui({
    id: 'password-pointer-app',
    init: () => ({ state: { text: secret } }),
    update: (state) => ({ state }),
    view: (state) => passwordInput({
      id: 'password', meta: { accessibleName: 'Password input' },
      state: { text: state.text, cursor: 0 },
      onTransition: () => ({ kind: 'edit' }),
      onContextMenu: () => ({ kind: 'context', value: state.text }),
    }),
  });
  const runtime = createTuiRuntime({ app, host: createMemoryTerminalHost(), transcript });
  await runtime.start();
  await runtime.handleInput({
    kind: 'mouse', sequence: '\u001b[<2;4;1M', encoding: 'sgr', action: 'press',
    button: 'right', row: 1, column: 4, rawCode: 2,
    modifiers: { shift: false, alt: false, ctrl: false },
  });
  const recorded = JSON.stringify(transcript.snapshot());
  assert.doesNotMatch(recorded, /pointer-secret/u);
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

import assert from 'node:assert/strict';
import test from 'node:test';

import { createTerminalHarness } from '../../dist/testing/index.js';
import { validateTranscript } from '../../dist/transcript/index.js';

const modifiers = { ctrl: false, alt: false, shift: false, meta: false };
const mouseModifiers = { shift: false, alt: false, ctrl: false };

test('transcript validation rejects malformed top-level and step discriminants', () => {
  const cases = [
    [null, /must be an object/u],
    [{}, /schema version/u],
    [transcript(), /id must not be empty/u],
    [transcript({ id: 'valid', source: 'other' }), /source/u],
    [transcript({ id: 'valid', startedAt: 1 }), /startedAt/u],
    [transcript({ id: 'valid', steps: null }), /steps must be an array/u],
    [transcript({ id: 'valid', diagnostics: null }), /diagnostics must be an array/u],
    [transcript({ id: 'valid', redactions: null }), /redactions must be an array/u],
    [transcript({ id: 'valid', steps: [null] }), /step must be an object/u],
    [transcript({ id: 'valid', steps: [{ kind: 'other' }] }), /unsupported step kind/u],
    [transcript({ id: 'valid', steps: [{ kind: 'message', source: 'other', message: {} }] }), /message source/u],
    [transcript({ id: 'valid', steps: [{ kind: 'message', source: 'input' }] }), /requires message/u],
    [transcript({ id: 'valid', redactions: [{ path: 1, reason: 'secret' }] }), /redaction/u]
  ];

  for (const [value, pattern] of cases) {
    assertInvalid(value, pattern);
  }
});

test('transcript validation rejects malformed input-event variants', () => {
  const validKey = {
    kind: 'key',
    key: 'enter',
    modifiers,
    eventType: 'press',
    location: 'standard'
  };
  const validMouse = {
    kind: 'mouse',
    sequence: '\u001B[<0;1;1M',
    encoding: 'sgr',
    action: 'press',
    button: 'left',
    row: 1,
    column: 1,
    rawCode: 0,
    modifiers: mouseModifiers
  };
  const events = [
    [null, /input event must be an object/u],
    [{ kind: 'text', text: 1, paste: false }, /text event/u],
    [{ kind: 'paste', text: 'x', bracketed: 'yes' }, /paste event/u],
    [{ ...validKey, key: 'other' }, /key name/u],
    [{ ...validKey, modifiers: null }, /requires modifiers/u],
    [{ ...validKey, modifiers: { ...modifiers, ctrl: 1 } }, /require ctrl/u],
    [{ ...validKey, sequence: 1 }, /sequence/u],
    [{ ...validKey, committedText: 1 }, /committedText/u],
    [{ ...validKey, alternateCodePoints: {} }, /requires shifted or baseLayout/u],
    [{ ...validKey, alternateCodePoints: { shifted: 0xd800 } }, /shifted alternate/u],
    [{ ...validKey, eventType: 'other' }, /eventType/u],
    [{ ...validKey, location: 'other' }, /location/u],
    [{ ...validMouse, encoding: 'other' }, /mouse encoding/u],
    [{ ...validMouse, action: 'other' }, /mouse action/u],
    [{ ...validMouse, button: 'other' }, /mouse button/u],
    [{ ...validMouse, row: 0 }, /positive integers/u],
    [{ ...validMouse, rawCode: 0.5 }, /rawCode/u],
    [{ ...validMouse, modifiers: { ...mouseModifiers, alt: 1 } }, /require alt/u],
    [{ kind: 'resize', viewport: { columns: 0, rows: 1 } }, /viewport/u],
    [{ kind: 'focus', focused: 'yes' }, /focus event/u],
    [{ kind: 'signal', signal: '' }, /signal event/u],
    [{ kind: 'unknown', sequence: 1 }, /unknown event/u],
    [{ kind: 'other' }, /unsupported input event/u]
  ];

  for (const [event, pattern] of events) {
    assertInvalid(transcript({ id: 'invalid-input', steps: [{ kind: 'input', event }] }), pattern);
  }
});

test('transcript validation rejects malformed frame and render-diff payloads', () => {
  const snapshot = createTerminalHarness().snapshot();
  const validFrame = {
    schemaVersion: 'terminal-ui.tui-frame.v1',
    width: 2,
    height: 1,
    cells: [{ row: 1, column: 1, text: 'x', width: 1 }],
    accessibility: snapshot
  };
  const validDiff = {
    schemaVersion: 'terminal-ui.render-diff.v2',
    width: 2,
    height: 1,
    fullRewrite: false,
    operations: [{ kind: 'write', row: 1, column: 1, spans: [{ text: 'x' }] }]
  };
  const frames = [
    [{ ...validFrame, width: -1 }, /width and height/u],
    [{ ...validFrame, cells: null }, /cells must be an array/u],
    [{ ...validFrame, cells: [null] }, /cell 0/u],
    [{ ...validFrame, cells: [{ row: 0, column: 1, text: 'x', width: 1 }] }, /positive integers/u],
    [{ ...validFrame, cells: [{ row: 1, column: 1, text: 1, width: 1 }] }, /text must be a string/u],
    [{ ...validFrame, cells: [{ row: 1, column: 1, text: 'x', width: -1 }] }, /width must be/u],
    [{ ...validFrame, cursor: { row: 0, column: 1 } }, /frame cursor/u],
    [{ ...validFrame, focusPath: [1] }, /focusPath/u],
    [{ ...validFrame, accessibility: null }, /accessibility/u]
  ];
  const diffs = [
    [{ ...validDiff, width: -1 }, /width and height/u],
    [{ ...validDiff, fullRewrite: 1 }, /fullRewrite/u],
    [{ ...validDiff, operations: null }, /operations must be an array/u],
    [{ ...validDiff, cursor: { row: 2, column: 1 } }, /cursor must fit/u],
    [{ ...validDiff, dirtyRegions: {} }, /dirtyRegions must be an array/u],
    [{ ...validDiff, dirtyRegions: [{ row: 1, column: 1, width: 3, height: 1 }] }, /bounds must fit/u],
    [{ ...validDiff, operations: [null] }, /operation must be an object/u],
    [{ ...validDiff, operations: [{ kind: 'write', row: 1, column: 1, spans: [] }] }, /at least one span/u],
    [{ ...validDiff, operations: [{ kind: 'write', row: 1, column: 1, spans: [{ text: '' }] }] }, /at least one terminal cell/u],
    [{ ...validDiff, operations: [{ kind: 'write', row: 1, column: 2, spans: [{ text: 'xx' }] }] }, /must fit/u],
    [{ ...validDiff, operations: [{ kind: 'clearRect', bounds: { row: 0, column: 1, width: 1, height: 1 } }] }, /clearRect bounds/u],
    [{ ...validDiff, operations: [{ kind: 'other' }] }, /unsupported diff operation/u]
  ];

  for (const [frame, pattern] of frames) {
    assertInvalid(transcript({ id: 'invalid-frame', steps: [{ kind: 'frame', frame }] }), pattern);
  }
  for (const [diff, pattern] of diffs) {
    assertInvalid(transcript({ id: 'invalid-diff', steps: [{ kind: 'diff', diff }] }), pattern);
  }
});

test('transcript validation rejects malformed restore checkpoints', () => {
  const checkpoint = {
    rawInput: false,
    alternateScreen: false,
    bracketedPaste: false,
    mouseReporting: 'none',
    focusReporting: false,
    keyboardProfile: { kind: 'legacy' },
    cursorVisible: true
  };
  const cases = [
    [null, /must be an object/u],
    [{ ...checkpoint, rawInput: 'no' }, /rawInput/u],
    [{ ...checkpoint, alternateScreen: 'no' }, /alternateScreen/u],
    [{ ...checkpoint, bracketedPaste: 'no' }, /bracketedPaste/u],
    [{ ...checkpoint, mouseReporting: 'other' }, /mouseReporting/u],
    [{ ...checkpoint, focusReporting: 'no' }, /focusReporting/u],
    [{ ...checkpoint, keyboardProfile: { kind: 'kitty', flags: 16 } }, /keyboardProfile/u],
    [{ ...checkpoint, cursorVisible: 'yes' }, /cursorVisible/u]
  ];

  for (const [value, pattern] of cases) {
    assertInvalid(transcript({ id: 'invalid-restore', steps: [{ kind: 'restore', checkpoint: value }] }), pattern);
  }
});

function transcript(overrides = {}) {
  return {
    schemaVersion: 'terminal-ui.interaction-transcript.v2',
    id: '',
    source: 'test',
    steps: [],
    diagnostics: [],
    redactions: [],
    ...overrides
  };
}

function assertInvalid(value, pattern) {
  const result = validateTranscript(value);
  assert.equal(result.ok, false);
  assert.match(result.error.message, pattern);
}

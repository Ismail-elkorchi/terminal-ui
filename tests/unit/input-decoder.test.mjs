import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createInputDecoder,
  createInputPipeline,
  decodeInputChunk,
  resolveInputPipelineProfile
} from '../../dist/input/index.js';
import { resolveTerminalCapabilities } from '../../dist/host/index.js';
import { kittyKeyboardProfile } from '../../dist/protocol/index.js';

const kittyEvents = kittyKeyboardProfile(3);
const kittyFull = kittyKeyboardProfile(31);

function expectedKey(key, sequence, modifiers = {}) {
  return {
    kind: 'key',
    key,
    sequence,
    modifiers: { ctrl: false, alt: false, shift: false, meta: false, ...modifiers },
    eventType: 'press',
    location: 'standard'
  };
}

test('input decoder normalizes basic control keys', () => {
  assert.equal(decodeInputChunk({ data: '\u0003' })[0]?.kind, 'key');
  assert.deepEqual(decodeInputChunk({ data: '\u0003' })[0], expectedKey('c', '\u0003', { ctrl: true }));
  assert.deepEqual(decodeInputChunk({ data: '\u0011' })[0], expectedKey('q', '\u0011', { ctrl: true }));
});

test('input decoder normalizes shifted navigation keys', () => {
  assert.deepEqual(decodeInputChunk({ data: '\u001B[1;2B' })[0], expectedKey('arrowDown', '\u001B[1;2B', { shift: true }));
  assert.deepEqual(decodeInputChunk({ data: '\u001B[Z' })[0], expectedKey('tab', '\u001B[Z', { shift: true }));
});

test('input decoder normalizes xterm modified navigation keys', () => {
  assert.deepEqual(decodeInputChunk({ data: '\u001B[1;5D' })[0], expectedKey('arrowLeft', '\u001B[1;5D', { ctrl: true }));
  assert.deepEqual(decodeInputChunk({ data: '\u001B[3;4~' })[0], expectedKey('delete', '\u001B[3;4~', { alt: true, shift: true }));
  assert.deepEqual(decodeInputChunk({ data: '\u001B[6;9~' })[0], expectedKey('pageDown', '\u001B[6;9~', { meta: true }));
});

test('input decoder recognizes common home and end sequence variants', () => {
  assert.equal(decodeInputChunk({ data: '\u001BOH' })[0]?.key, 'home');
  assert.equal(decodeInputChunk({ data: '\u001BOF' })[0]?.key, 'end');
  assert.equal(decodeInputChunk({ data: '\u001B[1~' })[0]?.key, 'home');
  assert.equal(decodeInputChunk({ data: '\u001B[4~' })[0]?.key, 'end');
});

test('input decoder distinguishes paste, focus, mouse, and text runs', () => {
  const events = decodeInputChunk({ data: 'a\u001B[200~pasted\ntext\u001B[201~\u001B[I\u001B[<0;4;5M\u001B[O' });

  assert.deepEqual(events, [
    { kind: 'text', text: 'a', paste: false },
    { kind: 'paste', text: 'pasted\ntext', bracketed: true },
    { kind: 'focus', focused: true },
    {
      kind: 'mouse',
      sequence: '\u001B[<0;4;5M',
      encoding: 'sgr',
      action: 'press',
      button: 'left',
      row: 5,
      column: 4,
      rawCode: 0,
      modifiers: { shift: false, alt: false, ctrl: false }
    },
    { kind: 'focus', focused: false }
  ]);
});

test('input decoder parses mouse release, wheel, and legacy mouse reports', () => {
  assert.deepEqual(decodeInputChunk({ data: '\u001B[<0;4;5m' })[0], {
    kind: 'mouse',
    sequence: '\u001B[<0;4;5m',
    encoding: 'sgr',
    action: 'release',
    button: 'none',
    row: 5,
    column: 4,
    rawCode: 0,
    modifiers: { shift: false, alt: false, ctrl: false }
  });
  assert.deepEqual(decodeInputChunk({ data: '\u001B[<64;2;3M' })[0], {
    kind: 'mouse',
    sequence: '\u001B[<64;2;3M',
    encoding: 'sgr',
    action: 'wheel',
    button: 'wheelUp',
    deltaRows: -1,
    deltaColumns: 0,
    row: 3,
    column: 2,
    rawCode: 64,
    modifiers: { shift: false, alt: false, ctrl: false }
  });
  assert.deepEqual(decodeInputChunk({ data: '\u001B[<67;2;3M' })[0], {
    kind: 'mouse',
    sequence: '\u001B[<67;2;3M',
    encoding: 'sgr',
    action: 'wheel',
    button: 'wheelRight',
    deltaRows: 0,
    deltaColumns: 1,
    row: 3,
    column: 2,
    rawCode: 67,
    modifiers: { shift: false, alt: false, ctrl: false }
  });
  assert.deepEqual(decodeInputChunk({ data: '\u001B[M !!' })[0], {
    kind: 'mouse',
    sequence: '\u001B[M !!',
    encoding: 'x10',
    action: 'press',
    button: 'left',
    row: 1,
    column: 1,
    rawCode: 0,
    modifiers: { shift: false, alt: false, ctrl: false }
  });
});

test('input decoder preserves unknown escape sequences as unknown events', () => {
  assert.deepEqual(decodeInputChunk({ data: '\u001B[99~x' }), [
    { kind: 'unknown', sequence: '\u001B[99~' },
    { kind: 'text', text: 'x', paste: false }
  ]);
});

test('stateful input decoder buffers split paste and CSI reports', () => {
  const decoder = createInputDecoder();

  assert.deepEqual(decoder.decode({ data: 'a\u001B[200~pa' }).events, [
    { kind: 'text', text: 'a', paste: false }
  ]);
  assert.deepEqual(decoder.decode({ data: 'sted\u001B[201~\u001B[' }).events, [
    { kind: 'paste', text: 'pasted', bracketed: true }
  ]);
  assert.deepEqual(decoder.decode({ data: 'I\u001B[<0;4' }).events, [
    { kind: 'focus', focused: true }
  ]);
  assert.deepEqual(decoder.decode({ data: ';5M' }).events, [
    {
      kind: 'mouse',
      sequence: '\u001B[<0;4;5M',
      encoding: 'sgr',
      action: 'press',
      button: 'left',
      row: 5,
      column: 4,
      rawCode: 0,
      modifiers: { shift: false, alt: false, ctrl: false }
    }
  ]);
});

test('stateful input decoder holds an ambiguous Escape prefix across chunks', () => {
  const cases = [
    { suffix: '[A', expected: expectedKey('arrowUp', '\u001B[A') },
    { suffix: 'OQ', expected: expectedKey('f2', '\u001BOQ') },
    { suffix: 'x', expected: expectedKey('x', '\u001Bx', { alt: true }) }
  ];

  for (const item of cases) {
    const decoder = createInputDecoder();
    assert.deepEqual(decoder.decode({ data: '\u001B' }), {
      events: [],
      pending: { kind: 'escape' }
    }, item.suffix);
    assert.deepEqual(decoder.decode({ data: item.suffix }), {
      events: [item.expected],
      pending: { kind: 'none' }
    }, item.suffix);
  }

  const isolated = createInputDecoder();
  assert.deepEqual(isolated.decode({ data: '\u001B' }), {
    events: [],
    pending: { kind: 'escape' }
  });
  assert.deepEqual(isolated.flush(), {
    events: [expectedKey('escape', '\u001B')],
    pending: { kind: 'none' }
  });
});

test('stateful input decoder flushes incomplete buffered input deterministically', () => {
  const decoder = createInputDecoder();

  assert.deepEqual(decoder.decode({ data: '\u001B[200~unfinished' }), {
    events: [],
    pending: { kind: 'sequence' }
  });
  assert.deepEqual(decoder.flush(), {
    events: [
      { kind: 'unknown', sequence: '\u001B[200~' },
      { kind: 'text', text: 'unfinished', paste: false }
    ],
    pending: { kind: 'none' }
  });
});

test('Kitty full keyboard reports preserve alternate key identity and committed text', () => {
  const sequence = '\u001B[97:65:113;2:1;65u';
  assert.deepEqual(decodeInputChunk({ data: sequence }, { keyboard: kittyFull }), [{
    ...expectedKey('a', sequence, { shift: true }),
    alternateCodePoints: { shifted: 65, baseLayout: 113 },
    committedText: 'A'
  }]);
});

test('Kitty fields are exposed only when their negotiated flags are active', () => {
  const sequence = '\u001B[97:65:113;2:1;65u';
  assert.deepEqual(decodeInputChunk({ data: sequence }, { keyboard: kittyEvents }), [
    expectedKey('a', sequence, { shift: true })
  ]);
});

test('Kitty reports reject malformed alternate and associated text scalars', () => {
  assert.deepEqual(decodeInputChunk({
    data: '\u001B[97:55296;1u'
  }, { keyboard: kittyFull }), [
    { kind: 'unknown', sequence: '\u001B[97:55296;1u' }
  ]);
  assert.deepEqual(decodeInputChunk({
    data: '\u001B[97;1;31u'
  }, { keyboard: kittyFull }), [
    { kind: 'unknown', sequence: '\u001B[97;1;31u' }
  ]);
});

test('input decoder recognizes bracketed paste by default and can disable that protocol', () => {
  const data = '\u001B[200~pasted\ntext\u001B[201~';

  assert.deepEqual(decodeInputChunk({ data }), [
    { kind: 'paste', text: 'pasted\ntext', bracketed: true }
  ]);

  assert.deepEqual(decodeInputChunk({ data }, { bracketedPaste: false }), [
    { kind: 'unknown', sequence: '\u001B[200~' },
    { kind: 'text', text: 'pasted', paste: false },
    expectedKey('enter', '\n'),
    { kind: 'text', text: 'text', paste: false },
    { kind: 'unknown', sequence: '\u001B[201~' }
  ]);
});

test('stateful input decoder only buffers split bracketed paste when recognition is enabled', () => {
  const enabled = createInputDecoder();
  assert.deepEqual(enabled.decode({ data: '\u001B[200~half' }).events, []);
  assert.deepEqual(enabled.decode({ data: 'done\u001B[201~' }).events, [
    { kind: 'paste', text: 'halfdone', bracketed: true }
  ]);

  const disabled = createInputDecoder({ bracketedPaste: false });
  assert.deepEqual(disabled.decode({ data: '\u001B[200~half' }).events, [
    { kind: 'unknown', sequence: '\u001B[200~' },
    { kind: 'text', text: 'half', paste: false }
  ]);
  assert.deepEqual(disabled.decode({ data: 'done\u001B[201~' }).events, [
    { kind: 'text', text: 'done', paste: false },
    { kind: 'unknown', sequence: '\u001B[201~' }
  ]);
});

test('input pipeline selects the legacy profile and preserves bracketed paste boundaries by default', () => {
  const pipeline = createInputPipeline();

  assert.deepEqual(pipeline.profile.keyboard, { active: { kind: 'legacy' }, requested: 'auto' });
  assert.equal(pipeline.profile.bracketedPaste, true);
  assert.deepEqual(pipeline.profile.diagnostics, []);
  assert.deepEqual(pipeline.decode({ data: 'a\u001B[200~pasted\u001B[201~' }).events, [
    { kind: 'text', text: 'a', paste: false },
    { kind: 'paste', text: 'pasted', bracketed: true }
  ]);
});

test('input pipeline follows the active session protocol for bracketed paste parsing', () => {
  const pipeline = createInputPipeline({ bracketedPaste: false });

  assert.equal(pipeline.profile.bracketedPaste, false);
  assert.deepEqual(pipeline.decodeOnce({ data: '\u001B[200~pasted\ntext\u001B[201~' }), [
    { kind: 'unknown', sequence: '\u001B[200~' },
    { kind: 'text', text: 'pasted', paste: false },
    expectedKey('enter', '\n'),
    { kind: 'text', text: 'text', paste: false },
    { kind: 'unknown', sequence: '\u001B[201~' }
  ]);
});

test('input pipeline activates an explicitly supported Kitty keyboard profile', () => {
  const capabilities = resolveTerminalCapabilities({
    host: {
      runtime: 'memory',
      inputIsTty: true,
      outputIsTty: true,
      rawInput: true,
      resizeEvents: true,
      terminalProtocols: true
    },
    overrides: {
      keyboardProtocol: true
    }
  });
  const profile = resolveInputPipelineProfile({ capabilities, keyboard: kittyEvents });

  assert.deepEqual(profile.keyboard, { active: kittyEvents, requested: kittyEvents });
  assert.deepEqual(profile.diagnostics, []);
});

test('input pipeline reports Kitty keyboard fallback instead of faking support', () => {
  const capabilities = resolveTerminalCapabilities({
    host: {
      runtime: 'memory',
      inputIsTty: true,
      outputIsTty: true,
      rawInput: true,
      resizeEvents: true,
      terminalProtocols: true
    }
  });
  const profile = resolveInputPipelineProfile({ capabilities, keyboard: kittyEvents });

  assert.deepEqual(profile.keyboard, { active: { kind: 'legacy' }, requested: kittyEvents });
  assert.equal(profile.diagnostics[0]?.code, 'INPUT_PROFILE_UNSUPPORTED');
  assert.equal(profile.diagnostics[0]?.severity, 'warning');
});

test('Kitty keyboard decoder preserves modifiers, event types, and keypad locations', () => {
  const options = { keyboard: kittyEvents };

  assert.deepEqual(decodeInputChunk({ data: '\u001B[97;5:2u' }, options)[0], {
    ...expectedKey('a', '\u001B[97;5:2u', { ctrl: true }),
    eventType: 'repeat'
  });
  assert.deepEqual(decodeInputChunk({ data: '\u001B[1;2:3D' }, options)[0], {
    ...expectedKey('arrowLeft', '\u001B[1;2:3D', { shift: true }),
    eventType: 'release'
  });
  assert.deepEqual(decodeInputChunk({ data: '\u001B[57400;1:1u' }, options)[0], {
    ...expectedKey('1', '\u001B[57400;1:1u'),
    location: 'numpad'
  });
  assert.deepEqual(decodeInputChunk({ data: '\u001B[1;1:2R' }, options)[0], {
    ...expectedKey('f3', '\u001B[1;1:2R'),
    eventType: 'repeat'
  });
});

test('Kitty keyboard decoder buffers split reports without changing legacy parsing', () => {
  const decoder = createInputDecoder({ keyboard: kittyEvents });
  assert.deepEqual(decoder.decode({ data: '\u001B[97;5:' }).events, []);
  assert.deepEqual(decoder.decode({ data: '2u' }).events, [{
    ...expectedKey('a', '\u001B[97;5:2u', { ctrl: true }),
    eventType: 'repeat'
  }]);

  assert.deepEqual(decodeInputChunk({ data: '\u001B[97;5:2u' }), [
    { kind: 'unknown', sequence: '\u001B[97;5:2u' }
  ]);
});

test('input pipeline disables bracketed paste when capabilities do not support it', () => {
  const capabilities = resolveTerminalCapabilities({
    host: {
      runtime: 'memory',
      inputIsTty: false,
      outputIsTty: true,
      rawInput: true,
      resizeEvents: false,
      terminalProtocols: true
    }
  });
  const profile = resolveInputPipelineProfile({ capabilities });

  assert.equal(profile.bracketedPaste, false);
});

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createInputDecoder,
  createInputPipeline,
  decodeInputChunk,
  InputDecodeError,
  matchesInputTrigger,
  decodeInputTrigger,
  resolveInputPipelineProfile
} from '../../dist/input/index.js';
import { resolveTerminalCapabilities } from '../../dist/host/index.js';
import { decodeKeyboardProfile, kittyKeyboardProfile } from '../../dist/protocol/index.js';

const kittyEvents = kittyKeyboardProfile(3);
const kittyDisambiguate = kittyKeyboardProfile(1);
const kittyFull = kittyKeyboardProfile(31);

test('Kitty report-all and associated-text flags follow the protocol dependency', () => {
  const accepted = [
    1, 2, 3, 4, 5, 6, 7,
    8, 9, 10, 11, 12, 13, 14, 15,
    24, 25, 26, 27, 28, 29, 30, 31
  ];
  for (const flags of accepted) assert.doesNotThrow(() => kittyKeyboardProfile(flags));
  for (let flags = 16; flags <= 23; flags += 1) {
    assert.throws(() => kittyKeyboardProfile(flags), /associated text/u);
  }
});

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
  const events = decodeInputChunk(
    { data: 'a\u001B[200~pasted\ntext\u001B[201~\u001B[I\u001B[<0;4;5M\u001B[O' },
    { bracketedPaste: true, focusReporting: true, mouseReporting: 'drag' }
  );

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

test('input decoder parses bounded SGR mouse reports and does not claim X10 support', () => {
  const mouse = { mouseReporting: 'drag' };
  assert.deepEqual(decodeInputChunk({ data: '\u001B[<0;4;5m' }, mouse)[0], {
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
  assert.deepEqual(decodeInputChunk({ data: '\u001B[<64;2;3M' }, mouse)[0], {
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
  assert.deepEqual(decodeInputChunk({ data: '\u001B[<67;2;3M' }, mouse)[0], {
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
  assert.equal(decodeInputChunk({ data: '\u001B[M !!' }, mouse).some((event) => event.kind === 'mouse'), false);
});

test('mouse decoding follows the exact reporting mode applied by the session', () => {
  const drag = '\u001B[<32;4;3M';
  const move = '\u001B[<35;4;3M';

  assert.equal(decodeInputChunk({ data: drag }, { mouseReporting: 'click' })[0]?.kind, 'unknown');
  assert.equal(decodeInputChunk({ data: drag }, { mouseReporting: 'drag' })[0]?.kind, 'mouse');
  assert.equal(decodeInputChunk({ data: move }, { mouseReporting: 'drag' })[0]?.kind, 'unknown');
  assert.equal(decodeInputChunk({ data: move }, { mouseReporting: 'all' })[0]?.kind, 'mouse');
});

test('input decoder preserves unknown escape sequences as unknown events', () => {
  assert.deepEqual(decodeInputChunk({ data: '\u001B[99~x' }), [
    { kind: 'unknown', sequence: '\u001B[99~' },
    { kind: 'text', text: 'x', paste: false }
  ]);
});

test('stateful input decoder buffers split paste and CSI reports', () => {
  const decoder = createInputDecoder({
    bracketedPaste: true,
    focusReporting: true,
    mouseReporting: 'drag'
  });

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
    {
      suffix: 'x',
      expected: { ...expectedKey('x', '\u001Bx', { alt: true }), keyCodePoint: 120 }
    }
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
  const decoder = createInputDecoder({ bracketedPaste: true });

  assert.deepEqual(decoder.decode({ data: '\u001B[200~unfinished' }), {
    events: [],
    pending: { kind: 'paste' }
  });
  assert.deepEqual(decoder.flush(), {
    events: [{ kind: 'unknown', sequence: '\u001B[200~unfinished' }],
    pending: { kind: 'none' }
  });
});

test('input decoder never emits C0 or C1 controls as text', () => {
  for (let codePoint = 0; codePoint <= 0x1f; codePoint += 1) {
    const sequence = String.fromCodePoint(codePoint);
    const events = decodeInputChunk({ data: sequence });
    assert.equal(events.some((event) => event.kind === 'text'), false, `U+${codePoint.toString(16)}`);
  }
  for (let codePoint = 0x7f; codePoint <= 0x9f; codePoint += 1) {
    const sequence = String.fromCodePoint(codePoint);
    const events = decodeInputChunk({ data: sequence });
    assert.equal(events.some((event) => event.kind === 'text'), false, `U+${codePoint.toString(16)}`);
  }
  assert.deepEqual(
    decodeInputChunk({ data: '\u001C\u001D\u001E\u001F' }).map((event) => event.keyCodePoint),
    [92, 93, 94, 95]
  );
});

test('Kitty full keyboard reports preserve alternate key identity and committed text', () => {
  const sequence = '\u001B[97:65:113;2:1;65u';
  assert.deepEqual(decodeInputChunk({ data: sequence }, { keyboard: kittyFull }), [{
    ...expectedKey('a', sequence, { shift: true }),
    keyCodePoint: 97,
    alternateCodePoints: { shifted: 65, baseLayout: 113 },
    committedText: 'A'
  }]);
});

test('Kitty report-all profiles accept key events that do not produce associated text', () => {
  const ctrlA = '\u001B[97;5u';
  assert.deepEqual(decodeInputChunk({ data: ctrlA }, { keyboard: kittyFull }), [{
    ...expectedKey('a', ctrlA, { ctrl: true }),
    keyCodePoint: 97
  }]);

  const reportAll = kittyKeyboardProfile(8);
  const plainA = '\u001B[97u';
  assert.deepEqual(decodeInputChunk({ data: plainA }, { keyboard: reportAll }), [{
    ...expectedKey('a', plainA),
    keyCodePoint: 97
  }]);
});

test('legacy decoding accepts the base CSI-u grammar without unnegotiated extensions', () => {
  const ctrlA = '\u001B[97;5u';
  assert.deepEqual(decodeInputChunk({ data: ctrlA }), [{
    ...expectedKey('a', ctrlA, { ctrl: true }),
    keyCodePoint: 97
  }]);

  const eventType = '\u001B[97;5:2u';
  assert.deepEqual(decodeInputChunk({ data: eventType }), [
    { kind: 'unknown', sequence: eventType }
  ]);
});

test('input triggers match normalized, code-point, and base-layout physical key identities', () => {
  const [event] = decodeInputChunk({ data: '\u001B[97:65:113;2:2;65u' }, { keyboard: kittyFull });
  assert.equal(matchesInputTrigger({ kind: 'key', key: 'a', eventType: 'repeat', modifiers: { shift: true } }, event), true);
  assert.equal(matchesInputTrigger({ kind: 'codePoint', codePoint: 97, eventType: 'repeat', modifiers: { shift: true } }, event), true);
  assert.equal(matchesInputTrigger({ kind: 'codePoint', codePoint: 65, source: 'shifted', eventType: 'repeat', modifiers: { shift: true } }, event), true);
  assert.equal(matchesInputTrigger({ kind: 'physicalKey', codePoint: 113, eventType: 'repeat', modifiers: { shift: true } }, event), true);
  assert.equal(matchesInputTrigger({ kind: 'physicalKey', codePoint: 97, eventType: 'repeat', modifiers: { shift: true } }, event), false);
});

test('Kitty reports using unnegotiated optional fields remain unknown', () => {
  const sequence = '\u001B[97:65:113;2:1;65u';
  assert.deepEqual(decodeInputChunk({ data: sequence }, { keyboard: kittyEvents }), [
    { kind: 'unknown', sequence }
  ]);

  const unnegotiatedEventType = '\u001B[13;1:3u';
  assert.deepEqual(decodeInputChunk({ data: unnegotiatedEventType }, { keyboard: kittyDisambiguate }), [
    { kind: 'unknown', sequence: unnegotiatedEventType }
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

test('input decoder recognizes bracketed paste only when the protocol is enabled', () => {
  const data = '\u001B[200~pasted\ntext\u001B[201~';

  assert.deepEqual(decodeInputChunk({ data }, { bracketedPaste: true }), [
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
  const enabled = createInputDecoder({ bracketedPaste: true });
  const pendingPaste = enabled.decode({ data: '\u001B[200~half' });
  assert.deepEqual(pendingPaste.events, []);
  assert.equal(pendingPaste.pending.kind, 'paste');
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

test('input triggers reject type coercion at the JavaScript boundary', () => {
  assert.throws(
    () => decodeInputTrigger({ kind: 'codePoint', codePoint: '97' }),
    /numeric Unicode scalar/u
  );
  assert.deepEqual(decodeInputTrigger({ kind: 'codePoint', codePoint: 97 }), {
    kind: 'codePoint',
    codePoint: 97
  });
});

test('input pipeline uses an explicit legacy profile and conservative protocol defaults', () => {
  const pipeline = createInputPipeline();

  assert.deepEqual(pipeline.profile.keyboard, { active: { kind: 'legacy' }, requested: { kind: 'legacy' } });
  assert.equal(pipeline.profile.bracketedPaste, false);
  assert.deepEqual(pipeline.profile.diagnostics, []);
  assert.equal(
    pipeline.decode({ data: 'a\u001B[200~pasted\u001B[201~' }).events.some((event) => event.kind === 'paste'),
    false
  );
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
    keyCodePoint: 97,
    eventType: 'repeat'
  });
  assert.deepEqual(decodeInputChunk({ data: '\u001B[1;2:3D' }, options)[0], {
    ...expectedKey('arrowLeft', '\u001B[1;2:3D', { shift: true }),
    eventType: 'release'
  });
  assert.deepEqual(decodeInputChunk({ data: '\u001B[57400;1:1u' }, options)[0], {
    ...expectedKey('1', '\u001B[57400;1:1u'),
    keyCodePoint: 57400,
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
    keyCodePoint: 97,
    eventType: 'repeat'
  }]);

  assert.deepEqual(decodeInputChunk({ data: '\u001B[97;5:2u' }), [
    { kind: 'unknown', sequence: '\u001B[97;5:2u' }
  ]);
});

test('Kitty keyboard decoder preserves unsupported functional key identity', () => {
  const sequence = '\u001B[57430;1:1u';
  assert.deepEqual(decodeInputChunk({ data: sequence }, { keyboard: kittyEvents }), [{
    ...expectedKey('unknown', sequence),
    keyCodePoint: 57430
  }]);
});

test('Kitty keyboard decoder rejects invalid primary Unicode scalars as unknown input', () => {
  for (const sequence of ['\u001B[1114112u', '\u001B[55296u']) {
    assert.deepEqual(decodeInputChunk({ data: sequence }, { keyboard: kittyEvents }), [{
      kind: 'unknown',
      sequence
    }]);
  }
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

test('stateful input decoder preserves UTF-8 scalars split at every byte boundary', () => {
  const value = 'Aé€🙂éZ';
  const bytes = new TextEncoder().encode(value);
  for (let split = 1; split < bytes.length; split += 1) {
    const decoder = createInputDecoder();
    const events = [
      ...decoder.decode({ data: bytes.slice(0, split) }).events,
      ...decoder.decode({ data: bytes.slice(split) }).events,
      ...decoder.flush().events
    ];
    assert.equal(events.map((event) => event.kind === 'text' ? event.text : '').join(''), value, String(split));
  }
});

test('stateful input decoder finalizes partial bytes before a following string chunk', () => {
  const decoder = createInputDecoder();
  assert.deepEqual(decoder.decode({ data: Uint8Array.of(0xe2, 0x82) }).events, []);
  assert.deepEqual(decoder.decode({ data: 'x' }).events, [
    { kind: 'text', text: '�x', paste: false }
  ]);
});

test('stateful input decoder rejects and resets oversized pending protocols', () => {
  const decoder = createInputDecoder({ limits: { maxProtocolCodeUnits: 8, maxPasteCodeUnits: 12 } });
  assert.throws(
    () => decoder.decode({ data: '\u001B[' + '1'.repeat(8) }),
    (cause) => cause instanceof InputDecodeError && cause.code === 'protocol_token_limit_exceeded'
  );
  assert.deepEqual(decoder.decode({ data: 'ok' }).events, [{ kind: 'text', text: 'ok', paste: false }]);
});

test('stateful input decoder applies pending limits only to undecoded remainders', () => {
  const decoder = createInputDecoder({ limits: { maxProtocolCodeUnits: 4 } });
  const text = 'plain text '.repeat(2_000);

  assert.deepEqual(decoder.decode({ data: text }), {
    events: [{ kind: 'text', text, paste: false }],
    pending: { kind: 'none' }
  });
});

test('stateful input decoder rejects oversized bracketed paste without truncation', () => {
  const decoder = createInputDecoder({
    bracketedPaste: true,
    limits: { maxProtocolCodeUnits: 8, maxPasteCodeUnits: 4 }
  });
  assert.throws(
    () => decoder.decode({ data: '\u001B[200~12345' }),
    (cause) => cause instanceof InputDecodeError && cause.code === 'paste_limit_exceeded'
  );
  assert.deepEqual(decoder.decode({ data: 'safe' }).events, [{ kind: 'text', text: 'safe', paste: false }]);
});

test('stateful input decoder excludes split closing markers from paste payload limits', () => {
  const start = '\u001B[200~';
  const end = '\u001B[201~';
  for (let split = 1; split < end.length; split += 1) {
    const decoder = createInputDecoder({ bracketedPaste: true, limits: { maxPasteCodeUnits: 4 } });
    const first = decoder.decode({ data: `${start}1234${end.slice(0, split)}` });
    const second = decoder.decode({ data: end.slice(split) });

    assert.deepEqual(first.events, []);
    assert.deepEqual(second.events, [{ kind: 'paste', text: '1234', bracketed: true }]);
  }
});

test('stateful input decoder counts a rejected closing prefix as paste payload', () => {
  const decoder = createInputDecoder({ bracketedPaste: true, limits: { maxPasteCodeUnits: 4 } });
  decoder.decode({ data: '\u001B[200~1234\u001B[20' });

  assert.throws(
    () => decoder.decode({ data: 'x' }),
    (cause) => cause instanceof InputDecodeError && cause.code === 'paste_limit_exceeded'
  );
});

test('input decoder enforces limits for every bracketed paste marker', () => {
  const oversized = '\u001B[200~12345\u001B[201~';
  for (const value of [
    `prefix${oversized}`,
    `\u001B[200~ok\u001B[201~suffix${oversized}`
  ]) {
    assert.throws(
      () => decodeInputChunk({ data: value }, {
        bracketedPaste: true,
        limits: { maxPasteCodeUnits: 4 }
      }),
      (cause) => cause instanceof InputDecodeError && cause.code === 'paste_limit_exceeded'
    );
  }
});

test('stateful pipeline decoding has one immutable profile while decodeOnce is explicit', () => {
  const pipeline = createInputPipeline({
    bracketedPaste: true,
    limits: { maxPasteCodeUnits: 4 }
  });

  assert.throws(
    () => pipeline.decode({ data: '\u001B[200~12345\u001B[201~' }),
    (cause) => cause instanceof InputDecodeError && cause.code === 'paste_limit_exceeded'
  );
  assert.equal(
    pipeline.decodeOnce(
      { data: '\u001B[200~ok\u001B[201~' },
      { bracketedPaste: false }
    ).some((event) => event.kind === 'paste'),
    false
  );
});

test('input pipeline snapshots its immutable limits and clears pending state after failure', () => {
  const limits = { maxHostChunkBytes: 2, maxEventsPerBatch: 2 };
  const pipeline = createInputPipeline({ limits });
  limits.maxHostChunkBytes = 100;
  limits.maxEventsPerBatch = 100;

  assert.equal(Object.isFrozen(pipeline.profile), true);
  assert.equal(Object.isFrozen(pipeline.profile.keyboard), true);
  assert.equal(Object.isFrozen(pipeline.profile.limits), true);
  assert.equal(Object.isFrozen(pipeline.profile.diagnostics), true);
  assert.equal(pipeline.profile.limits.maxHostChunkBytes, 2);
  assert.equal(pipeline.profile.limits.maxEventsPerBatch, 2);
  assert.throws(
    () => pipeline.decodeOnce({ data: 'abc' }),
    (cause) => cause instanceof InputDecodeError && cause.code === 'host_chunk_limit_exceeded'
  );

  assert.equal(pipeline.decode({ data: '\u001B[' }).pending.kind, 'sequence');
  assert.throws(
    () => pipeline.decode({ data: 'abc' }),
    (cause) => cause instanceof InputDecodeError && cause.code === 'host_chunk_limit_exceeded'
  );
  assert.equal(pipeline.pending().kind, 'none');
  assert.deepEqual(pipeline.decode({ data: 'x' }).events, [
    { kind: 'text', text: 'x', paste: false }
  ]);
});

test('input decode limits reject invalid configuration', () => {
  assert.throws(() => createInputDecoder({ limits: { maxPasteCodeUnits: 0 } }), /positive safe integer/u);
  assert.throws(() => createInputDecoder({ bracketedPaste: 'yes' }), /must be boolean/u);
  assert.doesNotThrow(() => createInputDecoder({ limits: { removedLimit: 1 } }));
  assert.doesNotThrow(() => decodeInputChunk({ data: 'x' }, { unknown: true }));
  assert.throws(() => decodeInputChunk({ data: 'x' }, { focusReporting: 'yes' }), /must be boolean/u);
  assert.throws(() => decodeInputChunk({ data: 'x', metadata: true }), /only data/u);
  assert.throws(() => decodeInputChunk({ data: 1 }), /string or Uint8Array/u);
  assert.doesNotThrow(() => createInputPipeline({ unknown: true }));
  assert.throws(() => createInputPipeline({ mouseReporting: 'x10' }), /mouseReporting/u);
  assert.doesNotThrow(() => createInputPipeline({ capabilities: 'unused-with-legacy' }));
  assert.throws(
    () => createInputPipeline({ keyboard: kittyEvents, capabilities: 'invalid' }),
    /capabilities must be an object/u
  );
  assert.throws(
    () => createInputPipeline().decodeOnce({ data: 'x' }, { focusReporting: 'yes' }),
    /must be boolean/u
  );
  assert.doesNotThrow(() => createInputDecoder({ keyboard: { kind: 'legacy', flags: 1 } }));
  assert.doesNotThrow(() => decodeKeyboardProfile({ kind: 'legacy', flags: 1 }));
});

test('terminal control framing keeps unsupported payloads out of text for every split', () => {
  for (const sequence of [
    '\u001B]0;private title\u0007',
    '\u001BPprivate dcs\u001B\\',
    '\u001BXprivate sos\u001B\\',
    '\u001B^private pm\u001B\\',
    '\u001B_private apc\u001B\\',
    '\u001BOz',
    '\u009Dprivate c1 osc\u009C',
    '\u0090private c1 dcs\u009C'
  ]) {
    const expected = [{ kind: 'unknown', sequence }];
    assert.deepEqual(decodeInputChunk({ data: sequence }), expected, sequence);
    for (let split = 1; split < sequence.length; split += 1) {
      const decoder = createInputDecoder();
      const events = [
        ...decoder.decode({ data: sequence.slice(0, split) }).events,
        ...decoder.decode({ data: sequence.slice(split) }).events,
        ...decoder.flush().events
      ];
      assert.deepEqual(events, expected, `${JSON.stringify(sequence)} at ${String(split)}`);
    }
  }
});

test('streaming input decoding is invariant across byte and string partitions', () => {
  const text = 'Aé🙂Z\u001B[A';
  const bytes = new TextEncoder().encode(text);
  const expectedBytes = decodeStreaming([bytes]);
  for (let split = 1; split < bytes.length; split += 1) {
    assert.deepEqual(
      decodeStreaming([bytes.slice(0, split), bytes.slice(split)]),
      expectedBytes,
      `byte ${String(split)}`
    );
  }
  assert.deepEqual(
    decodeStreaming([...bytes].map((byte) => Uint8Array.of(byte))),
    expectedBytes,
    'one byte at a time'
  );

  const exhaustivelyPartitioned = new TextEncoder().encode('é\u001B[Aq');
  const expectedPartitions = decodeStreaming([exhaustivelyPartitioned]);
  for (const chunks of bytePartitions(exhaustivelyPartitioned)) {
    assert.deepEqual(decodeStreaming(chunks), expectedPartitions);
  }

  const surrogateText = 'before🙂after';
  const expectedString = decodeStreaming([surrogateText]);
  for (let split = 1; split < surrogateText.length; split += 1) {
    assert.deepEqual(
      decodeStreaming([surrogateText.slice(0, split), surrogateText.slice(split)]),
      expectedString,
      `string ${String(split)}`
    );
  }
});

test('input limits independently bound chunks tokens text expansion Kitty text and mouse fields', () => {
  assert.throws(
    () => decodeInputChunk({ data: '12345' }, { limits: { maxHostChunkBytes: 4 } }),
    (cause) => cause instanceof InputDecodeError && cause.code === 'host_chunk_limit_exceeded'
  );
  assert.throws(
    () => decodeInputChunk(
      { data: `\u001B[${'1'.repeat(8)}A` },
      { limits: { maxProtocolCodeUnits: 8 } }
    ),
    (cause) => cause instanceof InputDecodeError && cause.code === 'protocol_token_limit_exceeded'
  );
  assert.deepEqual(
    decodeInputChunk({ data: 'abcdef' }, { limits: { maxTextEventCodeUnits: 2 } }),
    [
      { kind: 'text', text: 'ab', paste: false },
      { kind: 'text', text: 'cd', paste: false },
      { kind: 'text', text: 'ef', paste: false }
    ]
  );
  assert.throws(
    () => decodeInputChunk({ data: '\r\r\r' }, { limits: { maxEventsPerBatch: 2 } }),
    (cause) => cause instanceof InputDecodeError && cause.code === 'event_batch_limit_exceeded'
  );
  assert.throws(
    () => decodeInputChunk(
      { data: '\u001B[97;1;97:98:99u' },
      { keyboard: kittyFull, limits: { maxKittyAssociatedTextCodePoints: 2 } }
    ),
    (cause) => cause instanceof InputDecodeError && cause.code === 'kitty_text_limit_exceeded'
  );
  assert.throws(
    () => decodeInputChunk(
      { data: '\u001B[<123;1;1M' },
      { mouseReporting: 'drag', limits: { maxMouseFieldDigits: 2 } }
    ),
    (cause) => cause instanceof InputDecodeError && cause.code === 'mouse_field_limit_exceeded'
  );
});

function decodeStreaming(chunks) {
  const decoder = createInputDecoder();
  const events = [
    ...chunks.flatMap((data) => decoder.decode({ data }).events),
    ...decoder.flush().events
  ];
  const normalized = [];
  for (const event of events) {
    const previous = normalized.at(-1);
    if (event.kind === 'text' && previous?.kind === 'text') {
      normalized[normalized.length - 1] = {
        kind: 'text',
        text: previous.text + event.text,
        paste: false
      };
    } else {
      normalized.push(event);
    }
  }
  return normalized;
}

function* bytePartitions(bytes) {
  const cutCount = Math.max(0, bytes.length - 1);
  for (let mask = 0; mask < 2 ** cutCount; mask += 1) {
    const chunks = [];
    let start = 0;
    for (let cut = 0; cut < cutCount; cut += 1) {
      if ((mask & (1 << cut)) === 0) continue;
      chunks.push(bytes.slice(start, cut + 1));
      start = cut + 1;
    }
    chunks.push(bytes.slice(start));
    yield chunks;
  }
}

import assert from 'node:assert/strict';
import test from 'node:test';

import { createInputDecoder, decodeInputChunk } from '../../dist/input/index.js';

test('input decoder normalizes basic control keys', () => {
  assert.equal(decodeInputChunk({ data: '\u0003' })[0]?.kind, 'key');
  assert.equal(decodeInputChunk({ data: '\u0003' })[0]?.key, 'ctrlC');
});

test('input decoder normalizes shifted navigation keys', () => {
  assert.deepEqual(decodeInputChunk({ data: '\u001B[1;2B' })[0], {
    kind: 'key',
    key: 'arrowDown',
    sequence: '\u001B[1;2B',
    ctrl: false,
    alt: false,
    shift: true,
    meta: false
  });
  assert.deepEqual(decodeInputChunk({ data: '\u001B[Z' })[0], {
    kind: 'key',
    key: 'tab',
    sequence: '\u001B[Z',
    ctrl: false,
    alt: false,
    shift: true,
    meta: false
  });
});

test('input decoder normalizes xterm modified navigation keys', () => {
  assert.deepEqual(decodeInputChunk({ data: '\u001B[1;5D' })[0], {
    kind: 'key',
    key: 'arrowLeft',
    sequence: '\u001B[1;5D',
    ctrl: true,
    alt: false,
    shift: false,
    meta: false
  });
  assert.deepEqual(decodeInputChunk({ data: '\u001B[3;4~' })[0], {
    kind: 'key',
    key: 'delete',
    sequence: '\u001B[3;4~',
    ctrl: false,
    alt: true,
    shift: true,
    meta: false
  });
  assert.deepEqual(decodeInputChunk({ data: '\u001B[6;9~' })[0], {
    kind: 'key',
    key: 'pageDown',
    sequence: '\u001B[6;9~',
    ctrl: false,
    alt: false,
    shift: false,
    meta: true
  });
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
    row: 3,
    column: 2,
    rawCode: 64,
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

  assert.deepEqual(decoder.decode({ data: 'a\u001B[200~pa' }), [
    { kind: 'text', text: 'a', paste: false }
  ]);
  assert.deepEqual(decoder.decode({ data: 'sted\u001B[201~\u001B[' }), [
    { kind: 'paste', text: 'pasted', bracketed: true }
  ]);
  assert.deepEqual(decoder.decode({ data: 'I\u001B[<0;4' }), [
    { kind: 'focus', focused: true }
  ]);
  assert.deepEqual(decoder.decode({ data: ';5M' }), [
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

test('stateful input decoder flushes incomplete buffered input deterministically', () => {
  const decoder = createInputDecoder();

  assert.deepEqual(decoder.decode({ data: '\u001B[200~unfinished' }), []);
  assert.deepEqual(decoder.flush(), [
    { kind: 'unknown', sequence: '\u001B[200~' },
    { kind: 'text', text: 'unfinished', paste: false }
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
    {
      kind: 'key',
      key: 'enter',
      sequence: '\n',
      ctrl: false,
      alt: false,
      shift: false,
      meta: false
    },
    { kind: 'text', text: 'text', paste: false },
    { kind: 'unknown', sequence: '\u001B[201~' }
  ]);
});

test('stateful input decoder only buffers split bracketed paste when recognition is enabled', () => {
  const enabled = createInputDecoder();
  assert.deepEqual(enabled.decode({ data: '\u001B[200~half' }), []);
  assert.deepEqual(enabled.decode({ data: 'done\u001B[201~' }), [
    { kind: 'paste', text: 'halfdone', bracketed: true }
  ]);

  const disabled = createInputDecoder({ bracketedPaste: false });
  assert.deepEqual(disabled.decode({ data: '\u001B[200~half' }), [
    { kind: 'unknown', sequence: '\u001B[200~' },
    { kind: 'text', text: 'half', paste: false }
  ]);
  assert.deepEqual(disabled.decode({ data: 'done\u001B[201~' }), [
    { kind: 'text', text: 'done', paste: false },
    { kind: 'unknown', sequence: '\u001B[201~' }
  ]);
});

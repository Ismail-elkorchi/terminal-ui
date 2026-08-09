import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createKeyboardState,
  decodeInputChunk,
  keyboardKeyIsPressed,
  pressedKeyIdentity,
  reduceKeyboardState
} from '../../dist/input/index.js';
import { kittyKeyboardProfile } from '../../dist/protocol/index.js';

const kittyFull = kittyKeyboardProfile(31);

function decode(sequence) {
  const event = decodeInputChunk({ data: sequence }, { keyboard: kittyFull })[0];
  assert.equal(event?.kind, 'key');
  return event;
}

test('pressed-key identity survives modifier changes across Kitty event phases', () => {
  const press = decode('\u001B[97;5:1u');
  const repeat = decode('\u001B[97;6:2u');
  const release = decode('\u001B[97;1:3u');

  let state = reduceKeyboardState(createKeyboardState(), { kind: 'key', event: press });
  state = reduceKeyboardState(state, { kind: 'key', event: repeat });

  assert.deepEqual(state.pressed, [{
    identity: { kind: 'codePoint', codePoint: 97, location: 'standard' },
    modifiers: repeat.modifiers
  }]);
  assert.equal(keyboardKeyIsPressed(state, pressedKeyIdentity(press)), true);

  state = reduceKeyboardState(state, { kind: 'key', event: release });
  assert.deepEqual(state.pressed, []);
});

test('pressed-key identity is separate from alternates, committed text, and keypad location', () => {
  const shifted = decode('\u001B[97:65:113;2:1;65u');
  const keypad = decode('\u001B[57400;1:1u');

  assert.deepEqual(pressedKeyIdentity(shifted), {
    kind: 'codePoint',
    codePoint: 97,
    location: 'standard'
  });
  assert.deepEqual(shifted.alternateCodePoints, { shifted: 65, baseLayout: 113 });
  assert.equal(shifted.committedText, 'A');
  assert.deepEqual(pressedKeyIdentity(keypad), {
    kind: 'codePoint',
    codePoint: 57400,
    location: 'numpad'
  });
});

test('unsupported Kitty functional keys retain distinct pressed identities', () => {
  const playPause = decode('\u001B[57430;1:1u');
  const stop = decode('\u001B[57432;1:1u');

  assert.equal(playPause.key, 'unknown');
  assert.equal(stop.key, 'unknown');
  assert.notDeepEqual(pressedKeyIdentity(playPause), pressedKeyIdentity(stop));
});

test('focus loss clears all pressed-key state', () => {
  const press = decode('\u001B[97;1:1;97u');
  const pressed = reduceKeyboardState(createKeyboardState(), { kind: 'key', event: press });
  const cleared = reduceKeyboardState(pressed, {
    kind: 'focus',
    event: { kind: 'focus', focused: false }
  });

  assert.equal(pressed.pressed.length, 1);
  assert.deepEqual(cleared, createKeyboardState());
});

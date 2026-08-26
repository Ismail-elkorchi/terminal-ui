import type { FocusEvent, KeyEvent, KeyLocation, KeyModifiers, KeyName } from './types.ts';

export type PressedKeyIdentity =
  | {
      readonly kind: 'codePoint';
      readonly codePoint: number;
      readonly location: KeyLocation;
    }
  | {
      readonly kind: 'logicalKey';
      readonly key: KeyName;
      readonly location: KeyLocation;
    };

export interface PressedKey {
  readonly identity: PressedKeyIdentity;
  readonly modifiers: KeyModifiers;
}

export interface KeyboardState {
  readonly pressed: readonly PressedKey[];
}

export type KeyboardStateTransition =
  | { readonly kind: 'key'; readonly event: KeyEvent }
  | { readonly kind: 'focus'; readonly event: FocusEvent };

export function createKeyboardState(): KeyboardState {
  return { pressed: [] };
}

export function reduceKeyboardState(state: KeyboardState, transition: KeyboardStateTransition): KeyboardState {
  if (transition.kind === 'focus') return transition.event.focused ? state : createKeyboardState();
  const identity = pressedKeyIdentity(transition.event);
  const index = state.pressed.findIndex((candidate) => sameIdentity(candidate.identity, identity));
  if (transition.event.eventType === 'release') {
    return index < 0
      ? state
      : { pressed: state.pressed.filter((_, candidateIndex) => candidateIndex !== index) };
  }
  const pressed = { identity, modifiers: transition.event.modifiers } satisfies PressedKey;
  if (index < 0) return { pressed: [...state.pressed, pressed] };
  return {
    pressed: state.pressed.map((candidate, candidateIndex) => candidateIndex === index ? pressed : candidate)
  };
}

export function keyboardKeyIsPressed(state: KeyboardState, identity: PressedKeyIdentity): boolean {
  return state.pressed.some((candidate) => sameIdentity(candidate.identity, identity));
}

export function pressedKeyIdentity(event: KeyEvent): PressedKeyIdentity {
  return event.keyCodePoint === undefined
    ? { kind: 'logicalKey', key: event.key, location: event.location }
    : { kind: 'codePoint', codePoint: event.keyCodePoint, location: event.location };
}

function sameIdentity(left: PressedKeyIdentity, right: PressedKeyIdentity): boolean {
  if (left.kind !== right.kind || left.location !== right.location) return false;
  if (left.kind === 'codePoint') return right.kind === 'codePoint' && left.codePoint === right.codePoint;
  return right.kind === 'logicalKey' && left.key === right.key;
}

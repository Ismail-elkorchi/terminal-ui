import type { FocusEvent, KeyEvent, KeyModifiers, KeyName, KeyLocation } from './types.ts';

export interface KeyboardKeyIdentity {
  readonly key: KeyName;
  readonly modifiers: KeyModifiers;
  readonly location: KeyLocation;
}

export interface KeyboardState {
  readonly pressed: readonly KeyboardKeyIdentity[];
}

export type KeyboardStateAction =
  | { readonly kind: 'key'; readonly event: KeyEvent }
  | { readonly kind: 'focus'; readonly event: FocusEvent };

export function createKeyboardState(): KeyboardState {
  return { pressed: [] };
}

export function reduceKeyboardState(state: KeyboardState, action: KeyboardStateAction): KeyboardState {
  if (action.kind === 'focus') return action.event.focused ? state : createKeyboardState();
  const identity = keyIdentity(action.event);
  const index = state.pressed.findIndex((candidate) => sameKey(candidate, identity));
  if (action.event.eventType === 'release') {
    return index < 0
      ? state
      : { pressed: state.pressed.filter((_, candidateIndex) => candidateIndex !== index) };
  }
  if (index >= 0) return state;
  return { pressed: [...state.pressed, identity] };
}

export function keyboardKeyIsPressed(state: KeyboardState, identity: KeyboardKeyIdentity): boolean {
  return state.pressed.some((candidate) => sameKey(candidate, identity));
}

function keyIdentity(event: KeyEvent): KeyboardKeyIdentity {
  return { key: event.key, modifiers: event.modifiers, location: event.location };
}

function sameKey(left: KeyboardKeyIdentity, right: KeyboardKeyIdentity): boolean {
  return left.key === right.key
    && left.location === right.location
    && left.modifiers.ctrl === right.modifiers.ctrl
    && left.modifiers.alt === right.modifiers.alt
    && left.modifiers.shift === right.modifiers.shift
    && left.modifiers.meta === right.modifiers.meta;
}

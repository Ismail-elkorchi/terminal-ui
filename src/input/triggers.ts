import type {
  InputEvent,
  InputTrigger,
  BindableKeyName,
  KeyEvent,
  KeyModifierTrigger,
  KeyModifiers
} from './types.ts';
import { keyEventTypes, keyLocations, keyNames } from './types.ts';
import { isNonArrayObject, isStringMember } from '../foundation/validation.ts';
import { segmentGraphemes } from '../text/index.ts';

/** Decodes one dynamically supplied trigger at an authoring boundary. */
export function decodeInputTrigger(value: unknown): InputTrigger {
  if (!isNonArrayObject(value) || typeof value['kind'] !== 'string') {
    throw new TypeError('Input trigger must be an object with a kind.');
  }
  if (value['kind'] === 'text') {
    if (typeof value['text'] !== 'string' || segmentGraphemes(value['text']).length !== 1) {
      throw new TypeError('Text input trigger must contain exactly one grapheme.');
    }
    return Object.freeze({ kind: 'text', text: value['text'] });
  }
  if (value['kind'] === 'focus') {
    if (typeof value['focused'] !== 'boolean') throw new TypeError('Focus input trigger requires focused boolean.');
    return Object.freeze({ kind: 'focus', focused: value['focused'] });
  }
  if (value['kind'] !== 'key' && value['kind'] !== 'codePoint' && value['kind'] !== 'physicalKey') {
    throw new TypeError('Input trigger kind is unsupported.');
  }
  const modifiers = decodeModifierTrigger(value['modifiers']);
  const eventType = value['eventType'];
  const location = value['location'];
  if (eventType !== undefined && !isStringMember(eventType, keyEventTypes)) {
    throw new TypeError('Input trigger eventType is unsupported.');
  }
  if (location !== undefined && !isStringMember(location, keyLocations)) {
    throw new TypeError('Input trigger location is unsupported.');
  }
  const shared = {
    ...(modifiers === undefined ? {} : { modifiers }),
    ...(eventType === undefined ? {} : { eventType }),
    ...(location === undefined ? {} : { location })
  };
  if (value['kind'] === 'key') {
    if (!isBindableKeyName(value['key'])) {
      throw new TypeError('Key input trigger requires a bindable key name.');
    }
    return Object.freeze({ kind: 'key', key: value['key'], ...shared });
  }
  if (typeof value['codePoint'] !== 'number') {
    throw new TypeError('Code-point input trigger requires a numeric Unicode scalar.');
  }
  const codePoint = unicodeScalar(value['codePoint']);
  if (value['kind'] === 'physicalKey') {
    return Object.freeze({ kind: 'physicalKey', codePoint, ...shared });
  }
  const source = value['source'];
  if (source !== undefined && source !== 'primary' && source !== 'shifted') {
    throw new TypeError('Code-point input trigger source is unsupported.');
  }
  return Object.freeze({
    kind: 'codePoint',
    codePoint,
    ...(source === undefined ? {} : { source }),
    ...shared
  });
}

export function matchesInputTrigger(trigger: InputTrigger, event: InputEvent): boolean {
  if (trigger.kind === 'text') return event.kind === 'text' && event.text === trigger.text;
  if (trigger.kind === 'focus') return event.kind === 'focus' && event.focused === trigger.focused;
  if (event.kind !== 'key' || !keyIdentityMatches(trigger, event)) return false;
  if ((trigger.eventType ?? 'press') !== event.eventType) return false;
  if (trigger.location !== undefined && trigger.location !== event.location) return false;
  if (trigger.modifiers?.kind === 'any') return true;
  return modifierMatches(trigger.modifiers, event.modifiers);
}

export function inputTriggerIdentity(trigger: InputTrigger): string {
  switch (trigger.kind) {
    case 'text':
      return `text:${JSON.stringify(trigger.text)}`;
    case 'focus':
      return `focus:${String(trigger.focused)}`;
    case 'key':
      return keyTriggerIdentity(trigger.kind, trigger.key, trigger);
    case 'codePoint':
      return keyTriggerIdentity(
        trigger.kind,
        `${trigger.source ?? 'primary'}:${String(unicodeScalar(trigger.codePoint))}`,
        trigger
      );
    case 'physicalKey':
      return keyTriggerIdentity(trigger.kind, String(unicodeScalar(trigger.codePoint)), trigger);
  }
}

function keyIdentityMatches(
  trigger: Extract<InputTrigger, { readonly kind: 'key' | 'codePoint' | 'physicalKey' }>,
  event: KeyEvent
): boolean {
  switch (trigger.kind) {
    case 'key':
      return event.key === trigger.key;
    case 'codePoint':
      return (trigger.source ?? 'primary') === 'shifted'
        ? event.alternateCodePoints?.shifted === trigger.codePoint
        : event.keyCodePoint === trigger.codePoint;
    case 'physicalKey':
      return event.alternateCodePoints?.baseLayout === trigger.codePoint;
  }
}

function keyTriggerIdentity(
  kind: string,
  identity: string,
  trigger: Extract<InputTrigger, { readonly kind: 'key' | 'codePoint' | 'physicalKey' }>
): string {
  const modifiers = trigger.modifiers?.kind === 'any'
    ? 'any'
    : String(Number(trigger.modifiers?.ctrl === true)) + String(Number(trigger.modifiers?.alt === true))
      + String(Number(trigger.modifiers?.shift === true)) + String(Number(trigger.modifiers?.meta === true))
      + String(Number(trigger.modifiers?.super === true)) + String(Number(trigger.modifiers?.hyper === true))
      + String(trigger.modifiers?.capsLock ?? '*') + String(trigger.modifiers?.numLock ?? '*');
  return `${kind}:${identity}:${trigger.eventType ?? 'press'}:${trigger.location ?? '*'}:${modifiers}`;
}

function unicodeScalar(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0x10ffff || (value >= 0xd800 && value <= 0xdfff)) {
    throw new RangeError('Input trigger codePoint must be a Unicode scalar value.');
  }
  return value;
}

function decodeModifierTrigger(value: unknown): KeyModifierTrigger | undefined {
  if (value === undefined) return undefined;
  if (!isNonArrayObject(value)) throw new TypeError('Input trigger modifiers must be an object.');
  if (value['kind'] === 'any') {
    if (['ctrl', 'alt', 'shift', 'meta', 'super', 'hyper', 'capsLock', 'numLock']
      .some((field) => value[field] !== undefined)) {
      throw new TypeError('Any-modifier trigger cannot define modifier flags.');
    }
    return Object.freeze({ kind: 'any' });
  }
  if (value['kind'] !== undefined && value['kind'] !== 'exact') {
    throw new TypeError('Input trigger modifier kind is unsupported.');
  }
  for (const field of [
    'ctrl', 'alt', 'shift', 'meta', 'super', 'hyper', 'capsLock', 'numLock'
  ] as const) {
    if (value[field] !== undefined && typeof value[field] !== 'boolean') {
      throw new TypeError(`Input trigger modifier ${field} must be boolean.`);
    }
  }
  const ctrl = optionalBoolean(value['ctrl']);
  const alt = optionalBoolean(value['alt']);
  const shift = optionalBoolean(value['shift']);
  const meta = optionalBoolean(value['meta']);
  const superModifier = optionalBoolean(value['super']);
  const hyper = optionalBoolean(value['hyper']);
  const capsLock = optionalBoolean(value['capsLock']);
  const numLock = optionalBoolean(value['numLock']);
  return Object.freeze({
    ...(value['kind'] === undefined ? {} : { kind: 'exact' as const }),
    ...(ctrl === undefined ? {} : { ctrl }),
    ...(alt === undefined ? {} : { alt }),
    ...(shift === undefined ? {} : { shift }),
    ...(meta === undefined ? {} : { meta }),
    ...(superModifier === undefined ? {} : { super: superModifier }),
    ...(hyper === undefined ? {} : { hyper }),
    ...(capsLock === undefined ? {} : { capsLock }),
    ...(numLock === undefined ? {} : { numLock })
  });
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function isBindableKeyName(value: unknown): value is BindableKeyName {
  return isStringMember(value, keyNames) && value !== 'unknown';
}

function modifierMatches(
  expected: Exclude<KeyModifierTrigger, { readonly kind: 'any' }> | undefined,
  actual: KeyModifiers
): boolean {
  return (expected?.ctrl ?? false) === actual.ctrl
    && (expected?.alt ?? false) === actual.alt
    && (expected?.shift ?? false) === actual.shift
    && (expected?.meta ?? false) === actual.meta
    && (expected?.super ?? false) === (actual.super ?? false)
    && (expected?.hyper ?? false) === (actual.hyper ?? false)
    && (expected?.capsLock === undefined || expected.capsLock === (actual.capsLock ?? false))
    && (expected?.numLock === undefined || expected.numLock === (actual.numLock ?? false));
}

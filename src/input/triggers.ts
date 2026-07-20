import type {
  InputEvent,
  InputTrigger,
  KeyEvent,
  KeyModifierTrigger,
  KeyModifiers
} from './types.ts';

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
      + String(Number(trigger.modifiers?.shift === true)) + String(Number(trigger.modifiers?.meta === true));
  return `${kind}:${identity}:${trigger.eventType ?? 'press'}:${trigger.location ?? '*'}:${modifiers}`;
}

function unicodeScalar(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0x10ffff || (value >= 0xd800 && value <= 0xdfff)) {
    throw new RangeError('Input trigger codePoint must be a Unicode scalar value.');
  }
  return value;
}

function modifierMatches(
  expected: Exclude<KeyModifierTrigger, { readonly kind: 'any' }> | undefined,
  actual: KeyModifiers
): boolean {
  return (expected?.ctrl ?? false) === actual.ctrl
    && (expected?.alt ?? false) === actual.alt
    && (expected?.shift ?? false) === actual.shift
    && (expected?.meta ?? false) === actual.meta;
}

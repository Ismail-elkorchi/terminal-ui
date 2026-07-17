import type { InputEvent, InputTrigger, KeyModifierTrigger, KeyModifiers } from './types.ts';

export function matchesInputTrigger(trigger: InputTrigger, event: InputEvent): boolean {
  if (trigger.kind === 'text') return event.kind === 'text' && event.text === trigger.text;
  if (event.kind !== 'key' || event.key !== trigger.key) return false;
  if ((trigger.eventType ?? 'press') !== event.eventType) return false;
  if (trigger.modifiers?.kind === 'any') return true;
  return modifierMatches(trigger.modifiers, event.modifiers);
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

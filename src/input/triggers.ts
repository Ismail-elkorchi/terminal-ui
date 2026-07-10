import type { InputEvent, InputTrigger, KeyEvent } from './types.ts';

export function matchesInputTrigger(trigger: InputTrigger, event: InputEvent): boolean {
  if (trigger.kind === 'text') return event.kind === 'text' && event.text === trigger.text;
  if (event.kind !== 'key' || event.key !== trigger.key) return false;
  return modifierMatches(trigger.ctrl, event.ctrl)
    && modifierMatches(trigger.alt, event.alt)
    && modifierMatches(trigger.shift, event.shift)
    && modifierMatches(trigger.meta, event.meta);
}

function modifierMatches(expected: boolean | undefined, actual: KeyEvent['ctrl']): boolean {
  return expected === undefined || expected === actual;
}

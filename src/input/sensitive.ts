import type { InputEvent } from './types.ts';

/** Internal recorder policy for input owned by a sensitive control. */
export function inputEventContainsSensitiveText(event: InputEvent): boolean {
  if (event.kind === 'text' || event.kind === 'paste') return event.text.length > 0;
  if (event.kind !== 'key' || event.eventType === 'release') return false;
  if (event.committedText?.length) return true;
  if (
    event.modifiers.ctrl
    || event.modifiers.alt
    || event.modifiers.meta
    || event.modifiers.super === true
    || event.modifiers.hyper === true
  ) return false;
  return event.keyCodePoint !== undefined
    || /^[a-z0-9]$/u.test(event.key)
    || event.key === 'space';
}

export function redactSensitiveInputEvent(event: InputEvent): InputEvent {
  if (event.kind === 'paste') return { ...event, text: '[redacted]' };
  return { kind: 'text', text: '[redacted]', paste: false };
}

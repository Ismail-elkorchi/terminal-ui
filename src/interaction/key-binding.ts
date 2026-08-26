import type { InputTrigger } from '../input/types.ts';

export type KeyboardBinding = Extract<
  InputTrigger,
  { readonly kind: 'key' | 'codePoint' | 'physicalKey' }
>;

export function formatKeyboardBinding(binding: KeyboardBinding): string {
  const chord = [...bindingModifierLabels(binding), bindingKeyLabel(binding)].join('+');
  const details = bindingDetailLabels(binding);
  return details.length === 0 ? chord : `${chord} (${details.join(', ')})`;
}

function bindingModifierLabels(binding: KeyboardBinding): readonly string[] {
  const modifiers = binding.modifiers;
  const exact = modifiers?.kind === 'any' ? undefined : modifiers;
  return modifiers?.kind === 'any' ? ['Any modifier'] : [
    ...(exact?.ctrl === true ? ['Ctrl'] : []),
    ...(exact?.alt === true ? ['Alt'] : []),
    ...(exact?.shift === true ? ['Shift'] : []),
    ...(exact?.meta === true ? ['Meta'] : []),
    ...(exact?.super === true ? ['Super'] : []),
    ...(exact?.hyper === true ? ['Hyper'] : []),
    ...(exact?.capsLock === true ? ['Caps Lock'] : []),
    ...(exact?.numLock === true ? ['Num Lock'] : []),
  ];
}

function bindingKeyLabel(binding: KeyboardBinding): string {
  if (binding.kind === 'key') {
    return binding.key.length === 1 ? binding.key.toUpperCase() : readableKey(binding.key);
  }
  if (binding.kind === 'codePoint') return String.fromCodePoint(binding.codePoint);
  return `Physical U+${binding.codePoint.toString(16).toUpperCase().padStart(4, '0')}`;
}

function bindingDetailLabels(binding: KeyboardBinding): readonly string[] {
  return [
    ...(binding.kind === 'codePoint' && binding.source === 'shifted' ? ['shifted code point'] : []),
    ...(binding.eventType !== undefined && binding.eventType !== 'press' ? [binding.eventType] : []),
    ...(binding.location !== undefined && binding.location !== 'standard'
      ? [binding.location === 'numpad' ? 'numpad' : 'unknown location']
      : []),
  ];
}

function readableKey(key: string): string {
  return key.replace(/([a-z])([A-Z])/gu, '$1 $2').replace(/^./u, (value) => value.toUpperCase());
}

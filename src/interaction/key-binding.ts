import type { InputTrigger } from '../input/types.ts';

export type KeyboardBinding = Extract<
  InputTrigger,
  { readonly kind: 'key' | 'codePoint' | 'physicalKey' }
>;

export function formatKeyboardBinding(binding: KeyboardBinding): string {
  const modifiers = binding.modifiers;
  const exact = modifiers?.kind === 'any' ? undefined : modifiers;
  const prefix = modifiers?.kind === 'any' ? ['Any modifier'] : [
    ...(exact?.ctrl === true ? ['Ctrl'] : []),
    ...(exact?.alt === true ? ['Alt'] : []),
    ...(exact?.shift === true ? ['Shift'] : []),
    ...(exact?.super === true ? ['Super'] : []),
  ];
  const key = binding.kind === 'key'
    ? binding.key.length === 1 ? binding.key.toUpperCase() : readableKey(binding.key)
    : binding.kind === 'codePoint'
    ? String.fromCodePoint(binding.codePoint)
    : `Physical ${String(binding.codePoint)}`;
  return [...prefix, key].join('+');
}

function readableKey(key: string): string {
  return key.replace(/([a-z])([A-Z])/gu, '$1 $2').replace(/^./u, (value) => value.toUpperCase());
}

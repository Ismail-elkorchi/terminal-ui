import type { FocusEvent } from './types.ts';

export function focusFromPrefix(
  value: string
): { readonly event: FocusEvent; readonly length: number } | undefined {
  if (value.startsWith('\u001B[I')) return { event: { kind: 'focus', focused: true }, length: 3 };
  if (value.startsWith('\u001B[O')) return { event: { kind: 'focus', focused: false }, length: 3 };
  return undefined;
}

import type { PasteEvent } from './types.ts';

export const BRACKETED_PASTE_START = '\u001B[200~';
export const BRACKETED_PASTE_END = '\u001B[201~';

export function bracketedPasteFromPrefix(
  value: string
): { readonly event: PasteEvent; readonly length: number } | undefined {
  if (!value.startsWith(BRACKETED_PASTE_START)) return undefined;
  const endIndex = value.indexOf(BRACKETED_PASTE_END, BRACKETED_PASTE_START.length);
  if (endIndex === -1) return undefined;
  const text = value.slice(BRACKETED_PASTE_START.length, endIndex);
  return {
    event: { kind: 'paste', text, bracketed: true },
    length: endIndex + BRACKETED_PASTE_END.length
  };
}

export function isIncompleteBracketedPaste(value: string): boolean {
  if (!value.startsWith('\u001B')) return false;
  if (value === '\u001B') return false;
  if (BRACKETED_PASTE_START.startsWith(value) && value.length < BRACKETED_PASTE_START.length) return true;
  return value.startsWith(BRACKETED_PASTE_START)
    && !value.includes(BRACKETED_PASTE_END, BRACKETED_PASTE_START.length);
}

export function incompleteBracketedPastePayloadLength(value: string): number | undefined {
  if (!value.startsWith(BRACKETED_PASTE_START)) return undefined;
  if (value.includes(BRACKETED_PASTE_END, BRACKETED_PASTE_START.length)) return undefined;
  const pendingPayload = value.slice(BRACKETED_PASTE_START.length);
  return pendingPayload.length - trailingMarkerPrefixLength(pendingPayload, BRACKETED_PASTE_END);
}

function trailingMarkerPrefixLength(value: string, marker: string): number {
  const maximum = Math.min(value.length, marker.length - 1);
  for (let length = maximum; length > 0; length -= 1) {
    if (value.endsWith(marker.slice(0, length))) return length;
  }
  return 0;
}

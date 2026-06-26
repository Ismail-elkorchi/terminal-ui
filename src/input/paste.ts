import type { PasteEvent } from './types.ts';

const bracketedPasteStart = '\u001B[200~';
const bracketedPasteEnd = '\u001B[201~';

export function bracketedPasteFromPrefix(
  value: string
): { readonly event: PasteEvent; readonly length: number } | undefined {
  if (!value.startsWith(bracketedPasteStart)) return undefined;
  const endIndex = value.indexOf(bracketedPasteEnd, bracketedPasteStart.length);
  if (endIndex === -1) return undefined;
  const text = value.slice(bracketedPasteStart.length, endIndex);
  return {
    event: { kind: 'paste', text, bracketed: true },
    length: endIndex + bracketedPasteEnd.length
  };
}

export function isIncompleteBracketedPaste(value: string): boolean {
  if (!value.startsWith('\u001B')) return false;
  if (value === '\u001B') return false;
  if (bracketedPasteStart.startsWith(value) && value.length < bracketedPasteStart.length) return true;
  return value.startsWith(bracketedPasteStart) && !value.includes(bracketedPasteEnd, bracketedPasteStart.length);
}

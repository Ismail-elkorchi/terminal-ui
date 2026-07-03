import type { RemovedControlSequence, SanitizedTerminalText, SanitizeTerminalTextOptions } from './types.ts';

const escapeOrCsi = new RegExp(String.raw`\u001B(?:\[[0-?]*[ -/]*[@-~]|[@-Z\\-_])`, 'gu');
const controlCharacters = new RegExp(String.raw`[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]`, 'gu');
const sanitizeCacheLimit = 8192;
const sanitizeCacheMaxTextLength = 4096;
const sanitizeCache = new Map<string, SanitizedTerminalText>();

export function sanitizeTerminalText(
  text: string,
  options: SanitizeTerminalTextOptions = {}
): SanitizedTerminalText {
  const replacement = options.replacement ?? '';
  const cacheKey = sanitizeCacheKey(text, replacement);
  if (cacheKey !== undefined) {
    const cached = sanitizeCache.get(cacheKey);
    if (cached !== undefined) return cached;
  }
  if (!hasUnsafeTerminalText(text)) {
    const result = Object.freeze({
      text,
      changed: false,
      removedControlSequences: Object.freeze([])
    });
    if (cacheKey !== undefined) {
      sanitizeCache.set(cacheKey, result);
      trimSanitizeCache();
    }
    return result;
  }
  const removedControlSequences: RemovedControlSequence[] = [];
  const withoutEscapes = text.replace(escapeOrCsi, (sequence: string, index: number) => {
    removedControlSequences.push({ sequence, index, kind: 'escape' });
    return replacement;
  });
  const sanitized = withoutEscapes.replace(controlCharacters, (sequence: string, index: number) => {
    removedControlSequences.push({ sequence, index, kind: 'control' });
    return replacement;
  });
  const result = Object.freeze({
    text: sanitized,
    changed: removedControlSequences.length > 0,
    removedControlSequences: Object.freeze(removedControlSequences.map((entry) => Object.freeze(entry)))
  });
  if (cacheKey !== undefined) {
    sanitizeCache.set(cacheKey, result);
    trimSanitizeCache();
  }
  return result;
}

function hasUnsafeTerminalText(text: string): boolean {
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code === 0x1b || code <= 0x08 || code === 0x0b || code === 0x0c || (code >= 0x0e && code <= 0x1f) || code === 0x7f) {
      return true;
    }
  }
  return false;
}

function sanitizeCacheKey(text: string, replacement: string): string | undefined {
  if (text.length > sanitizeCacheMaxTextLength || replacement.length > 16) return undefined;
  return `${String(replacement.length)}:${replacement}${String(text.length)}:${text}`;
}

function trimSanitizeCache(): void {
  while (sanitizeCache.size > sanitizeCacheLimit) {
    const oldest = sanitizeCache.keys().next().value;
    if (oldest === undefined) return;
    sanitizeCache.delete(oldest);
  }
}

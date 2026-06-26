import type { RemovedControlSequence, SanitizedTerminalText, SanitizeTerminalTextOptions } from './types.ts';

const escapeOrCsi = new RegExp(String.raw`\u001B(?:\[[0-?]*[ -/]*[@-~]|[@-Z\\-_])`, 'gu');
const controlCharacters = new RegExp(String.raw`[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]`, 'gu');

export function sanitizeTerminalText(
  text: string,
  options: SanitizeTerminalTextOptions = {}
): SanitizedTerminalText {
  const replacement = options.replacement ?? '';
  const removedControlSequences: RemovedControlSequence[] = [];
  const withoutEscapes = text.replace(escapeOrCsi, (sequence: string, index: number) => {
    removedControlSequences.push({ sequence, index, kind: 'escape' });
    return replacement;
  });
  const sanitized = withoutEscapes.replace(controlCharacters, (sequence: string, index: number) => {
    removedControlSequences.push({ sequence, index, kind: 'control' });
    return replacement;
  });
  return {
    text: sanitized,
    changed: removedControlSequences.length > 0,
    removedControlSequences
  };
}

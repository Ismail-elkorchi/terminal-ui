import { graphemeBoundaryOffsets, segmentGraphemesForMeasurement } from './graphemes.ts';
import type {
  RemovedControlSequence,
  SanitizedTerminalText,
  SanitizeTerminalTextOptions,
} from './types.ts';

const escape = '\u001B';
const stringTerminator = String.raw`(?:\u001B\\|\u009C)`;
const unsafeTerminalSequenceParts = [
  String.raw`(?:\u001B\]|\u009D)[\s\S]*?(?:\u0007|${stringTerminator})`,
  String.raw`(?:\u001BP|\u0090)[\s\S]*?${stringTerminator}`,
  String.raw`(?:\u001B[X^_]|\u0098|\u009E|\u009F)[\s\S]*?${stringTerminator}`,
  String.raw`(?:\u001B\[|\u009B)[0-?]*[ -/]*[@-~]`,
  String.raw`\u001B[ -/]*[0-~]`,
  String.raw`[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]`
];
const unsafeTerminalSequence = new RegExp(unsafeTerminalSequenceParts.join('|'), 'gu');
const terminalTabSize = 4;
const sanitizeCacheWeightLimit = 65_536;
const sanitizeCacheMaxTextLength = 256;
const sanitizeCache = new Map<string, SanitizedTerminalText>();
let sanitizeCacheWeight = 0;

export function sanitizeTerminalText(
  text: string,
  options: SanitizeTerminalTextOptions = {}
): SanitizedTerminalText {
  return sanitize(text, options, 'multiline');
}

/** Sanitizes and canonicalizes editable content that must remain on one line. */
export function sanitizeTerminalSingleLineText(
  text: string,
  options: SanitizeTerminalTextOptions = {}
): SanitizedTerminalText {
  return sanitize(text, options, 'single-line');
}

/** Source offsets for an editable one-line value whose terminal text may be sanitized. */
export function projectTerminalSingleLineText(source: string): {
  readonly text: string;
  sourceOffsetToDisplay(offset: number): number;
  displayOffsetToSource(offset: number): number;
} {
  const sanitized = sanitizeTerminalSingleLineText(source);
  if (!sanitized.changed) {
    return {
      text: sanitized.text,
      sourceOffsetToDisplay: (offset) => offset,
      displayOffsetToSource: (offset) => offset,
    };
  }

  const sourceToStripped = new Uint32Array(source.length + 1);
  const pieces: string[] = [];
  let sourceOffset = 0;
  let strippedOffset = 0;
  for (const removed of sanitized.removedControlSequences) {
    const start = removed.codeUnitOffset;
    const end = start + removed.sequence.length;
    pieces.push(source.slice(sourceOffset, start));
    while (sourceOffset < start) {
      sourceToStripped[sourceOffset] = strippedOffset;
      sourceOffset += 1;
      strippedOffset += 1;
      sourceToStripped[sourceOffset] = strippedOffset;
    }
    while (sourceOffset < end) {
      sourceToStripped[sourceOffset] = strippedOffset;
      sourceOffset += 1;
      sourceToStripped[sourceOffset] = strippedOffset;
    }
  }
  pieces.push(source.slice(sourceOffset));
  while (sourceOffset < source.length) {
    sourceToStripped[sourceOffset] = strippedOffset;
    sourceOffset += 1;
    strippedOffset += 1;
    sourceToStripped[sourceOffset] = strippedOffset;
  }
  const stripped = pieces.join('');
  const strippedToNormalized = new Uint32Array(stripped.length + 1);
  let normalizedOffset = 0;
  for (let index = 0; index < stripped.length;) {
    strippedToNormalized[index] = normalizedOffset;
    if (stripped[index] === '\r' && stripped[index + 1] === '\n') {
      strippedToNormalized[index + 1] = normalizedOffset;
      index += 2;
    } else {
      index += 1;
    }
    normalizedOffset += 1;
    strippedToNormalized[index] = normalizedOffset;
  }
  const normalized = stripped.replace(/\r\n?/gu, '\n');
  const normalizedToDisplay = new Uint32Array(normalized.length + 1);
  let displayOffset = 0;
  let column = 0;
  for (const segment of segmentGraphemesForMeasurement(normalized, {})) {
    for (let index = segment.startOffset; index < segment.endOffsetExclusive; index += 1) {
      normalizedToDisplay[index] = displayOffset;
    }
    if (segment.text === '\n') {
      displayOffset += 1;
      column = 0;
    } else if (segment.text === '\t') {
      const spaces = terminalTabSize - column % terminalTabSize;
      displayOffset += spaces;
      column += spaces;
    } else {
      displayOffset += segment.text.length;
      column += segment.cells;
    }
    normalizedToDisplay[segment.endOffsetExclusive] = displayOffset;
  }
  if (displayOffset !== sanitized.text.length) {
    throw new Error('Single-line text projection is inconsistent with terminal sanitization.');
  }
  const sourceOffsets = graphemeBoundaryOffsets(source);
  const displayOffsets = sourceOffsets.map((offset) => {
    const strippedIndex = sourceToStripped[offset] ?? 0;
    const normalizedIndex = strippedToNormalized[strippedIndex] ?? 0;
    return normalizedToDisplay[normalizedIndex] ?? 0;
  });
  return {
    text: sanitized.text,
    sourceOffsetToDisplay(offset) {
      return displayOffsets[lastMappedBoundary(sourceOffsets, offset)] ?? 0;
    },
    displayOffsetToSource(offset) {
      return sourceOffsets[lastMappedBoundary(displayOffsets, offset)] ?? 0;
    },
  };
}

function lastMappedBoundary(offsets: readonly number[], target: number): number {
  let low = 0;
  let high = offsets.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if ((offsets[middle] ?? Number.POSITIVE_INFINITY) <= target) low = middle + 1;
    else high = middle;
  }
  return Math.max(0, low - 1);
}

/**
 * Sanitizes text that will occupy cells on one terminal row.
 *
 * Unlike general application text, cell text cannot contain tab, line-feed,
 * or carriage-return because terminals interpret them as cursor movement.
 */
export function sanitizeTerminalCellText(
  text: string,
  options: SanitizeTerminalTextOptions = {}
): SanitizedTerminalText {
  return sanitize(text, options, 'cell');
}

function sanitize(
  text: string,
  options: SanitizeTerminalTextOptions,
  mode: 'multiline' | 'single-line' | 'cell'
): SanitizedTerminalText {
  const replacement = options.replacement ?? '';
  if (hasUnsafeTerminalText(replacement) || /[\t\r\n]/u.test(replacement)) {
    throw new TypeError('Terminal text replacement must not contain control characters or terminal sequences.');
  }
  const cacheKey = sanitizeCacheKey(text, replacement, mode);
  if (cacheKey !== undefined) {
    const cached = sanitizeCache.get(cacheKey);
    if (cached !== undefined) return cached;
  }
  if (isTerminalTextSafe(text) && (mode === 'multiline' || !text.includes('\n'))) {
    const result = Object.freeze({
      text,
      changed: false,
      removedControlSequences: Object.freeze([])
    });
    if (cacheKey !== undefined) {
      sanitizeCache.set(cacheKey, result);
      sanitizeCacheWeight += cacheKey.length;
      trimSanitizeCache();
    }
    return result;
  }
  const removedControlSequences: RemovedControlSequence[] = [];
  const stripped = text.replace(unsafeTerminalSequence, (sequence: string, codeUnitOffset: number) => {
    removedControlSequences.push({
      sequence,
      codeUnitOffset,
      kind: isTerminalEscape(sequence) ? 'escape' : 'control'
    });
    return replacement;
  });
  const multiline = expandTerminalTabs(stripped.replace(/\r\n?/gu, '\n'));
  const sanitized = mode === 'multiline' ? multiline : multiline.replace(/\n/gu, mode === 'single-line' ? ' ' : '');
  const result = Object.freeze({
    text: sanitized,
    changed: removedControlSequences.length > 0 || sanitized !== text,
    removedControlSequences: Object.freeze(removedControlSequences.map((entry) => Object.freeze(entry)))
  });
  if (cacheKey !== undefined) {
    sanitizeCache.set(cacheKey, result);
    sanitizeCacheWeight += cacheKey.length;
    trimSanitizeCache();
  }
  return result;
}

/** Whether multiline terminal sanitization preserves a string byte-for-byte. */
export function isTerminalTextSafe(text: string): boolean {
  return isTerminalControlTextSafe(text) && !/[\t\r]/u.test(text);
}

/** Whether text is free of terminal control sequences, excluding editable whitespace. */
export function isTerminalControlTextSafe(text: string): boolean {
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code === 0x1b
      || code <= 0x08
      || code === 0x0b
      || code === 0x0c
      || (code >= 0x0e && code <= 0x1f)
      || (code >= 0x7f && code <= 0x9f)) {
      return false;
    }
  }
  return true;
}

const hasUnsafeTerminalText = (text: string): boolean => !isTerminalControlTextSafe(text);

function isTerminalEscape(sequence: string): boolean {
  if (sequence.startsWith(escape)) return true;
  const code = sequence.charCodeAt(0);
  return code === 0x90
    || code === 0x98
    || code === 0x9b
    || code === 0x9c
    || code === 0x9d
    || code === 0x9e
    || code === 0x9f;
}

function sanitizeCacheKey(
  text: string,
  replacement: string,
  mode: 'multiline' | 'single-line' | 'cell'
): string | undefined {
  if (text.length > sanitizeCacheMaxTextLength || replacement.length > 16) return undefined;
  return `${mode}:${String(replacement.length)}:${replacement}${String(text.length)}:${text}`;
}

function expandTerminalTabs(text: string): string {
  if (!text.includes('\t')) return text;
  let column = 0;
  let result = '';
  for (const segment of segmentGraphemesForMeasurement(text, {})) {
    if (segment.text === '\n') {
      result += '\n';
      column = 0;
      continue;
    }
    if (segment.text === '\t') {
      const spaces = terminalTabSize - column % terminalTabSize;
      result += ' '.repeat(spaces);
      column += spaces;
      continue;
    }
    result += segment.text;
    column += segment.cells;
  }
  return result;
}

function trimSanitizeCache(): void {
  while (sanitizeCacheWeight > sanitizeCacheWeightLimit) {
    const oldest = sanitizeCache.entries().next().value;
    if (oldest === undefined) return;
    sanitizeCache.delete(oldest[0]);
    sanitizeCacheWeight -= oldest[0].length;
  }
}

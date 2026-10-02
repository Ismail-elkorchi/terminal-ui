import { finishWork } from '../foundation/cooperative-work.ts';
import { expandTerminalTabsWork, terminalTabCells } from './tabs.ts';
import { textWidthProfileKey } from './width-profile.ts';
import { graphemeBoundaryOffsets, segmentGraphemesForMeasurement } from './graphemes.ts';
import type {
  RemovedControlSequence,
  SanitizedTerminalText,
  SanitizeTerminalTextOptions,
  TextMeasurementOptions,
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
const unsafeTerminalTextCharacters = new RegExp(String.raw`[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]`, 'u');
const sanitizeCacheWeightLimit = 65_536;
const sanitizeCacheMaxTextLength = 256;
const sanitizeCache = new Map<string, SanitizedTerminalText>();
let sanitizeCacheWeight = 0;
type SanitizationMode = 'multiline' | 'single-line' | 'cell' | 'control';

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

/** Strip unsafe controls while retaining tabs until a layout profile is known. */
export function sanitizeTerminalControlText(text: string): SanitizedTerminalText {
  return sanitize(text, {}, 'control');
}

/** Cooperative form of the same sanitizer used by direct text operations. */
export function* sanitizeTerminalTextWork(text: string): Generator<void, SanitizedTerminalText> {
  const result = sanitization(text, {}, 'multiline');
  return 'text' in result ? result : yield* result;
}

/** Source offsets for an editable one-line value whose terminal text may be sanitized. */
export function projectTerminalSingleLineText(source: string, options: TextMeasurementOptions = {}): {
  readonly text: string;
  sourceOffsetToDisplay(offset: number): number;
  displayOffsetToSource(offset: number): number;
} {
  const sanitized = sanitizeTerminalSingleLineText(source, options);
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
  for (const segment of segmentGraphemesForMeasurement(normalized, options)) {
    for (let index = segment.startOffset; index < segment.endOffsetExclusive; index += 1) {
      normalizedToDisplay[index] = displayOffset;
    }
    if (segment.text === '\n') {
      displayOffset += 1;
      column = 0;
    } else if (segment.text === '\t') {
      const spaces = terminalTabCells(column);
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
  mode: SanitizationMode
): SanitizedTerminalText {
  const result = sanitization(text, options, mode);
  return 'text' in result ? result : finishWork(result);
}

/** Validate every request before cache admission; cache hits need no work iterator. */
function sanitization(
  text: string,
  options: SanitizeTerminalTextOptions,
  mode: SanitizationMode,
): SanitizedTerminalText | Generator<void, SanitizedTerminalText> {
  const replacement = options.replacement ?? '';
  if (replacement !== '' && (hasUnsafeTerminalText(replacement) || /[\t\r\n]/u.test(replacement))) {
    throw new TypeError('Terminal text replacement must not contain control characters or terminal sequences.');
  }
  const cacheKey = sanitizeCacheKey(text, replacement, mode, options);
  if (cacheKey !== undefined) {
    const cached = sanitizeCache.get(cacheKey);
    if (cached !== undefined) return cached;
  }
  return sanitizeWork(text, options, mode, replacement, cacheKey);
}

function* sanitizeWork(
  text: string,
  options: SanitizeTerminalTextOptions,
  mode: SanitizationMode,
  replacement: string,
  cacheKey: string | undefined,
): Generator<void, SanitizedTerminalText> {
  if ((yield* terminalTextSafetyWork(text, true)) && (mode === 'multiline' || !text.includes('\n'))) {
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
  const pieces: string[] = [];
  let cursor = 0;
  let operations = 0;
  // Each native regex search is indivisible; matches and assembly cooperate.
  const matcher = new RegExp(unsafeTerminalSequence.source, unsafeTerminalSequence.flags);
  for (let match = matcher.exec(text); match !== null; match = matcher.exec(text)) {
    const sequence = match[0];
    const codeUnitOffset = match.index;
    pieces.push(text.slice(cursor, codeUnitOffset), replacement);
    cursor = codeUnitOffset + sequence.length;
    removedControlSequences.push(Object.freeze({ sequence, codeUnitOffset,
      kind: isTerminalEscape(sequence) ? 'escape' : 'control' }));
    if (++operations % 256 === 0) yield;
  }
  pieces.push(text.slice(cursor));
  const stripped = pieces.join('');
  const normalized = stripped.replace(/\r\n?/gu, '\n');
  const multiline = mode === 'control' ? normalized : yield* expandTerminalTabsWork(normalized, options);
  const sanitized = mode === 'multiline' || mode === 'control' ? multiline : multiline.replace(/\n/gu, mode === 'single-line' ? ' ' : '');
  const result = Object.freeze({
    text: sanitized,
    changed: removedControlSequences.length > 0 || sanitized !== text,
    removedControlSequences: Object.freeze(removedControlSequences)
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
  return finishWork(terminalTextSafetyWork(text, false));
}

function* terminalTextSafetyWork(text: string, multiline: boolean): Generator<void, boolean> {
  if (text.length <= 2048) {
    return !unsafeTerminalTextCharacters.test(text)
      && (!multiline || !/[\t\r]/u.test(text));
  }
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if ((multiline && (code === 9 || code === 13))
      || code === 0x1b
      || code <= 0x08
      || code === 0x0b
      || code === 0x0c
      || (code >= 0x0e && code <= 0x1f)
      || (code >= 0x7f && code <= 0x9f)) {
      return false;
    }
    if ((index + 1) % 2048 === 0) yield;
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
  mode: 'multiline' | 'single-line' | 'cell' | 'control',
  options: TextMeasurementOptions,
): string | undefined {
  if (text.length > sanitizeCacheMaxTextLength || replacement.length > 16) return undefined;
  return `${mode}:${textWidthProfileKey(options.widthProfile)}:${String(replacement.length)}:${replacement}${String(text.length)}:${text}`;
}

function trimSanitizeCache(): void {
  while (sanitizeCacheWeight > sanitizeCacheWeightLimit) {
    const oldest = sanitizeCache.entries().next().value;
    if (oldest === undefined) return;
    sanitizeCache.delete(oldest[0]);
    sanitizeCacheWeight -= oldest[0].length;
  }
}

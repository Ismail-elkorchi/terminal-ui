import { mergeTerminalStyles } from '../../visual/terminal-style.ts';
import { segmentGraphemesForMeasurement } from '../../text/graphemes.ts';
import {
  prepareTextDocument,
  sanitizeTerminalText,
  textDocumentText,
  textWidthProfileKey,
  type TextDocument,
  type TextWidthProfile
} from '../../text/index.ts';
import type { TerminalStyle } from '../../visual/render.ts';

export interface PreparedTextAreaDecoration {
  readonly startOffset: number;
  readonly endOffsetExclusive: number;
  readonly label: string;
  readonly style?: TerminalStyle;
  readonly replacementText?: string;
  readonly accessibilityText?: string;
}

export interface ProjectedTextStyleRange {
  readonly startOffset: number;
  readonly endOffsetExclusive: number;
  readonly label: string;
  readonly style?: TerminalStyle;
}

interface ProjectionSegment {
  readonly displayStart: number;
  readonly displayEnd: number;
  readonly sourceStart: number;
  readonly sourceEnd: number;
  readonly linear: boolean;
}

export interface TextAreaProjection {
  readonly document: TextDocument;
  readonly text: string;
  readonly accessibilityText: string;
  readonly styleRanges: readonly ProjectedTextStyleRange[];
  displayOffsetAtSourceOffset(offset: number, affinity?: 'upstream' | 'downstream'): number;
  sourceOffsetAtDisplayOffset(offset: number, affinity?: 'upstream' | 'downstream'): number;
}

interface ProjectionBuilder {
  readonly widthProfile: TextWidthProfile;
  readonly textParts: string[];
  readonly accessibilityParts: string[];
  readonly segments: ProjectionSegment[];
  readonly styleRanges: ProjectedTextStyleRange[];
  displayLength: number;
  column: number;
}

const projectionCache = new WeakMap<TextDocument, Map<string, TextAreaProjection>>();
const CACHE_LIMIT = 8;
const TAB_SIZE = 4;

export function createTextAreaProjection(
  document: TextDocument,
  decorations: readonly PreparedTextAreaDecoration[],
  widthProfile: TextWidthProfile
): TextAreaProjection {
  const key = projectionKey(decorations, widthProfile);
  const existing = projectionCache.get(document)?.get(key);
  if (existing !== undefined) return existing;

  const source = textDocumentText(document);
  const builder: ProjectionBuilder = {
    widthProfile,
    textParts: [],
    accessibilityParts: [],
    segments: [],
    styleRanges: [],
    displayLength: 0,
    column: 0
  };
  const replacements = decorations.filter((decoration) => decoration.replacementText !== undefined);
  const cuts = new Set<number>([0, source.length]);
  for (const decoration of decorations) {
    cuts.add(decoration.startOffset);
    cuts.add(decoration.endOffsetExclusive);
  }
  const boundaries = [...cuts].toSorted((left, right) => left - right);
  let sourceOffset = 0;
  for (const boundary of boundaries) {
    if (boundary < sourceOffset) continue;
    for (const virtual of replacements.filter((decoration) => (
      decoration.startOffset === boundary
      && decoration.endOffsetExclusive === boundary
    ))) {
      appendPiece(builder, virtual.replacementText ?? '', boundary, boundary, false, [virtual]);
    }
    const replacement = replacements.find((decoration) => (
      decoration.startOffset === boundary
      && decoration.endOffsetExclusive > boundary
    ));
    if (replacement !== undefined) {
      appendPiece(
        builder,
        replacement.replacementText ?? '',
        replacement.startOffset,
        replacement.endOffsetExclusive,
        false,
        activeDecorations(decorations, replacement.startOffset, replacement.endOffsetExclusive)
      );
      sourceOffset = replacement.endOffsetExclusive;
      continue;
    }
    if (boundary !== sourceOffset) continue;
    const next = boundaries.find((candidate) => candidate > boundary) ?? source.length;
    if (next <= boundary) continue;
    appendPiece(
      builder,
      source.slice(boundary, next),
      boundary,
      next,
      true,
      activeDecorations(decorations, boundary, next)
    );
    sourceOffset = next;
  }

  const text = builder.textParts.join('');
  const segments = Object.freeze(builder.segments);
  const created: TextAreaProjection = Object.freeze({
    document: prepareTextDocument(text),
    text,
    accessibilityText: builder.accessibilityParts.join(''),
    styleRanges: Object.freeze(builder.styleRanges),
    displayOffsetAtSourceOffset(
      offset: number,
      affinity: 'upstream' | 'downstream' = 'downstream'
    ) {
      return displayOffsetAtSourceOffset(segments, source.length, text.length, offset, affinity);
    },
    sourceOffsetAtDisplayOffset(
      offset: number,
      affinity: 'upstream' | 'downstream' = 'downstream'
    ) {
      return sourceOffsetAtDisplayOffset(segments, source.length, text.length, offset, affinity);
    }
  });
  const cache = projectionCache.get(document) ?? new Map<string, TextAreaProjection>();
  cache.set(key, created);
  while (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
  projectionCache.set(document, cache);
  return created;
}

function activeDecorations(
  decorations: readonly PreparedTextAreaDecoration[],
  start: number,
  end: number
): readonly PreparedTextAreaDecoration[] {
  return decorations.filter((decoration) => (
    decoration.startOffset <= start
    && decoration.endOffsetExclusive >= end
    && decoration.startOffset < decoration.endOffsetExclusive
  ));
}

function appendPiece(
  builder: ProjectionBuilder,
  rawText: string,
  sourceStart: number,
  sourceEnd: number,
  linear: boolean,
  decorations: readonly PreparedTextAreaDecoration[]
): void {
  const removed = sanitizeTerminalText(rawText).removedControlSequences.map((entry) => ({
    start: entry.codeUnitOffset,
    end: entry.codeUnitOffset + entry.sequence.length
  }));
  const style = decorations.reduce<TerminalStyle | undefined>(
    (current, decoration) => mergeTerminalStyles(current, decoration.style),
    undefined
  );
  const label = decorations.at(-1)?.label ?? 'decoration';
  const accessibility = decorations.findLast(
    (decoration) => decoration.accessibilityText !== undefined
  )?.accessibilityText;
  if (accessibility !== undefined) builder.accessibilityParts.push(accessibility);
  let replacementText = '';
  let removedIndex = 0;
  for (const grapheme of segmentGraphemesForMeasurement(rawText, {
    widthProfile: builder.widthProfile
  })) {
    while ((removed[removedIndex]?.end ?? Number.POSITIVE_INFINITY) <= grapheme.startOffset) {
      removedIndex += 1;
    }
    const omitted = removed[removedIndex];
    if (omitted !== undefined
      && grapheme.startOffset >= omitted.start
      && grapheme.startOffset < omitted.end) continue;
    if (grapheme.text === '\r') continue;
    let displayText = grapheme.text;
    let direct = linear;
    if (grapheme.text === '\t') {
      const spaces = TAB_SIZE - (builder.column % TAB_SIZE);
      displayText = ' '.repeat(spaces);
      direct = false;
      builder.column += spaces;
    } else if (grapheme.text === '\n') {
      builder.column = 0;
    } else {
      builder.column += grapheme.cells;
    }
    if (linear) {
      appendDisplay(
        builder,
        displayText,
        sourceStart + grapheme.startOffset,
        sourceStart + grapheme.endOffsetExclusive,
        direct,
        style,
        label,
        decorations.length > 0
      );
    } else {
      replacementText += displayText;
    }
    if (accessibility === undefined) builder.accessibilityParts.push(displayText);
  }
  if (!linear) {
    appendDisplay(
      builder,
      replacementText,
      sourceStart,
      sourceEnd,
      false,
      style,
      label,
      decorations.length > 0
    );
  }
}

function appendDisplay(
  builder: ProjectionBuilder,
  text: string,
  sourceStart: number,
  sourceEnd: number,
  linear: boolean,
  style: TerminalStyle | undefined,
  label: string,
  decorated: boolean
): void {
  const displayStart = builder.displayLength;
  const displayEnd = displayStart + text.length;
  builder.textParts.push(text);
  builder.displayLength = displayEnd;
  const segment: ProjectionSegment = Object.freeze({
    displayStart,
    displayEnd,
    sourceStart,
    sourceEnd,
    linear: linear && displayEnd - displayStart === sourceEnd - sourceStart
  });
  const previousSegment = builder.segments.at(-1);
  if (
    previousSegment?.linear === true
    && segment.linear
    && previousSegment.displayEnd === segment.displayStart
    && previousSegment.sourceEnd === segment.sourceStart
  ) {
    builder.segments[builder.segments.length - 1] = Object.freeze({
      displayStart: previousSegment.displayStart,
      displayEnd: segment.displayEnd,
      sourceStart: previousSegment.sourceStart,
      sourceEnd: segment.sourceEnd,
      linear: true
    });
  } else {
    builder.segments.push(segment);
  }
  if (decorated && displayEnd > displayStart) {
    const range: ProjectedTextStyleRange = Object.freeze({
      startOffset: displayStart,
      endOffsetExclusive: displayEnd,
      label,
      ...(style === undefined ? {} : { style })
    });
    const previousRange = builder.styleRanges.at(-1);
    if (
      previousRange?.endOffsetExclusive === range.startOffset
      && previousRange.label === range.label
      && previousRange.style === range.style
    ) {
      builder.styleRanges[builder.styleRanges.length - 1] = Object.freeze({
        startOffset: previousRange.startOffset,
        endOffsetExclusive: range.endOffsetExclusive,
        label: range.label,
        ...(range.style === undefined ? {} : { style: range.style })
      });
    } else {
      builder.styleRanges.push(range);
    }
  }
}

function displayOffsetAtSourceOffset(
  segments: readonly ProjectionSegment[],
  sourceLength: number,
  displayLength: number,
  offset: number,
  affinity: 'upstream' | 'downstream'
): number {
  const target = boundedOffset(offset, sourceLength);
  if (target === sourceLength) return displayLength;
  let low = 0;
  let high = segments.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if ((segments[middle]?.sourceEnd ?? Number.POSITIVE_INFINITY) <= target) low = middle + 1;
    else high = middle;
  }
  const segment = segments[low];
  if (segment === undefined) return displayLength;
  if (segment.linear && target >= segment.sourceStart) {
    return segment.displayStart + target - segment.sourceStart;
  }
  if (target <= segment.sourceStart) return segment.displayStart;
  return affinity === 'upstream' ? segment.displayStart : segment.displayEnd;
}

function sourceOffsetAtDisplayOffset(
  segments: readonly ProjectionSegment[],
  sourceLength: number,
  displayLength: number,
  offset: number,
  affinity: 'upstream' | 'downstream'
): number {
  const target = boundedOffset(offset, displayLength);
  if (target === displayLength) return sourceLength;
  let low = 0;
  let high = segments.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if ((segments[middle]?.displayEnd ?? Number.POSITIVE_INFINITY) <= target) low = middle + 1;
    else high = middle;
  }
  const segment = segments[low];
  if (segment === undefined) return sourceLength;
  if (segment.linear && target >= segment.displayStart) {
    return segment.sourceStart + target - segment.displayStart;
  }
  if (target <= segment.displayStart) return segment.sourceStart;
  return affinity === 'upstream' ? segment.sourceStart : segment.sourceEnd;
}

function boundedOffset(value: number, maximum: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(maximum, Math.floor(value))) : 0;
}

function projectionKey(
  decorations: readonly PreparedTextAreaDecoration[],
  widthProfile: TextWidthProfile
): string {
  return `${textWidthProfileKey(widthProfile)}:${JSON.stringify(decorations)}`;
}

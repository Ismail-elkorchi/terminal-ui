import { segmentGraphemesForMeasurement } from '../../text/graphemes.ts';
import {
  prepareTextDocument,
  sanitizeTerminalText,
  textDocumentParentChange,
  textDocumentText,
  textWidthProfileKey,
  type TextDocument,
  type TextWidthProfile
} from '../../text/index.ts';
import { textDocumentCanProjectDirectly, textDocumentEditExact } from '../../text/document.ts';
import type { TerminalStyle } from '../../visual/render.ts';

interface PreparedTextAreaDecorationBase {
  readonly startOffset: number;
  readonly endOffsetExclusive: number;
  readonly order: number;
  readonly label: string;
}

interface PreparedTextAreaStyleDecoration extends PreparedTextAreaDecorationBase {
  readonly kind: 'style';
  readonly style?: TerminalStyle;
  readonly replacementText?: never;
  readonly accessibilityText?: never;
}

interface PreparedTextAreaReplacementDecoration extends PreparedTextAreaDecorationBase {
  readonly kind: 'replace';
  readonly style?: TerminalStyle;
  readonly replacementText: string;
  readonly accessibilityText?: string;
}

interface PreparedTextAreaConcealDecoration extends PreparedTextAreaDecorationBase {
  readonly kind: 'conceal';
  readonly style?: never;
  readonly replacementText?: never;
  readonly accessibilityText?: never;
}

export type PreparedTextAreaDecoration =
  | PreparedTextAreaStyleDecoration
  | PreparedTextAreaReplacementDecoration
  | PreparedTextAreaConcealDecoration;

type PreparedTextAreaContentDecoration =
  | PreparedTextAreaReplacementDecoration
  | PreparedTextAreaConcealDecoration;

export interface ProjectedTextStyleRange {
  readonly startOffset: number;
  readonly endOffsetExclusive: number;
  readonly label: string;
  readonly style?: TerminalStyle;
}

interface MappingSegment {
  readonly sourceStart: number;
  readonly sourceEnd: number;
  readonly targetStart: number;
  readonly targetEnd: number;
  readonly linear: boolean;
}

interface OffsetProjection {
  readonly sourceLength: number;
  readonly targetLength: number;
  readonly sourceSegments: readonly MappingSegment[];
  readonly targetSegments: readonly MappingSegment[];
  readonly virtualSegments: readonly MappingSegment[];
}

export interface TextAreaProjection {
  readonly widthProfileKey: string;
  readonly document: TextDocument;
  readonly text: string;
  readonly accessibilityText: string;
  readonly styleRanges: readonly ProjectedTextStyleRange[];
  displayOffsetAtSourceOffset(offset: number, affinity?: 'upstream' | 'downstream'): number;
  sourceOffsetAtDisplayOffset(offset: number, affinity?: 'upstream' | 'downstream'): number;
  accessibilityOffsetAtSourceOffset(offset: number, affinity?: 'upstream' | 'downstream'): number;
}

interface ProjectionBuilder {
  readonly widthProfile: TextWidthProfile;
  readonly textParts: string[];
  readonly accessibilityParts: string[];
  readonly displayMappings: MappingSegment[];
  readonly accessibilityMappings: MappingSegment[];
  readonly styleRanges: ProjectedTextStyleRange[];
  readonly removedSourceRanges: readonly RemovedRange[];
  removedSourceIndex: number;
  displayLength: number;
  accessibilityLength: number;
  column: number;
}

interface RemovedRange {
  readonly start: number;
  readonly end: number;
}

interface ResolvedDecoration {
  readonly decorated: boolean;
  readonly label: string;
  readonly style?: TerminalStyle;
}

type TerminalStyleField = keyof TerminalStyle;

interface HeapEntry<TValue> {
  readonly order: number;
  readonly value: TValue;
}

const projectionCache = new WeakMap<TextDocument, Map<string, TextAreaProjection>>();
const CACHE_LIMIT = 8;
const TAB_SIZE = 4;
const terminalStyleFields: readonly TerminalStyleField[] = Object.freeze([
  'fg', 'bg', 'bold', 'dim', 'italic', 'underline', 'strikethrough', 'inverse', 'hidden'
]);

export function createTextAreaProjection(
  document: TextDocument,
  decorations: readonly PreparedTextAreaDecoration[],
  widthProfile: TextWidthProfile
): TextAreaProjection {
  const key = projectionKey(decorations, widthProfile);
  const profileKey = textWidthProfileKey(widthProfile);
  const existing = projectionCache.get(document)?.get(key);
  if (existing !== undefined) return existing;

  const source = textDocumentText(document);
  if (
    decorations.every((decoration) => decoration.kind === 'style')
    && textDocumentCanProjectDirectly(document)
  ) {
    return retainProjection(document, key, directProjection(document, source, decorations, profileKey));
  }
  const sanitizedSource = sanitizeTerminalText(source);
  const removedSourceRanges = sanitizedSource.removedControlSequences.map((entry) => ({
    start: entry.codeUnitOffset,
    end: entry.codeUnitOffset + entry.sequence.length
  }));
  const builder: ProjectionBuilder = {
    widthProfile,
    textParts: [],
    accessibilityParts: [],
    displayMappings: [],
    accessibilityMappings: [],
    styleRanges: [],
    removedSourceRanges,
    removedSourceIndex: 0,
    displayLength: 0,
    accessibilityLength: 0,
    column: 0
  };
  projectSource(builder, source, decorations);

  const text = builder.textParts.join('');
  const accessibilityText = builder.accessibilityParts.join('');
  const displayProjection = createOffsetProjection(
    source.length,
    text.length,
    builder.displayMappings
  );
  const accessibilityProjection = createOffsetProjection(
    source.length,
    accessibilityText.length,
    builder.accessibilityMappings
  );
  const created: TextAreaProjection = Object.freeze({
    widthProfileKey: profileKey,
    document: inheritedProjectedDocument(document, text, profileKey),
    text,
    accessibilityText,
    styleRanges: Object.freeze(builder.styleRanges),
    displayOffsetAtSourceOffset(
      offset: number,
      affinity: 'upstream' | 'downstream' = 'downstream'
    ) {
      return projectSourceOffset(displayProjection, offset, affinity);
    },
    sourceOffsetAtDisplayOffset(
      offset: number,
      affinity: 'upstream' | 'downstream' = 'downstream'
    ) {
      return projectTargetOffset(displayProjection, offset, affinity);
    },
    accessibilityOffsetAtSourceOffset(
      offset: number,
      affinity: 'upstream' | 'downstream' = 'downstream'
    ) {
      return projectSourceOffset(accessibilityProjection, offset, affinity);
    }
  });
  return retainProjection(document, key, created);
}

function retainProjection(
  document: TextDocument,
  key: string,
  projection: TextAreaProjection,
): TextAreaProjection {
  const cache = projectionCache.get(document) ?? new Map<string, TextAreaProjection>();
  cache.set(key, projection);
  while (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
  projectionCache.set(document, cache);
  return projection;
}

function directProjection(
  document: TextDocument,
  source: string,
  decorations: readonly PreparedTextAreaDecoration[],
  profileKey: string,
): TextAreaProjection {
  const segment: MappingSegment = Object.freeze({
    sourceStart: 0,
    sourceEnd: source.length,
    targetStart: 0,
    targetEnd: source.length,
    linear: true,
  });
  const projection = createOffsetProjection(source.length, source.length, [segment]);
  return Object.freeze({
    widthProfileKey: profileKey,
    document,
    text: source,
    accessibilityText: source,
    styleRanges: directStyleRanges(decorations, source.length),
    displayOffsetAtSourceOffset(offset: number, affinity: 'upstream' | 'downstream' = 'downstream') {
      return projectSourceOffset(projection, offset, affinity);
    },
    sourceOffsetAtDisplayOffset(offset: number, affinity: 'upstream' | 'downstream' = 'downstream') {
      return projectTargetOffset(projection, offset, affinity);
    },
    accessibilityOffsetAtSourceOffset(offset: number, affinity: 'upstream' | 'downstream' = 'downstream') {
      return projectSourceOffset(projection, offset, affinity);
    },
  });
}

function inheritedProjectedDocument(
  sourceDocument: TextDocument,
  text: string,
  profileKey: string,
): TextDocument {
  const lineage = textDocumentParentChange(sourceDocument);
  const parentCache = lineage === undefined ? undefined : projectionCache.get(lineage.parent);
  const parent = parentCache === undefined
    ? undefined
    : [...parentCache.values()].toReversed().find((candidate) => (
        candidate.widthProfileKey === profileKey
      ));
  if (parent === undefined) return prepareTextDocument(text);
  if (parent.text === text) return parent.document;
  const prefix = commonPrefixLength(parent.text, text);
  const suffix = commonSuffixLength(parent.text, text, prefix);
  return textDocumentEditExact(
    parent.document,
    prefix,
    parent.text.length - suffix,
    text.slice(prefix, text.length - suffix),
  ).document;
}

function commonPrefixLength(left: string, right: string): number {
  const maximum = Math.min(left.length, right.length);
  let index = 0;
  while (index < maximum && left.charCodeAt(index) === right.charCodeAt(index)) index += 1;
  return index;
}

function commonSuffixLength(left: string, right: string, prefix: number): number {
  const maximum = Math.min(left.length, right.length) - prefix;
  let length = 0;
  while (
    length < maximum
    && left.charCodeAt(left.length - length - 1) === right.charCodeAt(right.length - length - 1)
  ) length += 1;
  return length;
}

function directStyleRanges(
  decorations: readonly PreparedTextAreaDecoration[],
  sourceLength: number,
): readonly ProjectedTextStyleRange[] {
  if (decorations.length === 0) return Object.freeze([]);
  const starts = new Map<number, PreparedTextAreaDecoration[]>();
  const ends = new Map<number, PreparedTextAreaDecoration[]>();
  const boundaries = new Set<number>([0, sourceLength]);
  for (const decoration of decorations) {
    boundaries.add(decoration.startOffset);
    boundaries.add(decoration.endOffsetExclusive);
    appendEvent(starts, decoration.startOffset, decoration);
    appendEvent(ends, decoration.endOffsetExclusive, decoration);
  }
  const ordered = [...boundaries].toSorted((left, right) => left - right);
  const active = new ActiveDecorationStyles();
  const ranges: ProjectedTextStyleRange[] = [];
  for (let index = 0; index < ordered.length - 1; index += 1) {
    const start = ordered[index];
    const end = ordered[index + 1];
    if (start === undefined || end === undefined || end <= start) continue;
    for (const decoration of ends.get(start) ?? []) active.remove(decoration);
    for (const decoration of starts.get(start) ?? []) active.add(decoration);
    const resolved = active.resolve();
    if (!resolved.decorated) continue;
    const range: ProjectedTextStyleRange = Object.freeze({
      startOffset: start,
      endOffsetExclusive: end,
      label: resolved.label,
      ...(resolved.style === undefined ? {} : { style: resolved.style }),
    });
    const previous = ranges.at(-1);
    if (
      previous?.endOffsetExclusive === range.startOffset
      && previous.label === range.label
      && sameTerminalStyle(previous.style, range.style)
    ) {
      ranges[ranges.length - 1] = Object.freeze({ ...range, startOffset: previous.startOffset });
    } else {
      ranges.push(range);
    }
  }
  return Object.freeze(ranges);
}

function projectSource(
  builder: ProjectionBuilder,
  source: string,
  decorations: readonly PreparedTextAreaDecoration[]
): void {
  const boundaries = new Set<number>([0, source.length]);
  const starts = new Map<number, PreparedTextAreaDecoration[]>();
  const ends = new Map<number, PreparedTextAreaDecoration[]>();
  const replacements = new Map<number, PreparedTextAreaContentDecoration>();
  const virtual = new Map<number, PreparedTextAreaReplacementDecoration[]>();
  for (const decoration of decorations) {
    boundaries.add(decoration.startOffset);
    boundaries.add(decoration.endOffsetExclusive);
    if (decoration.kind !== 'style') {
      if (decoration.kind === 'replace' && decoration.startOffset === decoration.endOffsetExclusive) {
        appendEvent(virtual, decoration.startOffset, decoration);
      } else {
        replacements.set(decoration.startOffset, decoration);
      }
      continue;
    }
    appendEvent(starts, decoration.startOffset, decoration);
    appendEvent(ends, decoration.endOffsetExclusive, decoration);
  }

  const ordered = [...boundaries].toSorted((left, right) => left - right);
  const active = new ActiveDecorationStyles();
  let consumedSource = 0;
  for (let index = 0; index < ordered.length; index += 1) {
    const boundary = ordered[index];
    if (boundary === undefined) continue;
    for (const decoration of ends.get(boundary) ?? []) active.remove(decoration);
    for (const decoration of starts.get(boundary) ?? []) active.add(decoration);
    if (boundary < consumedSource) continue;

    for (const decoration of virtual.get(boundary) ?? []) {
      appendResolvedReplacement(builder, decoration, active);
    }
    const replacement = replacements.get(boundary);
    if (replacement !== undefined) {
      appendResolvedReplacement(builder, replacement, active);
      consumedSource = replacement.endOffsetExclusive;
      continue;
    }
    if (boundary !== consumedSource) continue;
    const next = ordered[index + 1] ?? source.length;
    if (next <= boundary) continue;
    appendSourcePiece(builder, source, boundary, next, active.resolve());
    consumedSource = next;
  }
}

function appendResolvedReplacement(
  builder: ProjectionBuilder,
  decoration: PreparedTextAreaContentDecoration,
  active: ActiveDecorationStyles,
): void {
  active.add(decoration);
  const resolved = active.resolve();
  active.remove(decoration);
  appendReplacement(builder, decoration, resolved);
}

function appendEvent(
  events: Map<number, PreparedTextAreaDecoration[]>,
  offset: number,
  decoration: PreparedTextAreaDecoration
): void {
  const entries = events.get(offset);
  if (entries === undefined) events.set(offset, [decoration]);
  else entries.push(decoration);
}

class ActiveDecorationStyles {
  readonly #active = new Set<number>();
  readonly #labels: HeapEntry<string>[] = [];
  readonly #fields = new Map<TerminalStyleField, HeapEntry<TerminalStyle[TerminalStyleField]>[]>();

  add(decoration: PreparedTextAreaDecoration): void {
    this.#active.add(decoration.order);
    heapPush(this.#labels, { order: decoration.order, value: decoration.label });
    for (const field of terminalStyleFields) {
      const value = decoration.style?.[field];
      if (value === undefined) continue;
      const heap = this.#fields.get(field) ?? [];
      heapPush(heap, { order: decoration.order, value });
      this.#fields.set(field, heap);
    }
  }

  remove(decoration: PreparedTextAreaDecoration): void {
    this.#active.delete(decoration.order);
  }

  resolve(): ResolvedDecoration {
    const label = heapValue(this.#labels, this.#active);
    if (label === undefined) return { decorated: false, label: 'decoration' };
    const style: Partial<Record<TerminalStyleField, TerminalStyle[TerminalStyleField]>> = {};
    for (const field of terminalStyleFields) {
      const value = heapValue(this.#fields.get(field), this.#active);
      if (value !== undefined) style[field] = value;
    }
    return {
      decorated: true,
      label,
      ...(Object.keys(style).length === 0 ? {} : { style: Object.freeze(style) as TerminalStyle })
    };
  }
}

function heapPush<TValue>(heap: HeapEntry<TValue>[], entry: HeapEntry<TValue>): void {
  heap.push(entry);
  let index = heap.length - 1;
  while (index > 0) {
    const parent = Math.floor((index - 1) / 2);
    const parentEntry = heap[parent];
    if (parentEntry === undefined || parentEntry.order >= entry.order) break;
    heap[index] = parentEntry;
    index = parent;
  }
  heap[index] = entry;
}

function heapValue<TValue>(
  heap: HeapEntry<TValue>[] | undefined,
  active: ReadonlySet<number>
): TValue | undefined {
  if (heap === undefined) return undefined;
  while (heap.length > 0 && !active.has(heap[0]?.order ?? -1)) heapPop(heap);
  return heap[0]?.value;
}

function heapPop<TValue>(heap: HeapEntry<TValue>[]): void {
  const last = heap.pop();
  if (last === undefined || heap.length === 0) return;
  let index = 0;
  for (;;) {
    const left = index * 2 + 1;
    const right = left + 1;
    if (left >= heap.length) break;
    const child = right < heap.length
      && (heap[right]?.order ?? -1) > (heap[left]?.order ?? -1)
      ? right
      : left;
    const childEntry = heap[child];
    if (childEntry === undefined || childEntry.order <= last.order) break;
    heap[index] = childEntry;
    index = child;
  }
  heap[index] = last;
}

function appendSourcePiece(
  builder: ProjectionBuilder,
  source: string,
  start: number,
  end: number,
  decoration: ResolvedDecoration
): void {
  const rawText = source.slice(start, end);
  while ((builder.removedSourceRanges[builder.removedSourceIndex]?.end
    ?? Number.POSITIVE_INFINITY) <= start) {
    builder.removedSourceIndex += 1;
  }
  const removed = builder.removedSourceRanges[builder.removedSourceIndex];
  if (
    (removed === undefined || removed.start >= end)
    && /^[\n\x20-\x7E]*$/u.test(rawText)
  ) {
    const lastBreak = rawText.lastIndexOf('\n');
    builder.column = lastBreak === -1
      ? builder.column + rawText.length
      : rawText.length - lastBreak - 1;
    appendProjection(builder, rawText, rawText, start, end, true, true, decoration);
    return;
  }
  for (const grapheme of segmentGraphemesForMeasurement(rawText, {
    widthProfile: builder.widthProfile
  })) {
    const sourceStart = start + grapheme.startOffset;
    const sourceEnd = start + grapheme.endOffsetExclusive;
    while ((builder.removedSourceRanges[builder.removedSourceIndex]?.end
      ?? Number.POSITIVE_INFINITY) <= sourceStart) {
      builder.removedSourceIndex += 1;
    }
    const removed = builder.removedSourceRanges[builder.removedSourceIndex];
    if (removed !== undefined && sourceStart >= removed.start && sourceStart < removed.end) {
      appendProjection(builder, '', '', sourceStart, sourceEnd, false, false, decoration);
      continue;
    }
    const projected = projectedGrapheme(builder, grapheme.text, grapheme.cells);
    const linear = projected === grapheme.text;
    appendProjection(
      builder,
      projected,
      projected,
      sourceStart,
      sourceEnd,
      linear,
      linear,
      decoration
    );
  }
}

function appendReplacement(
  builder: ProjectionBuilder,
  decoration: PreparedTextAreaContentDecoration,
  resolved: ResolvedDecoration,
): void {
  const displayText = decoration.kind === 'conceal'
    ? ''
    : projectReplacementText(decoration.replacementText, builder);
  const accessibilityText = decoration.kind === 'conceal'
    ? ''
    : decoration.accessibilityText === undefined
      ? displayText
      : sanitizeTerminalText(decoration.accessibilityText).text;
  appendProjection(
    builder,
    displayText,
    accessibilityText,
    decoration.startOffset,
    decoration.endOffsetExclusive,
    false,
    false,
    resolved
  );
}

function projectReplacementText(rawText: string, builder: ProjectionBuilder): string {
  const sanitized = sanitizeTerminalText(rawText).text;
  let text = '';
  for (const grapheme of segmentGraphemesForMeasurement(sanitized, {
    widthProfile: builder.widthProfile
  })) {
    text += projectedGrapheme(builder, grapheme.text, grapheme.cells);
  }
  return text;
}

function projectedGrapheme(builder: ProjectionBuilder, text: string, cells: number): string {
  if (text === '\r' || text === '\r\n' || text === '\n') {
    builder.column = 0;
    return '\n';
  }
  if (text === '\t') {
    const spaces = TAB_SIZE - (builder.column % TAB_SIZE);
    builder.column += spaces;
    return ' '.repeat(spaces);
  }
  builder.column += cells;
  return text;
}

function appendProjection(
  builder: ProjectionBuilder,
  displayText: string,
  accessibilityText: string,
  sourceStart: number,
  sourceEnd: number,
  displayLinear: boolean,
  accessibilityLinear: boolean,
  decoration: ResolvedDecoration
): void {
  const displayStart = builder.displayLength;
  const displayEnd = displayStart + displayText.length;
  const accessibilityStart = builder.accessibilityLength;
  const accessibilityEnd = accessibilityStart + accessibilityText.length;
  builder.textParts.push(displayText);
  builder.accessibilityParts.push(accessibilityText);
  builder.displayLength = displayEnd;
  builder.accessibilityLength = accessibilityEnd;
  appendMapping(builder.displayMappings, {
    sourceStart,
    sourceEnd,
    targetStart: displayStart,
    targetEnd: displayEnd,
    linear: displayLinear && displayEnd - displayStart === sourceEnd - sourceStart
  });
  appendMapping(builder.accessibilityMappings, {
    sourceStart,
    sourceEnd,
    targetStart: accessibilityStart,
    targetEnd: accessibilityEnd,
    linear: accessibilityLinear && accessibilityEnd - accessibilityStart === sourceEnd - sourceStart
  });
  if (decoration.decorated && displayEnd > displayStart) {
    const range: ProjectedTextStyleRange = Object.freeze({
      startOffset: displayStart,
      endOffsetExclusive: displayEnd,
      label: decoration.label,
      ...(decoration.style === undefined ? {} : { style: decoration.style })
    });
    const previous = builder.styleRanges.at(-1);
    if (
      previous?.endOffsetExclusive === range.startOffset
      && previous.label === range.label
      && sameTerminalStyle(previous.style, range.style)
    ) {
      builder.styleRanges[builder.styleRanges.length - 1] = Object.freeze({
        ...range,
        startOffset: previous.startOffset
      });
    } else {
      builder.styleRanges.push(range);
    }
  }
}

function appendMapping(mappings: MappingSegment[], segment: MappingSegment): void {
  const frozen = Object.freeze(segment);
  const previous = mappings.at(-1);
  const adjacent = previous?.sourceEnd === segment.sourceStart
    && previous.targetEnd === segment.targetStart;
  const linear = previous !== undefined && adjacent && previous.linear && segment.linear;
  const collapsed = previous !== undefined
    && adjacent
    && previous.targetStart === previous.targetEnd
    && segment.targetStart === segment.targetEnd;
  if (previous !== undefined && (linear || collapsed)) {
    mappings[mappings.length - 1] = Object.freeze({
      sourceStart: previous.sourceStart,
      sourceEnd: segment.sourceEnd,
      targetStart: previous.targetStart,
      targetEnd: segment.targetEnd,
      linear
    });
  } else {
    mappings.push(frozen);
  }
}

function createOffsetProjection(
  sourceLength: number,
  targetLength: number,
  mappings: readonly MappingSegment[]
): OffsetProjection {
  return Object.freeze({
    sourceLength,
    targetLength,
    sourceSegments: Object.freeze(mappings.filter((segment) => segment.sourceEnd > segment.sourceStart)),
    targetSegments: Object.freeze(mappings.filter((segment) => segment.targetEnd > segment.targetStart)),
    virtualSegments: Object.freeze(mappings.filter((segment) => (
      segment.sourceStart === segment.sourceEnd && segment.targetEnd > segment.targetStart
    )))
  });
}

function projectSourceOffset(
  projection: OffsetProjection,
  offset: number,
  affinity: 'upstream' | 'downstream'
): number {
  const target = boundedOffset(offset, projection.sourceLength);
  const virtual = virtualSegmentAt(projection.virtualSegments, target);
  if (virtual !== undefined) {
    return affinity === 'upstream' ? virtual.targetStart : virtual.targetEnd;
  }
  if (target === projection.sourceLength) return projection.targetLength;
  const index = firstEndingAfter(projection.sourceSegments, target, 'sourceEnd');
  const segment = projection.sourceSegments[index];
  if (segment === undefined) return projection.targetLength;
  if (target < segment.sourceStart) {
    return affinity === 'upstream'
      ? projection.sourceSegments[index - 1]?.targetEnd ?? segment.targetStart
      : segment.targetStart;
  }
  if (target === segment.sourceStart) return segment.targetStart;
  if (segment.linear) return segment.targetStart + target - segment.sourceStart;
  return affinity === 'upstream' ? segment.targetStart : segment.targetEnd;
}

function projectTargetOffset(
  projection: OffsetProjection,
  offset: number,
  affinity: 'upstream' | 'downstream'
): number {
  const target = boundedOffset(offset, projection.targetLength);
  if (target === projection.targetLength) return projection.sourceLength;
  const index = firstEndingAfter(projection.targetSegments, target, 'targetEnd');
  const segment = projection.targetSegments[index];
  if (segment === undefined) return projection.sourceLength;
  if (target < segment.targetStart) {
    return affinity === 'upstream'
      ? projection.targetSegments[index - 1]?.sourceEnd ?? segment.sourceStart
      : segment.sourceStart;
  }
  if (segment.linear) return segment.sourceStart + target - segment.targetStart;
  return affinity === 'upstream' ? segment.sourceStart : segment.sourceEnd;
}

function firstEndingAfter(
  segments: readonly MappingSegment[],
  offset: number,
  field: 'sourceEnd' | 'targetEnd'
): number {
  let low = 0;
  let high = segments.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if ((segments[middle]?.[field] ?? Number.POSITIVE_INFINITY) <= offset) low = middle + 1;
    else high = middle;
  }
  return low;
}

function virtualSegmentAt(
  segments: readonly MappingSegment[],
  sourceOffset: number
): MappingSegment | undefined {
  let low = 0;
  let high = segments.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if ((segments[middle]?.sourceStart ?? Number.POSITIVE_INFINITY) < sourceOffset) low = middle + 1;
    else high = middle;
  }
  if (segments[low]?.sourceStart !== sourceOffset) return undefined;
  let end = low + 1;
  while (segments[end]?.sourceStart === sourceOffset) end += 1;
  return Object.freeze({
    sourceStart: sourceOffset,
    sourceEnd: sourceOffset,
    targetStart: segments[low]?.targetStart ?? 0,
    targetEnd: segments[end - 1]?.targetEnd ?? 0,
    linear: false
  });
}

function boundedOffset(value: number, maximum: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(maximum, Math.floor(value))) : 0;
}

function sameTerminalStyle(left: TerminalStyle | undefined, right: TerminalStyle | undefined): boolean {
  if (left === undefined || right === undefined) return left === right;
  return terminalStyleFields.every((field) => left[field] === right[field]);
}

function projectionKey(
  decorations: readonly PreparedTextAreaDecoration[],
  widthProfile: TextWidthProfile
): string {
  return `${textWidthProfileKey(widthProfile)}:${JSON.stringify(decorations)}`;
}

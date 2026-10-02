import { finishWork, stableSortWork } from '../../foundation/cooperative-work.ts';
import type { TextDocument, TextDocumentLine } from '../../text/document.ts';
import {
  createTextDocumentWork,
  normalizeTextDocumentOffset,
  textDocumentApplyChangesExactWork,
  textDocumentCanProjectLines,
  textDocumentCanRenderDirectly,
  textDocumentEditExactWork,
  textDocumentLength,
  textDocumentLineAt,
  textDocumentLineBoundaries,
  textDocumentLineCount,
  textDocumentLineIndexAtOffset,
  textDocumentLines,
  textDocumentPreviousMutation,
  textDocumentSlice,
  textDocumentText,
} from '../../text/document.ts';
import { measureGraphemeCells } from '../../text/graphemes.ts';
import type { SourceBoundaryIndex, SourceRevisionData } from '../../text/source-boundaries.ts';
import { sourceBoundaries } from '../../text/source-boundaries.ts';
import { sanitizeTerminalControlTextWork, sanitizeTerminalTextWork } from '../../text/sanitize.ts';
import { expandTerminalTabsWork, terminalTabCells } from '../../text/tabs.ts';
import type { TextWidthProfile } from '../../text/types.ts';
import { textWidthProfileKey } from '../../text/width-profile.ts';
import type { TerminalStyle } from '../../visual/render-content.ts';
import type { TextAreaDecorationModel, TextAreaReplacementDecorationModel } from './decorations.ts';
import { textAreaDecorationMapping } from './decorations.ts';
import { textDocumentChangedLineRanges } from './document-change-ranges.ts';
import type { TextDocumentChangedLineRange } from './document-change-ranges.ts';

type TextAreaContentDecorationModel =
  | TextAreaReplacementDecorationModel
  | Extract<TextAreaDecorationModel, { readonly kind: 'conceal' }>;

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
  readonly segments: readonly MappingSegment[];
}

export interface TextAreaProjection {
  readonly widthProfileKey: string;
  readonly document: TextDocument;
  readonly styleRanges: readonly ProjectedTextStyleRange[];
  accessibilityWindow(centerOffset: number, maximumCodeUnits: number): TextAreaAccessibilityWindow;
  accessibilityLineCount(): number;
  displayOffsetAtSourceOffset(offset: number, affinity?: 'upstream' | 'downstream'): number;
  sourceOffsetAtDisplayOffset(offset: number, affinity?: 'upstream' | 'downstream'): number;
  accessibilityOffsetAtSourceOffset(offset: number, affinity?: 'upstream' | 'downstream'): number;
}

interface RetainedProjectionData {
  readonly sourceDocument: TextDocument;
  readonly decorations: readonly TextAreaDecorationModel[];
  readonly displayDocument: TextDocument;
  readonly accessibilityDocument: TextDocument;
  readonly displayOffsets: OffsetProjection;
  readonly accessibilityOffsets: OffsetProjection;
}

export interface TextAreaAccessibilityWindow {
  readonly startOffset: number;
  readonly endOffsetExclusive: number;
  readonly totalLength: number;
  readonly text: string;
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

const projectionCache = new WeakMap<
  TextDocument,
  WeakMap<readonly TextAreaDecorationModel[], Map<string, TextAreaProjection>>
>();
const recentDisplayProjections = new WeakMap<
  TextDocument,
  Map<string, WeakRef<TextAreaProjection>>
>();
const lineProjectableProjections = new WeakSet<TextAreaProjection>();
const preparedLineProjectionMaps = new WeakMap<TextAreaProjection, ReadonlyMap<number, OffsetProjection>>();
const maximumLazyLineLength = 4_096;
const retainedProjectionData = new WeakMap<TextAreaProjection, RetainedProjectionData>();
const CACHE_LIMIT = 8;
const terminalStyleFields: readonly TerminalStyleField[] = Object.freeze([
  'fg', 'bg', 'bold', 'dim', 'italic', 'underline', 'strikethrough', 'inverse', 'hidden'
]);

export function createTextAreaProjection(
  document: TextDocument,
  decorations: readonly TextAreaDecorationModel[],
  widthProfile: TextWidthProfile
): TextAreaProjection {
  return finishWork(createTextAreaProjectionWork(document, decorations, widthProfile));
}

/** Shared projection computation. Native string operations and single grapheme
 * measurements are indivisible; framework-owned scans checkpoint throughout. */
export function* createTextAreaProjectionWork(
  document: TextDocument,
  decorations: readonly TextAreaDecorationModel[],
  widthProfile: TextWidthProfile,
): Generator<void, TextAreaProjection> {
  const profileKey = textWidthProfileKey(widthProfile);
  const existing = projectionCache.get(document)?.get(decorations)?.get(profileKey);
  if (existing !== undefined) return existing;

  const stylesOnly = yield* onlyStyleDecorationsWork(decorations);
  if (stylesOnly && textDocumentCanRenderDirectly(document)) {
    return retainProjection(
      document,
      decorations,
      profileKey,
      yield* directProjectionWork(document, decorations, profileKey),
    );
  }
  if (stylesOnly && textDocumentCanProjectLines(document)) {
    return retainProjection(
      document,
      decorations,
      profileKey,
      yield* lineProjectionWork(document, decorations, widthProfile, profileKey),
    );
  }
  const updated = yield* incrementalMaterializedProjectionWork(
    document,
    decorations,
    widthProfile,
    profileKey,
  );
  if (updated !== undefined) {
    return retainProjection(document, decorations, profileKey, updated);
  }
  const source = textDocumentText(document);
  const built = yield* buildMaterializedProjectionWork(source, decorations, widthProfile);
  const displayDocument = yield* createTextDocumentWork(built.text);
  const accessibilityDocument = yield* createTextDocumentWork(built.accessibilityText);
  const created: TextAreaProjection = Object.freeze({
    widthProfileKey: profileKey,
    document: displayDocument,
    styleRanges: built.styleRanges,
    accessibilityWindow: (centerOffset: number, maximumCodeUnits: number) => (
      accessibilityWindow(accessibilityDocument, centerOffset, maximumCodeUnits)
    ),
    accessibilityLineCount: () => built.accessibilityText.length === 0
      ? 0
      : textDocumentLineCount(accessibilityDocument),
    displayOffsetAtSourceOffset(
      offset: number,
      affinity: 'upstream' | 'downstream' = 'downstream'
    ) {
      return projectSourceOffset(built.displayOffsets, offset, affinity);
    },
    sourceOffsetAtDisplayOffset(
      offset: number,
      affinity: 'upstream' | 'downstream' = 'downstream'
    ) {
      return projectTargetOffset(built.displayOffsets, offset, affinity);
    },
    accessibilityOffsetAtSourceOffset(
      offset: number,
      affinity: 'upstream' | 'downstream' = 'downstream'
    ) {
      return projectSourceOffset(built.accessibilityOffsets, offset, affinity);
    }
  });
  retainedProjectionData.set(created, Object.freeze({
    sourceDocument: document,
    decorations,
    displayDocument,
    accessibilityDocument,
    displayOffsets: built.displayOffsets,
    accessibilityOffsets: built.accessibilityOffsets,
  }));
  return retainProjection(document, decorations, profileKey, created);
}

function* onlyStyleDecorationsWork(decorations: readonly TextAreaDecorationModel[]): Generator<void, boolean> {
  let operations = 0;
  for (const decoration of decorations) {
    if (decoration.kind !== 'style') return false;
    if (++operations % 256 === 0) yield;
  }
  return true;
}

function* styleDecorationsWork(decorations: readonly TextAreaDecorationModel[]): Generator<void, readonly TextAreaDecorationModel[]> {
  const result: TextAreaDecorationModel[] = [];
  let operations = 0;
  for (const decoration of decorations) {
    if (decoration.kind === 'style') result.push(decoration);
    if (++operations % 256 === 0) yield;
  }
  return result;
}

interface BuiltMaterializedProjection {
  readonly text: string;
  readonly accessibilityText: string;
  readonly displayOffsets: OffsetProjection;
  readonly accessibilityOffsets: OffsetProjection;
  readonly styleRanges: readonly ProjectedTextStyleRange[];
}

function* buildMaterializedProjectionWork(
  source: string,
  decorations: readonly TextAreaDecorationModel[],
  widthProfile: TextWidthProfile,
): Generator<void, BuiltMaterializedProjection> {
  const sanitizedSource = yield* sanitizeTerminalTextWork(source, { widthProfile });
  const removedSourceRanges: RemovedRange[] = [];
  for (const entry of sanitizedSource.removedControlSequences) {
    removedSourceRanges.push({ start: entry.codeUnitOffset, end: entry.codeUnitOffset + entry.sequence.length });
    if (removedSourceRanges.length % 256 === 0) yield;
  }
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
    column: 0,
  };
  yield* projectSourceWork(builder, source, decorations);
  const text = builder.textParts.join('');
  const accessibilityText = builder.accessibilityParts.join('');
  return Object.freeze({
    text,
    accessibilityText,
    displayOffsets: yield* createOffsetProjectionWork(source.length, text.length, builder.displayMappings),
    accessibilityOffsets: yield* createOffsetProjectionWork(
      source.length,
      accessibilityText.length,
      builder.accessibilityMappings,
    ),
    styleRanges: Object.freeze(builder.styleRanges),
  });
}

function* incrementalMaterializedProjectionWork(
  document: TextDocument,
  decorations: readonly TextAreaDecorationModel[],
  widthProfile: TextWidthProfile,
  profileKey: string,
): Generator<void, TextAreaProjection | undefined> {
  if (!textDocumentCanProjectLines(document)) return undefined;
  const mutation = textDocumentPreviousMutation(document);
  const decorationMapping = textAreaDecorationMapping(decorations);
  if (
    mutation === undefined
    || decorationMapping?.changes !== mutation.changes
  ) return undefined;
  const previousProjection = recentDisplayProjections
    .get(mutation.document)?.get(profileKey)?.deref();
  const previous = previousProjection === undefined
    ? undefined
    : retainedProjectionData.get(previousProjection);
  if (
    previous?.sourceDocument !== mutation.document
    || previous.decorations !== decorationMapping.previous
  ) return undefined;
  let sourceDelta = 0;
  let operations = 0;
  for (const change of mutation.changes) {
    sourceDelta += change.insertedText.length - (change.endOffsetExclusive - change.startOffset);
    if (++operations % 256 === 0) yield;
  }
  const previousRange = yield* completeMaterializedSourceRangeWork(
    mutation.document,
    decorationMapping.previousAffectedRange.startOffset,
    decorationMapping.previousAffectedRange.endOffsetExclusive,
    decorationMapping.previous,
  );
  const nextRange = yield* completeMaterializedSourceRangeWork(
    document,
    decorationMapping.nextAffectedRange.startOffset,
    decorationMapping.nextAffectedRange.endOffsetExclusive,
    decorations,
  );
  const previousSourceStart = previousRange.startOffset;
  const previousSourceEnd = previousRange.endOffsetExclusive;
  const nextSourceStart = nextRange.startOffset;
  const nextSourceEnd = nextRange.endOffsetExclusive;
  if (
    previousSourceStart !== nextSourceStart
    || nextSourceEnd - previousSourceEnd !== sourceDelta
  ) return undefined;
  const localDecorations = yield* decorationsWithinRangeWork(
    decorations,
    nextSourceStart,
    nextSourceEnd,
    textDocumentLength(document),
  );
  const local = yield* buildMaterializedProjectionWork(
    textDocumentSlice(document, nextSourceStart, nextSourceEnd),
    localDecorations,
    widthProfile,
  );

  const previousDisplayStart = projectSourceOffset(
    previous.displayOffsets,
    previousSourceStart,
    'upstream',
  );
  const previousDisplayEnd = projectSourceOffset(
    previous.displayOffsets,
    previousSourceEnd,
    'upstream',
  );
  const previousAccessibilityStart = projectSourceOffset(
    previous.accessibilityOffsets,
    previousSourceStart,
    'upstream',
  );
  const previousAccessibilityEnd = projectSourceOffset(
    previous.accessibilityOffsets,
    previousSourceEnd,
    'upstream',
  );
  const displayDocument = (yield* textDocumentEditExactWork(
    previous.displayDocument,
    previousDisplayStart,
    previousDisplayEnd,
    local.text,
  )).document;
  const accessibilityDocument = (yield* textDocumentEditExactWork(
    previous.accessibilityDocument,
    previousAccessibilityStart,
    previousAccessibilityEnd,
    local.accessibilityText,
  )).document;
  const displayOffsets = yield* replaceOffsetRangeWork({
    previous: previous.displayOffsets,
    local: local.displayOffsets,
    previousSourceStart,
    previousSourceEnd,
    nextSourceEnd,
    previousTargetStart: previousDisplayStart,
    previousTargetEnd: previousDisplayEnd,
  });
  const accessibilityOffsets = yield* replaceOffsetRangeWork({
    previous: previous.accessibilityOffsets,
    local: local.accessibilityOffsets,
    previousSourceStart,
    previousSourceEnd,
    nextSourceEnd,
    previousTargetStart: previousAccessibilityStart,
    previousTargetEnd: previousAccessibilityEnd,
  });
  const styleRanges = yield* directStyleRangesWork(
    yield* styleDecorationsWork(decorations),
    textDocumentLength(document),
    (offset, affinity = 'downstream') => projectSourceOffset(displayOffsets, offset, affinity),
  );
  const result: TextAreaProjection = Object.freeze({
    widthProfileKey: profileKey,
    document: displayDocument,
    styleRanges,
    accessibilityWindow: (centerOffset: number, maximumCodeUnits: number) => (
      accessibilityWindow(accessibilityDocument, centerOffset, maximumCodeUnits)
    ),
    accessibilityLineCount: () => textDocumentLength(accessibilityDocument) === 0
      ? 0
      : textDocumentLineCount(accessibilityDocument),
    displayOffsetAtSourceOffset: (
      offset: number,
      affinity: 'upstream' | 'downstream' = 'downstream',
    ) => (
      projectSourceOffset(displayOffsets, offset, affinity)
    ),
    sourceOffsetAtDisplayOffset: (
      offset: number,
      affinity: 'upstream' | 'downstream' = 'downstream',
    ) => (
      projectTargetOffset(displayOffsets, offset, affinity)
    ),
    accessibilityOffsetAtSourceOffset: (
      offset: number,
      affinity: 'upstream' | 'downstream' = 'downstream',
    ) => (
      projectSourceOffset(accessibilityOffsets, offset, affinity)
    ),
  });
  retainedProjectionData.set(result, Object.freeze({
    sourceDocument: document,
    decorations,
    displayDocument,
    accessibilityDocument,
    displayOffsets,
    accessibilityOffsets,
  }));
  return result;
}

function* completeMaterializedSourceRangeWork(
  document: TextDocument,
  changedStart: number,
  changedEnd: number,
  decorations: readonly TextAreaDecorationModel[],
): Generator<void, { readonly startOffset: number; readonly endOffsetExclusive: number }> {
  let operations = 0;
  let startOffset = changedStart;
  let endOffsetExclusive = changedEnd;
  let expanded = true;
  while (expanded) {
    const startLine = textDocumentLineIndexAtOffset(document, startOffset);
    const endAnchor = endOffsetExclusive > startOffset
      ? endOffsetExclusive - 1
      : endOffsetExclusive;
    const endLine = textDocumentLineIndexAtOffset(document, endAnchor) + 1;
    const lineStart = textDocumentLineAt(document, startLine)?.startOffset ?? 0;
    const lineEnd = textDocumentLineAt(document, endLine)?.startOffset
      ?? textDocumentLength(document);
    expanded = lineStart !== startOffset || lineEnd !== endOffsetExclusive;
    startOffset = lineStart;
    endOffsetExclusive = lineEnd;
    for (const decoration of decorations) {
      if (++operations % 256 === 0) yield;
      if (decoration.kind === 'style') continue;
      const point = decoration.startOffset === decoration.endOffsetExclusive;
      const overlaps = point
        ? decoration.startOffset >= startOffset
          && decoration.startOffset < endOffsetExclusive
        : decoration.startOffset < endOffsetExclusive
          && decoration.endOffsetExclusive > startOffset;
      if (!overlaps) continue;
      const nextStart = Math.min(startOffset, decoration.startOffset);
      const nextEnd = Math.max(endOffsetExclusive, decoration.endOffsetExclusive);
      expanded ||= nextStart !== startOffset || nextEnd !== endOffsetExclusive;
      startOffset = nextStart;
      endOffsetExclusive = nextEnd;
    }
  }
  return Object.freeze({ startOffset, endOffsetExclusive });
}

function* decorationsWithinRangeWork(
  decorations: readonly TextAreaDecorationModel[],
  startOffset: number,
  endOffsetExclusive: number,
  documentLength: number,
): Generator<void, readonly TextAreaDecorationModel[]> {
  const result: TextAreaDecorationModel[] = [];
  let operations = 0;
  for (const decoration of decorations) {
    if (++operations % 256 === 0) yield;
    const point = decoration.startOffset === decoration.endOffsetExclusive;
    const inside = point
      ? decoration.startOffset >= startOffset
        && (decoration.startOffset < endOffsetExclusive
          || endOffsetExclusive === documentLength && decoration.startOffset === endOffsetExclusive)
      : decoration.startOffset >= startOffset
        && decoration.endOffsetExclusive <= endOffsetExclusive;
    if (inside) result.push(Object.freeze({
      ...decoration,
      startOffset: decoration.startOffset - startOffset,
      endOffsetExclusive: decoration.endOffsetExclusive - startOffset,
    }));
  }
  return Object.freeze(result);
}

interface ReplaceOffsetRangeInput {
  readonly previous: OffsetProjection;
  readonly local: OffsetProjection;
  readonly previousSourceStart: number;
  readonly previousSourceEnd: number;
  readonly nextSourceEnd: number;
  readonly previousTargetStart: number;
  readonly previousTargetEnd: number;
}

function* replaceOffsetRangeWork(input: ReplaceOffsetRangeInput): Generator<void, OffsetProjection> {
  let operations = 0;
  const sourceDelta = input.nextSourceEnd - input.previousSourceEnd;
  const targetDelta = input.local.targetLength
    - (input.previousTargetEnd - input.previousTargetStart);
  const mappings: MappingSegment[] = [];
  for (const segment of input.previous.segments) {
    if (++operations % 256 === 0) yield;
    if (segment.sourceStart < input.previousSourceStart) {
      const sourceEnd = Math.min(segment.sourceEnd, input.previousSourceStart);
      const targetEnd = segment.linear
        ? segment.targetStart + sourceEnd - segment.sourceStart
        : segment.targetEnd;
      appendMapping(mappings, { ...segment, sourceEnd, targetEnd });
    }
  }
  for (const segment of input.local.segments) {
    if (++operations % 256 === 0) yield;
    appendMapping(mappings, {
      ...segment,
      sourceStart: segment.sourceStart + input.previousSourceStart,
      sourceEnd: segment.sourceEnd + input.previousSourceStart,
      targetStart: segment.targetStart + input.previousTargetStart,
      targetEnd: segment.targetEnd + input.previousTargetStart,
    });
  }
  for (const segment of input.previous.segments) {
    if (++operations % 256 === 0) yield;
    if (
      segment.sourceEnd < input.previousSourceEnd
      || segment.sourceEnd === input.previousSourceEnd
        && segment.sourceStart < input.previousSourceEnd
    ) continue;
    const sourceStart = Math.max(segment.sourceStart, input.previousSourceEnd);
    const targetStart = segment.linear
      ? segment.targetEnd - (segment.sourceEnd - sourceStart)
      : segment.targetStart;
    appendMapping(mappings, {
      ...segment,
      sourceStart: sourceStart + sourceDelta,
      sourceEnd: segment.sourceEnd + sourceDelta,
      targetStart: targetStart + targetDelta,
      targetEnd: segment.targetEnd + targetDelta,
    });
  }
  return yield* createOffsetProjectionWork(
    input.previous.sourceLength + sourceDelta,
    input.previous.targetLength + targetDelta,
    mappings,
  );
}

function retainProjection(
  document: TextDocument,
  decorations: readonly TextAreaDecorationModel[],
  profileKey: string,
  projection: TextAreaProjection,
): TextAreaProjection {
  const documentCache = projectionCache.get(document)
    ?? new WeakMap<readonly TextAreaDecorationModel[], Map<string, TextAreaProjection>>();
  const cache = documentCache.get(decorations) ?? new Map<string, TextAreaProjection>();
  cache.set(profileKey, projection);
  while (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
  documentCache.set(decorations, cache);
  projectionCache.set(document, documentCache);
  const recentDisplay = recentDisplayProjections.get(document)
    ?? new Map<string, WeakRef<TextAreaProjection>>();
  recentDisplay.delete(profileKey);
  recentDisplay.set(profileKey, new WeakRef(projection));
  while (recentDisplay.size > CACHE_LIMIT) {
    const oldest = recentDisplay.keys().next().value;
    if (oldest === undefined) break;
    recentDisplay.delete(oldest);
  }
  recentDisplayProjections.set(document, recentDisplay);
  return projection;
}

/** Completed line maps follow the same immutable source revisions as boundaries. */
class RetainedLineOffsets implements SourceRevisionData {
  readonly reservedBytes: number;
  projection: OffsetProjection | undefined;

  constructor(length: number, projection?: OffsetProjection) {
    this.reservedBytes = length * 80 + 128;
    this.projection = projection;
  }

  forRevision(source: SourceBoundaryIndex): RetainedLineOffsets {
    return new RetainedLineOffsets(source.source.length,
      source.unchangedFromPrevious ? this.projection : undefined);
  }
}

function* lineProjectionWork(
  sourceDocument: TextDocument,
  decorations: readonly TextAreaDecorationModel[],
  widthProfile: TextWidthProfile,
  profileKey: string,
): Generator<void, TextAreaProjection> {
  const preparedLineMaps = new Map<number, OffsetProjection>();
  const displayDocument = yield* lineProjectedDocumentWork(sourceDocument, widthProfile, profileKey, preparedLineMaps);
  const lineMaps = new Map<number, OffsetProjection>();
  const mapForLine = (lineIndex: number): OffsetProjection => {
    const existing = preparedLineMaps.get(lineIndex) ?? lineMaps.get(lineIndex);
    if (existing !== undefined) return existing;
    const sourceLine = textDocumentLineAt(sourceDocument, lineIndex);
    const displayLine = textDocumentLineAt(displayDocument, lineIndex);
    const created = finishWork(lineOffsetProjectionWork(sourceLine?.text ?? '', displayLine?.text ?? '', widthProfile));
    lineMaps.set(lineIndex, created);
    return created;
  };
  const displayOffsetAtSourceOffset = (
    offset: number,
    affinity: 'upstream' | 'downstream' = 'downstream',
  ): number => {
    const sourceLength = textDocumentLength(sourceDocument);
    const bounded = boundedOffset(offset, sourceLength);
    if (bounded === sourceLength) return textDocumentLength(displayDocument);
    const lineIndex = textDocumentLineIndexAtOffset(sourceDocument, bounded);
    const sourceLine = textDocumentLineAt(sourceDocument, lineIndex);
    const displayLine = textDocumentLineAt(displayDocument, lineIndex);
    if (sourceLine === undefined || displayLine === undefined) return 0;
    if (bounded > sourceLine.endOffsetExclusive) {
      return affinity === 'upstream'
        ? displayLine.endOffsetExclusive
        : textDocumentLineAt(displayDocument, lineIndex + 1)?.startOffset
          ?? displayLine.endOffsetExclusive;
    }
    return displayLine.startOffset + projectSourceOffset(
      mapForLine(lineIndex),
      bounded - sourceLine.startOffset,
      affinity,
    );
  };
  const sourceOffsetAtDisplayOffset = (
    offset: number,
    affinity: 'upstream' | 'downstream' = 'downstream',
  ): number => {
    const displayLength = textDocumentLength(displayDocument);
    const bounded = boundedOffset(offset, displayLength);
    if (bounded === displayLength) return textDocumentLength(sourceDocument);
    const lineIndex = textDocumentLineIndexAtOffset(displayDocument, bounded);
    const sourceLine = textDocumentLineAt(sourceDocument, lineIndex);
    const displayLine = textDocumentLineAt(displayDocument, lineIndex);
    if (sourceLine === undefined || displayLine === undefined) return 0;
    if (bounded > displayLine.endOffsetExclusive) {
      return affinity === 'upstream'
        ? sourceLine.endOffsetExclusive
        : textDocumentLineAt(sourceDocument, lineIndex + 1)?.startOffset
          ?? sourceLine.endOffsetExclusive;
    }
    return sourceLine.startOffset + projectTargetOffset(
      mapForLine(lineIndex),
      bounded - displayLine.startOffset,
      affinity,
    );
  };
  const result = Object.freeze({
    widthProfileKey: profileKey,
    document: displayDocument,
    styleRanges: yield* directStyleRangesWork(
      decorations,
      textDocumentLength(sourceDocument),
      displayOffsetAtSourceOffset,
    ),
    accessibilityWindow: (centerOffset: number, maximumCodeUnits: number) => (
      accessibilityWindow(displayDocument, centerOffset, maximumCodeUnits)
    ),
    accessibilityLineCount: () => textDocumentLength(displayDocument) === 0
      ? 0
      : textDocumentLineCount(displayDocument),
    displayOffsetAtSourceOffset,
    sourceOffsetAtDisplayOffset,
    accessibilityOffsetAtSourceOffset: displayOffsetAtSourceOffset,
  });
  preparedLineProjectionMaps.set(result, preparedLineMaps);
  lineProjectableProjections.add(result);
  return result;
}

function* lineProjectedDocumentWork(
  sourceDocument: TextDocument,
  widthProfile: TextWidthProfile,
  profileKey: string,
  lineMaps: Map<number, OffsetProjection>,
): Generator<void, TextDocument> {
  const mutation = textDocumentPreviousMutation(sourceDocument);
  const previousProjection = mutation === undefined
    ? undefined
    : recentDisplayProjections.get(mutation.document)?.get(profileKey)?.deref();
  if (
    mutation === undefined
    || previousProjection === undefined
    || !lineProjectableProjections.has(previousProjection)
  ) {
    return yield* createTextDocumentWork(yield* projectLineRangeWork(
      sourceDocument,
      0,
      textDocumentLineCount(sourceDocument),
      widthProfile,
      profileKey,
      lineMaps,
    ));
  }
  const ranges = textDocumentChangedLineRanges(
    mutation.document,
    sourceDocument,
    mutation.changes,
  );
  let operations = 0;
  // Retain completed expensive maps by logical-line identity. No old line text
  // is read here, and tiny lines remain bounded lazy queries.
  for (const [lineIndex, projection] of preparedLineProjectionMaps.get(previousProjection) ?? []) {
    const nextIndex = unchangedLineIndex(lineIndex, ranges);
    if (nextIndex !== undefined) lineMaps.set(nextIndex, projection);
    if (++operations % 256 === 0) yield;
  }
  const changes = [];
  for (const range of ranges) {
    changes.push(Object.freeze({
      startOffset: textDocumentLineAt(
        previousProjection.document,
        range.previousStart,
      )?.startOffset ?? textDocumentLength(previousProjection.document),
      endOffsetExclusive: textDocumentLineAt(
        previousProjection.document,
        range.previousEndExclusive,
      )?.startOffset ?? textDocumentLength(previousProjection.document),
      insertedText: yield* projectLineRangeWork(
        sourceDocument,
        range.nextStart,
        range.nextEndExclusive,
        widthProfile,
        profileKey,
        lineMaps,
      ),
    }));
    if (changes.length % 256 === 0) yield;
  }
  return yield* textDocumentApplyChangesExactWork(previousProjection.document, changes);
}

function* projectLineRangeWork(
  document: TextDocument,
  startLine: number,
  endLineExclusive: number,
  widthProfile: TextWidthProfile,
  profileKey: string,
  lineMaps: Map<number, OffsetProjection>,
): Generator<void, string> {
  let operations = 0;
  const lineCount = textDocumentLineCount(document);
  const parts: string[] = [];
  if (startLine === 0 && endLineExclusive >= lineCount) {
    for (const line of textDocumentLines(document)) {
      if (++operations % 256 === 0) yield;
      parts.push(yield* projectEditableLineWork(document, line, widthProfile, profileKey, lineMaps));
      if (line.lineIndex + 1 < lineCount) parts.push('\n');
    }
    return parts.join('');
  }
  for (let lineIndex = startLine; lineIndex < Math.min(lineCount, endLineExclusive); lineIndex += 1) {
    if (++operations % 256 === 0) yield;
    const line = textDocumentLineAt(document, lineIndex);
    if (line === undefined) continue;
    parts.push(yield* projectEditableLineWork(document, line, widthProfile, profileKey, lineMaps));
    if (lineIndex + 1 < lineCount) parts.push('\n');
  }
  return parts.join('');
}

function unchangedLineIndex(index: number, ranges: readonly TextDocumentChangedLineRange[]): number | undefined {
  let low = 0;
  let high = ranges.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if ((ranges[middle]?.previousStart ?? Number.POSITIVE_INFINITY) <= index) low = middle + 1;
    else high = middle;
  }
  const previous = ranges[low - 1];
  if (previous === undefined) return index;
  if (index < previous.previousEndExclusive) return undefined;
  return index + previous.nextEndExclusive - previous.previousEndExclusive;
}

function* projectEditableLineWork(
  document: TextDocument,
  line: TextDocumentLine,
  widthProfile: TextWidthProfile,
  profileKey: string,
  lineMaps: Map<number, OffsetProjection>,
): Generator<void, string> {
  const text = line.text;
  const display = yield* expandTerminalTabsWork(text, { widthProfile });
  if (text.length <= maximumLazyLineLength || !text.includes('\t')) return display;
  const source = textDocumentLineBoundaries(document, line);
  const key = `text-area-projection:${profileKey}`;
  let retained = source.derivedData(key) as RetainedLineOffsets | undefined;
  if (retained === undefined) {
    retained = new RetainedLineOffsets(source.source.length);
    source.retainDerivedData(key, retained);
  }
  if (retained.projection === undefined) {
    const projection = yield* lineOffsetProjectionWork(text, display, widthProfile, source);
    // Publish only complete mappings. An overlapping preparer can safely win.
    retained.projection ??= projection;
  }
  lineMaps.set(line.lineIndex, retained.projection);
  return display;
}

function* lineOffsetProjectionWork(
  source: string,
  display: string,
  widthProfile: TextWidthProfile,
  ownedSource?: SourceBoundaryIndex,
): Generator<void, OffsetProjection> {
  if (!source.includes('\t')) {
    return yield* createOffsetProjectionWork(source.length, display.length, [{
      sourceStart: 0,
      sourceEnd: source.length,
      targetStart: 0,
      targetEnd: display.length,
      linear: true,
    }]);
  }
  const mappings: MappingSegment[] = [];
  let targetOffset = 0;
  let column = 0;
  const boundaries = ownedSource ?? sourceBoundaries(source);
  let offset = 0;
  let measured = 0;
  while (offset < source.length) {
    yield* boundaries.prepareThroughWork(offset);
    const endOffsetExclusive = boundaries.at(offset)?.endOffsetExclusive ?? source.length;
    const text = source.slice(offset, endOffsetExclusive);
    const startOffset = offset;
    const cells = measureGraphemeCells(text, { widthProfile });
    offset = endOffsetExclusive;
    if (++measured % 256 === 0) yield;
    const targetLength = text === '\t'
      ? terminalTabCells(column)
      : text.length;
    appendMapping(mappings, {
      sourceStart: startOffset,
      sourceEnd: endOffsetExclusive,
      targetStart: targetOffset,
      targetEnd: targetOffset + targetLength,
      linear: text !== '\t',
    });
    targetOffset += targetLength;
    column += text === '\t' ? targetLength : cells;
  }
  return yield* createOffsetProjectionWork(source.length, display.length, mappings);
}

function* directProjectionWork(
  document: TextDocument,
  decorations: readonly TextAreaDecorationModel[],
  profileKey: string,
): Generator<void, TextAreaProjection> {
  const sourceLength = textDocumentLength(document);
  const segment: MappingSegment = Object.freeze({
    sourceStart: 0,
    sourceEnd: sourceLength,
    targetStart: 0,
    targetEnd: sourceLength,
    linear: true,
  });
  const projection = yield* createOffsetProjectionWork(sourceLength, sourceLength, [segment]);
  const result = Object.freeze({
    widthProfileKey: profileKey,
    document,
    styleRanges: yield* directStyleRangesWork(decorations, sourceLength),
    accessibilityWindow: (centerOffset: number, maximumCodeUnits: number) => (
      accessibilityWindow(document, centerOffset, maximumCodeUnits)
    ),
    accessibilityLineCount: () => sourceLength === 0 ? 0 : textDocumentLineCount(document),
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
  lineProjectableProjections.add(result);
  return result;
}

function accessibilityWindow(
  document: TextDocument,
  centerOffset: number,
  maximumCodeUnits: number,
): TextAreaAccessibilityWindow {
  const totalLength = textDocumentLength(document);
  const limit = Number.isSafeInteger(maximumCodeUnits) && maximumCodeUnits > 0
    ? maximumCodeUnits
    : 1;
  const center = normalizeTextDocumentOffset(document, centerOffset);
  let startOffset = normalizeTextDocumentOffset(
    document,
    Math.max(0, center - Math.floor(limit / 2)),
  );
  let endOffsetExclusive = normalizeTextDocumentOffset(
    document,
    Math.min(totalLength, startOffset + limit),
  );
  if (endOffsetExclusive < center) endOffsetExclusive = center;
  if (endOffsetExclusive - startOffset < limit && endOffsetExclusive === totalLength) {
    startOffset = normalizeTextDocumentOffset(
      document,
      Math.max(0, endOffsetExclusive - limit),
    );
  }
  return Object.freeze({
    startOffset,
    endOffsetExclusive,
    totalLength,
    text: textDocumentSlice(document, startOffset, endOffsetExclusive),
  });
}

function* directStyleRangesWork(
  decorations: readonly TextAreaDecorationModel[],
  sourceLength: number,
  displayOffsetAtSourceOffset: (
    offset: number,
    affinity?: 'upstream' | 'downstream',
  ) => number = (offset) => offset,
): Generator<void, readonly ProjectedTextStyleRange[]> {
  let operations = 0;
  if (decorations.length === 0) return Object.freeze([]);
  const starts = new Map<number, TextAreaDecorationModel[]>();
  const ends = new Map<number, TextAreaDecorationModel[]>();
  const boundaries = new Set<number>([0, sourceLength]);
  for (const decoration of decorations) {
    if (++operations % 256 === 0) yield;
    boundaries.add(decoration.startOffset);
    boundaries.add(decoration.endOffsetExclusive);
    appendEvent(starts, decoration.startOffset, decoration);
    appendEvent(ends, decoration.endOffsetExclusive, decoration);
  }
  const ordered = yield* stableSortWork(boundaries, (left, right) => left - right);
  const active = new ActiveDecorationStyles();
  const ranges: ProjectedTextStyleRange[] = [];
  for (let index = 0; index < ordered.length - 1; index += 1) {
    if (++operations % 256 === 0) yield;
    const start = ordered[index];
    const end = ordered[index + 1];
    if (start === undefined || end === undefined || end <= start) continue;
    for (const decoration of ends.get(start) ?? []) {
      active.remove(decoration);
      if (++operations % 256 === 0) yield;
    }
    for (const decoration of starts.get(start) ?? []) {
      active.add(decoration);
      if (++operations % 256 === 0) yield;
    }
    const resolved = yield* active.resolveWork();
    if (!resolved.decorated) continue;
    const range: ProjectedTextStyleRange = Object.freeze({
      startOffset: displayOffsetAtSourceOffset(start, 'downstream'),
      endOffsetExclusive: displayOffsetAtSourceOffset(end, 'upstream'),
      label: resolved.label,
      ...(resolved.style === undefined ? {} : { style: resolved.style }),
    });
    const previous = ranges.at(-1);
    if (
      range.endOffsetExclusive > range.startOffset
      && previous?.endOffsetExclusive === range.startOffset
      && previous.label === range.label
      && sameTerminalStyle(previous.style, range.style)
    ) {
      ranges[ranges.length - 1] = Object.freeze({ ...range, startOffset: previous.startOffset });
    } else if (range.endOffsetExclusive > range.startOffset) {
      ranges.push(range);
    }
  }
  return Object.freeze(ranges);
}

function* projectSourceWork(
  builder: ProjectionBuilder,
  source: string,
  decorations: readonly TextAreaDecorationModel[]
): Generator<void, void> {
  let operations = 0;
  const boundaries = new Set<number>([0, source.length]);
  const starts = new Map<number, TextAreaDecorationModel[]>();
  const ends = new Map<number, TextAreaDecorationModel[]>();
  const replacements = new Map<number, TextAreaContentDecorationModel>();
  const virtual = new Map<number, TextAreaReplacementDecorationModel[]>();
  for (const decoration of decorations) {
    if (++operations % 256 === 0) yield;
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

  const ordered = yield* stableSortWork(boundaries, (left, right) => left - right);
  const active = new ActiveDecorationStyles();
  let consumedSource = 0;
  for (let index = 0; index < ordered.length; index += 1) {
    if (++operations % 256 === 0) yield;
    const boundary = ordered[index];
    if (boundary === undefined) continue;
    for (const decoration of ends.get(boundary) ?? []) {
      active.remove(decoration);
      if (++operations % 256 === 0) yield;
    }
    for (const decoration of starts.get(boundary) ?? []) {
      active.add(decoration);
      if (++operations % 256 === 0) yield;
    }
    if (boundary < consumedSource) continue;

    for (const decoration of virtual.get(boundary) ?? []) {
    if (++operations % 256 === 0) yield;
      yield* appendResolvedReplacementWork(builder, decoration, active);
    }
    const replacement = replacements.get(boundary);
    if (replacement !== undefined) {
      yield* appendResolvedReplacementWork(builder, replacement, active);
      consumedSource = replacement.endOffsetExclusive;
      continue;
    }
    if (boundary !== consumedSource) continue;
    const next = ordered[index + 1] ?? source.length;
    if (next <= boundary) continue;
    yield* appendSourcePieceWork(builder, source, boundary, next, yield* active.resolveWork());
    consumedSource = next;
  }
}

function* appendResolvedReplacementWork(
  builder: ProjectionBuilder,
  decoration: TextAreaContentDecorationModel,
  active: ActiveDecorationStyles,
): Generator<void, void> {
  active.add(decoration);
  const resolved = yield* active.resolveWork();
  active.remove(decoration);
  yield* appendReplacementWork(builder, decoration, resolved);
}

function appendEvent(
  events: Map<number, TextAreaDecorationModel[]>,
  offset: number,
  decoration: TextAreaDecorationModel
): void {
  const entries = events.get(offset);
  if (entries === undefined) events.set(offset, [decoration]);
  else entries.push(decoration);
}

class ActiveDecorationStyles {
  readonly #active = new Set<number>();
  readonly #labels: HeapEntry<string>[] = [];
  readonly #fields = new Map<TerminalStyleField, HeapEntry<TerminalStyle[TerminalStyleField]>[]>();

  add(decoration: TextAreaDecorationModel): void {
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

  remove(decoration: TextAreaDecorationModel): void {
    this.#active.delete(decoration.order);
  }

  *resolveWork(): Generator<void, ResolvedDecoration> {
    const label = yield* heapValueWork(this.#labels, this.#active);
    if (label === undefined) return { decorated: false, label: 'decoration' };
    const style: Partial<Record<TerminalStyleField, TerminalStyle[TerminalStyleField]>> = {};
    for (const field of terminalStyleFields) {
      const value = yield* heapValueWork(this.#fields.get(field), this.#active);
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

function* heapValueWork<TValue>(
  heap: HeapEntry<TValue>[] | undefined,
  active: ReadonlySet<number>
): Generator<void, TValue | undefined> {
  if (heap === undefined) return undefined;
  let operations = 0;
  while (heap.length > 0 && !active.has(heap[0]?.order ?? -1)) {
    heapPop(heap);
    if (++operations % 256 === 0) yield;
  }
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

function* appendSourcePieceWork(
  builder: ProjectionBuilder,
  source: string,
  start: number,
  end: number,
  decoration: ResolvedDecoration
): Generator<void, void> {
  let operations = 0;
  const rawText = source.slice(start, end);
  while ((builder.removedSourceRanges[builder.removedSourceIndex]?.end
    ?? Number.POSITIVE_INFINITY) <= start) {
    builder.removedSourceIndex += 1;
    if (++operations % 256 === 0) yield;
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
  const boundaries = sourceBoundaries(rawText);
  let offset = 0;
  let measured = 0;
  while (offset < rawText.length) {
    yield* boundaries.prepareThroughWork(offset);
    const endOffsetExclusive = boundaries.at(offset)?.endOffsetExclusive ?? rawText.length;
    const text = rawText.slice(offset, endOffsetExclusive);
    const startOffset = offset;
    const cells = measureGraphemeCells(text, { widthProfile: builder.widthProfile });
    offset = endOffsetExclusive;
    if (++measured % 256 === 0) yield;
    const sourceStart = start + startOffset;
    const sourceEnd = start + endOffsetExclusive;
    while ((builder.removedSourceRanges[builder.removedSourceIndex]?.end
      ?? Number.POSITIVE_INFINITY) <= sourceStart) {
      builder.removedSourceIndex += 1;
      if (++operations % 256 === 0) yield;
    }
    const removed = builder.removedSourceRanges[builder.removedSourceIndex];
    if (removed !== undefined && sourceStart >= removed.start && sourceStart < removed.end) {
      appendProjection(builder, '', '', sourceStart, sourceEnd, false, false, decoration);
      continue;
    }
    const projected = projectedGrapheme(builder, text, cells);
    const linear = projected === text;
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

function* appendReplacementWork(
  builder: ProjectionBuilder,
  decoration: TextAreaContentDecorationModel,
  resolved: ResolvedDecoration,
): Generator<void, void> {
  const displayText = decoration.kind === 'conceal'
    ? ''
    : yield* projectReplacementTextWork(decoration.replacementText, builder);
  const accessibilityText = decoration.kind === 'conceal'
    ? ''
    : decoration.accessibilityText === undefined
      ? displayText
      : (yield* sanitizeTerminalTextWork(decoration.accessibilityText, { widthProfile: builder.widthProfile })).text;
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

function* projectReplacementTextWork(rawText: string, builder: ProjectionBuilder): Generator<void, string> {
  const sanitized = (yield* sanitizeTerminalControlTextWork(rawText)).text;
  const parts: string[] = [];
  const boundaries = sourceBoundaries(sanitized);
  let offset = 0;
  let measured = 0;
  while (offset < sanitized.length) {
    yield* boundaries.prepareThroughWork(offset);
    const endOffsetExclusive = boundaries.at(offset)?.endOffsetExclusive ?? sanitized.length;
    const text = sanitized.slice(offset, endOffsetExclusive);
    const cells = measureGraphemeCells(text, { widthProfile: builder.widthProfile });
    offset = endOffsetExclusive;
    if (++measured % 256 === 0) yield;
    parts.push(projectedGrapheme(builder, text, cells));
  }
  return parts.join('');
}

function projectedGrapheme(builder: ProjectionBuilder, text: string, cells: number): string {
  if (text === '\r' || text === '\r\n' || text === '\n') {
    builder.column = 0;
    return '\n';
  }
  if (text === '\t') {
    const spaces = terminalTabCells(builder.column);
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

function* createOffsetProjectionWork(
  sourceLength: number,
  targetLength: number,
  mappings: readonly MappingSegment[]
): Generator<void, OffsetProjection> {
  const segments: MappingSegment[] = [];
  const sourceSegments: MappingSegment[] = [];
  const targetSegments: MappingSegment[] = [];
  const virtualSegments: MappingSegment[] = [];
  for (const segment of mappings) {
    segments.push(segment);
    if (segment.sourceEnd > segment.sourceStart) sourceSegments.push(segment);
    if (segment.targetEnd > segment.targetStart) targetSegments.push(segment);
    if (segment.sourceStart === segment.sourceEnd && segment.targetEnd > segment.targetStart) {
      virtualSegments.push(segment);
    }
    if (segments.length % 256 === 0) yield;
  }
  return Object.freeze({
    sourceLength,
    targetLength,
    segments: Object.freeze(segments),
    sourceSegments: Object.freeze(sourceSegments),
    targetSegments: Object.freeze(targetSegments),
    virtualSegments: Object.freeze(virtualSegments),
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
  high = segments.length;
  while (end < high) {
    const middle = Math.floor((end + high) / 2);
    if (segments[middle]?.sourceStart === sourceOffset) end = middle + 1;
    else high = middle;
  }
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

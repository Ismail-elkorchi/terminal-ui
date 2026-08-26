import { isNonArrayObject, isStringMember } from '../foundation/validation.ts';
import {
  assertTextDocument,
  createTerminalTextIndex,
  sanitizeTerminalText,
  textDocumentLength,
  textDocumentLineAt,
  textDocumentLineIndexAtOffset,
  textDocumentSlice,
} from '../text/index.ts';
import { textDocumentPreviousMutation } from '../text/document.ts';
import type { TerminalTextIndex, TextDocument, TextDocumentChange } from '../text/index.ts';
import { decodeTerminalStyle } from '../visual/terminal-style.ts';
import type { TerminalStyle } from '../visual/render-content.ts';
import type { TextAreaDecoration } from './text-area.ts';

declare const textAreaDecorationsBrand: unique symbol;

/** An immutable, document-scoped set of text-area decorations. @beta */
export interface TextAreaDecorations {
  readonly [textAreaDecorationsBrand]: true;
  readonly kind: 'text-area-decorations';
  readonly count: number;
}

export interface CreateTextAreaDecorationsInput {
  readonly document: TextDocument;
  readonly decorations: readonly TextAreaDecoration[];
}

export interface UpdateTextAreaDecorationsInput {
  readonly previousDecorations: TextAreaDecorations;
  readonly document: TextDocument;
  readonly decorations: readonly TextAreaDecoration[];
}

interface TextAreaDecorationModelBase {
  readonly startOffset: number;
  readonly endOffsetExclusive: number;
  readonly order: number;
  readonly label: string;
}

interface TextAreaStyleDecorationModel extends TextAreaDecorationModelBase {
  readonly kind: 'style';
  readonly style?: TerminalStyle;
  readonly replacementText?: never;
  readonly accessibilityText?: never;
}

export interface TextAreaReplacementDecorationModel extends TextAreaDecorationModelBase {
  readonly kind: 'replace';
  readonly style?: TerminalStyle;
  readonly replacementText: string;
  readonly accessibilityText?: string;
}

interface TextAreaConcealDecorationModel extends TextAreaDecorationModelBase {
  readonly kind: 'conceal';
  readonly style?: never;
  readonly replacementText?: never;
  readonly accessibilityText?: never;
}

export type TextAreaDecorationModel =
  | TextAreaStyleDecorationModel
  | TextAreaReplacementDecorationModel
  | TextAreaConcealDecorationModel;

export interface TextAreaDecorationsData {
  readonly document: TextDocument;
  readonly decorations: readonly TextAreaDecorationModel[];
}

export interface TextAreaDecorationMapping {
  readonly previous: readonly TextAreaDecorationModel[];
  readonly changes: readonly TextDocumentChange[];
  readonly previousAffectedRange: TextAreaDecorationAffectedRange;
  readonly nextAffectedRange: TextAreaDecorationAffectedRange;
}

export interface TextAreaDecorationAffectedRange {
  readonly startOffset: number;
  readonly endOffsetExclusive: number;
}

const decorationData = new WeakMap<object, TextAreaDecorationsData>();
const decorationMappings = new WeakMap<readonly TextAreaDecorationModel[], TextAreaDecorationMapping>();
const emptyDecorations = new WeakMap<TextDocument, TextAreaDecorations>();
const lineIndexes = new Map<string, TerminalTextIndex>();
const lineIndexWeightLimit = 1_048_576;
let lineIndexWeight = 0;

/** Creates immutable decoration data once for reuse across text-area elements. @beta */
export function createTextAreaDecorations(
  input: CreateTextAreaDecorationsInput,
): TextAreaDecorations {
  if (!isNonArrayObject(input)) {
    throw new TypeError('Text area decorations input must be an object.');
  }
  assertTextDocument(input.document);
  if (!Array.isArray(input.decorations)) {
    throw new TypeError('Text area decorations must be an array.');
  }
  return createDecorations(input.document, input.decorations);
}

function createDecorations(
  document: TextDocument,
  decorations: readonly TextAreaDecoration[],
): TextAreaDecorations {
  if (decorations.length === 0) return emptyTextAreaDecorations(document);
  const models = decorations.map((candidate, index) => (
    decodeTextAreaDecoration(candidate, index, document)
  ));
  const replacements = models
    .filter((decoration) => decoration.kind === 'replace')
    .toSorted((left, right) => (
      left.startOffset - right.startOffset
      || left.endOffsetExclusive - right.endOffsetExclusive
    ));
  assertReplacementRelationships(models, replacements);
  const conceals = mergeConcealments(models.filter((decoration) => decoration.kind === 'conceal'));
  for (const conceal of conceals) {
    if (replacements.some((replacement) => rangesOverlap(conceal, replacement))) {
      throw new RangeError('Text area conceal and replacement decorations must not overlap.');
    }
  }
  return registerDecorations(document, Object.freeze([
    ...models.filter((decoration) => decoration.kind !== 'conceal'),
    ...conceals,
  ]));
}

export function readTextAreaDecorations(value: unknown): TextAreaDecorationsData {
  const data = isNonArrayObject(value)
    ? decorationData.get(value)
    : undefined;
  if (data === undefined) {
    throw new TypeError('Text area decorations must be created with createTextAreaDecorations().');
  }
  return data;
}

export function emptyTextAreaDecorations(document: TextDocument): TextAreaDecorations {
  const existing = emptyDecorations.get(document);
  if (existing !== undefined) return existing;
  const created = registerDecorations(document, Object.freeze([]));
  emptyDecorations.set(document, created);
  return created;
}

/**
 * Creates current decorations for the next document revision and records the
 * exact source and decoration changes needed for incremental projection.
 * @beta
 */
export function updateTextAreaDecorations(
  input: UpdateTextAreaDecorationsInput,
): TextAreaDecorations {
  if (!isNonArrayObject(input)) {
    throw new TypeError('Text area decoration update input must be an object.');
  }
  assertTextDocument(input.document);
  if (!Array.isArray(input.decorations)) {
    throw new TypeError('Text area decorations must be an array.');
  }
  const source = readTextAreaDecorations(input.previousDecorations);
  const mutation = textDocumentPreviousMutation(input.document);
  if (mutation?.document !== source.document) {
    throw new TypeError(
      'Text area decorations can only be updated for the document revision created directly from their source.',
    );
  }
  const result = createDecorations(input.document, input.decorations);
  const next = readTextAreaDecorations(result).decorations;
  const affected = decorationAffectedRanges(source.decorations, next, mutation.changes);
  decorationMappings.set(next, Object.freeze({
    previous: source.decorations,
    changes: mutation.changes,
    previousAffectedRange: affected.previous,
    nextAffectedRange: affected.next,
  }));
  return result;
}

export function textAreaDecorationMapping(
  decorations: readonly TextAreaDecorationModel[],
): TextAreaDecorationMapping | undefined {
  return decorationMappings.get(decorations);
}

function registerDecorations(
  document: TextDocument,
  decorations: readonly TextAreaDecorationModel[],
): TextAreaDecorations {
  const value = Object.freeze({
    kind: 'text-area-decorations' as const,
    count: decorations.length,
  }) as TextAreaDecorations;
  decorationData.set(value, Object.freeze({ document, decorations }));
  return value;
}

function mapDecorationRange(
  decoration: TextAreaDecorationModel,
  changes: readonly TextDocumentChange[],
): Pick<TextAreaDecorationModel, 'startOffset' | 'endOffsetExclusive'> | undefined {
  let delta = 0;
  for (const change of changes) {
    if (textAreaDecorationIntersectsChange(decoration, change)) return undefined;
    if (change.endOffsetExclusive <= decoration.startOffset) {
      delta += change.insertedText.length
        - (change.endOffsetExclusive - change.startOffset);
    }
  }
  return {
    startOffset: decoration.startOffset + delta,
    endOffsetExclusive: decoration.endOffsetExclusive + delta,
  };
}

export function textAreaDecorationIntersectsChange(
  decoration: TextAreaDecorationModel,
  change: TextDocumentChange,
): boolean {
  const point = decoration.startOffset === decoration.endOffsetExclusive;
  if (change.startOffset === change.endOffsetExclusive) {
    return point
      ? decoration.startOffset === change.startOffset
      : decoration.startOffset < change.startOffset
        && change.startOffset < decoration.endOffsetExclusive;
  }
  return point
    ? change.startOffset <= decoration.startOffset
      && decoration.startOffset < change.endOffsetExclusive
    : decoration.startOffset < change.endOffsetExclusive
      && change.startOffset < decoration.endOffsetExclusive;
}

function decorationAffectedRanges(
  previous: readonly TextAreaDecorationModel[],
  next: readonly TextAreaDecorationModel[],
  changes: readonly TextDocumentChange[],
): {
  readonly previous: TextAreaDecorationAffectedRange;
  readonly next: TextAreaDecorationAffectedRange;
} {
  let previousRange: TextAreaDecorationAffectedRange | undefined;
  let nextRange: TextAreaDecorationAffectedRange | undefined;
  let delta = 0;
  for (const change of changes) {
    previousRange = includeAffectedRange(previousRange, change.startOffset, change.endOffsetExclusive);
    const nextStart = change.startOffset + delta;
    const nextEnd = nextStart + change.insertedText.length;
    nextRange = includeAffectedRange(nextRange, nextStart, nextEnd);
    delta += change.insertedText.length
      - (change.endOffsetExclusive - change.startOffset);
  }

  const remaining = new Map<string, number>();
  for (const decoration of next) {
    const key = decorationSemanticKey(decoration);
    remaining.set(key, (remaining.get(key) ?? 0) + 1);
  }
  for (const decoration of previous) {
    const mappedRange = mapDecorationRange(decoration, changes);
    if (mappedRange === undefined) {
      previousRange = includeDecorationRange(previousRange, decoration);
      continue;
    }
    const key = decorationSemanticKey({ ...decoration, ...mappedRange });
    const count = remaining.get(key) ?? 0;
    if (count > 0) {
      if (count === 1) remaining.delete(key);
      else remaining.set(key, count - 1);
      continue;
    }
    previousRange = includeDecorationRange(previousRange, decoration);
    nextRange = includeDecorationRange(nextRange, mappedRange);
  }
  for (const decoration of next) {
    const key = decorationSemanticKey(decoration);
    const count = remaining.get(key) ?? 0;
    if (count === 0) continue;
    remaining.set(key, count - 1);
    nextRange = includeDecorationRange(nextRange, decoration);
    previousRange = includeAffectedRange(
      previousRange,
      previousOffsetAtNextOffset(changes, decoration.startOffset, 'upstream'),
      previousOffsetAtNextOffset(changes, decoration.endOffsetExclusive, 'downstream'),
    );
  }
  const first = changes[0];
  if (first === undefined) {
    throw new TypeError('Text area decoration updates require a changed document revision.');
  }
  return Object.freeze({
    previous: Object.freeze(previousRange ?? {
      startOffset: first.startOffset,
      endOffsetExclusive: first.endOffsetExclusive,
    }),
    next: Object.freeze(nextRange ?? {
      startOffset: first.startOffset,
      endOffsetExclusive: first.startOffset + first.insertedText.length,
    }),
  });
}

function includeDecorationRange(
  range: TextAreaDecorationAffectedRange | undefined,
  decoration: Pick<TextAreaDecorationModel, 'startOffset' | 'endOffsetExclusive'>,
): TextAreaDecorationAffectedRange {
  return includeAffectedRange(range, decoration.startOffset, decoration.endOffsetExclusive);
}

function includeAffectedRange(
  range: TextAreaDecorationAffectedRange | undefined,
  startOffset: number,
  endOffsetExclusive: number,
): TextAreaDecorationAffectedRange {
  return range === undefined
    ? { startOffset, endOffsetExclusive }
    : {
        startOffset: Math.min(range.startOffset, startOffset),
        endOffsetExclusive: Math.max(range.endOffsetExclusive, endOffsetExclusive),
      };
}

function previousOffsetAtNextOffset(
  changes: readonly TextDocumentChange[],
  offset: number,
  affinity: 'upstream' | 'downstream',
): number {
  let delta = 0;
  for (const change of changes) {
    const nextStart = change.startOffset + delta;
    const nextEnd = nextStart + change.insertedText.length;
    if (offset < nextStart) return offset - delta;
    if (offset <= nextEnd) {
      return affinity === 'upstream' ? change.startOffset : change.endOffsetExclusive;
    }
    delta += change.insertedText.length
      - (change.endOffsetExclusive - change.startOffset);
  }
  return offset - delta;
}

function decorationSemanticKey(
  decoration: TextAreaDecorationModel,
): string {
  return JSON.stringify([
    decoration.kind,
    decoration.order,
    decoration.startOffset,
    decoration.endOffsetExclusive,
    decoration.label,
    decoration.kind === 'replace' ? decoration.replacementText : undefined,
    decoration.kind === 'replace' ? decoration.accessibilityText : undefined,
    decoration.kind === 'conceal' ? undefined : decoration.style,
  ]);
}

function assertReplacementRelationships(
  decorations: readonly TextAreaDecorationModel[],
  replacements: readonly TextAreaReplacementDecorationModel[],
): void {
  let previousEnd = 0;
  for (const [index, replacement] of replacements.entries()) {
    if (index > 0 && replacement.startOffset < previousEnd) {
      throw new RangeError('Text area replacement decorations must not overlap.');
    }
    previousEnd = Math.max(previousEnd, replacement.endOffsetExclusive);
  }
  for (const decoration of decorations) {
    if (decoration.kind !== 'style') continue;
    if (
      replacementContainingInteriorOffset(replacements, decoration.startOffset) !== undefined
      || replacementContainingInteriorOffset(replacements, decoration.endOffsetExclusive) !== undefined
    ) {
      throw new RangeError(
        'Text area style decorations must not partially overlap replacement decorations.',
      );
    }
  }
}

function decodeTextAreaDecoration(
  candidate: unknown,
  index: number,
  document: TextDocument,
): TextAreaDecorationModel {
  if (!isNonArrayObject(candidate)) {
    throw new TypeError(`Text area decorations[${String(index)}] is invalid.`);
  }
  const kind = candidate['kind'];
  if (!isStringMember(kind, ['style', 'replace', 'conceal'])) {
    throw new TypeError(`Text area decorations[${String(index)}].kind is invalid.`);
  }
  const range = decodeDecorationRange(candidate, index, kind, document);
  const label = optionalText(candidate['label'], `Text area decorations[${String(index)}].label`)
    ?? `decoration.${String(index)}`;
  const style = candidate['style'] === undefined
    ? undefined
    : decodeTerminalStyle(candidate['style'], `Text area decorations[${String(index)}].style`);
  const base = { ...range, order: index, label };
  return decodeDecorationKind(candidate, index, kind, base, style);
}

function decodeDecorationRange(
  candidate: Readonly<Record<string, unknown>>,
  index: number,
  kind: TextAreaDecoration['kind'],
  document: TextDocument,
): Pick<TextAreaDecorationModel, 'startOffset' | 'endOffsetExclusive'> {
  const startOffset = candidate['startOffset'];
  const endOffsetExclusive = candidate['endOffsetExclusive'];
  if (
    typeof startOffset !== 'number'
    || typeof endOffsetExclusive !== 'number'
    || !Number.isSafeInteger(startOffset)
    || !Number.isSafeInteger(endOffsetExclusive)
    || startOffset < 0
    || endOffsetExclusive < startOffset
    || (endOffsetExclusive === startOffset && kind !== 'replace')
    || endOffsetExclusive > textDocumentLength(document)
  ) {
    throw new RangeError(`Text area decorations[${String(index)}] range is invalid.`);
  }
  if (!offsetIsGraphemeBoundary(document, startOffset)
    || !offsetIsGraphemeBoundary(document, endOffsetExclusive)) {
    throw new RangeError(
      `Text area decorations[${String(index)}] must align with text grapheme boundaries.`,
    );
  }
  return { startOffset, endOffsetExclusive };
}

function decodeDecorationKind(
  candidate: Readonly<Record<string, unknown>>,
  index: number,
  kind: TextAreaDecoration['kind'],
  base: Pick<TextAreaDecorationModel, 'startOffset' | 'endOffsetExclusive' | 'order' | 'label'>,
  style: TerminalStyle | undefined,
): TextAreaDecorationModel {
  const replacementText = candidate['replacementText'];
  const accessibilityText = candidate['accessibilityText'];
  if (accessibilityText !== undefined && typeof accessibilityText !== 'string') {
    throw new TypeError(
      `Text area decorations[${String(index)}].accessibilityText must be a string.`,
    );
  }
  switch (kind) {
    case 'style':
      if (replacementText !== undefined || accessibilityText !== undefined) {
        throw new TypeError(
          `Text area style decoration ${String(index)} cannot replace or relabel content.`,
        );
      }
      return Object.freeze({ ...base, kind, ...(style === undefined ? {} : { style }) });
    case 'replace':
      if (typeof replacementText !== 'string' || replacementText.length === 0) {
        throw new TypeError(
          `Text area replacement decoration ${String(index)} requires non-empty replacementText.`,
        );
      }
      return Object.freeze({
        ...base,
        kind,
        replacementText,
        ...(style === undefined ? {} : { style }),
        ...(accessibilityText === undefined ? {} : { accessibilityText }),
      });
    case 'conceal':
      if (replacementText !== undefined || accessibilityText !== undefined || style !== undefined) {
        throw new TypeError(
          `Text area conceal decoration ${String(index)} cannot replace, style, or relabel content.`,
        );
      }
      return Object.freeze({ ...base, kind });
  }
}

function mergeConcealments(
  decorations: readonly TextAreaConcealDecorationModel[],
): readonly TextAreaConcealDecorationModel[] {
  const ordered = decorations.toSorted((left, right) => (
    left.startOffset - right.startOffset || left.endOffsetExclusive - right.endOffsetExclusive
  ));
  const merged: TextAreaConcealDecorationModel[] = [];
  for (const decoration of ordered) {
    const previous = merged.at(-1);
    if (previous === undefined || decoration.startOffset > previous.endOffsetExclusive) {
      merged.push(decoration);
      continue;
    }
    merged[merged.length - 1] = Object.freeze({
      kind: 'conceal',
      startOffset: previous.startOffset,
      endOffsetExclusive: Math.max(previous.endOffsetExclusive, decoration.endOffsetExclusive),
      order: Math.min(previous.order, decoration.order),
      label: previous.label,
    });
  }
  return Object.freeze(merged);
}

function rangesOverlap(
  left: Pick<TextAreaDecorationModel, 'startOffset' | 'endOffsetExclusive'>,
  right: Pick<TextAreaDecorationModel, 'startOffset' | 'endOffsetExclusive'>,
): boolean {
  return left.startOffset < right.endOffsetExclusive
    && right.startOffset < left.endOffsetExclusive;
}

function replacementContainingInteriorOffset(
  replacements: readonly TextAreaReplacementDecorationModel[],
  offset: number,
): TextAreaReplacementDecorationModel | undefined {
  let low = 0;
  let high = replacements.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if ((replacements[middle]?.startOffset ?? Number.POSITIVE_INFINITY) < offset) low = middle + 1;
    else high = middle;
  }
  const candidate = replacements[low - 1];
  return candidate !== undefined
    && candidate.startOffset < offset
    && offset < candidate.endOffsetExclusive
    ? candidate
    : undefined;
}

function offsetIsGraphemeBoundary(document: TextDocument, offset: number): boolean {
  if (offset === 0 || offset === textDocumentLength(document)) return true;
  if (textDocumentSlice(document, offset - 1, offset + 1) === '\r\n') return false;
  const line = textDocumentLineAt(document, textDocumentLineIndexAtOffset(document, offset));
  if (line === undefined) return false;
  if (offset < line.startOffset || offset > line.endOffsetExclusive) return true;
  const index = lineIndex(line.text);
  const localOffset = offset - line.startOffset;
  return index.graphemeIndexToCodeUnitOffset(index.codeUnitOffsetToGraphemeIndex(localOffset))
    === localOffset;
}

function lineIndex(text: string): TerminalTextIndex {
  const existing = lineIndexes.get(text);
  if (existing !== undefined) {
    lineIndexes.delete(text);
    lineIndexes.set(text, existing);
    return existing;
  }
  const created = createTerminalTextIndex(text);
  if (text.length <= lineIndexWeightLimit) {
    lineIndexes.set(text, created);
    lineIndexWeight += text.length;
    while (lineIndexWeight > lineIndexWeightLimit) {
      const oldest = lineIndexes.keys().next().value;
      if (oldest === undefined) break;
      lineIndexes.delete(oldest);
      lineIndexWeight -= oldest.length;
    }
  }
  return created;
}

function optionalText(value: unknown, owner: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new TypeError(`${owner} must be a string.`);
  return sanitizeTerminalText(value).text;
}

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
import type { TerminalTextIndex, TextDocument } from '../text/index.ts';
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

const decorationData = new WeakMap<object, TextAreaDecorationsData>();
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
  if (input.decorations.length === 0) return emptyTextAreaDecorations(input.document);
  const models = input.decorations.map((candidate, index) => (
    decodeTextAreaDecoration(candidate, index, input.document)
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
  return registerDecorations(input.document, Object.freeze([
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

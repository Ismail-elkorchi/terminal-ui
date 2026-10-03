import { finishWork } from '../foundation/cooperative-work.ts';
import { isTerminalControlTextSafe, isTerminalTextSafe } from './sanitize.ts';
import { normalizeSourceCursor } from './text-range.ts';
import { cachedSourceBoundaries, SourceBoundaryIndex } from './source-boundaries.ts';
import type {
  TextCaret,
  TextDocumentChange,
  TextDocumentSelection,
  TextPosition,
  TextSelection,
} from './types.ts';

declare const textDocumentBrand: unique symbol;

export interface TextDocument {
  readonly [textDocumentBrand]: true;
}

export interface TextDocumentLine {
  readonly lineIndex: number;
  readonly startOffset: number;
  readonly endOffsetExclusive: number;
  readonly text: string;
}

export interface TextDocumentMutation {
  readonly document: TextDocument;
  readonly replaced: { readonly startOffset: number; readonly endOffsetExclusive: number };
  readonly insertedLength: number;
}

type TextChunkNode = TextChunkLeaf | TextChunkBranch;

interface TextChunkMetrics {
  readonly length: number;
  readonly bytes: number;
  readonly lineBreaks: number;
  readonly chunkCount: number;
  readonly startsWithLf: boolean;
  readonly startsWithLowSurrogate: boolean;
  readonly endsWithHighSurrogate: boolean;
  readonly endsWithCr: boolean;
  readonly terminalTextSafe: boolean;
  readonly terminalControlTextSafe: boolean;
  readonly height: number;
}

interface TextChunkLeaf extends TextChunkMetrics {
  readonly kind: 'leaf';
  readonly text: string;
}

interface TextChunkBranch extends TextChunkMetrics {
  readonly kind: 'branch';
  readonly left: TextChunkNode;
  readonly right: TextChunkNode;
}

interface TextDocumentData {
  readonly root: TextChunkNode;
  readonly revision: object;
  readonly boundaries: Map<number, SourceBoundaryIndex>;
  readonly previousMutation?: TextDocumentMutationLineage;
}

export interface TextDocumentPreviousMutation {
  readonly document: TextDocument;
  readonly changes: readonly TextDocumentChange[];
}

interface TextDocumentMutationLineage {
  readonly previousDocument: WeakRef<TextDocument>;
  readonly changes: readonly TextDocumentChange[];
}

export interface TextDocumentChunkMetrics {
  readonly chunkCount: number;
  readonly treeHeight: number;
  readonly minimumChunkLength: number;
  readonly maximumChunkLength: number;
  readonly meanChunkLength: number;
  readonly underfilledChunkCount: number;
}

const EMPTY_LEAF: TextChunkLeaf = Object.freeze({
  kind: 'leaf',
  text: '',
  length: 0,
  bytes: 0,
  lineBreaks: 0,
  chunkCount: 0,
  startsWithLf: false,
  startsWithLowSurrogate: false,
  endsWithHighSurrogate: false,
  endsWithCr: false,
  terminalTextSafe: true,
  terminalControlTextSafe: true,
  height: 1
});
const MAX_CHUNK_LENGTH = 4_096;
const MIN_CHUNK_LENGTH = 1_024;
const documents = new WeakMap<object, TextDocumentData>();
// A global budget also bounds retained lines when many document revisions stay live.
const lineCacheLimit = 4_194_304;
const lineCache = new WeakMap<TextDocument, Map<number, TextDocumentLine>>();
const retainedLines = new Map<TextDocumentLine, WeakRef<TextDocument>>();
let lineCacheBytes = 0;

export function createTextDocument(value: string): TextDocument {
  return finishWork(createTextDocumentWork(value));
}

/** Internal cooperative construction shares the direct document's leaf metrics. */
export function* createTextDocumentWork(value: string): Generator<number, TextDocument> {
  if (typeof value !== 'string') throw new TypeError('text document source must be a string.');
  return createDocument(yield* treeFromTextWork(value));
}

export function assertTextDocument(value: unknown): asserts value is TextDocument {
  if (!isTextDocument(value)) throw new TypeError('text document must be created with text document APIs.');
}

export function isTextDocument(value: unknown): value is TextDocument {
  return documents.has(value as object);
}

export function textDocumentLength(document: TextDocument): number {
  return dataFor(document).root.length;
}

export function textDocumentBytes(document: TextDocument): number {
  return dataFor(document).root.bytes;
}

export function textDocumentLineCount(document: TextDocument): number {
  return dataFor(document).root.lineBreaks + 1;
}

export function textDocumentText(document: TextDocument): string {
  return textDocumentSlice(document, 0, textDocumentLength(document));
}

/** Whether multiline terminal sanitization can preserve this document verbatim. */
export function textDocumentCanRenderDirectly(document: TextDocument): boolean {
  return dataFor(document).root.terminalTextSafe;
}

/** Whether line-local whitespace projection can render this document safely. */
export function textDocumentCanProjectLines(document: TextDocument): boolean {
  return dataFor(document).root.terminalControlTextSafe;
}

export function textDocumentSlice(
  document: TextDocument,
  start?: number,
  end?: number
): string {
  return finishWork(textDocumentSliceWork(document, start, end));
}

export function* textDocumentSliceWork(
  document: TextDocument, start?: number, end?: number,
): Generator<number, string> {
  const length = textDocumentLength(document);
  const boundedStart = clampOffset(start ?? 0, length);
  const boundedEnd = Math.max(boundedStart, clampOffset(end ?? length, length));
  const output: string[] = [];
  yield* collectSliceWork(dataFor(document).root, boundedStart, boundedEnd, output);
  return output.join('');
}

export function textDocumentEdit(
  document: TextDocument,
  range: { readonly startOffset: number; readonly endOffsetExclusive: number },
  insertion: string
): TextDocumentMutation {
  return finishWork(textDocumentEditWork(document, range, insertion));
}

export function* textDocumentEditWork(
  document: TextDocument,
  range: { readonly startOffset: number; readonly endOffsetExclusive: number },
  insertion: string,
): Generator<number, TextDocumentMutation> {
  const start = yield* normalizeTextDocumentOffsetWork(document, Math.min(range.startOffset, range.endOffsetExclusive));
  const end = yield* normalizeTextDocumentOffsetWork(document, Math.max(range.startOffset, range.endOffsetExclusive));
  if (typeof insertion !== 'string') throw new TypeError('text document insertion must be a string.');
  return yield* textDocumentEditAtOffsetsWork(document, start, end, insertion);
}

/** Applies an already validated UTF-16 edit without interactive caret normalization. */
export function textDocumentEditExact(
  document: TextDocument,
  startOffset: number,
  endOffsetExclusive: number,
  insertion: string
): TextDocumentMutation {
  return finishWork(textDocumentEditExactWork(document, startOffset, endOffsetExclusive, insertion));
}

/** Admitted UTF-16 edits for cooperative projection; no cursor normalization. */
export function* textDocumentEditExactWork(
  document: TextDocument,
  startOffset: number,
  endOffsetExclusive: number,
  insertion: string,
): Generator<number, TextDocumentMutation> {
  return yield* textDocumentEditAtOffsetsWork(document, startOffset, endOffsetExclusive, insertion);
}

function* textDocumentEditAtOffsetsWork(
  document: TextDocument,
  start: number,
  end: number,
  insertion: string,
): Generator<number, TextDocumentMutation> {
  if (start === end && insertion.length === 0) {
    return {
      document,
      replaced: { startOffset: start, endOffsetExclusive: end },
      insertedLength: 0
    };
  }
  if (insertion === (yield* textDocumentSliceWork(document, start, end))) {
    return {
      document,
      replaced: { startOffset: start, endOffsetExclusive: end },
      insertedLength: insertion.length
    };
  }
  const root = dataFor(document).root;
  const meter = { operations: 0 };
  const [before, remainder] = splitChunks(root, start, meter);
  const [, after] = splitChunks(remainder, end - start, meter);
  yield meter.operations;
  meter.operations = 0;
  const inserted = yield* treeFromTextWork(insertion);
  const joined = joinChunks(joinChunks(before, inserted, meter), after, meter);
  yield meter.operations;
  const next = yield* compactFragmentedChunksWork(joined);
  const changes = Object.freeze([Object.freeze({
    startOffset: start,
    endOffsetExclusive: end,
    insertedText: insertion,
  })]);
  return {
    document: createDocument(next, document, changes),
    replaced: { startOffset: start, endOffsetExclusive: end },
    insertedLength: insertion.length
  };
}

export function textDocumentLineAt(document: TextDocument, lineIndex: number): TextDocumentLine | undefined {
  return finishWork(textDocumentLineAtWork(document, lineIndex));
}

export function* textDocumentLineAtWork(document: TextDocument, lineIndex: number): Generator<number, TextDocumentLine | undefined> {
  const lineCount = textDocumentLineCount(document);
  if (!Number.isInteger(lineIndex) || lineIndex < 0 || lineIndex >= lineCount) return undefined;
  const cached = lineCache.get(document)?.get(lineIndex);
  if (cached !== undefined) {
    retainedLines.delete(cached);
    retainedLines.set(cached, new WeakRef(document));
    return cached;
  }
  const root = dataFor(document).root;
  const startOffset = lineIndex === 0 ? 0 : yield* offsetAfterLineBreakWork(root, lineIndex - 1);
  const afterBreak = lineIndex < root.lineBreaks ? yield* offsetAfterLineBreakWork(root, lineIndex) : root.length;
  const endOffsetExclusive = lineIndex < root.lineBreaks
    ? Math.max(startOffset, afterBreak - lineTerminatorLength(root, afterBreak))
    : afterBreak;
  const inherited = inheritedLine(document, lineIndex, startOffset, endOffsetExclusive);
  const line = (endOffsetExclusive - startOffset) * 2 + 96 <= lineCacheLimit / 2
    ? { lineIndex, startOffset, endOffsetExclusive, text: inherited?.text ?? (yield* textDocumentSliceWork(document, startOffset, endOffsetExclusive)) }
    : lazyDocumentLine(root, lineIndex, startOffset, endOffsetExclusive);
  yield* retainLineWork(document, line);
  return line;
}

function lazyDocumentLine(root: TextChunkNode, lineIndex: number, startOffset: number, endOffsetExclusive: number): TextDocumentLine {
  let text: string | undefined;
  return { lineIndex, startOffset, endOffsetExclusive, get text() {
    if (text === undefined) {
      const parts: string[] = [];
      collectSlice(root, startOffset, endOffsetExclusive, parts);
      text = parts.join('');
    }
    return text;
  } };
}

/** Revision-owned boundaries are not evicted merely because a line is large.
 * The source accessor keeps the rope, not a permanently flattened line string. */
export function textDocumentLineBoundaries(document: TextDocument, line: TextDocumentLine): SourceBoundaryIndex {
  const data = dataFor(document);
  const cached = data.boundaries.get(line.lineIndex);
  if (cached !== undefined) return cached;
  const length = line.endOffsetExclusive - line.startOffset;
  const root = data.root;
  const startOffset = line.startOffset;
  const source = { length, slice(start: number, end = length): string {
    const parts: string[] = [];
    collectSlice(root, startOffset + start, startOffset + end, parts);
    return parts.join('');
  } };
  const previous = inheritedBoundaries(document, line);
  // Small already-materialized lines can also share the standalone source cache.
  const shared = length * 2 + 96 <= lineCacheLimit / 2 ? cachedSourceBoundaries(line.text) : undefined;
  const boundaries = shared ?? new SourceBoundaryIndex(source, previous?.index, previous?.changedAt);
  data.boundaries.set(line.lineIndex, boundaries);
  return boundaries;
}

function inheritedBoundaries(document: TextDocument, line: TextDocumentLine): {
  readonly index: SourceBoundaryIndex;
  readonly changedAt: number;
} | undefined {
  const lineage = textDocumentPreviousMutation(document);
  const change = lineage?.changes.length === 1 ? lineage.changes[0] : undefined;
  if (lineage === undefined || change === undefined) return undefined;
  const delta = change.insertedText.length - (change.endOffsetExclusive - change.startOffset);
  const before = line.endOffsetExclusive <= change.startOffset;
  const after = line.startOffset >= change.startOffset + change.insertedText.length;
  const oldStart = line.startOffset - (after && !before ? delta : 0);
  if (!before && !after && line.startOffset > change.startOffset) return undefined;
  const oldIndex = textDocumentLineIndexAtOffset(lineage.document, oldStart);
  const oldLine = textDocumentLineAt(lineage.document, oldIndex);
  const index = dataFor(lineage.document).boundaries.get(oldIndex);
  if (index === undefined || oldLine?.startOffset !== oldStart) return undefined;
  return { index, changedAt: before || after ? line.endOffsetExclusive - line.startOffset + 1 : change.startOffset - line.startOffset };
}

function inheritedLine(
  document: TextDocument,
  lineIndex: number,
  startOffset: number,
  endOffsetExclusive: number
): TextDocumentLine | undefined {
  const lineage = textDocumentPreviousMutation(document);
  if (lineage?.changes.length !== 1) return undefined;
  const previous = lineCache.get(lineage.document);
  if (previous === undefined) return undefined;
  const change = lineage.changes[0];
  if (change === undefined) return undefined;
  const delta = change.insertedText.length - (change.endOffsetExclusive - change.startOffset);
  const shift = endOffsetExclusive <= change.startOffset ? 0
    : startOffset >= change.startOffset + change.insertedText.length ? delta : undefined;
  if (shift === undefined) return undefined;
  const oldStart = startOffset - shift;
  const oldEnd = endOffsetExclusive - shift;
  if (oldEnd > change.startOffset && oldStart < change.endOffsetExclusive) return undefined;
  const previousIndex = textDocumentLineIndexAtOffset(lineage.document, oldStart);
  const line = previous.get(previousIndex);
  return line?.startOffset === oldStart && line.endOffsetExclusive === oldEnd
    ? { lineIndex, startOffset, endOffsetExclusive, text: line.text }
    : undefined;
}

function* retainLineWork(document: TextDocument, line: TextDocumentLine): Generator<number, void> {
  const weight = (line.endOffsetExclusive - line.startOffset) * 2 + 96;
  if (weight > lineCacheLimit / 2) return;
  const lines = lineCache.get(document) ?? new Map<number, TextDocumentLine>();
  const previous = lines.get(line.lineIndex);
  if (previous !== undefined) {
    retainedLines.delete(previous);
    lineCacheBytes -= previous.text.length * 2 + 96;
  }
  lines.set(line.lineIndex, line);
  lineCache.set(document, lines);
  retainedLines.set(line, new WeakRef(document));
  lineCacheBytes += weight;
  while (lineCacheBytes > lineCacheLimit) {
    const oldest = retainedLines.entries().next().value;
    if (oldest === undefined) break;
    retainedLines.delete(oldest[0]);
    const owner = oldest[1].deref();
    if (owner !== undefined) lineCache.get(owner)?.delete(oldest[0].lineIndex);
    lineCacheBytes -= oldest[0].text.length * 2 + 96;
    yield 1;
  }
}

/**
 * Iterates logical lines in source order without repeated indexed tree lookups.
 * @beta
 */
export function textDocumentLines(document: TextDocument): Iterable<TextDocumentLine> {
  const root = dataFor(document).root;
  return Object.freeze({
    [Symbol.iterator]: function* () {
      for (const event of iterateDocumentLineEvents(root)) if (typeof event !== 'number') yield event;
    },
  });
}

/** Internal charged line traversal; direct iteration drains this same computation. */
export function textDocumentLineEvents(document: TextDocument): Generator<number | TextDocumentLine> {
  return iterateDocumentLineEvents(dataFor(document).root);
}

export function textDocumentLineIndexAtOffset(document: TextDocument, offset: number): number {
  return finishWork(textDocumentLineIndexAtOffsetWork(document, offset));
}

export function* textDocumentLineIndexAtOffsetWork(document: TextDocument, offset: number): Generator<number, number> {
  const root = dataFor(document).root;
  const meter = { operations: 0 };
  const result = lineBreaksBefore(root, clampOffset(offset, root.length), meter);
  yield meter.operations;
  return result;
}

export function normalizeTextDocumentOffset(document: TextDocument, offset: number): number {
  return finishWork(normalizeTextDocumentOffsetWork(document, offset));
}

export function* normalizeTextDocumentOffsetWork(document: TextDocument, offset: number): Generator<number, number> {
  const length = textDocumentLength(document);
  const bounded = clampOffset(offset, length);
  if (bounded > 0 && bounded < length && textDocumentSlice(document, bounded - 1, bounded + 1) === '\r\n') {
    return bounded - 1;
  }
  const lineIndex = yield* textDocumentLineIndexAtOffsetWork(document, bounded);
  const line = yield* textDocumentLineAtWork(document, lineIndex);
  if (line === undefined || bounded > line.endOffsetExclusive) return bounded;
  const boundaries = textDocumentLineBoundaries(document, line);
  yield* boundaries.prepareThroughWork(bounded - line.startOffset);
  return line.startOffset + normalizeSourceCursor(boundaries, bounded - line.startOffset);
}

export function normalizeTextDocumentRange(
  document: TextDocument,
  selection: TextSelection | undefined
): TextSelection | undefined {
  if (selection === undefined) return undefined;
  const first = normalizeTextDocumentOffset(document, selection.startOffset);
  const second = normalizeTextDocumentOffset(document, selection.endOffsetExclusive);
  const start = Math.min(first, second);
  const end = Math.max(first, second);
  return start === end
    ? undefined
    : { startOffset: start, endOffsetExclusive: end };
}

export function normalizeTextPosition(document: TextDocument, position: TextPosition): TextPosition {
  return finishWork(normalizeTextPositionWork(document, position));
}

export function* normalizeTextPositionWork(document: TextDocument, position: TextPosition): Generator<number, TextPosition> {
  return Object.freeze({
    offset: yield* normalizeTextDocumentOffsetWork(document, position.offset),
    affinity: position.affinity
  });
}

export function normalizeTextCaret(document: TextDocument, caret: TextCaret): TextCaret {
  return finishWork(normalizeTextCaretWork(document, caret));
}

export function* normalizeTextCaretWork(document: TextDocument, caret: TextCaret): Generator<number, TextCaret> {
  const position = yield* normalizeTextPositionWork(document, caret.position);
  const preferredColumnCells = caret.preferredColumnCells === undefined
    ? undefined
    : Math.max(0, Math.floor(caret.preferredColumnCells));
  return Object.freeze({
    position,
    ...(preferredColumnCells === undefined ? {} : { preferredColumnCells })
  });
}

export function normalizeTextDocumentSelection(
  document: TextDocument,
  selection: TextDocumentSelection | undefined
): TextDocumentSelection | undefined {
  return finishWork(normalizeTextDocumentSelectionWork(document, selection));
}

export function* normalizeTextDocumentSelectionWork(
  document: TextDocument,
  selection: TextDocumentSelection | undefined,
): Generator<number, TextDocumentSelection | undefined> {
  if (selection === undefined) return undefined;
  const anchor = yield* normalizeTextPositionWork(document, selection.anchor);
  const focus = yield* normalizeTextPositionWork(document, selection.focus);
  return anchor.offset === focus.offset ? undefined : Object.freeze({ anchor, focus });
}

export function textDocumentSelectionRange(
  document: TextDocument,
  selection: TextDocumentSelection | undefined,
  caret: TextCaret
): { readonly startOffset: number; readonly endOffsetExclusive: number } {
  const focus = normalizeTextCaret(document, caret).position.offset;
  if (selection === undefined) return { startOffset: focus, endOffsetExclusive: focus };
  const normalized = normalizeTextDocumentSelection(document, selection);
  if (normalized === undefined) return { startOffset: focus, endOffsetExclusive: focus };
  return {
    startOffset: Math.min(normalized.anchor.offset, normalized.focus.offset),
    endOffsetExclusive: Math.max(normalized.anchor.offset, normalized.focus.offset)
  };
}

export function textDocumentPreviousMutation(
  document: TextDocument,
): TextDocumentPreviousMutation | undefined {
  const data = dataFor(document);
  const lineage = data.previousMutation;
  const previousDocument = lineage?.previousDocument.deref();
  return previousDocument === undefined || lineage === undefined
    ? undefined
    : {
        document: previousDocument,
        changes: lineage.changes,
      };
}

/** Internal identity for binding retained operations to one exact document revision. */
export function textDocumentRevision(document: TextDocument): object {
  return dataFor(document).revision;
}

/** Internal storage evidence used by performance and fragmentation tests. */
export function textDocumentChunkMetrics(document: TextDocument): TextDocumentChunkMetrics {
  const root = dataFor(document).root;
  let chunkCount = 0;
  let minimumChunkLength = Number.POSITIVE_INFINITY;
  let maximumChunkLength = 0;
  let underfilledChunkCount = 0;
  const pending = [root];
  while (pending.length > 0) {
    const node = pending.pop();
    if (node === undefined) continue;
    if (node.kind === 'branch') {
      pending.push(node.left, node.right);
      continue;
    }
    if (node.length === 0) continue;
    chunkCount += 1;
    minimumChunkLength = Math.min(minimumChunkLength, node.length);
    maximumChunkLength = Math.max(maximumChunkLength, node.length);
    if (node.length < MIN_CHUNK_LENGTH) underfilledChunkCount += 1;
  }
  return Object.freeze({
    chunkCount,
    treeHeight: root.height,
    minimumChunkLength: chunkCount === 0 ? 0 : minimumChunkLength,
    maximumChunkLength,
    meanChunkLength: chunkCount === 0 ? 0 : root.length / chunkCount,
    underfilledChunkCount,
  });
}

/** Applies an admitted ordered change list as one document transition. */
export function textDocumentApplyChangesExact(
  document: TextDocument,
  changes: readonly TextDocumentChange[],
): TextDocument {
  return finishWork(textDocumentApplyChangesExactWork(document, changes));
}

/** The projection owns its admitted changes; partial trees are never published. */
export function* textDocumentApplyChangesExactWork(
  document: TextDocument,
  changes: readonly TextDocumentChange[],
): Generator<number, TextDocument> {
  if (changes.length === 0) return document;
  const effective: TextDocumentChange[] = [];
  for (const change of changes) {
    if (change.insertedText !== (yield* textDocumentSliceWork(document, change.startOffset, change.endOffsetExclusive))) {
      effective.push(Object.freeze({ ...change }));
    }
    yield 1;
  }
  if (effective.length === 0) return document;
  let sourceOffset = 0;
  let remainder = dataFor(document).root;
  let result: TextChunkNode = EMPTY_LEAF;
  const meter = { operations: 0 };
  for (const change of effective) {
    const [unchanged, afterUnchanged] = splitChunks(remainder, change.startOffset - sourceOffset, meter);
    const [, afterChange] = splitChunks(afterUnchanged, change.endOffsetExclusive - change.startOffset, meter);
    yield meter.operations;
    meter.operations = 0;
    result = joinChunks(result, unchanged, meter);
    result = joinChunks(result, yield* treeFromTextWork(change.insertedText), meter);
    remainder = afterChange;
    sourceOffset = change.endOffsetExclusive;
    yield meter.operations + 1;
    meter.operations = 0;
  }
  result = joinChunks(result, remainder, meter);
  yield meter.operations;
  result = yield* compactFragmentedChunksWork(result);
  return createDocument(result, document, Object.freeze(effective));
}

function createDocument(
  root: TextChunkNode,
  previousDocument?: TextDocument,
  changes?: readonly TextDocumentChange[],
): TextDocument {
  const document = Object.freeze({}) as TextDocument;
  documents.set(document, Object.freeze({
    root,
    revision: Object.freeze({}),
    boundaries: new Map<number, SourceBoundaryIndex>(),
    ...(previousDocument === undefined || changes === undefined ? {} : {
      previousMutation: Object.freeze({
        previousDocument: new WeakRef(previousDocument),
        changes,
      }),
    }),
  }));
  return document;
}

function* treeFromTextWork(text: string): Generator<number, TextChunkNode> {
  if (text.length === 0) return EMPTY_LEAF;
  const leaves: TextChunkNode[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(text.length, start + MAX_CHUNK_LENGTH);
    if (end < text.length && isLowSurrogate(text.charCodeAt(end))) end -= 1;
    leaves.push(leaf(text.slice(start, end)));
    yield end - start;
    start = end;
  }
  return yield* balancedTreeWork(leaves, 0, leaves.length, { operations: 0 });
}

function* balancedTreeWork(
  nodes: readonly TextChunkNode[],
  startIndex: number,
  endIndexExclusive: number,
  budget: { operations: number },
): Generator<number, TextChunkNode> {
  const count = endIndexExclusive - startIndex;
  if (count <= 0) return EMPTY_LEAF;
  if (count === 1) return nodes[startIndex] ?? EMPTY_LEAF;
  const middle = startIndex + Math.floor(count / 2);
  const left = yield* balancedTreeWork(nodes, startIndex, middle, budget);
  const right = yield* balancedTreeWork(nodes, middle, endIndexExclusive, budget);
  budget.operations += 1;
  yield 1;
  return branch(left, right);
}

function leaf(text: string, meter: { operations: number } = { operations: 0 }): TextChunkLeaf {
  meter.operations += text.length;
  if (text.length === 0) return EMPTY_LEAF;
  let lineBreaks = 0;
  let previousWasCr = false;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code === 13) lineBreaks += 1;
    else if (code === 10 && !previousWasCr) lineBreaks += 1;
    previousWasCr = code === 13;
  }
  return Object.freeze({
    kind: 'leaf',
    text,
    length: text.length,
    bytes: new TextEncoder().encode(text).byteLength,
    lineBreaks,
    chunkCount: 1,
    startsWithLf: text.charCodeAt(0) === 10,
    startsWithLowSurrogate: isLowSurrogate(text.charCodeAt(0)),
    endsWithHighSurrogate: isHighSurrogate(text.charCodeAt(text.length - 1)),
    endsWithCr: text.charCodeAt(text.length - 1) === 13,
    terminalTextSafe: isTerminalTextSafe(text),
    terminalControlTextSafe: isTerminalControlTextSafe(text),
    height: 1
  });
}

function branch(left: TextChunkNode, right: TextChunkNode, meter: { operations: number } = { operations: 0 }): TextChunkNode {
  meter.operations += 1;
  if (left.length === 0) return right;
  if (right.length === 0) return left;
  return Object.freeze({
    kind: 'branch',
    left,
    right,
    length: left.length + right.length,
    bytes: left.bytes + right.bytes - (left.endsWithHighSurrogate && right.startsWithLowSurrogate ? 2 : 0),
    lineBreaks: left.lineBreaks + right.lineBreaks
      - Number(left.endsWithCr && right.startsWithLf),
    chunkCount: left.chunkCount + right.chunkCount,
    startsWithLf: left.startsWithLf,
    startsWithLowSurrogate: left.startsWithLowSurrogate,
    endsWithHighSurrogate: right.endsWithHighSurrogate,
    endsWithCr: right.endsWithCr,
    terminalTextSafe: left.terminalTextSafe && right.terminalTextSafe,
    terminalControlTextSafe: left.terminalControlTextSafe && right.terminalControlTextSafe,
    height: Math.max(left.height, right.height) + 1
  });
}

function joinChunks(left: TextChunkNode, right: TextChunkNode, meter: { operations: number } = { operations: 0 }): TextChunkNode {
  meter.operations += 1;
  if (left.length === 0) return right;
  if (right.length === 0) return left;
  const leftBoundary = rightmostLeaf(left, meter);
  const rightBoundary = leftmostLeaf(right, meter);
  if (
    leftBoundary.length + rightBoundary.length <= MAX_CHUNK_LENGTH
    && leftBoundary.length === rightBoundary.length
  ) {
    // Equal-size joining acts like a binary carry. It prevents one-character
    // appends from copying a growing boundary chunk on every edit while still
    // keeping the number of retained chunks proportional to document length.
    const removedLeft = removeRightmostLeaf(left, meter);
    const removedRight = removeLeftmostLeaf(right, meter);
    const boundary = boundaryChunks(leftBoundary.text + rightBoundary.text, meter);
    return joinChunks(joinChunks(removedLeft, boundary, meter), removedRight, meter);
  }
  return joinBalancedChunks(left, right, meter);
}

function joinBalancedChunks(left: TextChunkNode, right: TextChunkNode, meter: { operations: number } = { operations: 0 }): TextChunkNode {
  meter.operations += 1;
  if (left.length === 0) return right;
  if (right.length === 0) return left;
  if (left.kind === 'leaf' && right.kind === 'leaf'
    && left.length + right.length <= MAX_CHUNK_LENGTH) {
    return leaf(left.text + right.text, meter);
  }
  if (left.height > right.height + 1 && left.kind === 'branch') {
    return balanceChunks(left.left, joinBalancedChunks(left.right, right, meter), meter);
  }
  if (right.height > left.height + 1 && right.kind === 'branch') {
    return balanceChunks(joinBalancedChunks(left, right.left, meter), right.right, meter);
  }
  return balanceChunks(left, right, meter);
}

function balanceChunks(left: TextChunkNode, right: TextChunkNode, meter: { operations: number } = { operations: 0 }): TextChunkNode {
  meter.operations += 1;
  if (left.height > right.height + 1 && left.kind === 'branch') {
    if (left.left.height >= left.right.height) return branch(left.left, branch(left.right, right, meter), meter);
    if (left.right.kind === 'branch') {
      return branch(branch(left.left, left.right.left, meter), branch(left.right.right, right, meter), meter);
    }
  }
  if (right.height > left.height + 1 && right.kind === 'branch') {
    if (right.right.height >= right.left.height) return branch(branch(left, right.left, meter), right.right, meter);
    if (right.left.kind === 'branch') {
      return branch(branch(left, right.left.left, meter), branch(right.left.right, right.right, meter), meter);
    }
  }
  return branch(left, right, meter);
}

function splitChunks(
  node: TextChunkNode,
  offset: number,
  meter: { operations: number } = { operations: 0 },
): readonly [TextChunkNode, TextChunkNode] {
  meter.operations += 1;
  const bounded = clampOffset(offset, node.length);
  if (bounded === 0) return [EMPTY_LEAF, node];
  if (bounded === node.length) return [node, EMPTY_LEAF];
  if (node.kind === 'leaf') return [leaf(node.text.slice(0, bounded), meter), leaf(node.text.slice(bounded), meter)];
  if (bounded < node.left.length) {
    const [before, after] = splitChunks(node.left, bounded, meter);
    return [before, joinBalancedChunks(after, node.right, meter)];
  }
  const [before, after] = splitChunks(node.right, bounded - node.left.length, meter);
  return [joinBalancedChunks(node.left, before, meter), after];
}

function* collectSliceWork(
  node: TextChunkNode, startOffset: number, endOffsetExclusive: number, output: string[],
): Generator<number, void> {
  if (startOffset >= endOffsetExclusive || endOffsetExclusive <= 0 || startOffset >= node.length) return;
  if (node.kind === 'leaf') {
    const start = Math.max(0, startOffset);
    const end = Math.min(node.length, endOffsetExclusive);
    output.push(node.text.slice(start, end));
    yield end - start;
    return;
  }
  yield* collectSliceWork(node.left, startOffset, Math.min(endOffsetExclusive, node.left.length), output);
  yield* collectSliceWork(node.right, startOffset - node.left.length, endOffsetExclusive - node.left.length, output);
}

function collectSlice(
  node: TextChunkNode,
  startOffset: number,
  endOffsetExclusive: number,
  output: string[],
): void {
  finishWork(collectSliceWork(node, startOffset, endOffsetExclusive, output));
}

function* iterateDocumentLineEvents(root: TextChunkNode): Generator<number | TextDocumentLine> {
  let absoluteOffset = 0;
  let lineIndex = 0;
  let lineStartOffset = 0;
  let lineParts: string[] = [];
  let carriageReturnAtChunkEnd = false;

  for (const text of chunkTexts(root)) {
    let index = 0;
    if (carriageReturnAtChunkEnd) {
      yield {
        lineIndex,
        startOffset: lineStartOffset,
        endOffsetExclusive: absoluteOffset - 1,
        text: lineParts.join(''),
      };
      lineIndex += 1;
      const startsWithLf = text.charCodeAt(0) === 10;
      index = startsWithLf ? 1 : 0;
      lineStartOffset = absoluteOffset + index;
      lineParts = [];
      carriageReturnAtChunkEnd = false;
    }

    let segmentStart = index;
    let charged = index;
    for (; index < text.length; index += 1) {
      if (index - charged >= 256) { yield index - charged; charged = index; }
      const code = text.charCodeAt(index);
      if (code !== 10 && code !== 13) continue;
      lineParts.push(text.slice(segmentStart, index));
      if (code === 13 && index + 1 === text.length) {
        carriageReturnAtChunkEnd = true;
        segmentStart = text.length;
        break;
      }
      const terminatorLength = code === 13 && text.charCodeAt(index + 1) === 10 ? 2 : 1;
      yield {
        lineIndex,
        startOffset: lineStartOffset,
        endOffsetExclusive: absoluteOffset + index,
        text: lineParts.join(''),
      };
      lineIndex += 1;
      index += terminatorLength - 1;
      lineStartOffset = absoluteOffset + index + 1;
      lineParts = [];
      segmentStart = index + 1;
    }
    if (!carriageReturnAtChunkEnd && segmentStart < text.length) {
      lineParts.push(text.slice(segmentStart));
    }
    yield text.length - charged;
    absoluteOffset += text.length;
  }

  if (carriageReturnAtChunkEnd) {
    yield {
      lineIndex,
      startOffset: lineStartOffset,
      endOffsetExclusive: absoluteOffset - 1,
      text: lineParts.join(''),
    };
    lineIndex += 1;
    lineStartOffset = absoluteOffset;
    lineParts = [];
  }
  yield {
    lineIndex,
    startOffset: lineStartOffset,
    endOffsetExclusive: absoluteOffset,
    text: lineParts.join(''),
  };
}

function* chunkTexts(root: TextChunkNode): Generator<string> {
  const pending: TextChunkNode[] = [root];
  while (pending.length > 0) {
    const node = pending.pop();
    if (node === undefined) continue;
    if (node.kind === 'leaf') {
      if (node.length > 0) yield node.text;
      continue;
    }
    pending.push(node.right, node.left);
  }
}

function lineBreaksBefore(node: TextChunkNode, offset: number, meter = { operations: 0 }): number {
  const bounded = clampOffset(offset, node.length);
  if (bounded === 0) return 0;
  return prefixLineBreakCount(node, bounded, meter)
    - Number(
      characterCodeAt(node, bounded - 1) === 13
      && characterCodeAt(node, bounded) === 10,
    );
}

function prefixLineBreakCount(node: TextChunkNode, offset: number, meter: { operations: number }): number {
  meter.operations += 1;
  if (offset >= node.length) return node.lineBreaks;
  if (node.kind === 'leaf') {
    let lineBreaks = 0;
    let previousWasCr = false;
    for (let index = 0; index < Math.max(0, offset); index += 1) {
      meter.operations += 1;
      const code = node.text.charCodeAt(index);
      if (code === 13) lineBreaks += 1;
      else if (code === 10 && !previousWasCr) lineBreaks += 1;
      previousWasCr = code === 13;
    }
    return lineBreaks;
  }
  if (offset <= node.left.length) return prefixLineBreakCount(node.left, offset, meter);
  const rightOffset = offset - node.left.length;
  return node.left.lineBreaks
    + prefixLineBreakCount(node.right, rightOffset, meter)
    - Number(node.left.endsWithCr && node.right.startsWithLf && rightOffset > 0);
}

function* offsetAfterLineBreakWork(node: TextChunkNode, breakIndex: number): Generator<number, number> {
  const meter = { operations: 0 };
  let low = 1;
  let high = node.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (lineBreaksBefore(node, middle, meter) > breakIndex) high = middle;
    else low = middle + 1;
    yield meter.operations;
    meter.operations = 0;
  }
  return low;
}

function lineTerminatorLength(node: TextChunkNode, offsetAfter: number): number {
  return characterCodeAt(node, offsetAfter - 1) === 10
    && characterCodeAt(node, offsetAfter - 2) === 13
    ? 2
    : 1;
}

function characterCodeAt(node: TextChunkNode, offset: number): number | undefined {
  if (offset < 0 || offset >= node.length) return undefined;
  if (node.kind === 'leaf') return node.text.charCodeAt(offset);
  return offset < node.left.length
    ? characterCodeAt(node.left, offset)
    : characterCodeAt(node.right, offset - node.left.length);
}

function leftmostLeaf(node: TextChunkNode, meter: { operations: number } = { operations: 0 }): TextChunkLeaf {
  meter.operations += 1;
  let current = node;
  while (current.kind === 'branch') { current = current.left; meter.operations += 1; }
  return current;
}

function rightmostLeaf(node: TextChunkNode, meter: { operations: number } = { operations: 0 }): TextChunkLeaf {
  meter.operations += 1;
  let current = node;
  while (current.kind === 'branch') { current = current.right; meter.operations += 1; }
  return current;
}

function removeLeftmostLeaf(node: TextChunkNode, meter: { operations: number } = { operations: 0 }): TextChunkNode {
  meter.operations += 1;
  if (node.kind === 'leaf') return EMPTY_LEAF;
  return joinBalancedChunks(removeLeftmostLeaf(node.left, meter), node.right, meter);
}

function removeRightmostLeaf(node: TextChunkNode, meter: { operations: number } = { operations: 0 }): TextChunkNode {
  meter.operations += 1;
  if (node.kind === 'leaf') return EMPTY_LEAF;
  return joinBalancedChunks(node.left, removeRightmostLeaf(node.right, meter), meter);
}

function boundaryChunks(text: string, meter: { operations: number } = { operations: 0 }): TextChunkNode {
  meter.operations += 1;
  if (text.length <= MAX_CHUNK_LENGTH) return leaf(text, meter);
  let middle = Math.floor(text.length / 2);
  if (isLowSurrogate(text.charCodeAt(middle))) middle -= 1;
  return branch(leaf(text.slice(0, middle), meter), leaf(text.slice(middle), meter), meter);
}

function* compactFragmentedChunksWork(root: TextChunkNode): Generator<number, TextChunkNode> {
  const maximumChunkCount = Math.max(64, Math.ceil(root.length / MIN_CHUNK_LENGTH));
  if (root.chunkCount <= maximumChunkCount) return root;
  const parts: string[] = [];
  const pending = [root];
  while (pending.length > 0) {
    const node = pending.pop();
    if (node === undefined) break;
    if (node.kind === 'leaf') parts.push(node.text);
    else pending.push(node.right, node.left);
    yield 1;
  }
  // Joining immutable strings is native allocation; rebuilding leaf metrics is
  // bounded and resumable rather than one framework-owned whole-document loop.
  return yield* treeFromTextWork(parts.join(''));
}

function dataFor(document: TextDocument): TextDocumentData {
  const data = documents.get(document);
  if (data === undefined) throw new TypeError('Invalid text document.');
  return data;
}

function clampOffset(value: number, max: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(max, Math.floor(value))) : 0;
}

function isLowSurrogate(value: number): boolean {
  return value >= 0xdc00 && value <= 0xdfff;
}

function isHighSurrogate(value: number): boolean {
  return value >= 0xd800 && value <= 0xdbff;
}

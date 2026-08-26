import { normalizeTextCursor } from './text-range.ts';
import { isTerminalControlTextSafe, isTerminalTextSafe } from './sanitize.ts';
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
  endsWithCr: false,
  terminalTextSafe: true,
  terminalControlTextSafe: true,
  height: 1
});
const MAX_CHUNK_LENGTH = 4_096;
const MIN_CHUNK_LENGTH = 1_024;
const documents = new WeakMap<object, TextDocumentData>();

export function createTextDocument(value: string): TextDocument {
  if (typeof value !== 'string') throw new TypeError('text document source must be a string.');
  return createDocument(treeFromText(value));
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
  const length = textDocumentLength(document);
  const boundedStart = clampOffset(start ?? 0, length);
  const boundedEnd = Math.max(boundedStart, clampOffset(end ?? length, length));
  const output: string[] = [];
  collectSlice(dataFor(document).root, boundedStart, boundedEnd, output);
  return output.join('');
}

export function textDocumentEdit(
  document: TextDocument,
  range: { readonly startOffset: number; readonly endOffsetExclusive: number },
  insertion: string
): TextDocumentMutation {
  const start = normalizeTextDocumentOffset(document, Math.min(range.startOffset, range.endOffsetExclusive));
  const end = normalizeTextDocumentOffset(document, Math.max(range.startOffset, range.endOffsetExclusive));
  if (typeof insertion !== 'string') throw new TypeError('text document insertion must be a string.');
  return textDocumentEditAtOffsets(document, start, end, insertion);
}

/** Applies an already validated UTF-16 edit without interactive caret normalization. */
export function textDocumentEditExact(
  document: TextDocument,
  startOffset: number,
  endOffsetExclusive: number,
  insertion: string
): TextDocumentMutation {
  return textDocumentEditAtOffsets(document, startOffset, endOffsetExclusive, insertion);
}

function textDocumentEditAtOffsets(
  document: TextDocument,
  start: number,
  end: number,
  insertion: string
): TextDocumentMutation {
  if (start === end && insertion.length === 0) {
    return {
      document,
      replaced: { startOffset: start, endOffsetExclusive: end },
      insertedLength: 0
    };
  }
  if (insertion === textDocumentSlice(document, start, end)) {
    return {
      document,
      replaced: { startOffset: start, endOffsetExclusive: end },
      insertedLength: insertion.length
    };
  }
  const root = dataFor(document).root;
  const [before, remainder] = splitChunks(root, start);
  const [, after] = splitChunks(remainder, end - start);
  const next = compactFragmentedChunks(
    joinChunks(joinChunks(before, treeFromText(insertion)), after),
  );
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
  const lineCount = textDocumentLineCount(document);
  if (!Number.isInteger(lineIndex) || lineIndex < 0 || lineIndex >= lineCount) return undefined;
  const root = dataFor(document).root;
  const startOffset = lineIndex === 0 ? 0 : offsetAfterLineBreak(root, lineIndex - 1);
  const afterBreak = lineIndex < root.lineBreaks ? offsetAfterLineBreak(root, lineIndex) : root.length;
  const endOffsetExclusive = lineIndex < root.lineBreaks
    ? Math.max(startOffset, afterBreak - lineTerminatorLength(root, afterBreak))
    : afterBreak;
  return {
    lineIndex,
    startOffset,
    endOffsetExclusive,
    text: textDocumentSlice(document, startOffset, endOffsetExclusive)
  };
}

/**
 * Iterates logical lines in source order without repeated indexed tree lookups.
 * @beta
 */
export function textDocumentLines(document: TextDocument): Iterable<TextDocumentLine> {
  const root = dataFor(document).root;
  return Object.freeze({
    [Symbol.iterator]: () => iterateDocumentLines(root),
  });
}

export function textDocumentLineIndexAtOffset(document: TextDocument, offset: number): number {
  const root = dataFor(document).root;
  return lineBreaksBefore(root, clampOffset(offset, root.length));
}

export function normalizeTextDocumentOffset(document: TextDocument, offset: number): number {
  const length = textDocumentLength(document);
  const bounded = clampOffset(offset, length);
  if (bounded > 0 && bounded < length && textDocumentSlice(document, bounded - 1, bounded + 1) === '\r\n') {
    return bounded - 1;
  }
  const lineIndex = textDocumentLineIndexAtOffset(document, bounded);
  const line = textDocumentLineAt(document, lineIndex);
  if (line === undefined || bounded > line.endOffsetExclusive) return bounded;
  return line.startOffset + normalizeTextCursor(line.text, bounded - line.startOffset);
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
  return Object.freeze({
    offset: normalizeTextDocumentOffset(document, position.offset),
    affinity: position.affinity
  });
}

export function normalizeTextCaret(document: TextDocument, caret: TextCaret): TextCaret {
  const position = normalizeTextPosition(document, caret.position);
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
  if (selection === undefined) return undefined;
  const anchor = normalizeTextPosition(document, selection.anchor);
  const focus = normalizeTextPosition(document, selection.focus);
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
  if (changes.length === 0) return document;
  const effective = changes.filter((change) => (
    change.insertedText !== textDocumentSlice(
      document,
      change.startOffset,
      change.endOffsetExclusive,
    )
  ));
  if (effective.length === 0) return document;
  let sourceOffset = 0;
  let remainder = dataFor(document).root;
  let result: TextChunkNode = EMPTY_LEAF;
  for (const change of effective) {
    const [unchanged, afterUnchanged] = splitChunks(
      remainder,
      change.startOffset - sourceOffset,
    );
    const [, afterChange] = splitChunks(
      afterUnchanged,
      change.endOffsetExclusive - change.startOffset,
    );
    result = joinChunks(result, unchanged);
    result = joinChunks(result, treeFromText(change.insertedText));
    remainder = afterChange;
    sourceOffset = change.endOffsetExclusive;
  }
  result = compactFragmentedChunks(joinChunks(result, remainder));
  return createDocument(
    result,
    document,
    Object.freeze(effective.map((change) => Object.freeze({ ...change }))),
  );
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
    ...(previousDocument === undefined || changes === undefined ? {} : {
      previousMutation: Object.freeze({
        previousDocument: new WeakRef(previousDocument),
        changes,
      }),
    }),
  }));
  return document;
}

function treeFromText(text: string): TextChunkNode {
  if (text.length === 0) return EMPTY_LEAF;
  const leaves: TextChunkNode[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(text.length, start + MAX_CHUNK_LENGTH);
    if (end < text.length && isLowSurrogate(text.charCodeAt(end))) end -= 1;
    leaves.push(leaf(text.slice(start, end)));
    start = end;
  }
  return balancedTree(leaves, 0, leaves.length);
}

function balancedTree(
  nodes: readonly TextChunkNode[],
  startIndex: number,
  endIndexExclusive: number,
): TextChunkNode {
  const count = endIndexExclusive - startIndex;
  if (count <= 0) return EMPTY_LEAF;
  if (count === 1) return nodes[startIndex] ?? EMPTY_LEAF;
  const middle = startIndex + Math.floor(count / 2);
  return branch(
    balancedTree(nodes, startIndex, middle),
    balancedTree(nodes, middle, endIndexExclusive)
  );
}

function leaf(text: string): TextChunkLeaf {
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
    endsWithCr: text.charCodeAt(text.length - 1) === 13,
    terminalTextSafe: isTerminalTextSafe(text),
    terminalControlTextSafe: isTerminalControlTextSafe(text),
    height: 1
  });
}

function branch(left: TextChunkNode, right: TextChunkNode): TextChunkNode {
  if (left.length === 0) return right;
  if (right.length === 0) return left;
  return Object.freeze({
    kind: 'branch',
    left,
    right,
    length: left.length + right.length,
    bytes: left.bytes + right.bytes,
    lineBreaks: left.lineBreaks + right.lineBreaks
      - Number(left.endsWithCr && right.startsWithLf),
    chunkCount: left.chunkCount + right.chunkCount,
    startsWithLf: left.startsWithLf,
    endsWithCr: right.endsWithCr,
    terminalTextSafe: left.terminalTextSafe && right.terminalTextSafe,
    terminalControlTextSafe: left.terminalControlTextSafe && right.terminalControlTextSafe,
    height: Math.max(left.height, right.height) + 1
  });
}

function joinChunks(left: TextChunkNode, right: TextChunkNode): TextChunkNode {
  if (left.length === 0) return right;
  if (right.length === 0) return left;
  const leftBoundary = rightmostLeaf(left);
  const rightBoundary = leftmostLeaf(right);
  if (
    leftBoundary.length + rightBoundary.length <= MAX_CHUNK_LENGTH
    && leftBoundary.length === rightBoundary.length
  ) {
    // Equal-size joining acts like a binary carry. It prevents one-character
    // appends from copying a growing boundary chunk on every edit while still
    // keeping the number of retained chunks proportional to document length.
    const removedLeft = removeRightmostLeaf(left);
    const removedRight = removeLeftmostLeaf(right);
    const boundary = boundaryChunks(leftBoundary.text + rightBoundary.text);
    return joinChunks(joinChunks(removedLeft, boundary), removedRight);
  }
  return joinBalancedChunks(left, right);
}

function joinBalancedChunks(left: TextChunkNode, right: TextChunkNode): TextChunkNode {
  if (left.length === 0) return right;
  if (right.length === 0) return left;
  if (left.kind === 'leaf' && right.kind === 'leaf'
    && left.length + right.length <= MAX_CHUNK_LENGTH) {
    return leaf(left.text + right.text);
  }
  if (left.height > right.height + 1 && left.kind === 'branch') {
    return balanceChunks(left.left, joinBalancedChunks(left.right, right));
  }
  if (right.height > left.height + 1 && right.kind === 'branch') {
    return balanceChunks(joinBalancedChunks(left, right.left), right.right);
  }
  return balanceChunks(left, right);
}

function balanceChunks(left: TextChunkNode, right: TextChunkNode): TextChunkNode {
  if (left.height > right.height + 1 && left.kind === 'branch') {
    if (left.left.height >= left.right.height) return branch(left.left, branch(left.right, right));
    if (left.right.kind === 'branch') {
      return branch(branch(left.left, left.right.left), branch(left.right.right, right));
    }
  }
  if (right.height > left.height + 1 && right.kind === 'branch') {
    if (right.right.height >= right.left.height) return branch(branch(left, right.left), right.right);
    if (right.left.kind === 'branch') {
      return branch(branch(left, right.left.left), branch(right.left.right, right.right));
    }
  }
  return branch(left, right);
}

function splitChunks(
  node: TextChunkNode,
  offset: number,
): readonly [TextChunkNode, TextChunkNode] {
  const bounded = clampOffset(offset, node.length);
  if (bounded === 0) return [EMPTY_LEAF, node];
  if (bounded === node.length) return [node, EMPTY_LEAF];
  if (node.kind === 'leaf') return [leaf(node.text.slice(0, bounded)), leaf(node.text.slice(bounded))];
  if (bounded < node.left.length) {
    const [before, after] = splitChunks(node.left, bounded);
    return [before, joinBalancedChunks(after, node.right)];
  }
  const [before, after] = splitChunks(node.right, bounded - node.left.length);
  return [joinBalancedChunks(node.left, before), after];
}

function collectSlice(
  node: TextChunkNode,
  startOffset: number,
  endOffsetExclusive: number,
  output: string[],
): void {
  if (startOffset >= endOffsetExclusive || endOffsetExclusive <= 0 || startOffset >= node.length) return;
  if (node.kind === 'leaf') {
    output.push(node.text.slice(
      Math.max(0, startOffset),
      Math.min(node.length, endOffsetExclusive)
    ));
    return;
  }
  collectSlice(node.left, startOffset, Math.min(endOffsetExclusive, node.left.length), output);
  collectSlice(
    node.right,
    startOffset - node.left.length,
    endOffsetExclusive - node.left.length,
    output
  );
}

function* iterateDocumentLines(root: TextChunkNode): Generator<TextDocumentLine> {
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
    for (; index < text.length; index += 1) {
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

function lineBreaksBefore(node: TextChunkNode, offset: number): number {
  const bounded = clampOffset(offset, node.length);
  if (bounded === 0) return 0;
  return prefixLineBreakCount(node, bounded)
    - Number(
      characterCodeAt(node, bounded - 1) === 13
      && characterCodeAt(node, bounded) === 10,
    );
}

function prefixLineBreakCount(node: TextChunkNode, offset: number): number {
  if (offset >= node.length) return node.lineBreaks;
  if (node.kind === 'leaf') {
    let lineBreaks = 0;
    let previousWasCr = false;
    for (let index = 0; index < Math.max(0, offset); index += 1) {
      const code = node.text.charCodeAt(index);
      if (code === 13) lineBreaks += 1;
      else if (code === 10 && !previousWasCr) lineBreaks += 1;
      previousWasCr = code === 13;
    }
    return lineBreaks;
  }
  if (offset <= node.left.length) return prefixLineBreakCount(node.left, offset);
  const rightOffset = offset - node.left.length;
  return node.left.lineBreaks
    + prefixLineBreakCount(node.right, rightOffset)
    - Number(node.left.endsWithCr && node.right.startsWithLf && rightOffset > 0);
}

function offsetAfterLineBreak(node: TextChunkNode, breakIndex: number): number {
  let low = 1;
  let high = node.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (lineBreaksBefore(node, middle) > breakIndex) high = middle;
    else low = middle + 1;
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

function leftmostLeaf(node: TextChunkNode): TextChunkLeaf {
  let current = node;
  while (current.kind === 'branch') current = current.left;
  return current;
}

function rightmostLeaf(node: TextChunkNode): TextChunkLeaf {
  let current = node;
  while (current.kind === 'branch') current = current.right;
  return current;
}

function removeLeftmostLeaf(node: TextChunkNode): TextChunkNode {
  if (node.kind === 'leaf') return EMPTY_LEAF;
  return joinBalancedChunks(removeLeftmostLeaf(node.left), node.right);
}

function removeRightmostLeaf(node: TextChunkNode): TextChunkNode {
  if (node.kind === 'leaf') return EMPTY_LEAF;
  return joinBalancedChunks(node.left, removeRightmostLeaf(node.right));
}

function boundaryChunks(text: string): TextChunkNode {
  if (text.length <= MAX_CHUNK_LENGTH) return leaf(text);
  let middle = Math.floor(text.length / 2);
  if (isLowSurrogate(text.charCodeAt(middle))) middle -= 1;
  return branch(leaf(text.slice(0, middle)), leaf(text.slice(middle)));
}

function compactFragmentedChunks(root: TextChunkNode): TextChunkNode {
  const maximumChunkCount = Math.max(
    64,
    Math.ceil(root.length / MIN_CHUNK_LENGTH),
  );
  if (root.chunkCount <= maximumChunkCount) return root;
  const parts: string[] = [];
  collectSlice(root, 0, root.length, parts);
  return treeFromText(parts.join(''));
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

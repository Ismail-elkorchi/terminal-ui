import { normalizeTextCursor } from './text-range.ts';
import { isTerminalTextSafe } from './sanitize.ts';
import type { TextCaret, TextDocumentSelection, TextPosition, TextSelection } from './types.ts';

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

type PieceNode = PieceLeaf | PieceBranch;

interface PieceMetrics {
  readonly length: number;
  readonly bytes: number;
  readonly lineBreaks: number;
  readonly terminalTextSafe: boolean;
  readonly height: number;
}

interface PieceLeaf extends PieceMetrics {
  readonly kind: 'leaf';
  readonly text: string;
}

interface PieceBranch extends PieceMetrics {
  readonly kind: 'branch';
  readonly left: PieceNode;
  readonly right: PieceNode;
}

interface TextDocumentData {
  readonly root: PieceNode;
  readonly parent?: TextDocument;
  readonly change?: Omit<TextDocumentMutation, 'document'>;
}

const EMPTY_LEAF: PieceLeaf = Object.freeze({
  kind: 'leaf',
  text: '',
  length: 0,
  bytes: 0,
  lineBreaks: 0,
  terminalTextSafe: true,
  height: 1
});
const MAX_INITIAL_PIECE_LENGTH = 4_096;
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
  const [before, remainder] = split(root, start);
  const [, after] = split(remainder, end - start);
  const next = concat(concat(before, treeFromText(insertion)), after);
  return {
    document: createDocument(next, document, {
      replaced: { startOffset: start, endOffsetExclusive: end },
      insertedLength: insertion.length,
    }),
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
    ? Math.max(startOffset, afterBreak - 1)
    : afterBreak;
  return {
    lineIndex,
    startOffset,
    endOffsetExclusive,
    text: textDocumentSlice(document, startOffset, endOffsetExclusive)
  };
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

export function textDocumentParentChange(document: TextDocument): {
  readonly parent: TextDocument;
  readonly replaced: { readonly startOffset: number; readonly endOffsetExclusive: number };
  readonly insertedLength: number;
} | undefined {
  const data = dataFor(document);
  return data.parent === undefined || data.change === undefined
    ? undefined
    : { parent: data.parent, ...data.change };
}

function createDocument(
  root: PieceNode,
  parent?: TextDocument,
  change?: Omit<TextDocumentMutation, 'document'>,
): TextDocument {
  const document = Object.freeze({}) as TextDocument;
  documents.set(document, Object.freeze({
    root,
    ...(parent === undefined ? {} : { parent }),
    ...(change === undefined ? {} : { change: Object.freeze({
      replaced: Object.freeze({ ...change.replaced }),
      insertedLength: change.insertedLength,
    }) }),
  }));
  return document;
}

function treeFromText(text: string): PieceNode {
  if (text.length === 0) return EMPTY_LEAF;
  const leaves: PieceNode[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(text.length, start + MAX_INITIAL_PIECE_LENGTH);
    if (end < text.length && isLowSurrogate(text.charCodeAt(end))) end -= 1;
    leaves.push(leaf(text.slice(start, end)));
    start = end;
  }
  return balancedTree(leaves, 0, leaves.length);
}

function balancedTree(nodes: readonly PieceNode[], startIndex: number, endIndexExclusive: number): PieceNode {
  const count = endIndexExclusive - startIndex;
  if (count <= 0) return EMPTY_LEAF;
  if (count === 1) return nodes[startIndex] ?? EMPTY_LEAF;
  const middle = startIndex + Math.floor(count / 2);
  return branch(
    balancedTree(nodes, startIndex, middle),
    balancedTree(nodes, middle, endIndexExclusive)
  );
}

function leaf(text: string): PieceLeaf {
  if (text.length === 0) return EMPTY_LEAF;
  let lineBreaks = 0;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code === 10) lineBreaks += 1;
  }
  return Object.freeze({
    kind: 'leaf',
    text,
    length: text.length,
    bytes: new TextEncoder().encode(text).byteLength,
    lineBreaks,
    terminalTextSafe: isTerminalTextSafe(text),
    height: 1
  });
}

function branch(left: PieceNode, right: PieceNode): PieceNode {
  if (left.length === 0) return right;
  if (right.length === 0) return left;
  return Object.freeze({
    kind: 'branch',
    left,
    right,
    length: left.length + right.length,
    bytes: left.bytes + right.bytes,
    lineBreaks: left.lineBreaks + right.lineBreaks,
    terminalTextSafe: left.terminalTextSafe && right.terminalTextSafe,
    height: Math.max(left.height, right.height) + 1
  });
}

function concat(left: PieceNode, right: PieceNode): PieceNode {
  if (left.length === 0) return right;
  if (right.length === 0) return left;
  if (left.height > right.height + 1 && left.kind === 'branch') {
    return balance(left.left, concat(left.right, right));
  }
  if (right.height > left.height + 1 && right.kind === 'branch') {
    return balance(concat(left, right.left), right.right);
  }
  return balance(left, right);
}

function balance(left: PieceNode, right: PieceNode): PieceNode {
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

function split(node: PieceNode, offset: number): readonly [PieceNode, PieceNode] {
  const bounded = clampOffset(offset, node.length);
  if (bounded === 0) return [EMPTY_LEAF, node];
  if (bounded === node.length) return [node, EMPTY_LEAF];
  if (node.kind === 'leaf') return [leaf(node.text.slice(0, bounded)), leaf(node.text.slice(bounded))];
  if (bounded < node.left.length) {
    const [before, after] = split(node.left, bounded);
    return [before, concat(after, node.right)];
  }
  const [before, after] = split(node.right, bounded - node.left.length);
  return [concat(node.left, before), after];
}

function collectSlice(node: PieceNode, startOffset: number, endOffsetExclusive: number, output: string[]): void {
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

function lineBreaksBefore(node: PieceNode, offset: number): number {
  if (offset <= 0) return 0;
  if (offset >= node.length) return node.lineBreaks;
  if (node.kind === 'leaf') {
    let count = 0;
    for (let index = 0; index < offset; index += 1) if (node.text.charCodeAt(index) === 10) count += 1;
    return count;
  }
  return offset <= node.left.length
    ? lineBreaksBefore(node.left, offset)
    : node.left.lineBreaks + lineBreaksBefore(node.right, offset - node.left.length);
}

function offsetAfterLineBreak(node: PieceNode, breakIndex: number): number {
  if (node.kind === 'leaf') {
    let current = 0;
    for (let index = 0; index < node.text.length; index += 1) {
      if (node.text.charCodeAt(index) !== 10) continue;
      if (current === breakIndex) return index + 1;
      current += 1;
    }
    return node.length;
  }
  return breakIndex < node.left.lineBreaks
    ? offsetAfterLineBreak(node.left, breakIndex)
    : node.left.length + offsetAfterLineBreak(node.right, breakIndex - node.left.lineBreaks);
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

import {
  createTerminalTextIndex,
  textDocumentLineAt,
  textDocumentLineCount,
  textDocumentLines,
  textWidthProfileKey,
} from '../../text/index.ts';
import { textDocumentPreviousMutation } from '../../text/document.ts';
import { textDocumentChangedLineRanges } from './text-document-change-ranges.ts';
import type { TerminalTextIndex, TextDocument, TextWidthProfile } from '../../text/index.ts';

export interface TextAreaLayoutLine {
  readonly text: string;
  readonly start: number;
  readonly rowIndex: number;
  readonly logicalLineIndex: number;
  readonly firstVisualLine: boolean;
  readonly index: TerminalTextIndex;
}

export interface TextAreaDocumentLayout {
  readonly contentRows: number;
  readonly intrinsicColumns: number;
  readonly contentColumns: number;
  lineAtRow(rowIndex: number): TextAreaLayoutLine | undefined;
  linesInRows(startRowIndex: number, endRowIndexExclusive: number): readonly TextAreaLayoutLine[];
  allRowStartOffsets(): readonly number[];
  cursorAt(
    displayOffset: number,
    affinity: 'upstream' | 'downstream',
  ): { readonly rowIndex: number; readonly columnCells: number };
}

interface VisualLineLayout {
  readonly text: string;
  readonly localStart: number;
  readonly firstVisualLine: boolean;
  readonly index: TerminalTextIndex;
}

interface LogicalLineLayout {
  readonly text: string;
  readonly intrinsicColumns: number;
  readonly visualLines: readonly VisualLineLayout[];
}

interface LayoutNode {
  readonly line: LogicalLineLayout;
  readonly left?: LayoutNode;
  readonly right?: LayoutNode;
  readonly height: number;
  readonly lineCount: number;
  readonly rowCount: number;
  readonly codeUnits: number;
  readonly intrinsicColumns: number;
}

interface LogicalLinePosition {
  readonly line: LogicalLineLayout;
  readonly logicalLineIndex: number;
  readonly startOffset: number;
  readonly startRowIndex: number;
}

const layoutCaches = new WeakMap<TextDocument, Map<string, TextAreaDocumentLayout>>();
const sharedLineLayouts = new Map<string, LogicalLineLayout>();
const sharedLineMaximumTextLength = 4_096;
const sharedLineWeightLimit = 1_048_576;
let sharedLineWeight = 0;

export function layoutTextAreaDocument(
  document: TextDocument,
  width: number,
  wrap: boolean,
  widthProfile: TextWidthProfile,
): TextAreaDocumentLayout {
  const normalizedWidth = Math.max(0, Math.floor(width));
  const key = `${wrap ? 'wrap' : 'single'}:${String(normalizedWidth)}:${
    textWidthProfileKey(widthProfile)
  }`;
  const cache = layoutCaches.get(document) ?? new Map<string, TextAreaDocumentLayout>();
  const cached = cache.get(key);
  if (cached !== undefined) {
    cache.delete(key);
    cache.set(key, cached);
    return cached;
  }
  const root = updatedLayoutRoot(document, normalizedWidth, wrap, widthProfile, key);
  const created = createDocumentLayout(root, normalizedWidth, wrap);
  while (cache.size >= 8) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
  cache.set(key, created);
  layoutCaches.set(document, cache);
  return created;
}

function updatedLayoutRoot(
  document: TextDocument,
  width: number,
  wrap: boolean,
  widthProfile: TextWidthProfile,
  key: string,
): LayoutNode | undefined {
  const lineCount = textDocumentLineCount(document);
  const mutation = textDocumentPreviousMutation(document);
  const previousLayout = mutation === undefined
    ? undefined
    : layoutCaches.get(mutation.document)?.get(key);
  const previousRoot = previousLayout === undefined ? undefined : layoutRoot(previousLayout);
  if (mutation === undefined || previousRoot === undefined) {
    return buildLayoutRange(document, 0, lineCount, width, wrap, widthProfile);
  }
  const changedLineRanges = textDocumentChangedLineRanges(
    mutation.document,
    document,
    mutation.changes,
  );
  if (changedLineRanges.length === 0) {
    return buildLayoutRange(document, 0, lineCount, width, wrap, widthProfile);
  }
  let updated: LayoutNode | undefined = previousRoot;
  for (let index = changedLineRanges.length - 1; index >= 0; index -= 1) {
    const range = changedLineRanges[index];
    if (range === undefined) continue;
    const [prefix, changedAndSuffix] = splitLayout(updated, range.previousStart);
    const [, suffix] = splitLayout(
      changedAndSuffix,
      range.previousEndExclusive - range.previousStart,
    );
    const changed = buildLayoutRange(
      document,
      range.nextStart,
      Math.min(lineCount, range.nextEndExclusive),
      width,
      wrap,
      widthProfile,
    );
    updated = joinLayouts(joinLayouts(prefix, changed), suffix);
  }
  return nodeLineCount(updated) === lineCount
    ? updated
    : buildLayoutRange(document, 0, lineCount, width, wrap, widthProfile);
}

const layoutRoots = new WeakMap<TextAreaDocumentLayout, LayoutNode | undefined>();

function createDocumentLayout(
  root: LayoutNode | undefined,
  width: number,
  wrap: boolean,
): TextAreaDocumentLayout {
  const contentRows = nodeRowCount(root);
  const intrinsicColumns = nodeIntrinsicColumns(root);
  const layout: TextAreaDocumentLayout = Object.freeze({
    contentRows,
    intrinsicColumns,
    contentColumns: wrap ? Math.min(intrinsicColumns, width) : intrinsicColumns,
    lineAtRow: (rowIndex: number) => lineAtRow(root, rowIndex),
    linesInRows: (startRowIndex: number, endRowIndexExclusive: number) => {
      const start = Math.max(0, Math.floor(startRowIndex));
      const end = Math.min(contentRows, Math.max(start, Math.floor(endRowIndexExclusive)));
      const lines: TextAreaLayoutLine[] = [];
      for (let row = start; row < end; row += 1) {
        const line = lineAtRow(root, row);
        if (line !== undefined) lines.push(line);
      }
      return Object.freeze(lines);
    },
    allRowStartOffsets: () => {
      const offsets: number[] = [];
      for (let row = 0; row < contentRows; row += 1) {
        const line = lineAtRow(root, row);
        if (line !== undefined) offsets.push(line.start);
      }
      return Object.freeze(offsets);
    },
    cursorAt: (displayOffset: number, affinity: 'upstream' | 'downstream') => (
      cursorAt(root, displayOffset, affinity)
    ),
  });
  layoutRoots.set(layout, root);
  return layout;
}

function layoutRoot(layout: TextAreaDocumentLayout): LayoutNode | undefined {
  return layoutRoots.get(layout);
}

function buildLayoutRange(
  document: TextDocument,
  startLineIndex: number,
  endLineIndexExclusive: number,
  width: number,
  wrap: boolean,
  widthProfile: TextWidthProfile,
): LayoutNode | undefined {
  const lines: LogicalLineLayout[] = [];
  if (startLineIndex === 0 && endLineIndexExclusive === textDocumentLineCount(document)) {
    for (const line of textDocumentLines(document)) {
      lines.push(layoutLogicalLine(line.text, width, wrap, widthProfile));
    }
    return buildBalancedLayout(lines, 0, lines.length);
  }
  for (let lineIndex = startLineIndex; lineIndex < endLineIndexExclusive; lineIndex += 1) {
    const line = textDocumentLineAt(document, lineIndex);
    if (line !== undefined) lines.push(layoutLogicalLine(line.text, width, wrap, widthProfile));
  }
  return buildBalancedLayout(lines, 0, lines.length);
}

function buildBalancedLayout(
  lines: readonly LogicalLineLayout[],
  start: number,
  end: number,
): LayoutNode | undefined {
  if (start >= end) return undefined;
  const middle = Math.floor((start + end) / 2);
  const line = lines[middle];
  if (line === undefined) return undefined;
  return layoutNode(
    line,
    buildBalancedLayout(lines, start, middle),
    buildBalancedLayout(lines, middle + 1, end),
  );
}

function layoutNode(
  line: LogicalLineLayout,
  left?: LayoutNode,
  right?: LayoutNode,
): LayoutNode {
  const leftCount = nodeLineCount(left);
  const rightCount = nodeLineCount(right);
  return Object.freeze({
    line,
    ...(left === undefined ? {} : { left }),
    ...(right === undefined ? {} : { right }),
    height: Math.max(nodeHeight(left), nodeHeight(right)) + 1,
    lineCount: leftCount + rightCount + 1,
    rowCount: nodeRowCount(left) + line.visualLines.length + nodeRowCount(right),
    codeUnits: nodeCodeUnits(left)
      + Number(leftCount > 0)
      + line.text.length
      + Number(rightCount > 0)
      + nodeCodeUnits(right),
    intrinsicColumns: Math.max(
      line.intrinsicColumns,
      nodeIntrinsicColumns(left),
      nodeIntrinsicColumns(right),
    ),
  });
}

function splitLayout(
  node: LayoutNode | undefined,
  lineIndex: number,
): readonly [LayoutNode | undefined, LayoutNode | undefined] {
  if (node === undefined) return [undefined, undefined];
  const bounded = Math.max(0, Math.min(node.lineCount, lineIndex));
  if (bounded === 0) return [undefined, node];
  if (bounded === node.lineCount) return [node, undefined];
  const leftCount = nodeLineCount(node.left);
  if (bounded <= leftCount) {
    const [before, after] = splitLayout(node.left, bounded);
    return [before, joinLayouts(after, layoutNode(node.line, undefined, node.right))];
  }
  const [before, after] = splitLayout(node.right, bounded - leftCount - 1);
  return [joinLayouts(layoutNode(node.line, node.left), before), after];
}

function joinLayouts(
  left: LayoutNode | undefined,
  right: LayoutNode | undefined,
): LayoutNode | undefined {
  if (left === undefined) return right;
  if (right === undefined) return left;
  if (nodeHeight(left) > nodeHeight(right) + 1) {
    return balanceLayout(layoutNode(left.line, left.left, joinLayouts(left.right, right)));
  }
  if (nodeHeight(right) > nodeHeight(left) + 1) {
    return balanceLayout(layoutNode(right.line, joinLayouts(left, right.left), right.right));
  }
  const removed = removeMinimumLayout(right);
  return balanceLayout(layoutNode(removed.line, left, removed.root));
}

function removeMinimumLayout(node: LayoutNode): {
  readonly line: LogicalLineLayout;
  readonly root?: LayoutNode;
} {
  if (node.left === undefined) {
    return { line: node.line, ...(node.right === undefined ? {} : { root: node.right }) };
  }
  const removed = removeMinimumLayout(node.left);
  return {
    line: removed.line,
    root: balanceLayout(layoutNode(node.line, removed.root, node.right)),
  };
}

function balanceLayout(node: LayoutNode): LayoutNode {
  const balance = nodeHeight(node.left) - nodeHeight(node.right);
  if (balance > 1 && node.left !== undefined) {
    const left = nodeHeight(node.left.left) < nodeHeight(node.left.right)
      ? rotateLayoutLeft(node.left)
      : node.left;
    return rotateLayoutRight(layoutNode(node.line, left, node.right));
  }
  if (balance < -1 && node.right !== undefined) {
    const right = nodeHeight(node.right.right) < nodeHeight(node.right.left)
      ? rotateLayoutRight(node.right)
      : node.right;
    return rotateLayoutLeft(layoutNode(node.line, node.left, right));
  }
  return node;
}

function rotateLayoutLeft(node: LayoutNode): LayoutNode {
  const right = node.right;
  if (right === undefined) return node;
  return layoutNode(
    right.line,
    layoutNode(node.line, node.left, right.left),
    right.right,
  );
}

function rotateLayoutRight(node: LayoutNode): LayoutNode {
  const left = node.left;
  if (left === undefined) return node;
  return layoutNode(
    left.line,
    left.left,
    layoutNode(node.line, left.right, node.right),
  );
}

function lineAtRow(root: LayoutNode | undefined, rowIndex: number): TextAreaLayoutLine | undefined {
  if (!Number.isSafeInteger(rowIndex) || rowIndex < 0 || rowIndex >= nodeRowCount(root)) return undefined;
  let node = root;
  let precedingLines = 0;
  let precedingRows = 0;
  let precedingCodeUnits = 0;
  while (node !== undefined) {
    const leftLines = nodeLineCount(node.left);
    const leftRows = nodeRowCount(node.left);
    const lineStartRow = precedingRows + leftRows;
    const lineEndRow = lineStartRow + node.line.visualLines.length;
    const lineStartOffset = precedingCodeUnits
      + nodeCodeUnits(node.left)
      + Number(leftLines > 0);
    if (rowIndex < lineStartRow) {
      node = node.left;
      continue;
    }
    if (rowIndex < lineEndRow) {
      const visual = node.line.visualLines[rowIndex - lineStartRow];
      return visual === undefined ? undefined : Object.freeze({
        text: visual.text,
        start: lineStartOffset + visual.localStart,
        rowIndex,
        logicalLineIndex: precedingLines + leftLines,
        firstVisualLine: visual.firstVisualLine,
        index: visual.index,
      });
    }
    precedingLines += leftLines + 1;
    precedingRows = lineEndRow;
    precedingCodeUnits = lineStartOffset + node.line.text.length + 1;
    node = node.right;
  }
  return undefined;
}

function logicalLineAtOffset(
  root: LayoutNode | undefined,
  displayOffset: number,
): LogicalLinePosition | undefined {
  let node = root;
  let precedingLines = 0;
  let precedingRows = 0;
  let precedingCodeUnits = 0;
  const bounded = Math.max(0, Math.min(nodeCodeUnits(root), Math.floor(displayOffset)));
  while (node !== undefined) {
    const leftLines = nodeLineCount(node.left);
    const lineStartOffset = precedingCodeUnits
      + nodeCodeUnits(node.left)
      + Number(leftLines > 0);
    const lineEndOffset = lineStartOffset + node.line.text.length;
    if (bounded < lineStartOffset) {
      node = node.left;
      continue;
    }
    if (bounded <= lineEndOffset || node.right === undefined) {
      return {
        line: node.line,
        logicalLineIndex: precedingLines + leftLines,
        startOffset: lineStartOffset,
        startRowIndex: precedingRows + nodeRowCount(node.left),
      };
    }
    precedingLines += leftLines + 1;
    precedingRows += nodeRowCount(node.left) + node.line.visualLines.length;
    precedingCodeUnits = lineEndOffset + 1;
    node = node.right;
  }
  return undefined;
}

function cursorAt(
  root: LayoutNode | undefined,
  displayOffset: number,
  affinity: 'upstream' | 'downstream',
): { readonly rowIndex: number; readonly columnCells: number } {
  const position = logicalLineAtOffset(root, displayOffset);
  if (position === undefined) return { rowIndex: 0, columnCells: 0 };
  const localOffset = Math.max(
    0,
    Math.min(position.line.text.length, displayOffset - position.startOffset),
  );
  let low = 0;
  let high = position.line.visualLines.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if ((position.line.visualLines[middle]?.localStart ?? Number.POSITIVE_INFINITY) <= localOffset) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  let visualIndex = Math.max(0, low - 1);
  const visual = position.line.visualLines[visualIndex];
  if (
    affinity === 'upstream'
    && visualIndex > 0
    && visual?.localStart === localOffset
  ) visualIndex -= 1;
  const selected = position.line.visualLines[visualIndex];
  if (selected === undefined) return { rowIndex: position.startRowIndex, columnCells: 0 };
  const localVisualOffset = Math.max(
    0,
    Math.min(selected.text.length, localOffset - selected.localStart),
  );
  const grapheme = selected.index.codeUnitOffsetToGraphemeIndex(localVisualOffset);
  return {
    rowIndex: position.startRowIndex + visualIndex,
    columnCells: selected.index.graphemeIndexToVisualColumn(grapheme),
  };
}

function layoutLogicalLine(
  text: string,
  width: number,
  wrap: boolean,
  widthProfile: TextWidthProfile,
): LogicalLineLayout {
  const cacheKey = text.length <= sharedLineMaximumTextLength
    ? `${wrap ? 'wrap' : 'single'}:${String(width)}:${textWidthProfileKey(widthProfile)}\u0000${text}`
    : undefined;
  const cached = cacheKey === undefined ? undefined : sharedLineLayouts.get(cacheKey);
  if (cacheKey !== undefined && cached !== undefined) {
    sharedLineLayouts.delete(cacheKey);
    sharedLineLayouts.set(cacheKey, cached);
    return cached;
  }
  const index = createTerminalTextIndex(text, { widthProfile });
  if (!wrap || width <= 0 || index.cells <= width || text === '') {
    return retainSharedLineLayout(cacheKey, Object.freeze({
      text,
      intrinsicColumns: index.cells,
      visualLines: Object.freeze([{ text, localStart: 0, firstVisualLine: true, index }]),
    }));
  }
  const visualLines: VisualLineLayout[] = [];
  let visualColumn = 0;
  while (visualColumn < index.cells) {
    const startGrapheme = index.visualColumnToGraphemeIndex(visualColumn);
    const endGrapheme = Math.max(
      startGrapheme + 1,
      index.visualColumnToGraphemeIndex(visualColumn + width),
    );
    const startOffset = index.graphemeIndexToCodeUnitOffset(startGrapheme);
    const endOffset = index.graphemeIndexToCodeUnitOffset(endGrapheme);
    const visualText = text.slice(startOffset, endOffset);
    visualLines.push(Object.freeze({
      text: visualText,
      localStart: startOffset,
      firstVisualLine: startOffset === 0,
      index: createTerminalTextIndex(visualText, { widthProfile }),
    }));
    visualColumn = index.graphemeIndexToVisualColumn(endGrapheme);
    if (endOffset >= text.length) break;
  }
  return retainSharedLineLayout(cacheKey, Object.freeze({
    text,
    intrinsicColumns: index.cells,
    visualLines: Object.freeze(visualLines),
  }));
}

function retainSharedLineLayout(
  key: string | undefined,
  layout: LogicalLineLayout,
): LogicalLineLayout {
  if (key === undefined) return layout;
  sharedLineLayouts.set(key, layout);
  sharedLineWeight += key.length;
  while (sharedLineWeight > sharedLineWeightLimit) {
    const oldest = sharedLineLayouts.keys().next().value;
    if (oldest === undefined) break;
    sharedLineLayouts.delete(oldest);
    sharedLineWeight -= oldest.length;
  }
  return layout;
}

function nodeHeight(node: LayoutNode | undefined): number {
  return node?.height ?? 0;
}

function nodeLineCount(node: LayoutNode | undefined): number {
  return node?.lineCount ?? 0;
}

function nodeRowCount(node: LayoutNode | undefined): number {
  return node?.rowCount ?? 0;
}

function nodeCodeUnits(node: LayoutNode | undefined): number {
  return node?.codeUnits ?? 0;
}

function nodeIntrinsicColumns(node: LayoutNode | undefined): number {
  return node?.intrinsicColumns ?? 0;
}

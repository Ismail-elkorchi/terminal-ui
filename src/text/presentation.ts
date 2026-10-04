import { measureTextCells } from './measure.ts';
import { sanitizeTerminalCellText, sanitizeTerminalCellTextWork } from './sanitize.ts';
import type { GraphemeSegment, TextPosition, TextWidthProfile, TextPresentation, TextVisualCluster, TextVisualOrderProvider, VisualGraphemeSegment, TextParagraphContext } from './types.ts';

export type { TextPresentation, TextVisualOrderRequest, TextVisualCluster, TextVisualOrderProvider, VisualGraphemeSegment, TextParagraphContext } from './types.ts';

export interface TextVisualMap {
  readonly graphemes: readonly VisualGraphemeSegment[];
  columnAt(position: TextPosition): number;
  positionAt(column: number): TextPosition;
  move(position: TextPosition, delta: -1 | 1): TextPosition;
}

const presentationIds = new WeakMap<TextPresentation, number>();
let nextPresentationId = 1;

/** Identity enters layout/paint caches: different providers cannot share geometry. */
export function textPresentationKey(presentation: TextPresentation | undefined): string {
  if (presentation === undefined) return 'logical';
  let id = presentationIds.get(presentation);
  if (id === undefined) { id = nextPresentationId++; presentationIds.set(presentation, id); }
  return `visual:${String(id)}`;
}

export function* createTextVisualMapWork(
  text: string,
  logical: readonly GraphemeSegment[],
  widthProfile: TextWidthProfile,
  presentation: TextPresentation | undefined,
  paragraph?: TextParagraphContext,
): Generator<number, TextVisualMap> {
  const start = paragraph?.startOffset ?? 0;
  const paragraphText = paragraph?.text ?? text;
  if (!Number.isSafeInteger(start) || start < 0 || paragraphText.slice(start, start + text.length) !== text) {
    throw new TypeError('Text paragraph context must contain the indexed logical text at its start offset.');
  }
  if (presentation !== undefined && (yield* sanitizeTerminalCellTextWork(text, { widthProfile })).text !== text) {
    throw new TypeError('Text presentation requires printable cell text.');
  }
  const byStart = new Map<number, GraphemeSegment>();
  const requested: GraphemeSegment[] = [];
  const identity: TextVisualCluster[] = [];
  let work = 0;
  for (const g of logical) {
    byStart.set(g.startOffset + start, g);
    const cluster = Object.freeze({ ...g, startOffset: g.startOffset + start, endOffsetExclusive: g.endOffsetExclusive + start });
    requested.push(cluster);
    if (presentation === undefined) identity.push({ ...cluster, direction: 'ltr' });
    work += 1;
    if (work >= 256) { yield work; work = 0; }
  }
  if (work > 0) yield work;
  const mapped = presentation === undefined
    ? identity
    : presentation.map(Object.freeze({ text: paragraphText, startOffset: start,
      endOffsetExclusive: start + text.length, widthProfile, graphemes: Object.freeze(requested) }));
  // The callback and scalar-only return adoption are one indivisible boundary.
  // No borrowed provider arrays or property descriptors survive a checkpoint.
  if (!Array.isArray(mapped)) throw new TypeError('Text presentation must return a visual cluster array.');
  const clusters = ownVisualClusters(mapped, logical.length);
  let column = 0;
  const graphemes: VisualGraphemeSegment[] = [];
  const source = new Map<number, VisualGraphemeSegment>();
  const ends = new Map<number, VisualGraphemeSegment>();
  work = 0;
  for (const cluster of clusters) {
    const original = validateVisualCluster(cluster, byStart.get(cluster.startOffset), start, widthProfile);
    byStart.delete(cluster.startOffset);
    const result = Object.freeze({ text: cluster.text, startOffset: original.startOffset,
      endOffsetExclusive: original.endOffsetExclusive, cells: original.cells,
      direction: cluster.direction, column, endColumnExclusive: column + original.cells });
    column += original.cells;
    graphemes.push(result);
    source.set(result.startOffset, result);
    ends.set(result.endOffsetExclusive, result);
    work += 1;
    if (work >= 256) { yield work; work = 0; }
  }
  if (work > 0) yield work;
  if (byStart.size !== 0) throw new TypeError('Text presentation changed during preparation and omitted logical graphemes.');
  Object.freeze(graphemes);
  const before = (g: VisualGraphemeSegment): TextPosition => g.direction === 'ltr'
    ? { offset: g.startOffset, affinity: 'downstream' } : { offset: g.endOffsetExclusive, affinity: 'upstream' };
  const after = (g: VisualGraphemeSegment): TextPosition => g.direction === 'ltr'
    ? { offset: g.endOffsetExclusive, affinity: 'upstream' } : { offset: g.startOffset, affinity: 'downstream' };
  const columnAt = (position: TextPosition): number => {
    const downstream = source.get(position.offset);
    const upstream = ends.get(position.offset);
    const g = position.affinity === 'upstream' ? upstream ?? downstream : downstream ?? upstream;
    if (g === undefined) return 0;
    const atStart = g.startOffset === position.offset;
    return atStart === (g.direction === 'ltr') ? g.column : g.endColumnExclusive;
  };
  // Edge lookup and arrows are logarithmic even on an unwrapped long paragraph.
  const firstEndingAfter = (column: number): number => {
    let low = 0;
    let high = graphemes.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if ((graphemes[middle]?.endColumnExclusive ?? 0) <= column) low = middle + 1;
      else high = middle;
    }
    return low;
  };
  const positionAt = (requested: number): TextPosition => {
    const target = Number.isFinite(requested) ? Math.max(0, requested) : 0;
    const current = graphemes[firstEndingAfter(target)];
    if (current !== undefined) return before(current);
    const last = graphemes.at(-1);
    return last === undefined ? { offset: 0, affinity: 'downstream' } : after(last);
  };
  return Object.freeze({ graphemes, columnAt, positionAt,
    move(position: TextPosition, delta: -1 | 1): TextPosition {
      const current = columnAt(position);
      if (delta > 0) {
        const g = graphemes[firstEndingAfter(current)];
        return g === undefined ? position : after(g);
      }
      let low = 0;
      let high = graphemes.length;
      while (low < high) {
        const middle = Math.floor((low + high) / 2);
        if ((graphemes[middle]?.column ?? 0) < current) low = middle + 1;
        else high = middle;
      }
      const g = graphemes[low - 1];
      return g === undefined ? position : before(g);
    },
  });
}

const adoptedPresentations = new WeakMap<TextPresentation, TextPresentation>();

export function defineTextPresentation(value: unknown): TextPresentation {
  if (typeof value !== 'object' || value === null || !('map' in value) || typeof value.map !== 'function') {
    throw new TypeError('Text presentation requires a visual-order mapping provider.');
  }
  const candidate = value as TextPresentation;
  const retained = adoptedPresentations.get(candidate);
  if (retained !== undefined) return retained;
  const adopted = Object.freeze({ map: value.map as TextVisualOrderProvider });
  adoptedPresentations.set(candidate, adopted);
  adoptedPresentations.set(adopted, adopted);
  return adopted;
}

function validDirection(value: unknown): value is 'ltr' | 'rtl' {
  return value === 'ltr' || value === 'rtl';
}

function validateVisualCluster(
  cluster: TextVisualCluster,
  original: GraphemeSegment | undefined,
  start: number,
  widthProfile: TextWidthProfile,
): GraphemeSegment {
  if (original === undefined || cluster.endOffsetExclusive !== original.endOffsetExclusive + start
    || !validDirection(cluster.direction) || typeof cluster.text !== 'string') {
    throw new TypeError('Text presentation must preserve a bijection of logical grapheme boundaries.');
  }
  if (cluster.text !== original.text) {
    if (cluster.text.length > original.text.length * 2 || scalarCount(cluster.text) !== scalarCount(original.text)) {
      throw new TypeError('Text presentation may mirror scalars but must not expand or contract grapheme contents.');
    }
    const measured = measureTextCells(cluster.text, { widthProfile });
    if (sanitizeTerminalCellText(cluster.text).text !== cluster.text
      || measured.graphemes.length !== 1 || measured.cells !== original.cells) {
      throw new TypeError('Text presentation must preserve printable grapheme cell widths.');
    }
  }
  return original;
}

function scalarCount(text: string): number {
  let count = 0;
  for (const scalar of text) { void scalar; count += 1; }
  return count;
}

function ownVisualClusters(supplied: readonly TextVisualCluster[], expected: number): readonly TextVisualCluster[] {
  if (supplied.length !== expected) throw new TypeError('Text presentation must return one visual cluster per logical grapheme.');
  const owned: TextVisualCluster[] = [];
  for (let index = 0; index < expected; index += 1) {
    const cluster = supplied[index];
    if (cluster === undefined) throw new TypeError('Text presentation must not contain missing visual clusters.');
    owned.push(Object.freeze({ startOffset: cluster.startOffset, endOffsetExclusive: cluster.endOffsetExclusive,
      text: cluster.text, direction: cluster.direction }));
  }
  return Object.freeze(owned);
}

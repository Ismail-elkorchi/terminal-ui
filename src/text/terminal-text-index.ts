import { finishWork } from '../foundation/cooperative-work.ts';
import { createTextVisualMapWork, textPresentationKey } from './presentation.ts';
import { reserveSourcePreparation, sourceBoundaries, sourceBoundariesForOwner } from './source-boundaries.ts';
import type { SourceBoundaryIndex } from './source-boundaries.ts';
import { segmentGraphemesForMeasurement } from './graphemes.ts';
import { sourceGeometry } from './source-geometry.ts';
import { clampTextOffset } from './text-range.ts';
import type { GraphemeSegment, TerminalTextIndex, TextIndexOptions, TextSelection } from './types.ts';
import { defineTextWidthProfile } from './width-profile.ts';
import { ownedWordBoundaryIndex, lineSelectionAt } from './word-boundaries.ts';

const encoder = new TextEncoder();
const indexSources = new WeakMap<TerminalTextIndex, SourceBoundaryIndex>();
const retainedIndexes = new WeakMap<SourceBoundaryIndex, Map<string, TerminalTextIndex>>();

export function createTerminalTextIndex(text: string, options: TextIndexOptions = {}): TerminalTextIndex {
  return ownedTerminalTextIndex(sourceBoundaries(text), options);
}

export function terminalTextIndexForOwner(owner: object, text: string, options: TextIndexOptions = {}): TerminalTextIndex {
  return ownedTerminalTextIndex(sourceBoundariesForOwner(owner, text), options);
}

/** Internal adapter for revision-owned component geometry. Explicit grapheme and
 * byte array requests may materialize; prefix/column operations never do. */
export function ownedTerminalTextIndex(source: SourceBoundaryIndex, options: TextIndexOptions = {}): TerminalTextIndex {
  const adopted = { ...options, widthProfile: defineTextWidthProfile(options.widthProfile) };
  const key = options.paragraph === undefined
    ? `${adopted.widthProfile.emoji}:${adopted.widthProfile.ambiguous}:${options.locale ?? ''}:${textPresentationKey(options.textPresentation)}` : undefined;
  const retained = retainedIndexes.get(source);
  const existing = key === undefined ? undefined : retained?.get(key);
  if (existing !== undefined) return existing;
  const geometry = sourceGeometry(source, adopted);
  let materializedText: string | undefined;
  const text = (): string => materializedText ??= source.source.slice(0);
  let graphemes: readonly GraphemeSegment[] | undefined;
  const measured = (): readonly GraphemeSegment[] => graphemes ??= segmentGraphemesForMeasurement(text(), adopted, undefined, source);
  let retainedByteOffsets: readonly number[] | undefined;
  const byteOffsets = (): readonly number[] => retainedByteOffsets ??= utf8ByteOffsets(measured());
  const wordIndex = () => ownedWordBoundaryIndex(source, adopted);
  let visual: import('./presentation.ts').TextVisualMap | undefined;
  let reservedVisual = false;
  let visualWork: Generator<number, import('./presentation.ts').TextVisualMap> | undefined;
  function* constructVisualWork(): Generator<number, import('./presentation.ts').TextVisualMap> {
    if (!reservedVisual) {
      reserveSourcePreparation(source, source.source.length * 192 + 256);
      reservedVisual = true;
    }
    if (graphemes === undefined) {
      const logical: GraphemeSegment[] = [];
      let work = 0;
      for (const event of source.segmentEvents(text())) {
        if (typeof event === 'number') { yield event; continue; }
        const end = event.index + event.segment.length;
        yield* geometry.prepareOffsetWork(end);
        logical.push(Object.freeze({ text: event.segment, startOffset: event.index, endOffsetExclusive: end,
          cells: geometry.columnAt(end) - geometry.columnAt(event.index) }));
        work += 1;
        if (work >= 256) { yield work; work = 0; }
      }
      if (work > 0) yield work;
      graphemes = Object.freeze(logical);
    }
    return yield* createTextVisualMapWork(text(), graphemes, adopted.widthProfile, adopted.textPresentation, adopted.paragraph);
  }
  function* prepareVisualWork(): Generator<number, void> {
    while (visual === undefined) {
      visualWork ??= constructVisualWork();
      let next: IteratorResult<number, import('./presentation.ts').TextVisualMap>;
      try { next = visualWork.next(); }
      catch (error) { visualWork = undefined; throw error; }
      if (next.done === true) { visual = next.value; visualWork = undefined; }
      else yield next.value;
    }
  }
  const visualMap = (): import('./presentation.ts').TextVisualMap => {
    finishWork(prepareVisualWork());
    if (visual === undefined) throw new Error('Text visual preparation did not complete.');
    return visual;
  };
  const index: TerminalTextIndex = {
    get text() { return text(); },
    get graphemes() { return measured(); },
    get cells() { return geometry.columnAt(source.source.length); },
    codeUnits: source.source.length,
    get bytes() { return byteOffsets().at(-1) ?? 0; },
    graphemeIndexToCodeUnitOffset(index) { return source.offsetAtIndex(index); },
    codeUnitOffsetToGraphemeIndex(offset) { return source.indexAtOffset(offset); },
    get visualGraphemes() { return visualMap().graphemes; },
    prepareVisualWork,
    visualGraphemesInColumns(start, end) {
      if (end <= start) return [];
      if (adopted.textPresentation !== undefined) {
        const all = visualMap().graphemes;
        let low = 0;
        let high = all.length;
        while (low < high) {
          const middle = Math.floor((low + high) / 2);
          if ((all[middle]?.column ?? 0) < start) low = middle + 1;
          else high = middle;
        }
        const visible = [];
        for (let current = low; current < all.length; current += 1) {
          const g = all[current];
          if (g === undefined || g.endColumnExclusive > end) break;
          visible.push(g);
        }
        return visible;
      }
      const result: import('./presentation.ts').VisualGraphemeSegment[] = [];
      let offset = geometry.offsetAt(Math.max(0, start));
      while (offset < source.source.length) {
        const boundary = source.at(offset);
        if (boundary === undefined) break;
        const column = geometry.columnAt(boundary.startOffset);
        const endColumnExclusive = geometry.columnAt(boundary.endOffsetExclusive);
        if (endColumnExclusive > end) break;
        if (column >= start) result.push({ ...boundary, text: source.source.slice(boundary.startOffset, boundary.endOffsetExclusive),
          cells: endColumnExclusive - column, column, endColumnExclusive, direction: 'ltr' });
        offset = boundary.endOffsetExclusive;
      }
      return result;
    },
    positionToVisualColumn(position) {
      return adopted.textPresentation === undefined ? geometry.columnAt(position.offset) : visualMap().columnAt({ ...position, offset: source.offsetAtIndex(source.indexAtOffset(position.offset)) });
    },
    visualColumnToPosition(column) {
      return adopted.textPresentation === undefined
        ? { offset: geometry.offsetAt(column), affinity: column >= geometry.columnAt(source.source.length) ? 'upstream' : 'downstream' }
        : visualMap().positionAt(column);
    },
    moveVisualPosition(position, delta) {
      if (adopted.textPresentation !== undefined) return visualMap().move(position, delta);
      return { offset: source.offsetAtIndex(source.indexAtOffset(position.offset) + delta), affinity: delta < 0 ? 'downstream' : 'upstream' };
    },
    moveVisualWordPosition(position, delta) {
      if (adopted.textPresentation === undefined) return {
        offset: delta < 0 ? wordIndex().previous(position.offset) : wordIndex().next(position.offset),
        affinity: delta < 0 ? 'downstream' : 'upstream',
      };
      const map = visualMap();
      const all = map.graphemes;
      const column = map.columnAt(position);
      let low = 0;
      let high = all.length;
      while (low < high) {
        const middle = Math.floor((low + high) / 2);
        if ((all[middle]?.column ?? 0) < column) low = middle + 1;
        else high = middle;
      }
      let cursor = delta < 0 ? low - 1 : low;
      let range: TextSelection | undefined;
      let destination = position;
      while (cursor >= 0 && cursor < all.length) {
        const g = all[cursor];
        if (g === undefined) break;
        const word = wordIndex().selectionAt(g.startOffset);
        if (range !== undefined && (g.startOffset < range.startOffset || g.endOffsetExclusive > range.endOffsetExclusive)) break;
        if (range === undefined && word.startOffset !== word.endOffsetExclusive
          && g.startOffset >= word.startOffset && g.endOffsetExclusive <= word.endOffsetExclusive) range = word;
        destination = delta < 0
          ? g.direction === 'ltr' ? { offset: g.startOffset, affinity: 'downstream' } : { offset: g.endOffsetExclusive, affinity: 'upstream' }
          : g.direction === 'ltr' ? { offset: g.endOffsetExclusive, affinity: 'upstream' } : { offset: g.startOffset, affinity: 'downstream' };
        cursor += delta;
      }
      return destination;
    },
    graphemeIndexToVisualColumn(index) {
      return adopted.textPresentation === undefined ? geometry.columnAt(source.offsetAtIndex(index))
        : visualMap().columnAt({ offset: source.offsetAtIndex(index), affinity: 'downstream' });
    },
    visualColumnToGraphemeIndex(column) {
      return source.indexAtOffset(adopted.textPresentation === undefined ? geometry.offsetAt(column) : visualMap().positionAt(column).offset);
    },
    graphemeIndexToByteOffset(index) {
      const offsets = byteOffsets();
      return offsets[clampIndex(index, offsets.length - 1)] ?? 0;
    },
    byteOffsetToGraphemeIndex(offset) {
      const offsets = byteOffsets();
      return offsetToGraphemeIndex(offset, offsets, offsets.at(-1) ?? 0);
    },
    previousWordBoundary(offset) { return wordIndex().previous(offset); },
    nextWordBoundary(offset) { return wordIndex().next(offset); },
    wordSelectionAt(offset) { return wordIndex().selectionAt(offset); },
    lineSelectionAt(offset) { return lineSelectionAt(text(), offset); },
    selectedText(selection: TextSelection) {
      const start = clampTextOffset(Math.min(selection.startOffset, selection.endOffsetExclusive), source.source.length);
      const end = clampTextOffset(Math.max(selection.startOffset, selection.endOffsetExclusive), source.source.length);
      return source.source.slice(start, end);
    },
  };
  indexSources.set(index, source);
  if (key !== undefined) {
    const cache = retained ?? new Map<string, TerminalTextIndex>();
    if (cache.size >= 8) { const oldest = cache.keys().next().value; if (oldest !== undefined) cache.delete(oldest); }
    cache.set(key, index);
    retainedIndexes.set(source, cache);
  }
  return index;
}

export function sliceTerminalTextIndex(index: TerminalTextIndex, start: number, end: number, options: TextIndexOptions = {}): TerminalTextIndex {
  const source = indexSources.get(index);
  if (source === undefined) throw new TypeError('Text index range requires a canonical source owner.');
  return ownedTerminalTextIndex(source.slice(start, end), options);
}

function utf8ByteOffsets(graphemes: readonly { readonly text: string }[]): readonly number[] {
  const offsets = [0];
  for (const segment of graphemes) offsets.push((offsets.at(-1) ?? 0) + encoder.encode(segment.text).byteLength);
  return offsets;
}

function offsetToGraphemeIndex(offset: number, offsets: readonly number[], max: number): number {
  const bounded = Number.isFinite(offset) ? Math.max(0, Math.min(max, Math.floor(offset))) : 0;
  let lower = 0;
  let upper = offsets.length;
  while (lower < upper) {
    const middle = Math.floor((lower + upper) / 2);
    if ((offsets[middle] ?? 0) <= bounded) lower = middle + 1;
    else upper = middle;
  }
  return Math.max(0, Math.min(offsets.length - 1, lower - 1));
}

function clampIndex(index: number, length: number): number {
  if (!Number.isFinite(index)) return 0;
  return Math.max(0, Math.min(length, Math.floor(index)));
}

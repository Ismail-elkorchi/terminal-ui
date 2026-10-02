import { isNonArrayObject } from '../foundation/validation.ts';
import { prepareWork, type CooperativeWorkContext } from '../foundation/cooperative-work.ts';
import { createTextDocumentWork, textDocumentLineAt, textDocumentLineBoundaries } from './document.ts';
import type { TextDocument } from './document.ts';
import { bufferSourceBoundaries } from './source-boundaries.ts';
import type { SourceBoundaryIndex } from './source-boundaries.ts';
import { sourceGeometry } from './source-geometry.ts';
import type { TextEditBuffer, TextIndexOptions, TextWidthProfile } from './types.ts';
import { wordSegmenter } from './graphemes.ts';
import { defineTextWidthProfile } from './width-profile.ts';
import { ownedWordBoundaryIndex } from './word-boundaries.ts';

/** Offsets are UTF-16 units relative to the buffer or requested document line.
 * A missing offset prepares the full source, or only the requested column when
 * throughColumnCells is supplied. Geometry and word data are opt-in. */
export interface TextPreparationRequest extends TextIndexOptions {
  readonly throughOffset?: number;
  readonly throughColumnCells?: number;
  readonly geometry?: boolean;
  readonly words?: boolean;
}

export interface PreparedTextRequest {
  readonly throughOffset: number;
  readonly throughColumnCells?: number;
  readonly geometry: boolean;
  readonly words: boolean;
  readonly locale: string;
  readonly widthProfile: TextWidthProfile;
}

export interface PreparedTextBuffer {
  /** Exact adopted source, for ordinary update-message revision admission. */
  readonly buffer: TextEditBuffer;
  readonly text: string;
  readonly request: PreparedTextRequest;
}

export interface PreparedTextDocumentLine {
  /** Immutable document identity; do not apply completion to a newer revision. */
  readonly document: TextDocument;
  readonly lineIndex: number;
  readonly request: PreparedTextRequest;
}

/** Construct an immutable document cooperatively for large-file activation. */
export function prepareTextDocument(text: string, context: CooperativeWorkContext): Promise<TextDocument> {
  context.signal.throwIfAborted();
  return prepareWork(createTextDocumentWork(text), context);
}

/** Prepare data only. The normal update path remains responsible for ordered edits. */
export function prepareTextBuffer(
  buffer: TextEditBuffer,
  request: TextPreparationRequest,
  context: CooperativeWorkContext,
): Promise<PreparedTextBuffer> {
  context.signal.throwIfAborted();
  assertPreparationBuffer(buffer);
  const text = buffer.text;
  const source = bufferSourceBoundaries(buffer);
  const adopted = adoptRequest(request, text.length);
  return prepareWork(prepareTextSourceWork(source, adopted, Object.freeze({ buffer, text, request: adopted })), context);
}

/** Cold boundaries, words and prefix geometry share the synchronous owner's work.
 * Locale-word native setup needs the entire line; native callbacks and a single
 * enormous grapheme cannot be preempted. Checkpoints bound the surrounding work. */
export function prepareTextDocumentLine(
  document: TextDocument,
  lineIndex: number,
  request: TextPreparationRequest,
  context: CooperativeWorkContext,
): Promise<PreparedTextDocumentLine> {
  context.signal.throwIfAborted();
  const line = textDocumentLineAt(document, lineIndex);
  if (line === undefined) throw new RangeError('Text preparation line index is out of range.');
  const source = textDocumentLineBoundaries(document, line);
  const adopted = adoptRequest(request, source.source.length);
  return prepareWork(prepareTextSourceWork(source, adopted, Object.freeze({ document, lineIndex, request: adopted })), context);
}

function* prepareTextSourceWork<T>(source: SourceBoundaryIndex, request: PreparedTextRequest, result: T): Generator<void, T> {
  yield* source.prepareThroughWork(request.throughOffset);
  if (request.words) yield* ownedWordBoundaryIndex(source, request).prepareThroughWork(request.throughOffset);
  if (request.geometry) yield* sourceGeometry(source, request).prepareOffsetWork(request.throughOffset);
  if (request.throughColumnCells !== undefined) {
    yield* sourceGeometry(source, request).prepareColumnWork(request.throughColumnCells);
  }
  return result;
}

function adoptRequest(request: TextPreparationRequest, length: number): PreparedTextRequest {
  assertPreparationRequest(request);
  const throughColumnCells = request.throughColumnCells;
  const throughOffset = request.throughOffset ?? (throughColumnCells === undefined ? length : 0);
  if (!Number.isInteger(throughOffset) || throughOffset < 0 || throughOffset > length) {
    throw new RangeError('Text preparation offset must be an in-range integer.');
  }
  if (throughColumnCells !== undefined && (!Number.isInteger(throughColumnCells) || throughColumnCells < 0)) {
    throw new RangeError('Text preparation column must be a non-negative integer.');
  }
  return Object.freeze({
    throughOffset,
    ...(throughColumnCells === undefined ? {} : { throughColumnCells }),
    words: request.words ?? false,
    geometry: request.geometry === true || throughColumnCells !== undefined,
    locale: request.words === true ? wordSegmenter(request.locale).resolvedOptions().locale
      : Intl.getCanonicalLocales(request.locale ?? 'en')[0] ?? 'en',
    widthProfile: defineTextWidthProfile(request.widthProfile),
  });
}

function assertPreparationBuffer(buffer: unknown): asserts buffer is TextEditBuffer {
  if (!isNonArrayObject(buffer) || typeof buffer['text'] !== 'string' || typeof buffer['cursor'] !== 'number') {
    throw new TypeError('Text preparation buffer must have string text and a numeric cursor.');
  }
}

function assertPreparationRequest(request: unknown): asserts request is TextPreparationRequest {
  if (!isNonArrayObject(request)) {
    throw new TypeError('Text preparation request must be an object.');
  }
  const supported = new Set(['throughOffset', 'throughColumnCells', 'geometry', 'words', 'locale', 'widthProfile']);
  for (const field of Object.keys(request)) {
    if (!supported.has(field)) throw new TypeError(`Unknown text preparation option: ${field}.`);
  }
  if ((request['geometry'] !== undefined && typeof request['geometry'] !== 'boolean')
    || (request['words'] !== undefined && typeof request['words'] !== 'boolean')) {
    throw new TypeError('Text preparation geometry and words options must be booleans.');
  }
  if (request['throughOffset'] !== undefined && typeof request['throughOffset'] !== 'number') {
    throw new TypeError('Text preparation offset must be a number.');
  }
  if (request['locale'] !== undefined && typeof request['locale'] !== 'string') {
    throw new TypeError('Text preparation locale must be a string.');
  }
}

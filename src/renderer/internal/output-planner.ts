import { measureTextCells, sanitizeTerminalCellText } from '../../text/index.ts';
import type { TerminalOutputCapabilityProfile } from '../../protocol/index.ts';
import type { RenderDiff, RenderOperation } from '../contracts.ts';
import { serializeRenderSpansWithProtocols } from './ansi.ts';
import { createTerminalSerializationPolicy } from './serialization-policy.ts';
import type { RenderSerializeOptions } from './ansi.ts';

export interface TerminalOutputPlan {
  readonly text: string;
  readonly bytes: number;
  readonly payloadBytes: number;
  readonly baselinePayloadBytes: number;
  readonly strategy: 'baseline' | 'optimized';
  readonly synchronized: boolean;
  readonly protocols: FrameProtocolUsage;
  readonly failureCleanup?: string;
}

export interface FrameProtocolUsage {
  readonly synchronized: boolean;
  readonly scrollingRegion: boolean;
  readonly style: boolean;
  readonly hyperlink: boolean;
}

interface CursorState {
  readonly row: number;
  readonly column: number;
}

interface EncodedOutput {
  readonly text: string;
  readonly cursor?: CursorState;
}

type PreparedOutputOperation =
  | {
      readonly kind: 'write';
      readonly row: number;
      readonly column: number;
      readonly text: string;
      readonly columns: number;
      readonly bytes: number;
      readonly usesStyle: boolean;
      readonly usesHyperlink: boolean;
    }
  | Extract<RenderOperation, { readonly kind: 'clearRect' }>;

export function planTerminalOutput(
  diff: RenderDiff,
  options?: RenderSerializeOptions
): TerminalOutputPlan {
  const policy = createTerminalSerializationPolicy(options);
  const operations = prepareOperations(diff.operations, options, policy.capabilities);
  const baselinePayloadBytes = evaluateOperations(diff, operations, policy, false);
  const optimizedPayloadBytes = evaluateOperations(diff, operations, policy, true);
  const optimize = optimizedPayloadBytes < baselinePayloadBytes;
  const strategy = optimize ? 'optimized' : 'baseline';
  const payloadBytes = optimize ? optimizedPayloadBytes : baselinePayloadBytes;
  const selected = encodeOperations(diff, operations, policy, optimize).text;
  const synchronized = payloadBytes > 0
    && policy.capabilities.synchronizedOutput.support === 'supported'
    && policy.capabilities.synchronizedOutput.availability === 'available';
  const begin = synchronized ? policy.beginSynchronizedOutput() : '';
  const end = synchronized ? policy.endSynchronizedOutput() : '';
  const text = `${begin}${selected}${end}`;
  const protocols = Object.freeze({
    synchronized,
    scrollingRegion: false,
    style: operations.some((operation) => operation.kind === 'write' && operation.usesStyle),
    hyperlink: operations.some((operation) => operation.kind === 'write' && operation.usesHyperlink)
  });
  const failureCleanup = payloadBytes === 0 ? undefined : frameRecoverySuffix(policy, protocols);
  return Object.freeze({
    text,
    bytes: payloadBytes + asciiBytes(begin) + asciiBytes(end),
    payloadBytes,
    baselinePayloadBytes,
    strategy,
    synchronized,
    protocols,
    ...(failureCleanup === undefined ? {} : { failureCleanup })
  });
}

export function frameRecoverySuffix(
  policy: ReturnType<typeof createTerminalSerializationPolicy>,
  protocols: FrameProtocolUsage
): string | undefined {
  const suffix = [
    ...(protocols.synchronized ? [policy.endSynchronizedOutput()] : []),
    ...(protocols.scrollingRegion ? [policy.resetScrollingRegion()] : []),
    ...(protocols.hyperlink ? [policy.closeHyperlink()] : []),
    ...(protocols.style ? [policy.resetStyle()] : [])
  ].join('');
  return suffix.length === 0 ? undefined : suffix;
}

function evaluateOperations(
  diff: RenderDiff,
  operations: readonly PreparedOutputOperation[],
  policy: ReturnType<typeof createTerminalSerializationPolicy>,
  optimize: boolean
): number {
  let bytes = 0;
  let cursor: CursorState | undefined;
  for (const operation of operations) {
    if (operation.kind === 'write') {
      const moved = moveCursor(operation.row, operation.column, cursor, optimize, policy);
      bytes += asciiBytes(moved.text) + operation.bytes;
      cursor = cursorAfterColumns(
        { row: operation.row, column: operation.column },
        operation.columns,
        diff.width
      );
      continue;
    }
    const evaluated = evaluateClearRect(operation, diff.width, cursor, optimize, policy);
    bytes += evaluated.bytes;
    cursor = evaluated.cursor;
  }
  if (diff.cursor !== undefined) {
    bytes += asciiBytes(moveCursor(diff.cursor.row, diff.cursor.column, cursor, optimize, policy).text);
  }
  return bytes;
}

function evaluateClearRect(
  operation: Extract<RenderOperation, { readonly kind: 'clearRect' }>,
  frameWidth: number,
  initialCursor: CursorState | undefined,
  optimize: boolean,
  policy: ReturnType<typeof createTerminalSerializationPolicy>
): { readonly bytes: number; readonly cursor?: CursorState } {
  let bytes = 0;
  let cursor = initialCursor;
  const width = Math.max(0, operation.bounds.width);
  const endColumn = operation.bounds.column + width - 1;
  for (let rowOffset = 0; rowOffset < operation.bounds.height; rowOffset += 1) {
    const row = operation.bounds.row + rowOffset;
    const moved = moveCursor(row, operation.bounds.column, cursor, optimize, policy);
    bytes += asciiBytes(moved.text);
    if (optimize && endColumn >= frameWidth) {
      bytes += asciiBytes(policy.eraseLineToEnd());
      cursor = moved.cursor;
    } else {
      bytes += width;
      cursor = cursorAfterColumns(moved.cursor, width, frameWidth);
    }
  }
  return cursor === undefined ? { bytes } : { bytes, cursor };
}

function encodeOperations(
  diff: RenderDiff,
  operations: readonly PreparedOutputOperation[],
  policy: ReturnType<typeof createTerminalSerializationPolicy>,
  optimize: boolean
): EncodedOutput {
  const parts: string[] = [];
  let cursor: CursorState | undefined;
  for (const operation of operations) {
    switch (operation.kind) {
      case 'write': {
        const moved = moveCursor(operation.row, operation.column, cursor, optimize, policy);
        parts.push(moved.text, operation.text);
        cursor = cursorAfterColumns(
          { row: operation.row, column: operation.column },
          operation.columns,
          diff.width
        );
        break;
      }
      case 'clearRect': {
        const encoded = encodeClearRect(operation, diff.width, cursor, optimize, policy);
        parts.push(encoded.text);
        cursor = encoded.cursor;
        break;
      }
    }
  }
  if (diff.cursor !== undefined) {
    const moved = moveCursor(diff.cursor.row, diff.cursor.column, cursor, optimize, policy);
    parts.push(moved.text);
    cursor = moved.cursor;
  }
  return cursor === undefined
    ? { text: parts.join('') }
    : { text: parts.join(''), cursor };
}

function encodeClearRect(
  operation: Extract<RenderOperation, { readonly kind: 'clearRect' }>,
  frameWidth: number,
  initialCursor: CursorState | undefined,
  optimize: boolean,
  policy: ReturnType<typeof createTerminalSerializationPolicy>
): EncodedOutput {
  const parts: string[] = [];
  let cursor = initialCursor;
  const width = Math.max(0, operation.bounds.width);
  const endColumn = operation.bounds.column + width - 1;
  for (let rowOffset = 0; rowOffset < operation.bounds.height; rowOffset += 1) {
    const row = operation.bounds.row + rowOffset;
    const moved = moveCursor(row, operation.bounds.column, cursor, optimize, policy);
    parts.push(moved.text);
    if (optimize && endColumn >= frameWidth) {
      parts.push(policy.eraseLineToEnd());
      cursor = moved.cursor;
      continue;
    }
    parts.push(' '.repeat(width));
    cursor = cursorAfterColumns(moved.cursor, width, frameWidth);
  }
  return cursor === undefined ? { text: parts.join('') } : { text: parts.join(''), cursor };
}

function moveCursor(
  row: number,
  column: number,
  current: CursorState | undefined,
  optimize: boolean,
  policy: ReturnType<typeof createTerminalSerializationPolicy>
): EncodedOutput & { readonly cursor: CursorState } {
  const target = { row, column };
  return {
    text: policy.cursorMove(row, column, optimize ? current : undefined),
    cursor: target
  };
}

function cursorAfterColumns(
  start: CursorState,
  columns: number,
  frameWidth: number
): CursorState | undefined {
  const nextColumn = start.column + columns;
  return nextColumn > frameWidth ? undefined : { row: start.row, column: nextColumn };
}

function prepareOperations(
  operations: readonly RenderOperation[],
  options: RenderSerializeOptions | undefined,
  capabilities: TerminalOutputCapabilityProfile
): readonly PreparedOutputOperation[] {
  return Object.freeze(operations.map((operation): PreparedOutputOperation => {
    if (operation.kind !== 'write') return operation;
    const serialized = serializeRenderSpansWithProtocols(operation.spans, options);
    return Object.freeze({
      kind: 'write',
      row: operation.row,
      column: operation.column,
      text: serialized.text,
      bytes: utf8Bytes(serialized.text),
      usesStyle: serialized.usesStyle,
      usesHyperlink: serialized.usesHyperlink,
      columns: operation.spans.reduce((total, current) => {
        const text = sanitizeTerminalCellText(current.text).text;
        return total + measureTextCells(text, { widthProfile: capabilities.unicode.widthProfile }).cells;
      }, 0)
    });
  }));
}

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function asciiBytes(value: string): number {
  return value.length;
}

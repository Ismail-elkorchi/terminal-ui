import { measureTextCells, sanitizeTerminalText } from '../../text/index.ts';
import type { TerminalOutputCapabilityProfile } from '../../protocol/index.ts';
import type { RenderDiff, RenderOperation } from '../model/diff.ts';
import { serializeRenderSpans } from './ansi.ts';
import { createTerminalSerializationPolicy } from './serialization-policy.ts';
import type { RenderSerializeOptions } from './ansi.ts';

export interface TerminalOutputPlan {
  readonly text: string;
  readonly bytes: number;
  readonly payloadBytes: number;
  readonly baselinePayloadBytes: number;
  readonly strategy: 'baseline' | 'optimized';
  readonly synchronized: boolean;
  readonly failureCleanup?: string;
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
    }
  | Extract<RenderOperation, { readonly kind: 'clearRect' }>;

export function planTerminalOutput(
  diff: RenderDiff,
  options?: RenderSerializeOptions
): TerminalOutputPlan {
  const policy = createTerminalSerializationPolicy(options);
  const operations = prepareOperations(diff.operations, options, policy.capabilities);
  const baseline = encodeOperations(diff, operations, policy, false);
  const optimized = encodeOperations(diff, operations, policy, true);
  const baselinePayloadBytes = utf8Bytes(baseline.text);
  const optimizedPayloadBytes = utf8Bytes(optimized.text);
  const selected = optimizedPayloadBytes < baselinePayloadBytes ? optimized.text : baseline.text;
  const strategy = selected === optimized.text && optimized.text !== baseline.text ? 'optimized' : 'baseline';
  const payloadBytes = utf8Bytes(selected);
  const synchronized = selected.length > 0 && policy.capabilities.synchronizedOutput.status === 'supported';
  const text = synchronized
    ? `${policy.beginSynchronizedOutput()}${selected}${policy.endSynchronizedOutput()}`
    : selected;
  return Object.freeze({
    text,
    bytes: utf8Bytes(text),
    payloadBytes,
    baselinePayloadBytes,
    strategy,
    synchronized,
    ...(synchronized ? { failureCleanup: policy.endSynchronizedOutput() } : {})
  });
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
    return Object.freeze({
      kind: 'write',
      row: operation.row,
      column: operation.column,
      text: serializeRenderSpans(operation.spans, options),
      columns: operation.spans.reduce((total, current) => {
        const text = sanitizeTerminalText(current.text).text;
        return total + measureTextCells(text, { widthProfile: capabilities.unicode.widthProfile }).cells;
      }, 0)
    });
  }));
}

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

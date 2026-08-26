import { measureTextCells, sanitizeTerminalCellText } from '../../text/index.ts';
import type { TerminalOutputCapabilityProfile } from '../../protocol/index.ts';
import type { RenderDiff, RenderOperation } from '../contracts.ts';
import { createRenderSpanSerializer } from './ansi.ts';
import { createTerminalSerializationPolicy } from './serialization-policy.ts';
import type {
  AnsiStyleState,
  RenderSerializeOptions,
  RenderSpanSerializer,
} from './ansi.ts';

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
  readonly usesStyle: boolean;
  readonly usesHyperlink: boolean;
}

type PlannedOutputOperation =
  | {
      readonly kind: 'write';
      readonly row: number;
      readonly column: number;
      readonly spans: Extract<RenderOperation, { readonly kind: 'write' }>['spans'];
      readonly columns: number;
    }
  | Extract<RenderOperation, { readonly kind: 'clearRect' }>;

export function planTerminalOutput(
  diff: RenderDiff,
  options?: RenderSerializeOptions
): TerminalOutputPlan {
  const policy = createTerminalSerializationPolicy(options);
  const operations = planOutputOperations(diff.operations, policy.capabilities);
  const serializer = createRenderSpanSerializer(options);
  const encodedVariants = encodeOperations(diff, operations, policy, serializer);
  const { baseline, optimized } = encodedVariants;
  const baselinePayloadBytes = utf8Bytes(baseline.text);
  const optimizedPayloadBytes = utf8Bytes(optimized.text);
  const optimize = optimizedPayloadBytes < baselinePayloadBytes;
  const strategy = optimize ? 'optimized' : 'baseline';
  const payloadBytes = optimize ? optimizedPayloadBytes : baselinePayloadBytes;
  const encoded = optimize ? optimized : baseline;
  const selected = encoded.text;
  const synchronized = payloadBytes > 0
    && policy.capabilities.synchronizedOutput.support === 'supported'
    && policy.capabilities.synchronizedOutput.availability === 'available';
  const begin = synchronized ? policy.beginSynchronizedOutput() : '';
  const end = synchronized ? policy.endSynchronizedOutput() : '';
  const text = `${begin}${selected}${end}`;
  const protocols = Object.freeze({
    synchronized,
    scrollingRegion: false,
    style: encoded.usesStyle,
    hyperlink: encoded.usesHyperlink,
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

function encodeOperations(
  diff: RenderDiff,
  operations: readonly PlannedOutputOperation[],
  policy: ReturnType<typeof createTerminalSerializationPolicy>,
  serializer: RenderSpanSerializer,
): { readonly baseline: EncodedOutput; readonly optimized: EncodedOutput } {
  const baselineParts: string[] = [];
  const optimizedParts: string[] = [];
  let baselineCursor: CursorState | undefined;
  let optimizedCursor: CursorState | undefined;
  let ansi: AnsiStyleState = {};
  let usesStyle = false;
  let usesHyperlink = false;
  for (const operation of operations) {
    switch (operation.kind) {
      case 'write': {
        const baselineMove = moveCursor(operation.row, operation.column, baselineCursor, false, policy);
        const optimizedMove = moveCursor(operation.row, operation.column, optimizedCursor, true, policy);
        const chunk = serializer.write(operation.spans, ansi);
        baselineParts.push(baselineMove.text, chunk.text);
        optimizedParts.push(optimizedMove.text, chunk.text);
        ansi = chunk.state;
        usesStyle ||= chunk.usesStyle;
        usesHyperlink ||= chunk.usesHyperlink;
        baselineCursor = cursorAfterColumns(
          { row: operation.row, column: operation.column },
          operation.columns,
          diff.width
        );
        optimizedCursor = baselineCursor;
        break;
      }
      case 'clearRect': {
        const width = Math.max(0, operation.bounds.width);
        const endColumn = operation.bounds.column + width - 1;
        for (let rowOffset = 0; rowOffset < operation.bounds.height; rowOffset += 1) {
          const row = operation.bounds.row + rowOffset;
          const baselineMove = moveCursor(row, operation.bounds.column, baselineCursor, false, policy);
          const optimizedMove = moveCursor(row, operation.bounds.column, optimizedCursor, true, policy);
          const transition = serializer.transition(operation.style, undefined, ansi);
          ansi = transition.state;
          usesStyle ||= transition.usesStyle;
          baselineParts.push(baselineMove.text, transition.text, ' '.repeat(width));
          baselineCursor = cursorAfterColumns(baselineMove.cursor, width, diff.width);
          optimizedParts.push(optimizedMove.text, transition.text);
          if (endColumn >= diff.width && operation.style === undefined) {
            optimizedParts.push(policy.eraseLineToEnd());
            optimizedCursor = optimizedMove.cursor;
          } else {
            optimizedParts.push(' '.repeat(width));
            optimizedCursor = cursorAfterColumns(optimizedMove.cursor, width, diff.width);
          }
        }
        break;
      }
    }
  }
  if (diff.cursor !== undefined) {
    const baselineMove = moveCursor(diff.cursor.row, diff.cursor.column, baselineCursor, false, policy);
    const optimizedMove = moveCursor(diff.cursor.row, diff.cursor.column, optimizedCursor, true, policy);
    baselineParts.push(baselineMove.text);
    optimizedParts.push(optimizedMove.text);
    baselineCursor = baselineMove.cursor;
    optimizedCursor = optimizedMove.cursor;
  }
  const finish = serializer.finish(ansi);
  baselineParts.push(finish);
  optimizedParts.push(finish);
  return {
    baseline: {
      text: baselineParts.join(''),
      ...(baselineCursor === undefined ? {} : { cursor: baselineCursor }),
      usesStyle,
      usesHyperlink,
    },
    optimized: {
      text: optimizedParts.join(''),
      ...(optimizedCursor === undefined ? {} : { cursor: optimizedCursor }),
      usesStyle,
      usesHyperlink,
    },
  };
}

function moveCursor(
  row: number,
  column: number,
  current: CursorState | undefined,
  optimize: boolean,
  policy: ReturnType<typeof createTerminalSerializationPolicy>
): { readonly text: string; readonly cursor: CursorState } {
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

function planOutputOperations(
  operations: readonly RenderOperation[],
  capabilities: TerminalOutputCapabilityProfile
): readonly PlannedOutputOperation[] {
  return Object.freeze(operations.map((operation): PlannedOutputOperation => {
    if (operation.kind !== 'write') return Object.freeze({ ...operation });
    return Object.freeze({
      kind: 'write',
      row: operation.row,
      column: operation.column,
      spans: operation.spans,
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

import type { TerminalOutputCapabilityProfile } from '../../protocol/index.ts';
import type { TerminalTheme } from '../../theme/index.ts';
import type { Frame, FrameCell } from '../contracts.ts';
import type { RenderDiff } from '../contracts.ts';
import { diffFrames } from './frame.ts';
import { sameTerminalFrameCell } from './frame-cell-equality.ts';
import { frameIndex } from './frame-index.ts';
import { frameRecoverySuffix, planTerminalOutput } from './output-planner.ts';
import type { FrameProtocolUsage } from './output-planner.ts';
import type { RenderSerializeOptions } from './ansi.ts';
import { createTerminalSerializationPolicy } from './serialization-policy.ts';

export interface TerminalRowMovement {
  readonly top: number;
  readonly bottom: number;
  readonly rows: number;
}

export interface TerminalFrameOutputPlan {
  readonly text: string;
  readonly bytes: number;
  readonly payloadBytes: number;
  readonly baselinePayloadBytes: number;
  readonly strategy: 'diff' | 'scroll_rows';
  readonly synchronized: boolean;
  readonly protocols: FrameProtocolUsage;
  readonly failureCleanup?: string;
  readonly rowMovement?: TerminalRowMovement;
}

interface TerminalFramePlanOptions extends RenderSerializeOptions {
  readonly scrollRegion: boolean;
  readonly theme?: TerminalTheme;
  readonly beforeText?: string;
  readonly afterText?: string;
}

export function planTerminalFrameOutput(
  previous: Frame | undefined,
  next: Frame,
  diff: RenderDiff,
  options: TerminalFramePlanOptions
): TerminalFrameOutputPlan {
  const managedOptions = synchronizedFrameOptions(options);
  if ((managedOptions.beforeText?.length ?? 0) > 0 || (managedOptions.afterText?.length ?? 0) > 0) {
    return graphicsFramePlan(next, diff, managedOptions);
  }
  const baseline = planTerminalOutput(diff, managedOptions);
  if (
    previous === undefined
    || diff.fullRewrite
    || !managedOptions.scrollRegion
    || previous.graphics.length > 0
    || next.graphics.length > 0
  ) return baselineFramePlan(baseline);

  const unsynchronizedCapabilities: TerminalOutputCapabilityProfile = {
    ...managedOptions.capabilities,
    synchronizedOutput: {
      ...managedOptions.capabilities.synchronizedOutput,
      support: 'unsupported'
    }
  };
  const policy = createTerminalSerializationPolicy({ capabilities: unsynchronizedCapabilities });
  let selected: TerminalFrameOutputPlan | undefined;
  for (const movement of rowMovementCandidates(previous, next)) {
    const projected = applyTerminalRowMovement(previous, movement);
    const repair = diffFrames(projected, next);
    const repairPlan = planTerminalOutput(repair, {
      ...managedOptions,
      capabilities: unsynchronizedCapabilities
    });
    const movementText = [
      policy.setScrollingRegion(movement.top, movement.bottom),
      policy.cursorMove(movement.top, 1),
      policy.scrollRows(movement.rows),
      policy.resetScrollingRegion()
    ].join('');
    const candidatePayload = utf8Bytes(movementText) + repairPlan.payloadBytes;
    if (candidatePayload >= baseline.payloadBytes) continue;
    const synchronized = managedOptions.capabilities.synchronizedOutput.support === 'supported'
      && managedOptions.capabilities.synchronizedOutput.availability === 'available';
    const outerPolicy = createTerminalSerializationPolicy({ capabilities: managedOptions.capabilities });
    const begin = synchronized ? outerPolicy.beginSynchronizedOutput() : '';
    const end = synchronized ? outerPolicy.endSynchronizedOutput() : '';
    const text = `${begin}${movementText}${repairPlan.text}${end}`;
    const protocols = Object.freeze({
      synchronized,
      scrollingRegion: true,
      style: repairPlan.protocols.style,
      hyperlink: repairPlan.protocols.hyperlink
    });
    const failureCleanup = frameRecoverySuffix(outerPolicy, protocols);
    const candidate: TerminalFrameOutputPlan = {
      text,
      bytes: utf8Bytes(text),
      payloadBytes: candidatePayload,
      baselinePayloadBytes: baseline.payloadBytes,
      strategy: 'scroll_rows',
      synchronized,
      protocols,
      ...(failureCleanup === undefined ? {} : { failureCleanup }),
      rowMovement: movement
    };
    if (selected === undefined || candidate.payloadBytes < selected.payloadBytes) selected = candidate;
  }
  return selected ?? baselineFramePlan(baseline);
}

function synchronizedFrameOptions(options: TerminalFramePlanOptions): TerminalFramePlanOptions {
  const capability = options.capabilities.synchronizedOutput;
  if (capability.support !== 'unknown' || capability.availability !== 'available') return options;
  return {
    ...options,
    capabilities: {
      ...options.capabilities,
      synchronizedOutput: { ...capability, support: 'supported' },
    },
  };
}

export function applyTerminalRowMovement(frame: Frame, movement: TerminalRowMovement): Frame {
  const cells: FrameCell[] = [];
  for (const cell of frame.cells) {
    if (cell.row < movement.top || cell.row > movement.bottom) {
      cells.push(cell);
      continue;
    }
    const row = cell.row - movement.rows;
    if (row < movement.top || row > movement.bottom) continue;
    cells.push({ ...cell, row });
  }
  return Object.freeze({
    width: frame.width,
    height: frame.height,
    widthProfile: frame.widthProfile,
    ...(frame.canvasStyle === undefined ? {} : { canvasStyle: frame.canvasStyle }),
    cells: Object.freeze(cells.toSorted((left, right) => left.row - right.row || left.column - right.column)),
    graphics: Object.freeze([]),
    accessibility: frame.accessibility,
    ...(frame.focusPath === undefined ? {} : { focusPath: frame.focusPath }),
    ...(frame.hitTargets === undefined ? {} : { hitTargets: frame.hitTargets })
  });
}

function graphicsFramePlan(
  frame: Frame,
  diff: RenderDiff,
  options: TerminalFramePlanOptions,
): TerminalFrameOutputPlan {
  const capabilities: TerminalOutputCapabilityProfile = {
    ...options.capabilities,
    synchronizedOutput: { ...options.capabilities.synchronizedOutput, support: 'unsupported' },
  };
  const cellPlan = planTerminalOutput(diff, { ...options, capabilities });
  const outerPolicy = createTerminalSerializationPolicy({ capabilities: options.capabilities });
  const synchronized = options.capabilities.synchronizedOutput.support === 'supported'
    && options.capabilities.synchronizedOutput.availability === 'available';
  const begin = synchronized ? outerPolicy.beginSynchronizedOutput() : '';
  const end = synchronized ? outerPolicy.endSynchronizedOutput() : '';
  const restoreCursor = frame.cursor === undefined ? '' : outerPolicy.cursorMove(frame.cursor.row, frame.cursor.column);
  const payload = `${options.beforeText ?? ''}${cellPlan.text}${options.afterText ?? ''}${restoreCursor}`;
  const text = `${begin}${payload}${end}`;
  const protocols = Object.freeze({ ...cellPlan.protocols, synchronized });
  const failureCleanup = frameRecoverySuffix(outerPolicy, protocols);
  return Object.freeze({
    text,
    bytes: utf8Bytes(text),
    payloadBytes: utf8Bytes(payload),
    baselinePayloadBytes: cellPlan.baselinePayloadBytes,
    strategy: 'diff',
    synchronized,
    protocols,
    ...(failureCleanup === undefined ? {} : { failureCleanup }),
  });
}

function rowMovementCandidates(previous: Frame, next: Frame): readonly TerminalRowMovement[] {
  if (previous.width !== next.width || previous.height !== next.height || previous.height < 3) return [];
  const maximumDistance = Math.min(8, previous.height - 1);
  const candidates: TerminalRowMovement[] = [];
  for (let distance = 1; distance <= maximumDistance; distance += 1) {
    candidates.push(...movementRuns(previous, next, distance));
    candidates.push(...movementRuns(previous, next, -distance));
  }
  return Object.freeze(candidates);
}

function movementRuns(previous: Frame, next: Frame, rows: number): readonly TerminalRowMovement[] {
  const firstTarget = Math.max(1, 1 - rows);
  const lastTarget = Math.min(next.height, previous.height - rows);
  const minimumMatches = Math.max(2, Math.abs(rows) + 1);
  const candidates: TerminalRowMovement[] = [];
  let runStart: number | undefined;
  for (let targetRow = firstTarget; targetRow <= lastTarget + 1; targetRow += 1) {
    const matches = targetRow <= lastTarget && rowsMatch(previous, targetRow + rows, next, targetRow);
    if (matches && runStart === undefined) runStart = targetRow;
    if (matches || runStart === undefined) continue;
    const runEnd = targetRow - 1;
    if (runEnd - runStart + 1 >= minimumMatches) {
      const top = rows > 0 ? runStart : runStart + rows;
      const bottom = rows > 0 ? runEnd + rows : runEnd;
      if (top >= 1 && bottom <= next.height && bottom > top) candidates.push({ top, bottom, rows });
    }
    runStart = undefined;
  }
  return candidates;
}

function rowsMatch(previous: Frame, previousRow: number, next: Frame, nextRow: number): boolean {
  const previousCells = frameIndex(previous).rows[previousRow - 1]?.cells ?? new Map<number, FrameCell>();
  const nextCells = frameIndex(next).rows[nextRow - 1]?.cells ?? new Map<number, FrameCell>();
  if (previousCells.size !== nextCells.size) return false;
  for (const [column, cell] of previousCells) {
    if (!sameTerminalFrameCell(cell, nextCells.get(column))) return false;
  }
  return true;
}

function baselineFramePlan(plan: ReturnType<typeof planTerminalOutput>): TerminalFrameOutputPlan {
  return {
    text: plan.text,
    bytes: plan.bytes,
    payloadBytes: plan.payloadBytes,
    baselinePayloadBytes: plan.baselinePayloadBytes,
    strategy: 'diff',
    synchronized: plan.synchronized,
    protocols: plan.protocols,
    ...(plan.failureCleanup === undefined ? {} : { failureCleanup: plan.failureCleanup })
  };
}

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

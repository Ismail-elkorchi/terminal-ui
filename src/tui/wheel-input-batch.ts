import type { MouseModifiers, MouseWheelEvent } from '../input/index.ts';

export const DEFAULT_WHEEL_BATCH_WINDOW_MS = 8;
export const DEFAULT_WHEEL_BATCH_LIMIT = 64;

export interface WheelInputBatch {
  readonly event: MouseWheelEvent;
  readonly targetId?: string;
  readonly packetCount: number;
}

export function createWheelInputBatch(event: MouseWheelEvent, targetId?: string): WheelInputBatch {
  return {
    event,
    ...(targetId === undefined ? {} : { targetId }),
    packetCount: 1
  };
}

export function wheelInputBatchAccepts(
  batch: WheelInputBatch,
  event: MouseWheelEvent,
  targetId: string | undefined
): boolean {
  return batch.packetCount < DEFAULT_WHEEL_BATCH_LIMIT
    && batch.targetId === targetId
    && sameAxisAndDirection(batch.event, event)
    && sameModifiers(batch.event.modifiers, event.modifiers);
}

export function appendWheelInput(batch: WheelInputBatch, event: MouseWheelEvent): WheelInputBatch {
  return {
    event: {
      ...event,
      deltaRows: batch.event.deltaRows + event.deltaRows,
      deltaColumns: batch.event.deltaColumns + event.deltaColumns
    },
    ...(batch.targetId === undefined ? {} : { targetId: batch.targetId }),
    packetCount: batch.packetCount + 1
  };
}

function sameAxisAndDirection(left: MouseWheelEvent, right: MouseWheelEvent): boolean {
  return sameSignedAxis(left.deltaRows, right.deltaRows)
    && sameSignedAxis(left.deltaColumns, right.deltaColumns);
}

function sameSignedAxis(left: number, right: number): boolean {
  return left === 0 && right === 0 || Math.sign(left) === Math.sign(right);
}

function sameModifiers(left: MouseModifiers, right: MouseModifiers): boolean {
  return left.shift === right.shift && left.alt === right.alt && left.ctrl === right.ctrl;
}

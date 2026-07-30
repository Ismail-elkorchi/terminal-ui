import { createTerminalTextIndex, normalizeTextCursor } from '../../text/index.ts';
import type { TextMeasurementOptions, TextSelection } from '../../text/index.ts';
import type { PointerSelectionAction, TextPointerAction } from '../../interaction/text-pointer.ts';
import type { MessageResolution } from '../../interaction/message.ts';
import { ignoreMessage } from '../../interaction/message.ts';
import type { Rect } from '../contracts.ts';
import type { RoutedPointerEvent } from '../../input/pointer.ts';
import type { HitTarget } from '../contracts.ts';

export type { TextPointerAction } from '../../interaction/text-pointer.ts';

export interface TextPointerHitTargetInput<TMessage> {
  readonly id: string;
  readonly bounds: Rect;
  readonly focusTargetId?: string;
  readonly toMessage?: ((action: TextPointerAction) => MessageResolution<TMessage>) | undefined;
  offsetAt(event: RoutedPointerEvent): number | undefined;
}

export function textPointerHitTargets<TMessage>(
  input: TextPointerHitTargetInput<TMessage>
): readonly HitTarget<TMessage>[] {
  const toMessage = input.toMessage;
  const positionAt = (event: RoutedPointerEvent): number | undefined => input.offsetAt(event);
  return pointerSelectionHitTargets<number, TMessage>({
    id: input.id,
    bounds: input.bounds,
    ...(input.focusTargetId === undefined ? {} : { focusTargetId: input.focusTargetId }),
    positionAt,
    ...(toMessage === undefined
      ? {}
      : { toMessage: (action) => toMessage(toTextPointerAction(action)) })
  });
}

export interface PointerSelectionHitTargetInput<TCoordinate, TMessage> {
  readonly id: string;
  readonly bounds: Rect;
  readonly focusTargetId?: string;
  readonly toMessage?: ((action: PointerSelectionAction<TCoordinate>) => MessageResolution<TMessage>) | undefined;
  positionAt(event: RoutedPointerEvent): TCoordinate | undefined;
}

export function pointerSelectionHitTargets<TCoordinate, TMessage>(
  input: PointerSelectionHitTargetInput<TCoordinate, TMessage>
): readonly HitTarget<TMessage>[] {
  const toMessage = input.toMessage;
  const positionAt = (event: RoutedPointerEvent): TCoordinate | undefined => input.positionAt(event);
  if (toMessage === undefined || input.bounds.width <= 0 || input.bounds.height <= 0) return [];
  return [{
    id: input.id,
    bounds: input.bounds,
    accepts: ['pointerDown', 'dragStart', 'drag', 'dragEnd'],
    ...(input.focusTargetId === undefined
      ? {}
      : { focus: { kind: 'target' as const, targetId: input.focusTargetId } }),
    cursor: 'text',
    message(event) {
      const position = positionAt(event);
      if (position === undefined) return ignoreMessage();
      const action = pointerSelectionAction(event, position, positionAt);
      return action === undefined ? ignoreMessage() : toMessage(action);
    }
  }];
}

export function textOffsetAtVisualColumn(
  text: string,
  column: number,
  options?: TextMeasurementOptions
): number {
  const index = createTerminalTextIndex(text, options);
  const graphemeIndex = index.visualColumnToGraphemeIndex(Math.max(0, Math.floor(column)));
  return index.graphemeIndexToCodeUnitOffset(graphemeIndex);
}

export function textSelectionBetween(anchor: number, offset: number): TextSelection {
  const startOffset = Math.min(anchor, offset);
  const endOffsetExclusive = Math.max(anchor, offset);
  return { startOffset, endOffsetExclusive };
}

export function clampedTextOffset(text: string, offset: number): number {
  return normalizeTextCursor(text, offset);
}

function toTextPointerAction(action: PointerSelectionAction<number>): TextPointerAction {
  return action.kind === 'placeCaret'
    ? { kind: 'placeCaret', offset: action.position }
    : { kind: action.kind, anchor: action.anchor, offset: action.position };
}

function pointerSelectionAction<TCoordinate>(
  event: RoutedPointerEvent,
  position: TCoordinate,
  positionAt: (event: RoutedPointerEvent) => TCoordinate | undefined
): PointerSelectionAction<TCoordinate> | undefined {
  if (event.kind === 'pointerDown') return { kind: 'placeCaret', position };
  if (event.kind !== 'dragStart' && event.kind !== 'drag' && event.kind !== 'dragEnd') return undefined;
  const pressLocalRow = event.pressLocalRow ?? event.localRow;
  const pressLocalColumn = event.pressLocalColumn ?? event.localColumn;
  const anchor = positionAt({
    ...event,
    row: event.pressRow ?? event.row,
    column: event.pressColumn ?? event.column,
    ...(pressLocalRow === undefined ? {} : { localRow: pressLocalRow }),
    ...(pressLocalColumn === undefined ? {} : { localColumn: pressLocalColumn })
  }) ?? position;
  return event.kind === 'dragEnd'
    ? { kind: 'endSelection', anchor, position }
    : { kind: 'extendSelection', anchor, position };
}

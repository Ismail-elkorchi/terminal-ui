import { createTerminalTextIndex, normalizeTextCursor } from '../../text/index.ts';
import type { TextMeasurementOptions, TextSelection } from '../../text/index.ts';
import type { TextPointerAction } from '../../interaction/text-pointer.ts';
import type { MessageResolution } from '../../interaction/message.ts';
import { ignoreMessage } from '../../interaction/message.ts';
import type { Rect } from '../model/layout.ts';
import type { RoutedPointerEvent } from '../../input/pointer.ts';
import type { HitTarget } from '../model/renderer.ts';

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
  if (toMessage === undefined) return [];
  if (input.bounds.width <= 0 || input.bounds.height <= 0) return [];
  return [{
    id: input.id,
    bounds: input.bounds,
    accepts: ['pointerDown', 'dragStart', 'drag', 'dragEnd'],
    ...(input.focusTargetId === undefined
      ? {}
      : { focus: { kind: 'target' as const, targetId: input.focusTargetId } }),
    cursor: 'text',
    message(event) {
      const offset = input.offsetAt(event);
      if (offset === undefined) return ignoreMessage();
      const action = textPointerAction(event, offset, (candidate) => input.offsetAt(candidate));
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
  const start = Math.min(anchor, offset);
  const end = Math.max(anchor, offset);
  return { start, end };
}

export function clampedTextOffset(text: string, offset: number): number {
  return normalizeTextCursor(text, offset);
}

function textPointerAction(
  event: RoutedPointerEvent,
  offset: number,
  offsetAt: (event: RoutedPointerEvent) => number | undefined
): TextPointerAction | undefined {
  switch (event.kind) {
    case 'pointerDown':
      return { kind: 'placeCaret', offset };
    case 'dragStart':
    case 'drag':
      return selectionAction('extendSelection', event, offset, offsetAt);
    case 'dragEnd':
      return selectionAction('endSelection', event, offset, offsetAt);
    default:
      return undefined;
  }
}

function selectionAction(
  kind: 'extendSelection' | 'endSelection',
  event: RoutedPointerEvent,
  offset: number,
  offsetAt: (event: RoutedPointerEvent) => number | undefined
): TextPointerAction {
  const pressLocalRow = event.pressLocalRow ?? event.localRow;
  const pressLocalColumn = event.pressLocalColumn ?? event.localColumn;
  const anchor = offsetAt({
    ...event,
    row: event.pressRow ?? event.row,
    column: event.pressColumn ?? event.column,
    ...(pressLocalRow === undefined ? {} : { localRow: pressLocalRow }),
    ...(pressLocalColumn === undefined ? {} : { localColumn: pressLocalColumn })
  }) ?? offset;
  return { kind, anchor, offset };
}

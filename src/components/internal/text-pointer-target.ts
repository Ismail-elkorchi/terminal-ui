import { ignoreMessage } from '../../interaction/message.ts';
import type { MessageResolution } from '../../interaction/message.ts';
import type {
  TextContextMenuEvent,
  TextPointerTransition,
} from '../../interaction/text-pointer.ts';
import type { TextSelection } from '../../text/types.ts';
import type { HitTarget, Rect } from '../../renderer/contracts.ts';
import type { RoutedPointerEvent } from '../../input/pointer.ts';

export interface TextPointerTargetInput<TMessage> {
  readonly id: string;
  readonly bounds: Rect;
  readonly selection?: TextSelection;
  readonly offsetAt: (event: RoutedPointerEvent, origin: 'current' | 'press') => number;
  readonly wordSelectionAt?: (offset: number) => TextSelection;
  readonly onPointer: (
    transition: TextPointerTransition,
    event: RoutedPointerEvent,
  ) => MessageResolution<TMessage>;
  readonly onContextMenu?: (event: TextContextMenuEvent) => MessageResolution<TMessage>;
  readonly focusTargetId?: string;
}

export function textPointerTarget<TMessage>(
  input: TextPointerTargetInput<TMessage>,
): HitTarget<TMessage> {
  return {
    id: input.id,
    bounds: input.bounds,
    accepts: [
      'pointerDown',
      'click',
      'dragStart',
      'drag',
      'dragEnd',
      ...(input.onContextMenu === undefined ? [] : ['contextMenu' as const]),
    ],
    cursor: 'text',
    ...(input.focusTargetId === undefined
      ? {}
      : { focus: { kind: 'target' as const, targetId: input.focusTargetId } }),
    message(event) {
      const offset = input.offsetAt(event, 'current');
      if (event.kind === 'contextMenu') {
        return input.onContextMenu?.({
          kind: 'contextMenu',
          offset,
          ...(input.selection === undefined ? {} : { selection: input.selection }),
          row: event.row,
          column: event.column,
          modifiers: event.modifiers,
        }) ?? ignoreMessage();
      }
      if (event.button !== 'left') return ignoreMessage();
      if (event.kind === 'pointerDown') {
        return input.onPointer({ kind: 'placeCaret', offset }, event);
      }
      if (event.kind === 'click') {
        if (event.clickCount !== 2 || input.wordSelectionAt === undefined) return ignoreMessage();
        const selection = input.wordSelectionAt(offset);
        return input.onPointer({
          kind: 'endSelection',
          anchor: selection.startOffset,
          offset: selection.endOffsetExclusive,
        }, event);
      }
      if (event.kind !== 'dragStart' && event.kind !== 'drag' && event.kind !== 'dragEnd') {
        return ignoreMessage();
      }
      const anchor = input.offsetAt(event, 'press');
      return input.onPointer({
        kind: event.kind === 'dragEnd' ? 'endSelection' : 'extendSelection',
        anchor,
        offset,
      }, event);
    },
  };
}

import { createTerminalTextIndex, normalizeTextCursor } from '../text/index.ts';
import type { TextMeasurementOptions, TextSelection } from '../text/index.ts';
import type { RenderNodesOfKind } from '../render-node/index.ts';
import type { Rect } from './layout.ts';
import type { RoutedPointerEvent } from './pointer-types.ts';
import type { HitTarget } from './render-node-renderer.ts';

type TextPointerNode<TMessage> = RenderNodesOfKind<TMessage, 'commandBar' | 'textArea' | 'textInput'>;

export type TextPointerAction = 'placeCursor' | 'extendSelection' | 'endSelection';

export interface TextPointerEvent {
  readonly action: TextPointerAction;
  readonly offset: number;
  readonly pointer: RoutedPointerEvent;
}

export interface TextPointerHitTargetInput<TMessage> {
  readonly id: string;
  readonly bounds: Rect;
  readonly toMessage?: ((event: TextPointerEvent) => TMessage | undefined) | undefined;
  offsetAt(event: RoutedPointerEvent): number | undefined;
}

export function textPointerHitTargets<TMessage>(
  input: TextPointerHitTargetInput<TMessage>
): readonly HitTarget<TMessage>[] {
  if (input.toMessage === undefined) return [];
  if (input.bounds.width <= 0 || input.bounds.height <= 0) return [];
  return [{
    id: input.id,
    bounds: input.bounds,
    accepts: ['pointerDown', 'dragStart', 'drag', 'dragEnd'],
    cursor: 'text',
    message(event) {
      const action = textPointerAction(event);
      const offset = input.offsetAt(event);
      if (action === undefined || offset === undefined) return undefined;
      return input.toMessage?.({
        action,
        offset,
        pointer: event
      });
    }
  }];
}

export function textPointerMessageFactory<TMessage>(
  widget: TextPointerNode<TMessage>
): ((event: TextPointerEvent) => TMessage) | undefined {
  const raw = widget.props.toTextPointerMessage;
  return typeof raw === 'function'
    ? (event) => (raw)(event)
    : undefined;
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

function textPointerAction(event: RoutedPointerEvent): TextPointerAction | undefined {
  switch (event.kind) {
    case 'pointerDown':
      return 'placeCursor';
    case 'dragStart':
    case 'drag':
      return 'extendSelection';
    case 'dragEnd':
      return 'endSelection';
    default:
      return undefined;
  }
}

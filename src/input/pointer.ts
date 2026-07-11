import type { MouseButton, MouseEvent as TerminalMouseEvent, MouseModifiers } from './types.ts';

export type PointerEventKind =
  | 'pointerDown'
  | 'pointerUp'
  | 'click'
  | 'contextMenu'
  | 'scroll'
  | 'dragStart'
  | 'drag'
  | 'dragEnd'
  | 'hover'
  | 'enter'
  | 'leave';

export interface RoutedPointerEvent {
  readonly kind: PointerEventKind;
  readonly source: 'mouse';
  readonly row: number;
  readonly column: number;
  readonly localRow?: number;
  readonly localColumn?: number;
  readonly pressRow?: number;
  readonly pressColumn?: number;
  readonly pressLocalRow?: number;
  readonly pressLocalColumn?: number;
  readonly button: MouseButton;
  readonly modifiers: MouseModifiers;
  readonly deltaRows: number;
  readonly deltaColumns: number;
  readonly targetId?: string;
  readonly capturedTargetId?: string;
  readonly raw: TerminalMouseEvent;
}

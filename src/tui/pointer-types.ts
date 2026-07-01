import type { MouseButton, MouseEvent as TerminalMouseEvent, MouseModifiers } from '../input/index.ts';

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

export type PointerSource = 'mouse' | 'touch' | 'pen' | 'unknown';

export interface RoutedPointerEvent {
  readonly kind: PointerEventKind;
  readonly source: PointerSource;
  readonly row: number;
  readonly column: number;
  readonly localRow?: number;
  readonly localColumn?: number;
  readonly button: MouseButton;
  readonly modifiers: MouseModifiers;
  readonly deltaRows: number;
  readonly deltaColumns: number;
  readonly targetId?: string;
  readonly capturedTargetId?: string;
  readonly raw: TerminalMouseEvent;
}

import type { RoutedPointerEvent } from '../input/pointer.ts';

export type TextPointerAction = 'placeCursor' | 'extendSelection' | 'endSelection';

export interface TextPointerEvent {
  readonly action: TextPointerAction;
  readonly offset: number;
  readonly pointer: RoutedPointerEvent;
}

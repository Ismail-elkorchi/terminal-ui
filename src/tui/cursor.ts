import type { FrameCellSource } from './render-primitives.ts';

export interface CursorPosition {
  readonly row: number;
  readonly column: number;
  readonly source?: FrameCellSource;
}

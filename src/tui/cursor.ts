import type { FrameCellSource } from './render-primitives.ts';
import type { TerminalStyle } from './render-primitives.ts';

export interface CursorPosition {
  readonly row: number;
  readonly column: number;
  readonly style?: TerminalStyle;
  readonly source?: FrameCellSource;
}

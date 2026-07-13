import type { FrameCellSource, TerminalStyle } from '../../visual/render.ts';

export interface CursorPosition {
  readonly row: number;
  readonly column: number;
  readonly style?: TerminalStyle;
  readonly source?: FrameCellSource;
}

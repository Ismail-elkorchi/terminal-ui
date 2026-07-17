import type { Rect } from '../../geometry/types.ts';
import type { TextWidthProfile } from '../../text/index.ts';
import type {
  FrameCellSource,
  RenderBlock,
  RenderLine,
  RenderSpan,
  TerminalLink,
  TerminalStyle
} from '../../visual/render.ts';

export interface RenderTargetCell {
  readonly row: number;
  readonly column: number;
  readonly text: string;
  readonly width: number;
  readonly style?: TerminalStyle;
  readonly link?: TerminalLink;
  readonly source?: FrameCellSource;
  readonly continuation?: boolean;
}

export interface RenderTarget {
  readonly width: number;
  readonly height: number;
  readonly widthProfile: TextWidthProfile;
  write(row: number, column: number, spans: readonly RenderSpan[]): void;
  writeLine(row: number, column: number, line: RenderLine): void;
  writeBlock(row: number, column: number, block: RenderBlock): void;
  writeCell(cell: RenderTargetCell): void;
  clear(rect?: Rect): void;
}

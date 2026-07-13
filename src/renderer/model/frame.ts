import type { AccessibleSnapshot } from '../../accessibility/index.ts';
import type { FocusPath } from '../../interaction/focus.ts';
import type { Rect } from '../../geometry/types.ts';
import type { FrameCellSource, TerminalLink, TerminalStyle } from '../../visual/render.ts';
import type { CursorPosition } from './cursor.ts';

export interface Frame {
  readonly schemaVersion: 'terminal-ui.tui-frame.v1';
  readonly width: number;
  readonly height: number;
  readonly cells: readonly FrameCell[];
  readonly hitTargets?: readonly FrameHitTarget[];
  readonly cursor?: CursorPosition;
  readonly focusPath?: FocusPath;
  readonly accessibility: AccessibleSnapshot;
}

export interface FrameCell {
  readonly row: number;
  readonly column: number;
  readonly text: string;
  readonly width: number;
  readonly style?: TerminalStyle;
  readonly link?: TerminalLink;
  readonly source?: FrameCellSource;
  readonly continuation?: boolean;
}

export interface FrameHitTarget {
  readonly id: string;
  readonly bounds: Rect;
  readonly cursor?: 'pointer' | 'text' | 'default';
  readonly zIndex?: number;
}

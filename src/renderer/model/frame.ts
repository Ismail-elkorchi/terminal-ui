import type { AccessibleSnapshot } from '../../accessibility/index.ts';
import type { FocusPath, ResolvedPointerFocusIntent } from '../../interaction/focus.ts';
import type { PointerEventKind } from '../../input/pointer.ts';
import type { Rect } from '../../geometry/types.ts';
import type { FrameCellSource, TerminalLink, TerminalStyle } from '../../visual/render.ts';
import type { CursorPosition } from './cursor.ts';
import type { TextWidthProfile } from '../../text/index.ts';

export interface Frame {
  readonly schemaVersion: 'terminal-ui.tui-frame.v2';
  readonly width: number;
  readonly height: number;
  readonly widthProfile: TextWidthProfile;
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
  readonly accepts?: readonly PointerEventKind[];
  readonly focus?: ResolvedPointerFocusIntent;
  readonly cursor?: 'pointer' | 'text' | 'default';
  readonly zIndex?: number;
}

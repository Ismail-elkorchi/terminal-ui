import type { RenderSpan } from '../../visual/render.ts';
import type { CursorPosition } from './cursor.ts';
import type { Rect } from './layout.ts';
import type { TextWidthProfile } from '../../text/index.ts';

export interface RenderDiff {
  readonly schemaVersion: 'terminal-ui.render-diff.v3';
  readonly width: number;
  readonly height: number;
  readonly widthProfile: TextWidthProfile;
  readonly operations: readonly RenderOperation[];
  readonly cursor?: CursorPosition;
  readonly fullRewrite: boolean;
  readonly dirtyRegions?: readonly Rect[];
}

export interface FrameRowDiff {
  readonly row: number;
  readonly operations: readonly RenderOperation[];
}

export type RenderOperation =
  | { readonly kind: 'write'; readonly row: number; readonly column: number; readonly spans: readonly RenderSpan[] }
  | { readonly kind: 'clearRect'; readonly bounds: Rect };

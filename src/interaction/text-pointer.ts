import type { MouseModifiers } from '../input/types.ts';
import type { TextSelection } from '../text/types.ts';

export type PointerSelectionAction<TCoordinate> =
  | { readonly kind: 'placeCaret'; readonly position: TCoordinate }
  | { readonly kind: 'extendSelection'; readonly anchor: TCoordinate; readonly position: TCoordinate }
  | { readonly kind: 'endSelection'; readonly anchor: TCoordinate; readonly position: TCoordinate };

export type TextPointerAction =
  | { readonly kind: 'placeCaret'; readonly offset: number }
  | { readonly kind: 'extendSelection'; readonly anchor: number; readonly offset: number }
  | { readonly kind: 'endSelection'; readonly anchor: number; readonly offset: number };

export interface TextContextMenuEvent {
  readonly kind: 'contextMenu';
  readonly offset: number;
  readonly selection?: TextSelection;
  readonly row: number;
  readonly column: number;
  readonly modifiers: MouseModifiers;
}

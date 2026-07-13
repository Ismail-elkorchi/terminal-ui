import type { ElementFocusScope, ElementLayerOpacity } from '../../element/metadata.ts';
import type { Rect } from '../../geometry/types.ts';
import type { CursorPosition } from './cursor.ts';
import type { RenderNodeKind } from './types.ts';

export type { Rect } from '../../geometry/types.ts';

export interface Layer {
  readonly id: string;
  readonly zIndex: number;
  readonly bounds: Rect;
  readonly opacity: ElementLayerOpacity;
}

export interface LayoutFocusRegion {
  readonly id: string;
  readonly bounds: Rect;
  readonly cursor?: CursorPosition;
  readonly disabled: boolean;
  readonly order?: number;
  readonly scopeId?: string;
}

export interface LayoutNode {
  readonly id?: string;
  readonly identity: string;
  readonly kind: RenderNodeKind;
  readonly bounds: Rect;
  readonly layer: Layer;
  readonly visible: boolean;
  readonly focusable: boolean;
  readonly focusScope?: ElementFocusScope;
  readonly focusTargets: readonly LayoutFocusRegion[];
  readonly children: readonly LayoutNode[];
}

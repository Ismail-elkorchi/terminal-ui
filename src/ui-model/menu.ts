import type {
  AnchoredSurfaceAnchor,
  AnchoredSurfaceDismissReason
} from '../interaction/anchored-surface.ts';
import type { ScrollEvent } from '../interaction/scroll.ts';
import type { ComponentActionTone, ComponentTone, ItemBase } from './contracts.ts';
import type { InlineContent } from '../visual/inline-content.ts';

export interface MenuItem extends ItemBase {
  readonly leading?: InlineContent;
  readonly trailing?: InlineContent;
  readonly checked?: boolean;
  readonly shortcut?: string;
  readonly tone?: ComponentActionTone;
  readonly children?: readonly MenuItem[];
}

export type DividerOrientation = 'horizontal' | 'vertical';
export type DividerLineKind = 'single' | 'double' | 'heavy' | 'dashed' | 'dotted' | 'ascii' | 'empty';
export type TooltipTone = Extract<ComponentTone, 'default' | 'info' | 'success' | 'warning' | 'error'>;

export type MenuAction =
  | { readonly kind: 'focus'; readonly id: string }
  | { readonly kind: 'move'; readonly delta: number }
  | { readonly kind: 'first' }
  | { readonly kind: 'last' }
  | { readonly kind: 'enter' }
  | { readonly kind: 'back' }
  | { readonly kind: 'activate'; readonly id: string }
  | { readonly kind: 'scroll'; readonly event: ScrollEvent };

export type MenuBarAction =
  | { readonly kind: 'focusHeading'; readonly id: string }
  | { readonly kind: 'moveHeading'; readonly delta: number }
  | { readonly kind: 'firstHeading' }
  | { readonly kind: 'lastHeading' }
  | { readonly kind: 'open'; readonly id?: string }
  | { readonly kind: 'close'; readonly reason: AnchoredSurfaceDismissReason }
  | { readonly kind: 'activateHeading'; readonly id: string }
  | { readonly kind: 'menu'; readonly action: MenuAction };

export type ContextMenuAction =
  | { readonly kind: 'open'; readonly anchor: AnchoredSurfaceAnchor }
  | { readonly kind: 'dismiss'; readonly reason: AnchoredSurfaceDismissReason }
  | { readonly kind: 'menu'; readonly action: MenuAction };

export type DropdownMenuAction =
  | { readonly kind: 'open' }
  | { readonly kind: 'toggle' }
  | { readonly kind: 'dismiss'; readonly reason: AnchoredSurfaceDismissReason }
  | { readonly kind: 'menu'; readonly action: MenuAction };

export type TooltipPresentation =
  | { readonly kind: 'hidden' }
  | { readonly kind: 'visible'; readonly anchor: AnchoredSurfaceAnchor };

import type { ScrollEvent } from '../interaction/scroll.ts';
import type { ComponentActionTone, ComponentTone, HierarchyItem, ItemBase } from './contracts.ts';

export interface MenuItem extends ItemBase, HierarchyItem<MenuItem> {
  readonly checked?: boolean;
  readonly shortcut?: string;
  readonly tone?: ComponentActionTone;
}

export type DividerOrientation = 'horizontal' | 'vertical';
export type DividerLineKind = 'single' | 'double' | 'heavy' | 'dashed' | 'dotted' | 'ascii' | 'empty';
export type TooltipPlacement = 'auto' | 'above' | 'below' | 'left' | 'right' | 'cursor';
export type TooltipTone = Extract<ComponentTone, 'default' | 'info' | 'success' | 'warning' | 'error'>;

export type MenuAction =
  | { readonly kind: 'select'; readonly id: string }
  | { readonly kind: 'move'; readonly delta: number }
  | { readonly kind: 'first' }
  | { readonly kind: 'last' }
  | { readonly kind: 'activate'; readonly id: string }
  | { readonly kind: 'expand'; readonly id: string }
  | { readonly kind: 'collapse'; readonly id: string }
  | { readonly kind: 'scroll'; readonly event: ScrollEvent };

export type DropdownMenuAction =
  | { readonly kind: 'open' }
  | { readonly kind: 'close' }
  | { readonly kind: 'toggle' }
  | { readonly kind: 'highlight'; readonly id: string }
  | { readonly kind: 'move'; readonly delta: number }
  | { readonly kind: 'first' }
  | { readonly kind: 'last' }
  | { readonly kind: 'activate'; readonly id: string };

export type DropdownMenuPresentation =
  | { readonly kind: 'closed'; readonly selected?: string }
  | { readonly kind: 'open'; readonly selected?: string; readonly highlighted?: string };

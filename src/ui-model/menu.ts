import type {
  AnchoredSurfaceAnchor,
  AnchoredSurfaceDismissReason
} from '../interaction/anchored-surface.ts';
import type { ScrollEvent } from '../interaction/scroll.ts';
import type { ScrollState } from '../interaction/scroll.ts';
import type { ComponentActionTone, ComponentTone, ItemBase } from './contracts.ts';
import type { InlineContent } from '../visual/inline-content.ts';
import { assertUniqueRecursiveIds } from './identity.ts';

interface MenuItemBase extends ItemBase {
  readonly leading?: InlineContent;
  readonly trailing?: InlineContent;
  readonly shortcut?: string;
  readonly tone?: ComponentActionTone;
}

export interface MenuActionItem extends MenuItemBase {
  readonly kind: 'action';
}

export interface MenuCheckItem extends MenuItemBase {
  readonly kind: 'check';
  readonly checked: boolean;
}

export interface MenuSubmenuItem extends MenuItemBase {
  readonly kind: 'submenu';
  readonly children: readonly [MenuItem, ...MenuItem[]];
}

export type MenuItem = MenuActionItem | MenuCheckItem | MenuSubmenuItem;

export type MenuPresentationItem =
  | Exclude<MenuItem, { readonly kind: 'submenu' }>
  | Omit<Extract<MenuItem, { readonly kind: 'submenu' }>, 'children'> & {
      readonly expanded?: boolean;
      readonly children: readonly MenuPresentationItem[];
    };

export interface MenuPresentation {
  readonly activePath: readonly string[];
  readonly items: readonly MenuPresentationItem[];
  readonly scroll?: ScrollState;
}

export type MenuBarPresentation =
  | { readonly kind: 'closed'; readonly active?: string }
  | { readonly kind: 'open'; readonly active: string; readonly menu: MenuPresentation };

export type ContextMenuPresentation =
  | { readonly kind: 'closed' }
  | { readonly kind: 'open'; readonly anchor: AnchoredSurfaceAnchor; readonly menu: MenuPresentation };

export type DropdownMenuPresentation =
  | { readonly kind: 'closed'; readonly active?: string }
  | { readonly kind: 'open'; readonly active?: string; readonly menu: MenuPresentation };

type MenuItemStructure =
  | MenuActionItem
  | MenuCheckItem
  | Omit<MenuSubmenuItem, 'children'> & { readonly children: readonly MenuItemStructure[] };

export function menuItemChildren(item: MenuItem): readonly MenuItem[] {
  return item.kind === 'submenu' ? item.children : [];
}

export function assertValidMenuItems(items: readonly MenuItemStructure[]): void {
  const validate = (siblings: readonly MenuItemStructure[]): void => {
    for (const item of siblings) {
      switch (item.kind) {
        case 'action': break;
        case 'check':
          if (typeof item.checked !== 'boolean') throw new TypeError(`menu check item ${item.id} requires boolean checked state.`);
          break;
        case 'submenu':
          if (!Array.isArray(item.children) || item.children.length === 0) {
            throw new TypeError(`menu submenu item ${item.id} requires at least one child.`);
          }
          validate(item.children);
          break;
        default:
          throw new TypeError('menu items require an action, check, or submenu kind.');
      }
    }
  };
  validate(items);
  assertUniqueRecursiveIds(items, (item) => ({
    id: item.id,
    children: item.kind === 'submenu' ? item.children : []
  }), 'menu');
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

import type {
  AnchoredSurfaceAnchor,
  AnchoredSurfaceDismissReason
} from '../interaction/anchored-surface.ts';
import type { ScrollRequest } from '../interaction/scroll.ts';
import type { ScrollState } from '../interaction/scroll.ts';
import type { LabeledItem } from '../collection/item.ts';
import type { InlineContent } from '../visual/inline-content.ts';
import { assertUniqueRecursiveIds } from '../collection/identity.ts';

interface MenuItemBase extends LabeledItem {
  readonly leading?: InlineContent;
  readonly trailing?: InlineContent;
  readonly shortcut?: import('../interaction/key-binding.ts').KeyboardBinding;
  readonly tone?: MenuActionTone;
}

export type MenuActionTone = 'default' | 'destructive';

export interface MenuActionItem extends MenuItemBase {
  readonly kind: 'action';
}

export interface MenuCheckItem extends MenuItemBase {
  readonly kind: 'check';
  readonly checked: boolean;
}

export interface MenuRadioItem extends MenuItemBase {
  readonly kind: 'radio';
  readonly groupId: string;
  readonly checked: boolean;
}

export interface MenuSeparatorItem {
  readonly kind: 'separator';
  readonly id: string;
}

export interface MenuSectionItem {
  readonly kind: 'section';
  readonly id: string;
  readonly label?: string;
  readonly children: readonly [MenuItem, ...MenuItem[]];
}

export interface MenuSubmenuItem extends MenuItemBase {
  readonly kind: 'submenu';
  readonly children: readonly [MenuItem, ...MenuItem[]];
}

export type MenuItem =
  | MenuActionItem
  | MenuCheckItem
  | MenuRadioItem
  | MenuSubmenuItem
  | MenuSeparatorItem
  | MenuSectionItem;

export type MenuViewItem =
  | MenuActionItem
  | MenuCheckItem
  | MenuRadioItem
  | MenuSeparatorItem
  | Omit<MenuSubmenuItem, 'children'> & {
      readonly expanded?: boolean;
      readonly children: readonly MenuViewItem[];
    }
  | Omit<MenuSectionItem, 'children'> & {
      readonly children: readonly MenuViewItem[];
    };

export interface MenuView {
  readonly activePath: readonly string[];
  readonly items: readonly MenuViewItem[];
  readonly scroll?: ScrollState;
}

export type MenuBarView =
  | { readonly kind: 'closed'; readonly active?: string }
  | { readonly kind: 'open'; readonly active: string; readonly menu: MenuView };

export type ContextMenuView =
  | { readonly kind: 'closed' }
  | { readonly kind: 'open'; readonly anchor: AnchoredSurfaceAnchor; readonly menu: MenuView };

export type MenuTriggerView =
  | { readonly kind: 'closed'; readonly active?: string }
  | { readonly kind: 'open'; readonly active?: string; readonly menu: MenuView };

type MenuItemStructure =
  | MenuActionItem
  | MenuCheckItem
  | MenuRadioItem
  | MenuSeparatorItem
  | Omit<MenuSectionItem, 'children'> & { readonly children: readonly MenuItemStructure[] }
  | Omit<MenuSubmenuItem, 'children'> & { readonly children: readonly MenuItemStructure[] };

export function menuItemChildren(item: MenuItem): readonly MenuItem[] {
  return item.kind === 'submenu' || item.kind === 'section' ? item.children : [];
}

export function assertValidMenuItems(items: readonly MenuItemStructure[]): void {
  const validate = (siblings: readonly MenuItemStructure[]): void => {
    const selectedRadioGroups = new Set<string>();
    for (const item of siblings) {
      switch (item.kind) {
        case 'action': break;
        case 'check':
          if (typeof item.checked !== 'boolean') throw new TypeError(`menu check item ${item.id} requires boolean checked state.`);
          break;
        case 'radio':
          if (typeof item.checked !== 'boolean' || item.groupId.trim() === '') {
            throw new TypeError(`menu radio item ${item.id} requires checked state and groupId.`);
          }
          if (item.checked && selectedRadioGroups.has(item.groupId)) {
            throw new TypeError(`menu radio group ${item.groupId} cannot contain more than one checked item.`);
          }
          if (item.checked) selectedRadioGroups.add(item.groupId);
          break;
        case 'separator': break;
        case 'section':
          if (!Array.isArray(item.children) || item.children.length === 0) {
            throw new TypeError(`menu section ${item.id} requires at least one child.`);
          }
          validate(item.children);
          break;
        case 'submenu':
          if (!Array.isArray(item.children) || item.children.length === 0) {
            throw new TypeError(`menu submenu item ${item.id} requires at least one child.`);
          }
          validate(item.children);
          break;
        default:
          throw new TypeError('menu item kind is invalid.');
      }
    }
  };
  validate(items);
  assertUniqueRecursiveIds(items, (item) => ({
    id: item.id,
    children: item.kind === 'submenu' || item.kind === 'section' ? item.children : []
  }), 'menu');
}

export type MenuTransition =
  | { readonly kind: 'setActive'; readonly id: string }
  | { readonly kind: 'move'; readonly delta: number }
  | { readonly kind: 'first' }
  | { readonly kind: 'last' }
  | { readonly kind: 'enter' }
  | { readonly kind: 'back' }
  | { readonly kind: 'scroll'; readonly request: ScrollRequest };

export interface MenuActivateEvent {
  readonly kind: 'activate';
  readonly id: string;
}

export type MenuBarTransition =
  | { readonly kind: 'setActiveHeading'; readonly id: string }
  | { readonly kind: 'moveHeading'; readonly delta: number }
  | { readonly kind: 'firstHeading' }
  | { readonly kind: 'lastHeading' }
  | { readonly kind: 'open'; readonly id?: string }
  | { readonly kind: 'close'; readonly reason: AnchoredSurfaceDismissReason }
  | { readonly kind: 'activateHeading'; readonly id: string }
  | { readonly kind: 'menu'; readonly transition: MenuTransition };

export type ContextMenuTransition =
  | { readonly kind: 'open'; readonly anchor: AnchoredSurfaceAnchor }
  | { readonly kind: 'dismiss'; readonly reason: AnchoredSurfaceDismissReason }
  | { readonly kind: 'menu'; readonly transition: MenuTransition };

export type MenuTriggerTransition =
  | { readonly kind: 'open' }
  | { readonly kind: 'toggle' }
  | { readonly kind: 'dismiss'; readonly reason: AnchoredSurfaceDismissReason }
  | { readonly kind: 'menu'; readonly transition: MenuTransition };

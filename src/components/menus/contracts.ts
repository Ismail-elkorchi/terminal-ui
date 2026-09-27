import type {
  ContextMenuTransition,
  MenuActivateEvent,
  MenuBarTransition,
  MenuBarView,
  MenuItem,
  MenuTransition,
  MenuTriggerTransition,
  MenuView,
} from '../../behavior/menu.ts';
import type { ComponentMessage } from '../../component/message.ts';
import type { Element } from '../../element/types.ts';
import type { AnchoredSurfacePlacement } from '../../interaction/anchored-surface.ts';
import type { ScrollPolicy, ScrollState } from '../../interaction/scroll.ts';
import type { ScrollbarOptions } from '../../interaction/scrollbar.ts';
import type { InlineContent } from '../../visual/inline-content.ts';
import type { MenuStylePart } from '../style-parts.ts';
import type {
  ContextMenuOptions,
  MenuBarOptions,
  MenuOptions,
  MenuTriggerOptions,
} from './options.ts';


export interface MenuItemModelBase {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly disabled: boolean;
  readonly leading?: InlineContent;
  readonly trailing?: InlineContent;
  readonly shortcut?: import('../../interaction/key-binding.ts').KeyboardBinding;
  readonly tone: 'default' | 'destructive';
  readonly children: readonly MenuItemModel[];
}

export type MenuItemModel =
  | (MenuItemModelBase & { readonly kind: 'action' })
  | (MenuItemModelBase & { readonly kind: 'check'; readonly checked: boolean })
  | (MenuItemModelBase & { readonly kind: 'radio'; readonly checked: boolean; readonly groupId: string })
  | (MenuItemModelBase & { readonly kind: 'separator' })
  | (MenuItemModelBase & { readonly kind: 'section' })
  | (MenuItemModelBase & { readonly kind: 'submenu'; readonly expanded?: boolean });

export type MenuRow = MenuItemModel & { readonly depth: number };

export interface MenuContentModel {
  readonly activePath: readonly string[];
  readonly items: readonly MenuItemModel[];
  readonly scroll?: ScrollState;
}

export interface MenuModel {
  readonly items: readonly MenuItemModel[];
  readonly rows: readonly MenuRow[];
  readonly activePath: readonly string[];
  readonly emptyText: string;
  readonly scroll?: ScrollState;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
}

export interface MenuOwnOptions {
  readonly view: MenuView;
  readonly emptyText?: string;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
}

export type MenuComponentAction =
  | { readonly kind: 'transition'; readonly transition: MenuTransition }
  | { readonly kind: 'activate'; readonly event: MenuActivateEvent };

export type MenuFactory = <const TMessage extends ComponentMessage = never>(
  options: MenuOptions<TMessage>,
) => Element<TMessage>;

export interface MenuBarModel {
  readonly items: readonly MenuItemModel[];
  readonly view:
    | { readonly kind: 'closed'; readonly active?: string }
    | {
      readonly kind: 'open';
      readonly active: string;
      readonly popupAccessibleName: string;
      readonly menu: MenuContentModel;
    };
  readonly maxVisibleItems: number;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
}

export interface MenuBarOwnOptions {
  readonly items: readonly MenuItem[];
  readonly view: MenuBarView;
  readonly maxVisibleItems?: number;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
}

export type MenuBarFactory = <const TMessage extends ComponentMessage = never>(
  options: MenuBarOptions<TMessage>,
) => Element<TMessage>;

export type MenuBarComponentAction =
  | { readonly kind: 'transition'; readonly transition: MenuBarTransition }
  | { readonly kind: 'activate'; readonly event: MenuActivateEvent };

export interface ContextMenuModel {
  readonly view:
    | { readonly kind: 'closed' }
    | {
      readonly kind: 'open';
      readonly anchor: import('../../interaction/anchored-surface.ts').AnchoredSurfaceAnchor;
      readonly menu: MenuContentModel;
    };
  readonly title?: string;
  readonly emptyText: string;
  readonly placement: AnchoredSurfacePlacement;
  readonly maxVisibleItems: number;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
}

export type ContextOwnOptions = Omit<
  ContextMenuOptions<ComponentMessage>,
  'id' | 'onTransition' | 'onActivate' | 'styles' | 'meta' | 'disabled' | 'busy' | 'inert'
>;

export type ContextMenuFactory = <const TMessage extends ComponentMessage = never>(
  options: ContextMenuOptions<TMessage>,
) => Element<TMessage>;

export type ContextMenuComponentAction =
  | { readonly kind: 'transition'; readonly transition: ContextMenuTransition }
  | { readonly kind: 'activate'; readonly event: MenuActivateEvent };

export interface MenuTriggerModel {
  readonly label: string;
  readonly items: readonly MenuItemModel[];
  readonly view:
    | { readonly kind: 'closed'; readonly active?: string }
    | { readonly kind: 'open'; readonly active?: string; readonly menu: MenuContentModel };
  readonly placeholder: string;
  readonly placement: AnchoredSurfacePlacement;
  readonly maxVisibleItems: number;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
}

export type MenuTriggerOwnOptions = Omit<
  MenuTriggerOptions<ComponentMessage>,
  'id' | 'onTransition' | 'onActivate' | 'styles' | 'meta' | 'disabled' | 'busy' | 'inert'
>;

export type MenuTriggerFactory = <const TMessage extends ComponentMessage = never>(
  options: MenuTriggerOptions<TMessage>,
) => Element<TMessage>;

export type MenuTriggerComponentAction =
  | { readonly kind: 'transition'; readonly transition: MenuTriggerTransition }
  | { readonly kind: 'activate'; readonly event: MenuActivateEvent };

export interface MenuPopupOptions {
  readonly id?: string;
  readonly view: MenuContentModel;
  readonly accessibleName: string;
  readonly maxVisibleItems: number;
  readonly emit: (
    action: MenuComponentAction,
  ) => import('../../interaction/index.ts').MessageResolution<ComponentMessage>;
  readonly dismissOutside: () => import('../../interaction/index.ts').MessageResolution<ComponentMessage>;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
  readonly styles?: import('../../element/metadata.ts').ElementStyles<MenuStylePart>;
  readonly placement?: AnchoredSurfacePlacement;
  readonly busy?: boolean;
}

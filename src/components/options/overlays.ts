import type { BorderOptions } from '../../visual/border.ts';
import type { ComponentMessage } from '../../component/index.ts';
import type { AnchoredSurfacePlacement } from '../../interaction/anchored-surface.ts';
import type { ScrollPolicy } from '../../interaction/scroll.ts';
import type { ScrollbarOptions } from '../../interaction/scrollbar.ts';
import type {
  ContextMenuTransition,
  ContextMenuView,
  MenuTriggerTransition,
  MenuTriggerView,
  MenuActivateEvent,
  MenuTransition,
  MenuBarTransition,
  MenuBarView,
  MenuItem,
  MenuView
} from '../../behavior/menu.ts';
import type { Element } from '../../element/index.ts';
import type { MessageResolution } from '../../interaction/message.ts';
import type { MenuStylePart, TooltipStylePart } from '../style-parts.ts';
import type { ComponentDensity } from '../density.ts';
import type { ComponentMetadataOptions } from '../../component/index.ts';
import type { TooltipTone, TooltipTransition } from '../tooltip.ts';

interface InteractiveMenuOptions {
  readonly id: string;
  readonly disabled?: boolean;
  readonly busy?: boolean;
  readonly inert?: boolean;
  readonly styles?: import("../../element/metadata.ts").ElementStyles<MenuStylePart, 'focused' | 'hovered' | 'pressed' | 'active' | 'selected' | 'disabled' | 'busy'>;
  readonly meta?: ComponentMetadataOptions<readonly ['focus', 'layer', 'styles']>;
}

interface MenuCallbacks<TTransition, TMessage extends ComponentMessage> {
  readonly onTransition: (transition: TTransition) => MessageResolution<TMessage>;
  readonly onActivate?: (event: MenuActivateEvent) => MessageResolution<TMessage>;
}

interface DisabledMenuCallbacks {
  readonly onTransition?: never;
  readonly onActivate?: never;
}

type MenuAvailability<TTransition, TMessage extends ComponentMessage> =
  | (MenuCallbacks<TTransition, TMessage> & {
      readonly disabled?: false;
      readonly inert?: false;
    })
  | (DisabledMenuCallbacks & (
      | {
          readonly disabled: true;
          readonly busy?: never;
          readonly inert?: boolean;
        }
      | {
          readonly disabled?: false;
          readonly inert: true;
        }
    ));

export type MenuOptions<TMessage extends ComponentMessage = never> = InteractiveMenuOptions & {
  readonly view: MenuView;
  readonly emptyText?: string;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
} & MenuAvailability<MenuTransition, TMessage>;

export type MenuBarOptions<TMessage extends ComponentMessage = never> = InteractiveMenuOptions & {
  readonly items: readonly MenuItem[];
  readonly view: MenuBarView;
  readonly maxVisibleItems?: number;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
} & MenuAvailability<MenuBarTransition, TMessage>;

export type ContextMenuOptions<TMessage extends ComponentMessage = never> = InteractiveMenuOptions & {
  readonly view: ContextMenuView;
  readonly title?: string;
  readonly emptyText?: string;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
  readonly placement?: AnchoredSurfacePlacement;
  readonly maxVisibleItems?: number;
} & MenuAvailability<ContextMenuTransition, TMessage>;

export type MenuTriggerOptions<TMessage extends ComponentMessage = never> = InteractiveMenuOptions & {
  readonly label?: string;
  readonly items: readonly MenuItem[];
  readonly view: MenuTriggerView;
  readonly placeholder?: string;
  readonly density?: ComponentDensity;
  readonly placement?: AnchoredSurfacePlacement;
  readonly maxVisibleItems?: number;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
} & MenuAvailability<MenuTriggerTransition, TMessage>;

export interface TooltipOptions<
  TTrigger extends Element<ComponentMessage>,
  TMessage extends ComponentMessage = never
> {
  readonly id: string;
  readonly trigger: TTrigger;
  readonly content: string | readonly string[];
  readonly open: boolean;
  readonly title?: string;
  readonly tone?: TooltipTone;
  readonly placement?: AnchoredSurfacePlacement;
  readonly maxWidth?: number;
  readonly border?: BorderOptions;
  readonly styles?: import("../../element/metadata.ts").ElementStyles<TooltipStylePart>;
  readonly meta?: ComponentMetadataOptions<readonly ['styles']>;
  readonly onTransition: (transition: TooltipTransition) => MessageResolution<TMessage>;
}

export type {
  ContextMenuTransition,
  ContextMenuView,
  MenuTriggerTransition,
  MenuTriggerView,
  MenuActivateEvent,
  MenuActionItem,
  MenuActionTone,
  MenuBarTransition,
  MenuTransition,
  MenuBarView,
  MenuCheckItem,
  MenuRadioItem,
  MenuSectionItem,
  MenuSeparatorItem,
  MenuItem,
  MenuView,
  MenuViewItem,
  MenuSubmenuItem
} from '../../behavior/menu.ts';
export type { TooltipTransition, TooltipTone } from '../tooltip.ts';
export type { AnchoredSurfacePlacement } from '../../interaction/anchored-surface.ts';

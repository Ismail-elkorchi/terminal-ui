import type {
  ContextMenuTransition,
  ContextMenuView,
  MenuActivateEvent,
  MenuBarTransition,
  MenuBarView,
  MenuItem,
  MenuTransition,
  MenuTriggerTransition,
  MenuTriggerView,
  MenuView,
} from '../../behavior/menu.ts';
import type { ComponentMetadataOptions } from '../../component/contracts.ts';
import type { ComponentMessage } from '../../component/message.ts';
import type { AnchoredSurfacePlacement } from '../../interaction/anchored-surface.ts';
import type { MessageResolution } from '../../interaction/message.ts';
import type { ScrollPolicy } from '../../interaction/scroll.ts';
import type { ScrollbarOptions } from '../../interaction/scrollbar.ts';
import type { ComponentDensity } from '../density.ts';
import type { RetainedCallbacks } from '../shared/availability.ts';
import type { MenuStylePart } from '../style-parts.ts';


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

type MenuAvailability<TTransition, TMessage extends ComponentMessage> =
  | (MenuCallbacks<TTransition, TMessage> & {
      readonly disabled?: boolean;
      readonly inert?: boolean;
    })
  | (RetainedCallbacks<MenuCallbacks<TTransition, TMessage>> & (
      | {
          readonly disabled: true;
          readonly busy?: never;
          readonly inert?: boolean;
        }
      | {
          readonly disabled?: boolean;
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

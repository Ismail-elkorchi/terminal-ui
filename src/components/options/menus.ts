import type { BorderOptions } from '../../visual/border.ts';
import type { ComponentMessage } from '../../component/index.ts';
import type { AnchoredSurfacePlacement } from '../../interaction/anchored-surface.ts';
import type { ScrollPolicy } from '../../interaction/scroll.ts';
import type { ScrollbarOptions } from '../../interaction/scrollbar.ts';
import type {
  ContextMenuTransition,
  ContextMenuPresentation,
  DividerLineKind,
  DividerOrientation,
  MenuTriggerTransition,
  MenuTriggerPresentation,
  MenuActivateEvent,
  MenuTransition,
  MenuBarTransition,
  MenuBarPresentation,
  MenuItem,
  MenuPresentation,
  TooltipTransition,
  TooltipTone
} from '../../ui-model/menu.ts';
import type { Element } from '../../element/index.ts';
import type { PointerInteractionState } from '../../interaction/index.ts';
import type { MessageResolution } from '../../interaction/message.ts';
import type { DividerStylePart, MenuStylePart, TooltipStylePart } from '../../ui-model/style-parts.ts';
import type { ComponentDensity } from '../../ui-model/contracts.ts';
import type { ComponentMetadataOptions } from '../../component/index.ts';

interface InteractiveMenuOptions {
  readonly id: string;
  readonly pointerState?: PointerInteractionState;
  readonly disabled?: boolean;
  readonly readOnly?: boolean;
  readonly busy?: boolean;
  readonly inert?: boolean;
  readonly meta?: ComponentMetadataOptions<readonly ['focus', 'layer', 'styles'], MenuStylePart>;
}

interface MenuCallbacks<TTransition, TMessage extends ComponentMessage> {
  readonly onTransition: (transition: TTransition) => MessageResolution<TMessage>;
  readonly onActivate?: (event: MenuActivateEvent) => MessageResolution<TMessage>;
  readonly onPointerAction?: (action: import('../../interaction/pointer-interaction.ts').PointerInteractionAction) => MessageResolution<TMessage>;
}

interface DisabledMenuCallbacks {
  readonly onTransition?: never;
  readonly onActivate?: never;
  readonly onPointerAction?: never;
}

type MenuAvailability<TTransition, TMessage extends ComponentMessage> =
  | (MenuCallbacks<TTransition, TMessage> & {
      readonly disabled?: false;
      readonly inert?: false;
    })
  | (DisabledMenuCallbacks & (
      | {
          readonly disabled: true;
          readonly pointerState?: never;
          readonly readOnly?: never;
          readonly busy?: never;
          readonly inert?: boolean;
        }
      | {
          readonly disabled?: false;
          readonly inert: true;
          readonly readOnly?: never;
        }
    ));

export type MenuOptions<TMessage extends ComponentMessage = never> = InteractiveMenuOptions & {
  readonly presentation: MenuPresentation;
  readonly emptyText?: string;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
} & MenuAvailability<MenuTransition, TMessage>;

export type MenuBarOptions<TMessage extends ComponentMessage = never> = InteractiveMenuOptions & {
  readonly items: readonly MenuItem[];
  readonly presentation: MenuBarPresentation;
  readonly maxVisibleItems?: number;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
} & MenuAvailability<MenuBarTransition, TMessage>;

export type ContextMenuOptions<TMessage extends ComponentMessage = never> = InteractiveMenuOptions & {
  readonly presentation: ContextMenuPresentation;
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
  readonly presentation: MenuTriggerPresentation;
  readonly placeholder?: string;
  readonly density?: ComponentDensity;
  readonly placement?: AnchoredSurfacePlacement;
  readonly maxVisibleItems?: number;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
} & MenuAvailability<MenuTriggerTransition, TMessage>;

export interface DividerOptions {
  readonly id?: string;
  readonly orientation?: DividerOrientation;
  readonly line?: DividerLineKind;
  readonly label?: string;
  readonly labelAlign?: 'start' | 'center' | 'end';
  readonly meta?: ComponentMetadataOptions<readonly ['styles', 'layer'], DividerStylePart>;
}

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
  readonly meta?: ComponentMetadataOptions<readonly ['styles'], TooltipStylePart>;
  readonly onTransition: (action: TooltipTransition) => MessageResolution<TMessage>;
}

export type {
  ContextMenuTransition,
  ContextMenuPresentation,
  DividerLineKind,
  DividerOrientation,
  MenuTriggerTransition,
  MenuTriggerPresentation,
  MenuActivateEvent,
  MenuActionItem,
  MenuActionTone,
  MenuBarTransition,
  MenuTransition,
  MenuBarPresentation,
  MenuCheckItem,
  MenuRadioItem,
  MenuSectionItem,
  MenuSeparatorItem,
  MenuItem,
  MenuPresentation,
  MenuPresentationItem,
  MenuSubmenuItem,
  TooltipTransition,
  TooltipTone
} from '../../ui-model/menu.ts';
export type { AnchoredSurfacePlacement } from '../../interaction/anchored-surface.ts';

import type { BorderOptions } from '../../visual/border.ts';
import type { AnchoredSurfacePlacement } from '../../interaction/anchored-surface.ts';
import type { ScrollPolicy } from '../../interaction/scroll.ts';
import type { ScrollbarOptions } from '../../interaction/scrollbar.ts';
import type {
  ContextMenuAction,
  ContextMenuPresentation,
  DividerLineKind,
  DividerOrientation,
  DropdownMenuAction,
  DropdownMenuPresentation,
  MenuAction,
  MenuBarAction,
  MenuBarPresentation,
  MenuItem,
  MenuPresentation,
  TooltipPresentation,
  TooltipTone
} from '../../ui-model/menu.ts';
import type { ElementOptions } from '../../element/metadata.ts';
import type { PointerInteractionState } from '../../interaction/index.ts';
import type { MessageResolution } from '../../interaction/message.ts';
import type { DividerStylePart, MenuStylePart, TooltipStylePart } from '../../ui-model/style-parts.ts';
import type { ComponentDensity } from '../../ui-model/contracts.ts';
import type { ComponentMetadataOptions } from '../../component/index.ts';

interface InteractiveMenuOptions {
  readonly id: string;
  readonly pointerState?: PointerInteractionState;
  readonly meta?: ComponentMetadataOptions<readonly ['focus', 'layer', 'styles'], MenuStylePart>;
}

export interface MenuOptions<TMessage = never> extends InteractiveMenuOptions {
  readonly presentation: MenuPresentation;
  readonly emptyText?: string;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
  readonly onAction: (action: MenuAction) => MessageResolution<TMessage>;
}

export interface MenuBarOptions<TMessage = never> extends InteractiveMenuOptions {
  readonly items: readonly MenuItem[];
  readonly presentation: MenuBarPresentation;
  readonly maxVisibleItems?: number;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
  readonly onAction: (action: MenuBarAction) => MessageResolution<TMessage>;
}

export interface ContextMenuOptions<TMessage = never> extends InteractiveMenuOptions {
  readonly presentation: ContextMenuPresentation;
  readonly title?: string;
  readonly emptyText?: string;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
  readonly placement?: AnchoredSurfacePlacement;
  readonly maxVisibleItems?: number;
  readonly onAction: (action: ContextMenuAction) => MessageResolution<TMessage>;
}

export interface DropdownMenuOptions<TMessage = never> extends InteractiveMenuOptions {
  readonly label?: string;
  readonly items: readonly MenuItem[];
  readonly presentation: DropdownMenuPresentation;
  readonly placeholder?: string;
  readonly density?: ComponentDensity;
  readonly placement?: AnchoredSurfacePlacement;
  readonly maxVisibleItems?: number;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
  readonly onAction: (action: DropdownMenuAction) => MessageResolution<TMessage>;
}

export interface DividerOptions extends ElementOptions<DividerStylePart> {
  readonly orientation?: DividerOrientation;
  readonly line?: DividerLineKind;
  readonly label?: string;
  readonly labelAlign?: 'start' | 'center' | 'end';
}

export interface TooltipOptions {
  readonly id?: string;
  readonly content: string | readonly string[];
  readonly presentation: TooltipPresentation;
  readonly title?: string;
  readonly tone?: TooltipTone;
  readonly placement?: AnchoredSurfacePlacement;
  readonly maxWidth?: number;
  readonly border?: BorderOptions;
  readonly meta?: ComponentMetadataOptions<readonly ['styles'], TooltipStylePart>;
}

export type {
  ContextMenuAction,
  ContextMenuPresentation,
  DividerLineKind,
  DividerOrientation,
  DropdownMenuAction,
  DropdownMenuPresentation,
  MenuAction,
  MenuActionItem,
  MenuActionTone,
  MenuBarAction,
  MenuBarPresentation,
  MenuCheckItem,
  MenuItem,
  MenuPresentation,
  MenuPresentationItem,
  MenuSubmenuItem,
  TooltipPresentation,
  TooltipTone
} from '../../ui-model/menu.ts';
export type { AnchoredSurfacePlacement } from '../../interaction/anchored-surface.ts';

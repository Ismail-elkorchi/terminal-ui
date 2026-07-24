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
import type { ElementKeyBindings, ElementOptions, InteractiveElementOptions } from '../../element/metadata.ts';
import type { DividerStylePart, MenuStylePart, TooltipStylePart } from '../../ui-model/style-parts.ts';

export interface MenuOptions<TMessage = never> extends InteractiveElementOptions<MenuStylePart, TMessage> {
  readonly presentation: MenuPresentation;
  readonly emptyText?: string;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
  readonly onAction?: (action: MenuAction) => TMessage;
  readonly keys?: ElementKeyBindings<TMessage>;
}

export interface MenuBarOptions<TMessage = never> extends InteractiveElementOptions<MenuStylePart, TMessage> {
  readonly items: readonly MenuItem[];
  readonly presentation: MenuBarPresentation;
  readonly maxVisibleItems?: number;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
  readonly onAction?: (action: MenuBarAction) => TMessage;
  readonly keys?: ElementKeyBindings<TMessage>;
}

export interface ContextMenuOptions<TMessage = never> extends InteractiveElementOptions<MenuStylePart, TMessage> {
  readonly presentation: ContextMenuPresentation;
  readonly title?: string;
  readonly emptyText?: string;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
  readonly placement?: AnchoredSurfacePlacement;
  readonly maxVisibleItems?: number;
  readonly onAction?: (action: ContextMenuAction) => TMessage;
  readonly keys?: ElementKeyBindings<TMessage>;
}

export interface DropdownMenuOptions<TMessage = never> extends InteractiveElementOptions<MenuStylePart, TMessage> {
  readonly label?: string;
  readonly items: readonly MenuItem[];
  readonly presentation: DropdownMenuPresentation;
  readonly placeholder?: string;
  readonly placement?: AnchoredSurfacePlacement;
  readonly maxVisibleItems?: number;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
  readonly onAction?: (action: DropdownMenuAction) => TMessage;
  readonly keys?: ElementKeyBindings<TMessage>;
}

export interface DividerOptions extends ElementOptions<DividerStylePart> {
  readonly orientation?: DividerOrientation;
  readonly line?: DividerLineKind;
  readonly label?: string;
  readonly labelAlign?: 'start' | 'center' | 'end';
}

export interface TooltipOptions extends ElementOptions<TooltipStylePart> {
  readonly content: string | readonly string[];
  readonly presentation: TooltipPresentation;
  readonly title?: string;
  readonly tone?: TooltipTone;
  readonly placement?: AnchoredSurfacePlacement;
  readonly maxWidth?: number;
  readonly border?: BorderOptions;
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

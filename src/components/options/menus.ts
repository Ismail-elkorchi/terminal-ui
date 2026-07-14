import type { BorderOptions } from '../../visual/border.ts';
import type { ScrollPolicy, ScrollState } from '../../interaction/scroll.ts';
import type { ScrollbarOptions } from '../../interaction/scrollbar.ts';
import type {
  DividerLineKind,
  DividerOrientation,
  DropdownMenuAction,
  DropdownMenuPresentation,
  MenuAction,
  MenuItem,
  TooltipPlacement,
  TooltipTone
} from '../../ui-model/menu.ts';
import type { ElementKeyBindings, ElementOptions, InteractiveElementOptions } from '../../element/metadata.ts';
import type { DividerStylePart, MenuStylePart, TooltipStylePart } from '../../ui-model/style-parts.ts';

export interface MenuOptions<TMessage = never> extends InteractiveElementOptions<MenuStylePart, TMessage> {
  readonly items: readonly MenuItem[];
  readonly selected?: string;
  readonly emptyText?: string;
  readonly scroll?: ScrollState;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
  readonly onAction?: (action: MenuAction) => TMessage;
  readonly keys?: ElementKeyBindings<TMessage>;
}

export interface MenuBarOptions<TMessage = never> extends InteractiveElementOptions<MenuStylePart, TMessage> {
  readonly items: readonly MenuItem[];
  readonly selected?: string;
  readonly onAction?: (action: MenuAction) => TMessage;
  readonly keys?: ElementKeyBindings<TMessage>;
}

export interface ContextMenuOptions<TMessage = never> extends InteractiveElementOptions<MenuStylePart, TMessage> {
  readonly items: readonly MenuItem[];
  readonly selected?: string;
  readonly title?: string;
  readonly emptyText?: string;
  readonly scroll?: ScrollState;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
  readonly onAction?: (action: MenuAction) => TMessage;
  readonly keys?: ElementKeyBindings<TMessage>;
}

export interface DropdownMenuOptions<TMessage = never> extends InteractiveElementOptions<MenuStylePart, TMessage> {
  readonly label?: string;
  readonly items: readonly MenuItem[];
  readonly presentation: DropdownMenuPresentation;
  readonly placeholder?: string;
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
  readonly title?: string;
  readonly tone?: TooltipTone;
  readonly placement?: TooltipPlacement;
  readonly maxWidth?: number;
  readonly border?: BorderOptions;
}

export type {
  DividerLineKind,
  DividerOrientation,
  MenuItem,
  TooltipPlacement,
  TooltipTone
} from '../../ui-model/menu.ts';

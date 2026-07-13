import type { ScrollEvent, ScrollPolicy, ScrollState } from '../../../interaction/scroll.ts';
import type { ScrollbarOptions } from '../../../interaction/scrollbar.ts';
import type { BorderStyle } from '../../../visual/border.ts';
import type {
  DividerLineKind,
  DividerOrientation,
  DropdownAction,
  DropdownPresentation,
  MenuAction,
  MenuItem,
  TooltipPlacement,
  TooltipTone
} from '../../../ui-model/menu.ts';

export interface RenderMenuItem extends Omit<MenuItem, 'children'> {
  readonly children?: readonly RenderMenuItem[];
}

interface MenuCollectionRenderProps<TMessage> {
  readonly items: readonly RenderMenuItem[];
  readonly selected?: string;
  readonly emptyText?: string;
  readonly scroll?: ScrollState;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
  readonly toScrollMessage?: (event: ScrollEvent) => TMessage;
}

export interface MenuRenderProps<TMessage> extends MenuCollectionRenderProps<TMessage> {
  readonly toActionMessage?: (action: MenuAction) => TMessage;
}

export interface MenuBarRenderProps<TMessage> {
  readonly items: readonly RenderMenuItem[];
  readonly selected?: string;
  readonly toActionMessage?: (action: MenuAction) => TMessage;
}

export interface ContextMenuRenderProps<TMessage> extends MenuCollectionRenderProps<TMessage> {
  readonly title?: string;
  readonly toActionMessage?: (action: MenuAction) => TMessage;
}

export interface DropdownRenderProps<TMessage> extends MenuCollectionRenderProps<TMessage> {
  readonly label?: string;
  readonly presentation: DropdownPresentation;
  readonly placeholder?: string;
  readonly toDropdownActionMessage?: (action: DropdownAction) => TMessage;
}

export interface DividerRenderProps {
  readonly orientation?: DividerOrientation;
  readonly line?: DividerLineKind;
  readonly label?: string;
  readonly labelAlign?: 'start' | 'center' | 'end';
}

export interface TooltipRenderProps {
  readonly content: string | readonly string[];
  readonly title?: string;
  readonly tone?: TooltipTone;
  readonly placement?: TooltipPlacement;
  readonly maxWidth?: number;
  readonly border?: BorderStyle;
}

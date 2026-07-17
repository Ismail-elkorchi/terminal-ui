import type { ScrollEvent, ScrollPolicy } from '../../../interaction/scroll.ts';
import type { ScrollbarOptions } from '../../../interaction/scrollbar.ts';
import type { BorderOptions } from '../../../visual/border.ts';
import type { AnchoredSurfacePlacement } from '../../../interaction/anchored-surface.ts';
import type {
  ContextMenuAction,
  DividerLineKind,
  DividerOrientation,
  DropdownMenuAction,
  MenuAction,
  MenuBarAction,
  MenuItem,
  TooltipPresentation,
  TooltipTone
} from '../../../ui-model/menu.ts';
import type {
  ContextMenuPresentation,
  DropdownMenuPresentation,
  MenuBarPresentation,
  MenuPresentation
} from '../../../ui-model/menu.ts';

export type RenderMenuItem =
  | Exclude<MenuItem, { readonly kind: 'submenu' }>
  | Omit<Extract<MenuItem, { readonly kind: 'submenu' }>, 'children'> & {
      readonly expanded?: boolean;
      readonly children: readonly RenderMenuItem[];
    };

interface MenuCollectionRenderProps<TMessage> {
  readonly items: readonly RenderMenuItem[];
  readonly presentation: MenuPresentation;
  readonly emptyText?: string;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
  readonly toScrollMessage?: (event: ScrollEvent) => TMessage;
}

export interface MenuRenderProps<TMessage> extends MenuCollectionRenderProps<TMessage> {
  readonly toActionMessage?: (action: MenuAction) => TMessage;
}

export interface MenuBarRenderProps<TMessage> {
  readonly items: readonly RenderMenuItem[];
  readonly presentation: MenuBarPresentation;
  readonly maxVisibleItems: number;
  readonly toActionMessage?: (action: MenuBarAction) => TMessage;
}

export interface ContextMenuRenderProps<TMessage> {
  readonly presentation: ContextMenuPresentation;
  readonly title?: string;
  readonly placement?: AnchoredSurfacePlacement;
  readonly maxVisibleItems: number;
  readonly toActionMessage?: (action: ContextMenuAction) => TMessage;
}

export interface DropdownMenuRenderProps<TMessage> {
  readonly items: readonly RenderMenuItem[];
  readonly label?: string;
  readonly presentation: DropdownMenuPresentation;
  readonly placeholder?: string;
  readonly placement?: AnchoredSurfacePlacement;
  readonly maxVisibleItems: number;
  readonly toDropdownMenuActionMessage?: (action: DropdownMenuAction) => TMessage;
}

export interface DividerRenderProps {
  readonly orientation?: DividerOrientation;
  readonly line?: DividerLineKind;
  readonly label?: string;
  readonly labelAlign?: 'start' | 'center' | 'end';
}

export interface TooltipRenderProps {
  readonly content: string | readonly string[];
  readonly presentation: TooltipPresentation;
  readonly title?: string;
  readonly tone?: TooltipTone;
  readonly placement?: AnchoredSurfacePlacement;
  readonly maxWidth?: number;
  readonly border?: BorderOptions;
}

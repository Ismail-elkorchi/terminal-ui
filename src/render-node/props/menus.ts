import type {
  DividerOptions,
  MenuItem,
  MenuOptions,
  TooltipOptions
} from '../../components/options/menus.ts';
import type { ScrollEvent } from '../../behavior/scroll.ts';
import type { DropdownAction, MenuAction } from '../../components/menu.ts';
import type { AuthoredProps } from './shared.ts';

export interface RenderMenuItem extends Omit<MenuItem, 'children'> {
  readonly children?: readonly RenderMenuItem[];
}

interface MenuCollectionRenderProps<TMessage> {
  readonly items: readonly RenderMenuItem[];
  readonly selected?: string;
  readonly emptyText?: string;
  readonly scroll?: AuthoredProps<MenuOptions>['scroll'];
  readonly scrollbar?: AuthoredProps<MenuOptions>['scrollbar'];
  readonly scrollPolicy?: AuthoredProps<MenuOptions>['scrollPolicy'];
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
  readonly open?: boolean;
  readonly highlighted?: string;
  readonly placeholder?: string;
  readonly toDropdownActionMessage?: (action: DropdownAction) => TMessage;
}

export type DividerRenderProps = AuthoredProps<DividerOptions>;
export type TooltipRenderProps = AuthoredProps<TooltipOptions>;

import type {
  DividerOptions,
  MenuItem,
  MenuOptions,
  TooltipOptions
} from '../../components/options/menus.ts';
import type { ScrollEvent } from '../../tui/scroll.ts';
import type { AuthoredProps } from './shared.ts';

export interface RenderMenuItem<TMessage> extends Omit<MenuItem, 'onPress' | 'children'> {
  readonly message?: TMessage;
  readonly children?: readonly RenderMenuItem<TMessage>[];
}

interface MenuCollectionRenderProps<TMessage> {
  readonly items: readonly RenderMenuItem<TMessage>[];
  readonly selected?: string;
  readonly emptyText?: string;
  readonly scroll?: AuthoredProps<MenuOptions>['scroll'];
  readonly scrollbar?: AuthoredProps<MenuOptions>['scrollbar'];
  readonly scrollPolicy?: AuthoredProps<MenuOptions>['scrollPolicy'];
  readonly toScrollMessage?: (event: ScrollEvent) => TMessage;
}

export type MenuRenderProps<TMessage> = MenuCollectionRenderProps<TMessage>;

export interface MenuBarRenderProps<TMessage> {
  readonly items: readonly RenderMenuItem<TMessage>[];
  readonly selected?: string;
}

export interface ContextMenuRenderProps<TMessage> extends MenuCollectionRenderProps<TMessage> {
  readonly title?: string;
}

export interface DropdownRenderProps<TMessage> extends MenuCollectionRenderProps<TMessage> {
  readonly label?: string;
  readonly open?: boolean;
  readonly placeholder?: string;
}

export type DividerRenderProps = AuthoredProps<DividerOptions>;
export type TooltipRenderProps = AuthoredProps<TooltipOptions>;

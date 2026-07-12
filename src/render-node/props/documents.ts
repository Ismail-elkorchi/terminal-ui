import type {
  CommandBarOptions,
  PaletteOptions,
  ScrollbackOptions,
  StructuredBlock,
  StructuredBlockOptions
} from '../../ui-model/options/documents.ts';
import type { ViewportOptions } from '../../layout/options.ts';
import type { SearchEntry } from '../../ui-model/contracts.ts';
import type { TextPointerEvent } from '../../tui/text-pointer.ts';
import type { ScrollEvent } from '../../interaction/scroll.ts';
import type { AuthoredProps, ReplaceProps } from './shared.ts';
import type { ActivityFeedAction } from '../../ui-model/activity-feed.ts';

export type ViewportRenderProps<TMessage> = ReplaceProps<
  AuthoredProps<ViewportOptions>,
  'onScroll',
  { readonly toScrollMessage?: (event: ScrollEvent) => TMessage }
>;

export type ScrollbackRenderProps<TMessage> = ReplaceProps<
  AuthoredProps<ScrollbackOptions>,
  'onAction',
  { readonly toScrollMessage?: (event: ScrollEvent) => TMessage }
>;

export type StructuredBlockRenderProps = AuthoredProps<StructuredBlockOptions>;

export interface ActivityFeedRenderProps<TMessage> {
  readonly blocks: readonly StructuredBlock[];
  readonly selected?: number;
  readonly toActionMessage?: (action: ActivityFeedAction) => TMessage;
}

export type CommandBarRenderProps<TMessage> = ReplaceProps<
  AuthoredProps<CommandBarOptions>,
  'onAction' | 'onSubmit' | 'onTextPointer',
  { readonly toTextPointerMessage?: (event: TextPointerEvent) => TMessage }
> & { readonly value: string };

export interface PaletteRenderProps<TMessage> {
  readonly title?: string;
  readonly query?: string;
  readonly entries: readonly SearchEntry<unknown>[];
  readonly toMessage?: (entry: SearchEntry<unknown>) => TMessage;
  readonly selected?: number;
  readonly selectedId?: string;
  readonly scroll?: AuthoredProps<PaletteOptions<unknown>>['scroll'];
  readonly scrollbar?: AuthoredProps<PaletteOptions<unknown>>['scrollbar'];
  readonly scrollPolicy?: AuthoredProps<PaletteOptions<unknown>>['scrollPolicy'];
  readonly toScrollMessage?: (event: ScrollEvent) => TMessage;
  readonly maxVisible?: number;
  readonly helpText?: string;
  readonly emptyText?: string;
}

import type { ComponentMessage, ComponentMetadataOptions } from '../../component/index.ts';
import type {
  ScrollPolicy,
  ScrollbarOptions,
} from '../../interaction/index.ts';
import type { MessageResolution } from '../../interaction/message.ts';
import type {
  ListViewActivateEvent,
  ListViewControlTransition,
  ListViewTransition,
  ScrollableListViewState,
  UnscrolledListViewState,
} from '../../behavior/list-view.ts';
import type { ListViewItemRenderer, SemanticListItem } from '../list-item.ts';
import type { MeasuredWindow } from '../../collection/measured-window.ts';
import type { ListViewStylePart, SemanticListStylePart } from '../style-parts.ts';

export interface ListOptions<TItems extends readonly SemanticListItem[]> {
  readonly id?: string;
  readonly items: TItems;
  readonly ordered?: boolean;
  readonly styles?: import("../../element/metadata.ts").ElementStyles<SemanticListStylePart>;
  readonly meta?: ComponentMetadataOptions<readonly ['layer', 'styles']>;
}

interface ListViewBaseOptions<TValue, TContent extends import('../../element/index.ts').Element<ComponentMessage>> {
  readonly id: string;
  readonly window: MeasuredWindow<TValue>;
  readonly renderItem: ListViewItemRenderer<TValue, TContent>;
  readonly busy?: boolean;
  readonly inert?: boolean;
  readonly styles?: import("../../element/metadata.ts").ElementStyles<ListViewStylePart, 'focused' | 'hovered' | 'pressed' | 'active' | 'selected' | 'disabled' | 'busy'>;
  readonly meta?: ComponentMetadataOptions<readonly ['focus', 'layer', 'styles']>;
}

/** @beta */
export type ListViewScrollbarOptions = Omit<ScrollbarOptions, 'axis'> & {
  readonly axis?: 'vertical';
};

interface ActiveListViewOptions<TTransition, TMessage extends ComponentMessage> {
  readonly disabled?: false;
  readonly inert?: false;
  readonly onTransition: (transition: TTransition) => MessageResolution<TMessage>;
  readonly onActivate?: (event: ListViewActivateEvent) => MessageResolution<TMessage>;
}

interface InertListViewOptions {
  readonly disabled?: false;
  readonly inert: true;
  readonly onTransition?: never;
  readonly onActivate?: never;
}

interface DisabledListViewOptions {
  readonly disabled: true;
  readonly busy?: never;
  readonly onTransition?: never;
  readonly onActivate?: never;
}

/** @beta */
export type ListViewOptions<
  TValue,
  TContent extends import('../../element/index.ts').Element<ComponentMessage>,
  TMessage extends ComponentMessage = never,
> = UnscrolledListViewOptions<TValue, TContent, TMessage> | ScrollableListViewOptions<TValue, TContent, TMessage>;

/** @beta */
export type UnscrolledListViewOptions<
  TValue,
  TContent extends import('../../element/index.ts').Element<ComponentMessage>,
  TMessage extends ComponentMessage = never,
> = ListViewBaseOptions<TValue, TContent> & {
  readonly state: UnscrolledListViewState;
  readonly scrollbar?: never;
  readonly scrollPolicy?: never;
} & (ActiveListViewOptions<ListViewControlTransition, TMessage> | DisabledListViewOptions | InertListViewOptions);

/** @beta */
export type ScrollableListViewOptions<
  TValue,
  TContent extends import('../../element/index.ts').Element<ComponentMessage>,
  TMessage extends ComponentMessage = never,
> = ListViewBaseOptions<TValue, TContent> & {
  readonly state: ScrollableListViewState;
  readonly scrollbar?: ListViewScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
} & (ActiveListViewOptions<ListViewTransition, TMessage> | DisabledListViewOptions | InertListViewOptions);

export type {
  ListViewActivateEvent,
  ListViewControlTransition,
  ListViewState,
  ListViewTransition,
  ScrollableListViewState,
  UnscrolledListViewState,
} from '../../behavior/list-view.ts';
export type {
  ListViewItemRenderer,
  ListViewItemContent,
  SemanticListItem,
} from '../list-item.ts';
export type { MeasuredWindow } from '../../collection/measured-window.ts';

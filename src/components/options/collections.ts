import type { ComponentMessage, ComponentMetadataOptions } from '../../component/index.ts';
import type {
  PointerInteractionAction,
  PointerInteractionState,
  ScrollPolicy,
  ScrollbarOptions,
} from '../../interaction/index.ts';
import type { MessageResolution } from '../../interaction/message.ts';
import type {
  ListViewActivateEvent,
  ListViewControlTransition,
  ListViewItemRenderer,
  ListViewMeasuredWindow,
  ListViewTransition,
  ScrollableListViewPresentation,
  SemanticListItem,
  UnscrolledListViewPresentation,
} from '../../ui-model/semantic-list.ts';
import type { ListViewStylePart, SemanticListStylePart } from '../../ui-model/style-parts.ts';

export interface ListOptions<TItems extends readonly SemanticListItem[]> {
  readonly id?: string;
  readonly items: TItems;
  readonly ordered?: boolean;
  readonly meta?: ComponentMetadataOptions<readonly ['layer', 'styles'], SemanticListStylePart>;
}

interface ListViewBaseOptions<TValue, TContent extends import('../../element/index.ts').Element<ComponentMessage>> {
  readonly id: string;
  readonly window: ListViewMeasuredWindow<TValue>;
  readonly renderItem: ListViewItemRenderer<TValue, TContent>;
  readonly pointerState?: PointerInteractionState;
  readonly busy?: boolean;
  readonly inert?: boolean;
  readonly meta?: ComponentMetadataOptions<readonly ['focus', 'layer', 'styles'], ListViewStylePart>;
}

interface ActiveListViewOptions<TTransition, TMessage extends ComponentMessage> {
  readonly disabled?: false;
  readonly inert?: false;
  readonly onTransition: (action: TTransition) => MessageResolution<TMessage>;
  readonly onActivate?: (event: ListViewActivateEvent) => MessageResolution<TMessage>;
  readonly onPointerAction?: (action: PointerInteractionAction) => MessageResolution<TMessage>;
}

interface InertListViewOptions {
  readonly disabled?: false;
  readonly inert: true;
  readonly pointerState?: never;
  readonly onTransition?: never;
  readonly onActivate?: never;
  readonly onPointerAction?: never;
}

interface DisabledListViewOptions {
  readonly disabled: true;
  readonly pointerState?: never;
  readonly busy?: never;
  readonly onTransition?: never;
  readonly onActivate?: never;
  readonly onPointerAction?: never;
}

export type ListViewOptions<
  TValue,
  TContent extends import('../../element/index.ts').Element<ComponentMessage>,
  TMessage extends ComponentMessage = never,
> = UnscrolledListViewOptions<TValue, TContent, TMessage> | ScrollableListViewOptions<TValue, TContent, TMessage>;

export type UnscrolledListViewOptions<
  TValue,
  TContent extends import('../../element/index.ts').Element<ComponentMessage>,
  TMessage extends ComponentMessage = never,
> = ListViewBaseOptions<TValue, TContent> & {
  readonly presentation: UnscrolledListViewPresentation;
  readonly scrollbar?: never;
  readonly scrollPolicy?: never;
} & (ActiveListViewOptions<ListViewControlTransition, TMessage> | DisabledListViewOptions | InertListViewOptions);

export type ScrollableListViewOptions<
  TValue,
  TContent extends import('../../element/index.ts').Element<ComponentMessage>,
  TMessage extends ComponentMessage = never,
> = ListViewBaseOptions<TValue, TContent> & {
  readonly presentation: ScrollableListViewPresentation;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
} & (ActiveListViewOptions<ListViewTransition, TMessage> | DisabledListViewOptions | InertListViewOptions);

export type {
  ListViewActivateEvent,
  ListViewControlTransition,
  ListViewItemRenderer,
  ListViewMeasuredWindow,
  ListViewRenderedItem,
  ListViewPresentation,
  ListViewTransition,
  ScrollableListViewPresentation,
  SemanticListItem,
  UnscrolledListViewPresentation,
} from '../../ui-model/semantic-list.ts';

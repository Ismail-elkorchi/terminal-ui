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
  ListViewProjection,
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

interface ListViewBaseOptions<TProjection extends ListViewProjection> {
  readonly id: string;
  readonly projection: TProjection;
  readonly pointerState?: PointerInteractionState;
  readonly readOnly?: boolean;
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
  readonly readOnly?: never;
  readonly onTransition?: never;
  readonly onActivate?: never;
  readonly onPointerAction?: never;
}

interface DisabledListViewOptions {
  readonly disabled: true;
  readonly pointerState?: never;
  readonly readOnly?: never;
  readonly busy?: never;
  readonly onTransition?: never;
  readonly onActivate?: never;
  readonly onPointerAction?: never;
}

export type ListViewOptions<
  TProjection extends ListViewProjection,
  TMessage extends ComponentMessage = never,
> = UnscrolledListViewOptions<TProjection, TMessage> | ScrollableListViewOptions<TProjection, TMessage>;

export type UnscrolledListViewOptions<
  TProjection extends ListViewProjection,
  TMessage extends ComponentMessage = never,
> = ListViewBaseOptions<TProjection> & {
  readonly presentation: UnscrolledListViewPresentation;
  readonly scrollbar?: never;
  readonly scrollPolicy?: never;
} & (ActiveListViewOptions<ListViewControlTransition, TMessage> | DisabledListViewOptions | InertListViewOptions);

export type ScrollableListViewOptions<
  TProjection extends ListViewProjection,
  TMessage extends ComponentMessage = never,
> = ListViewBaseOptions<TProjection> & {
  readonly presentation: ScrollableListViewPresentation;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
} & (ActiveListViewOptions<ListViewTransition, TMessage> | DisabledListViewOptions | InertListViewOptions);

export type {
  ListViewActivateEvent,
  ListViewControlTransition,
  ListViewProjection,
  ListViewRecord,
  ListViewPresentation,
  ListViewTransition,
  ScrollableListViewPresentation,
  SemanticListItem,
  UnscrolledListViewPresentation,
} from '../../ui-model/semantic-list.ts';

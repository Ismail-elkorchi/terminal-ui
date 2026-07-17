import { elementFromRenderNode } from '../../renderer/model/element.ts';
import type { Element } from '../../element/index.ts';
import type {
  ListOptions,
  PassiveListOptions,
  ScrollableListOptions,
  PaginatorOptions,
  PassiveTableOptions,
  ScrollableTableOptions,
  TableOptions,
  PassiveTreeOptions,
  ScrollableTreeOptions,
  TreeOptions
} from '../options/content.ts';
import type { ScrollEvent } from '../../interaction/scroll.ts';
import { prepareListCollection } from '../../behavior/list.ts';
import { prepareTableCollection } from '../../behavior/table.ts';
import { prepareTreeCollection } from '../../behavior/tree.ts';
import type { ListControlAction } from '../../ui-model/list.ts';
import type { TableControlAction } from '../../ui-model/table.ts';
import {
  interactionProps,
  listKeyBindings,
  paginatorKeyBindings,
  tableKeyBindings,
  treeKeyBindings
} from '../internal/interaction.ts';
import { tableColumnsForRenderer } from '../internal/domain.ts';
import { requiredId } from '../../authoring/render-node.ts';
import type {
  ComponentKeyBindingMessages,
  IndependentInteractionOptions,
  InferredElementKeyBindings
} from '../internal/messages.ts';

/* eslint-disable @typescript-eslint/unified-signatures -- Separate overloads preserve contextual action types for passive and scrollable controls. */
export function list<
  TValue,
  const TActionMessage = unknown,
  const TPointerMessage = never,
  const TKeys extends InferredElementKeyBindings | undefined = undefined
>(
  options: IndependentInteractionOptions<
    ScrollableListOptions<TValue>,
    { readonly onAction: TActionMessage },
    TKeys,
    TPointerMessage
  >
): Element<TActionMessage | TPointerMessage | ComponentKeyBindingMessages<TKeys>>;
export function list<
  TValue,
  const TActionMessage = never,
  const TPointerMessage = never,
  const TKeys extends InferredElementKeyBindings | undefined = undefined
>(
  options: IndependentInteractionOptions<
    PassiveListOptions<TValue>,
    { readonly onAction: TActionMessage },
    TKeys,
    TPointerMessage
  >
): Element<TActionMessage | TPointerMessage | ComponentKeyBindingMessages<TKeys>>;
/* eslint-enable @typescript-eslint/unified-signatures */
export function list<TValue>(options: ListOptions<TValue, unknown>): Element<unknown> {
  const collection = options.collection ?? prepareListCollection(options.items, options.projectItem);
  if (collection.kind === 'window' && (options.filterQuery ?? '').trim().length > 0) {
    throw new TypeError('windowed list collections must be filtered before they are authored.');
  }
  const keyMap = listKeyBindings(options, collection);
  const toActionMessage: ((action: ListControlAction) => unknown) | undefined = options.onAction;
  const toScrollActionMessage = isScrollableListOptions(options) ? options.onAction : undefined;
  return elementFromRenderNode<'list', unknown>({
    ...requiredId(options.id, 'list'),
    kind: 'list',
    props: {
      collection,
      ...(options.selectedId === undefined ? {} : { selectedId: options.selectedId }),
      ...(options.filterQuery === undefined ? {} : { filterQuery: options.filterQuery }),
      ...(options.scroll === undefined ? {} : { scroll: options.scroll }),
      ...(options.scrollbar === undefined ? {} : { scrollbar: options.scrollbar }),
      ...(options.scrollPolicy === undefined ? {} : { scrollPolicy: options.scrollPolicy }),
      ...(toScrollActionMessage === undefined ? {} : {
        toScrollMessage: (event: ScrollEvent) => toScrollActionMessage({ kind: 'scroll', event })
      }),
      ...(toActionMessage === undefined ? {} : { toActionMessage })
    },
    ...(keyMap === undefined ? {} : { keyMap }),
    ...interactionProps({ pointer: options.pointer, meta: options.meta })
  });
}

function isScrollableListOptions<TValue, TMessage>(
  options: ListOptions<TValue, TMessage>
): options is ScrollableListOptions<TValue, TMessage> {
  return options.scroll !== undefined;
}

/* eslint-disable @typescript-eslint/unified-signatures -- Separate overloads preserve contextual action types for passive and scrollable controls. */
export function table<
  TRow,
  const TActionMessage = unknown,
  const TPointerMessage = never,
  const TKeys extends InferredElementKeyBindings | undefined = undefined
>(
  options:
    IndependentInteractionOptions<
      ScrollableTableOptions<TRow>,
      { readonly onAction: TActionMessage },
      TKeys,
      TPointerMessage
    >
): Element<TActionMessage | TPointerMessage | ComponentKeyBindingMessages<TKeys>>;
export function table<
  TRow,
  const TActionMessage = never,
  const TPointerMessage = never,
  const TKeys extends InferredElementKeyBindings | undefined = undefined
>(
  options: IndependentInteractionOptions<
    PassiveTableOptions<TRow>,
    { readonly onAction: TActionMessage },
    TKeys,
    TPointerMessage
  >
): Element<TActionMessage | TPointerMessage | ComponentKeyBindingMessages<TKeys>>;
/* eslint-enable @typescript-eslint/unified-signatures */
export function table<TRow>(options: TableOptions<TRow, unknown>): Element<unknown> {
  const collection = options.collection ?? prepareTableCollection(options.rows, options.getRowId);
  const keyMap = tableKeyBindings(options, collection);
  const columns = tableColumnsForRenderer(options.columns);
  const toActionMessage = options.onAction;
  const toScrollActionMessage = isScrollableTableOptions(options) ? options.onAction : undefined;
  const presentation = options.presentation;
  const scroll = isScrollableTableOptions(options) ? options.presentation.scroll : undefined;
  return elementFromRenderNode<'table', unknown>({
    ...requiredId(options.id, 'table'),
    kind: 'table',
    props: {
      collection,
      ...(columns === undefined ? {} : { columns }),
      ...(presentation?.selectedRowId === undefined ? {} : { selectedRowId: presentation.selectedRowId }),
      ...(presentation?.selectedCell === undefined ? {} : { selectedCell: presentation.selectedCell }),
      ...(presentation?.sort === undefined ? {} : { sort: presentation.sort }),
      ...(presentation?.columnWidths === undefined ? {} : { columnWidths: presentation.columnWidths }),
      ...(options.density === undefined ? {} : { density: options.density }),
      ...(scroll === undefined ? {} : { scroll }),
      ...(options.scrollbar === undefined ? {} : { scrollbar: options.scrollbar }),
      ...(options.scrollPolicy === undefined ? {} : { scrollPolicy: options.scrollPolicy }),
      ...(toActionMessage === undefined ? {} : {
        ...(toScrollActionMessage === undefined ? {} : {
          toScrollMessage: (event: ScrollEvent) => toScrollActionMessage({ kind: 'scroll', event })
        }),
        toActionMessage: (action: TableControlAction) => toActionMessage(action)
      }),
      ...(options.stickyHeader === undefined ? {} : { stickyHeader: options.stickyHeader }),
      ...(options.emptyText === undefined ? {} : { emptyText: options.emptyText })
    },
    ...(keyMap === undefined ? {} : { keyMap }),
    ...interactionProps({ pointer: options.pointer, meta: options.meta })
  });
}

function isScrollableTableOptions<TRow, TMessage>(
  options: TableOptions<TRow, TMessage>
): options is ScrollableTableOptions<TRow, TMessage> {
  return options.presentation !== undefined && 'scroll' in options.presentation;
}

/* eslint-disable @typescript-eslint/unified-signatures -- Separate overloads preserve contextual action types for passive and scrollable controls. */
export function tree<
  TMetadata extends Readonly<Record<string, unknown>>,
  const TActionMessage = unknown,
  const TPointerMessage = never,
  const TKeys extends InferredElementKeyBindings | undefined = undefined
>(
  options: IndependentInteractionOptions<
    ScrollableTreeOptions<TMetadata>,
    { readonly onAction: TActionMessage },
    TKeys,
    TPointerMessage
  >
): Element<TActionMessage | TPointerMessage | ComponentKeyBindingMessages<TKeys>>;
export function tree<
  TMetadata extends Readonly<Record<string, unknown>>,
  const TActionMessage = never,
  const TPointerMessage = never,
  const TKeys extends InferredElementKeyBindings | undefined = undefined
>(
  options: IndependentInteractionOptions<
    PassiveTreeOptions<TMetadata>,
    { readonly onAction: TActionMessage },
    TKeys,
    TPointerMessage
  >
): Element<TActionMessage | TPointerMessage | ComponentKeyBindingMessages<TKeys>>;
/* eslint-enable @typescript-eslint/unified-signatures */
export function tree<TMetadata extends Readonly<Record<string, unknown>>>(
  options: TreeOptions<TMetadata, unknown>
): Element<unknown> {
  const onAction = options.onAction;
  const onScrollAction = isScrollableTreeOptions(options) ? options.onAction : undefined;
  const keyMap = treeKeyBindings(options);
  const collection = options.collection ?? prepareTreeCollection(
    options.nodes,
    options.filterQuery === undefined ? {} : { filterQuery: options.filterQuery }
  );
  if (collection.kind === 'window' && (options.filterQuery ?? '').trim().length > 0) {
    throw new TypeError('windowed tree collections must be filtered before they are authored.');
  }
  return elementFromRenderNode<'tree', unknown>({
    ...requiredId(options.id, 'tree'),
    kind: 'tree',
    props: {
      collection,
      ...(options.selected === undefined ? {} : { selected: options.selected }),
      ...(options.filterQuery === undefined ? {} : { filterQuery: options.filterQuery }),
      ...(options.scroll === undefined ? {} : { scroll: options.scroll }),
      ...(options.scrollbar === undefined ? {} : { scrollbar: options.scrollbar }),
      ...(options.scrollPolicy === undefined ? {} : { scrollPolicy: options.scrollPolicy }),
      ...(onScrollAction === undefined ? {} : {
        toScrollMessage: (event: ScrollEvent) => onScrollAction({ kind: 'scroll', event })
      }),
      ...(options.emptyText === undefined ? {} : { emptyText: options.emptyText }),
      ...(onAction === undefined ? {} : { toActionMessage: onAction })
    },
    ...(keyMap === undefined ? {} : { keyMap }),
    ...interactionProps({ pointer: options.pointer, meta: options.meta })
  });
}

function isScrollableTreeOptions<
  TMetadata extends Readonly<Record<string, unknown>>,
  TMessage
>(
  options: TreeOptions<TMetadata, TMessage>
): options is ScrollableTreeOptions<TMetadata, TMessage> {
  return options.scroll !== undefined;
}

export function paginator<
  const TActionMessage = never,
  const TPointerMessage = never,
  const TKeys extends InferredElementKeyBindings | undefined = undefined
>(options: IndependentInteractionOptions<
  PaginatorOptions,
  { readonly onAction: TActionMessage },
  TKeys,
  TPointerMessage
>): Element<TActionMessage | TPointerMessage | ComponentKeyBindingMessages<TKeys>>;
export function paginator(options: PaginatorOptions<unknown>): Element<unknown> {
  const keyMap = paginatorKeyBindings(options);
  return elementFromRenderNode<'paginator', unknown>({
    ...requiredId(options.id, 'paginator'),
    kind: 'paginator',
    props: {
      page: options.page,
      pageCount: options.pageCount,
      ...(options.label === undefined ? {} : { label: options.label }),
      ...(options.onAction === undefined ? {} : { toActionMessage: options.onAction })
    },
    ...(keyMap === undefined ? {} : { keyMap }),
    ...interactionProps({ pointer: options.pointer, meta: options.meta })
  });
}

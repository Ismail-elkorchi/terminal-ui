import { elementFromRenderNode } from '../../renderer/model/element.ts';
import type { Element } from '../../element/index.ts';
import type {
  ListOptions,
  PaginatorOptions,
  TableOptions,
  TreeOptions
} from '../options/content.ts';
import type { ScrollEvent } from '../../interaction/scroll.ts';
import type { ListAction } from '../../ui-model/list.ts';
import type { TableAction } from '../../ui-model/table.ts';
import {
  interactionProps,
  listKeyBindings,
  paginatorKeyBindings,
  tableKeyBindings,
  treeKeyBindings
} from '../internal/interaction.ts';
import {
  domainValues,
  tableColumnsForRenderer,
  treeNodesForRenderer
} from '../internal/domain.ts';
import { requiredId } from '../../authoring/render-node.ts';
import type {
  ComponentKeyBindingMessages,
  IndependentInteractionOptions,
  InferredElementKeyBindings
} from '../internal/messages.ts';
import { resolveStableIds } from '../internal/identity.ts';

export function list<
  TValue,
  const TActionMessage = never,
  const TKeys extends InferredElementKeyBindings | undefined = undefined
>(
  options: IndependentInteractionOptions<
    ListOptions<TValue, never>,
    { readonly onAction: TActionMessage },
    Record<never, never>,
    TKeys
  >
): Element<TActionMessage | ComponentKeyBindingMessages<TKeys>>;
export function list<TValue>(options: ListOptions<TValue, unknown>): Element<unknown> {
  const keyMap = listKeyBindings(options);
  const toActionMessage = options.onAction;
  const itemIds = resolveStableIds(options.items, options.getItemId, 'list');
  const items = options.items.map((value, index) => ({
    id: itemIds[index] ?? '',
    value,
    disabled: options.isDisabled?.(value, index) === true
  }));
  return elementFromRenderNode<'list', unknown>({
    ...requiredId(options.id, 'list'),
    kind: 'list',
    props: {
      items,
      ...(options.selectedId === undefined ? {} : { selectedId: options.selectedId }),
      ...(options.filterQuery === undefined ? {} : { filterQuery: options.filterQuery }),
      ...(options.scroll === undefined ? {} : { scroll: options.scroll }),
      ...(options.scrollbar === undefined ? {} : { scrollbar: options.scrollbar }),
      ...(options.scrollPolicy === undefined ? {} : { scrollPolicy: options.scrollPolicy }),
      ...(toActionMessage === undefined ? {} : {
        ...(options.scroll === undefined ? {} : {
          toScrollMessage: (event: ScrollEvent) => toActionMessage({ kind: 'scroll', event })
        }),
        toActionMessage: (action: ListAction) => toActionMessage(action)
      })
    },
    ...(keyMap === undefined ? {} : { keyMap }),
    ...interactionProps({ meta: options.meta })
  });
}

export function table<
  TRow,
  const TActionMessage = never,
  const TKeys extends InferredElementKeyBindings | undefined = undefined
>(
  options: IndependentInteractionOptions<
    TableOptions<TRow>,
    { readonly onAction: TActionMessage },
    Record<never, never>,
    TKeys
  >
): Element<TActionMessage | ComponentKeyBindingMessages<TKeys>>;
export function table<TRow>(options: TableOptions<TRow, unknown>): Element<unknown> {
  const keyMap = tableKeyBindings(options);
  const columns = tableColumnsForRenderer(options.columns);
  const toActionMessage = options.onAction;
  const rowIds = resolveStableIds(options.rows, options.getRowId, 'table');
  return elementFromRenderNode<'table', unknown>({
    ...requiredId(options.id, 'table'),
    kind: 'table',
    props: {
      rows: domainValues(options.rows),
      rowIds,
      ...(columns === undefined ? {} : { columns }),
      ...(options.selectedRowId === undefined ? {} : { selectedRowId: options.selectedRowId }),
      ...(options.selectedCell === undefined ? {} : { selectedCell: options.selectedCell }),
      ...(options.sort === undefined ? {} : { sort: options.sort }),
      ...(options.columnWidths === undefined ? {} : { columnWidths: options.columnWidths }),
      ...(options.density === undefined ? {} : { density: options.density }),
      ...(options.scroll === undefined ? {} : { scroll: options.scroll }),
      ...(options.scrollbar === undefined ? {} : { scrollbar: options.scrollbar }),
      ...(options.scrollPolicy === undefined ? {} : { scrollPolicy: options.scrollPolicy }),
      ...(toActionMessage === undefined ? {} : {
        ...(options.scroll === undefined ? {} : {
          toScrollMessage: (event: ScrollEvent) => toActionMessage({ kind: 'scroll', event })
        }),
        toActionMessage: (action: TableAction) => toActionMessage(action)
      }),
      ...(options.stickyHeader === undefined ? {} : { stickyHeader: options.stickyHeader }),
      ...(options.emptyText === undefined ? {} : { emptyText: options.emptyText })
    },
    ...(keyMap === undefined ? {} : { keyMap }),
    ...interactionProps({ meta: options.meta })
  });
}

export function tree<
  TMetadata extends Readonly<Record<string, unknown>>,
  const TActionMessage = never,
  const TKeys extends InferredElementKeyBindings | undefined = undefined
>(
  options: IndependentInteractionOptions<
    TreeOptions<TMetadata>,
    { readonly onAction: TActionMessage },
    Record<never, never>,
    TKeys
  >
): Element<TActionMessage | ComponentKeyBindingMessages<TKeys>>;
export function tree<TMetadata extends Readonly<Record<string, unknown>>>(
  options: TreeOptions<TMetadata, unknown>
): Element<unknown> {
  const onAction = options.onAction;
  const keyMap = treeKeyBindings(options);
  return elementFromRenderNode<'tree', unknown>({
    ...requiredId(options.id, 'tree'),
    kind: 'tree',
    props: {
      nodes: treeNodesForRenderer(options.nodes),
      ...(options.selected === undefined ? {} : { selected: options.selected }),
      ...(options.filterQuery === undefined ? {} : { filterQuery: options.filterQuery }),
      ...(options.scroll === undefined ? {} : { scroll: options.scroll }),
      ...(options.scrollbar === undefined ? {} : { scrollbar: options.scrollbar }),
      ...(options.scrollPolicy === undefined ? {} : { scrollPolicy: options.scrollPolicy }),
      ...(onAction === undefined || options.scroll === undefined ? {} : {
        toScrollMessage: (event: ScrollEvent) => onAction({ kind: 'scroll', event })
      }),
      ...(options.emptyText === undefined ? {} : { emptyText: options.emptyText }),
      ...(onAction === undefined ? {} : {
        toMessage: (node) => onAction({ kind: 'select', id: node.id }),
        toDisclosureMessage: (_node, action) => onAction(action)
      })
    },
    ...(keyMap === undefined ? {} : { keyMap }),
    ...interactionProps({ meta: options.meta })
  });
}

export function paginator<
  const TActionMessage = never,
  const TKeys extends InferredElementKeyBindings | undefined = undefined
>(options: IndependentInteractionOptions<
  PaginatorOptions,
  { readonly onAction: TActionMessage },
  Record<never, never>,
  TKeys
>): Element<TActionMessage | ComponentKeyBindingMessages<TKeys>>;
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
    ...interactionProps({ meta: options.meta })
  });
}

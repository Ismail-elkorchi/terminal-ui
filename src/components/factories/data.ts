import { elementFromRenderNode } from '../../render-node/element.ts';
import type { Element } from '../element.ts';
import type {
  ListOptions,
  PaginatorOptions,
  TableOptions,
  TablePointerSelection,
  TreeOptions
} from '../options/content.ts';
import type { ComponentKeyBindings } from '../options/base.ts';
import type { ScrollEvent } from '../../tui/scroll.ts';
import { interactionProps, listKeyBindings, tableKeyBindings } from '../factory-internals/interaction.ts';
import {
  domainValues,
  tableColumnsForRenderer,
  tableSelectionHandler,
  treeDisclosureHandler,
  treeNodesForRenderer,
  treeSelectionHandler
} from '../factory-internals/domain.ts';
import { optionalId } from '../factory-internals/layout.ts';
import type { IndependentInteractionOptions } from '../factory-internals/messages.ts';

export function list<
  TValue,
  const TScrollMessage = never,
  const TSelectMessage = never,
  const TKeyMessage = never
>(
  options: IndependentInteractionOptions<
    ListOptions<TValue, never>,
    { readonly onScroll: TScrollMessage; readonly onSelect: TSelectMessage },
    Record<never, never>,
    TKeyMessage
  >
): Element<TScrollMessage | TSelectMessage | TKeyMessage>;
export function list<TValue>(options: ListOptions<TValue, unknown>): Element<unknown> {
  const keyMap = listKeyBindings(options);
  const toMessage = options.onSelect === undefined
    ? undefined
    : (value: unknown) => options.onSelect?.(value as TValue);
  return elementFromRenderNode<'list', unknown>({
    ...optionalId(options.id),
    kind: 'list',
    props: {
      items: domainValues(options.items),
      ...(options.selected === undefined ? {} : { selected: options.selected }),
      ...(options.filterQuery === undefined ? {} : { filterQuery: options.filterQuery }),
      ...(options.scroll === undefined ? {} : { scroll: options.scroll }),
      ...(options.scrollbar === undefined ? {} : { scrollbar: options.scrollbar }),
      ...(options.scrollPolicy === undefined ? {} : { scrollPolicy: options.scrollPolicy }),
      ...(options.onScroll === undefined ? {} : { toScrollMessage: options.onScroll }),
      ...(toMessage === undefined ? {} : { toMessage })
    },
    ...(keyMap === undefined ? {} : { keyMap }),
    ...interactionProps({ meta: options.meta })
  });
}

type TableFactoryOptions<TRow, TScrollMessage, TSelectMessage, TKeyMessage> =
  Omit<TableOptions<TRow>, 'onScroll' | 'onSelect' | 'keys'> & {
    readonly onScroll?: (event: ScrollEvent) => TScrollMessage;
    readonly onSelect?: (selection: TablePointerSelection<TRow>) => TSelectMessage;
    readonly keys?: ComponentKeyBindings<TKeyMessage>;
  };

export function table<
  TRow,
  const TScrollMessage = never,
  const TSelectMessage = never,
  const TKeyMessage = never
>(
  options: TableFactoryOptions<TRow, TScrollMessage, TSelectMessage, TKeyMessage>
): Element<TScrollMessage | TSelectMessage | TKeyMessage>;
export function table<TRow>(options: TableOptions<TRow, unknown>): Element<unknown> {
  const keyMap = tableKeyBindings(options);
  const columns = tableColumnsForRenderer(options.columns);
  const toMessage = tableSelectionHandler(options.onSelect);
  return elementFromRenderNode<'table', unknown>({
    ...optionalId(options.id),
    kind: 'table',
    props: {
      rows: domainValues(options.rows),
      ...(columns === undefined ? {} : { columns }),
      ...(options.selected === undefined ? {} : { selected: options.selected }),
      ...(options.selectedCell === undefined ? {} : { selectedCell: options.selectedCell }),
      ...(options.density === undefined ? {} : { density: options.density }),
      ...(options.scroll === undefined ? {} : { scroll: options.scroll }),
      ...(options.scrollbar === undefined ? {} : { scrollbar: options.scrollbar }),
      ...(options.scrollPolicy === undefined ? {} : { scrollPolicy: options.scrollPolicy }),
      ...(options.onScroll === undefined ? {} : { toScrollMessage: options.onScroll }),
      ...(options.stickyHeader === undefined ? {} : { stickyHeader: options.stickyHeader }),
      ...(options.emptyText === undefined ? {} : { emptyText: options.emptyText }),
      ...(toMessage === undefined ? {} : { toMessage })
    },
    ...(keyMap === undefined ? {} : { keyMap }),
    ...interactionProps({ meta: options.meta })
  });
}

export function tree<
  TMetadata extends Readonly<Record<string, unknown>>,
  const TScrollMessage = never,
  const TSelectMessage = never,
  const TDisclosureMessage = never,
  const TKeyMessage = never
>(
  options: IndependentInteractionOptions<
    TreeOptions<TMetadata>,
    {
      readonly onScroll: TScrollMessage;
      readonly onSelect: TSelectMessage;
      readonly onDisclosure: TDisclosureMessage;
    },
    Record<never, never>,
    TKeyMessage
  >
): Element<TScrollMessage | TSelectMessage | TDisclosureMessage | TKeyMessage>;
export function tree<TMetadata extends Readonly<Record<string, unknown>>>(
  options: TreeOptions<TMetadata, unknown>
): Element<unknown> {
  const toMessage = treeSelectionHandler(options.onSelect);
  const toDisclosureMessage = treeDisclosureHandler(options.onDisclosure);
  return elementFromRenderNode<'tree', unknown>({
    ...optionalId(options.id),
    kind: 'tree',
    props: {
      nodes: treeNodesForRenderer(options.nodes),
      ...(options.selected === undefined ? {} : { selected: options.selected }),
      ...(options.filterQuery === undefined ? {} : { filterQuery: options.filterQuery }),
      ...(options.scroll === undefined ? {} : { scroll: options.scroll }),
      ...(options.scrollbar === undefined ? {} : { scrollbar: options.scrollbar }),
      ...(options.scrollPolicy === undefined ? {} : { scrollPolicy: options.scrollPolicy }),
      ...(options.onScroll === undefined ? {} : { toScrollMessage: options.onScroll }),
      ...(options.emptyText === undefined ? {} : { emptyText: options.emptyText }),
      ...(toMessage === undefined ? {} : { toMessage }),
      ...(toDisclosureMessage === undefined ? {} : { toDisclosureMessage })
    },
    ...interactionProps(options)
  });
}

export function paginator<const TMessage = never>(options: PaginatorOptions<TMessage>): Element<TMessage> {
  return elementFromRenderNode<'paginator', TMessage>({
    ...optionalId(options.id),
    kind: 'paginator',
    props: {
      page: options.page,
      pageCount: options.pageCount,
      ...(options.label === undefined ? {} : { label: options.label })
    },
    ...interactionProps(options)
  });
}

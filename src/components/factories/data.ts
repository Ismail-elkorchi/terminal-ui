import { elementFromRenderNode } from '../../render-node/element.ts';
import type { Element } from '../element.ts';
import type { ListOptions, PaginatorOptions, TableOptions, TreeOptions } from '../options/content.ts';
import { interactionProps, listKeyBindings, tableKeyBindings } from '../factory-internals/interaction.ts';
import { optionalId } from '../factory-internals/layout.ts';

export function list<TValue, TMessage>(options: ListOptions<TValue, TMessage>): Element<TMessage> {
  const keyMap = listKeyBindings(options);
  return elementFromRenderNode({
    ...optionalId(options.id),
    kind: 'list',
    props: {
      items: options.items,
      ...(options.selected === undefined ? {} : { selected: options.selected }),
      ...(options.filterQuery === undefined ? {} : { filterQuery: options.filterQuery }),
      ...(options.scroll === undefined ? {} : { scroll: options.scroll }),
      ...(options.scrollbar === undefined ? {} : { scrollbar: options.scrollbar }),
      ...(options.scrollPolicy === undefined ? {} : { scrollPolicy: options.scrollPolicy }),
      ...(options.onScroll === undefined ? {} : { toScrollMessage: options.onScroll }),
      ...(options.onSelect === undefined ? {} : { toMessage: options.onSelect })
    },
    ...(keyMap === undefined ? {} : { keyMap }),
    ...interactionProps({ meta: options.meta })
  });
}

export function table<TMessage>(options: TableOptions<TMessage>): Element<TMessage> {
  const keyMap = tableKeyBindings(options);
  return elementFromRenderNode({
    ...optionalId(options.id),
    kind: 'table',
    props: {
      rows: options.rows,
      ...(options.columns === undefined ? {} : { columns: options.columns }),
      ...(options.selected === undefined ? {} : { selected: options.selected }),
      ...(options.selectedCell === undefined ? {} : { selectedCell: options.selectedCell }),
      ...(options.density === undefined ? {} : { density: options.density }),
      ...(options.scroll === undefined ? {} : { scroll: options.scroll }),
      ...(options.scrollbar === undefined ? {} : { scrollbar: options.scrollbar }),
      ...(options.scrollPolicy === undefined ? {} : { scrollPolicy: options.scrollPolicy }),
      ...(options.onScroll === undefined ? {} : { toScrollMessage: options.onScroll }),
      ...(options.stickyHeader === undefined ? {} : { stickyHeader: options.stickyHeader }),
      ...(options.emptyText === undefined ? {} : { emptyText: options.emptyText }),
      ...(options.onSelect === undefined ? {} : { toMessage: options.onSelect })
    },
    ...(keyMap === undefined ? {} : { keyMap }),
    ...interactionProps({ meta: options.meta })
  });
}

export function tree<TMessage>(options: TreeOptions<TMessage>): Element<TMessage> {
  return elementFromRenderNode({
    ...optionalId(options.id),
    kind: 'tree',
    props: {
      nodes: options.nodes,
      ...(options.selected === undefined ? {} : { selected: options.selected }),
      ...(options.filterQuery === undefined ? {} : { filterQuery: options.filterQuery }),
      ...(options.scroll === undefined ? {} : { scroll: options.scroll }),
      ...(options.scrollbar === undefined ? {} : { scrollbar: options.scrollbar }),
      ...(options.scrollPolicy === undefined ? {} : { scrollPolicy: options.scrollPolicy }),
      ...(options.onScroll === undefined ? {} : { toScrollMessage: options.onScroll }),
      ...(options.emptyText === undefined ? {} : { emptyText: options.emptyText }),
      ...(options.onSelect === undefined ? {} : { toMessage: options.onSelect }),
      ...(options.onDisclosure === undefined ? {} : { toDisclosureMessage: options.onDisclosure })
    },
    ...interactionProps(options)
  });
}

export function paginator<TMessage>(options: PaginatorOptions<TMessage>): Element<TMessage> {
  return elementFromRenderNode({
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

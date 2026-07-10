import { elementFromRenderNode } from '../../render-node/element.ts';
import type { Element } from '../element.ts';
import type {
  ContextMenuOptions,
  DividerOptions,
  DropdownOptions,
  MenuBarOptions,
  MenuOptions,
  TooltipOptions
} from '../options/menus.ts';
import {
  interactionProps,
  menuItemsForRenderer,
  menuKeyBindings,
  withMetaDefaults
} from '../factory-internals/interaction.ts';
import { optionalId } from '../factory-internals/layout.ts';

export function menu<TMessage>(options: MenuOptions<TMessage>): Element<TMessage> {
  const keyMap = menuKeyBindings(options.items, options.selected, options.keys);
  return elementFromRenderNode({
    ...optionalId(options.id),
    kind: 'menu',
    props: {
      items: menuItemsForRenderer(options.items),
      ...(options.selected === undefined ? {} : { selected: options.selected }),
      ...(options.emptyText === undefined ? {} : { emptyText: options.emptyText }),
      ...(options.scroll === undefined ? {} : { scroll: options.scroll }),
      ...(options.scrollbar === undefined ? {} : { scrollbar: options.scrollbar }),
      ...(options.scrollPolicy === undefined ? {} : { scrollPolicy: options.scrollPolicy }),
      ...(options.onScroll === undefined ? {} : { toScrollMessage: options.onScroll })
    },
    ...(keyMap === undefined ? {} : { keyMap }),
    ...interactionProps({ meta: options.meta })
  });
}

export function menuBar<TMessage>(options: MenuBarOptions<TMessage>): Element<TMessage> {
  const keyMap = menuKeyBindings(options.items, options.selected, options.keys);
  return elementFromRenderNode({
    ...optionalId(options.id),
    kind: 'menuBar',
    props: {
      items: menuItemsForRenderer(options.items),
      ...(options.selected === undefined ? {} : { selected: options.selected })
    },
    ...(keyMap === undefined ? {} : { keyMap }),
    ...interactionProps({ meta: options.meta })
  });
}

export function contextMenu<TMessage>(options: ContextMenuOptions<TMessage>): Element<TMessage> {
  const keyMap = menuKeyBindings(options.items, options.selected, options.keys);
  const meta = withMetaDefaults(options.meta, { layer: { opacity: 'opaque' } });
  return elementFromRenderNode({
    ...optionalId(options.id),
    kind: 'contextMenu',
    props: {
      items: menuItemsForRenderer(options.items),
      ...(options.selected === undefined ? {} : { selected: options.selected }),
      ...(options.title === undefined ? {} : { title: options.title }),
      ...(options.emptyText === undefined ? {} : { emptyText: options.emptyText }),
      ...(options.scroll === undefined ? {} : { scroll: options.scroll }),
      ...(options.scrollbar === undefined ? {} : { scrollbar: options.scrollbar }),
      ...(options.scrollPolicy === undefined ? {} : { scrollPolicy: options.scrollPolicy }),
      ...(options.onScroll === undefined ? {} : { toScrollMessage: options.onScroll })
    },
    ...(keyMap === undefined ? {} : { keyMap }),
    ...interactionProps({ meta })
  });
}

export function dropdown<TMessage>(options: DropdownOptions<TMessage>): Element<TMessage> {
  const keyMap = menuKeyBindings(options.items, options.selected, options.keys);
  const meta = options.open === true
    ? withMetaDefaults(options.meta, { layer: { opacity: 'opaque' } })
    : options.meta;
  return elementFromRenderNode({
    ...optionalId(options.id),
    kind: 'dropdown',
    props: {
      items: menuItemsForRenderer(options.items),
      ...(options.label === undefined ? {} : { label: options.label }),
      ...(options.selected === undefined ? {} : { selected: options.selected }),
      ...(options.open === undefined ? {} : { open: options.open }),
      ...(options.placeholder === undefined ? {} : { placeholder: options.placeholder })
    },
    ...(keyMap === undefined ? {} : { keyMap }),
    ...interactionProps({ meta })
  });
}

export function divider<TMessage>(options: DividerOptions<TMessage> = {}): Element<TMessage> {
  return elementFromRenderNode({
    ...optionalId(options.id),
    kind: 'divider',
    props: {
      ...(options.orientation === undefined ? {} : { orientation: options.orientation }),
      ...(options.line === undefined ? {} : { line: options.line }),
      ...(options.label === undefined ? {} : { label: options.label }),
      ...(options.labelAlign === undefined ? {} : { labelAlign: options.labelAlign })
    },
    ...interactionProps(options)
  });
}

export function tooltip<TMessage>(options: TooltipOptions<TMessage>): Element<TMessage> {
  return elementFromRenderNode({
    ...optionalId(options.id),
    kind: 'tooltip',
    props: {
      content: options.content,
      ...(options.title === undefined ? {} : { title: options.title }),
      ...(options.tone === undefined ? {} : { tone: options.tone }),
      ...(options.placement === undefined ? {} : { placement: options.placement }),
      ...(options.maxWidth === undefined ? {} : { maxWidth: options.maxWidth }),
      ...(options.border === undefined ? {} : { border: options.border })
    },
    ...interactionProps(options)
  });
}

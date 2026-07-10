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

export function menu<const TMessage = never>(options: MenuOptions<TMessage>): Element<TMessage> {
  const keyMap = menuKeyBindings(options.items, options.selected, options.keys);
  return elementFromRenderNode<'menu', TMessage>({
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

export function menuBar<const TMessage = never>(options: MenuBarOptions<TMessage>): Element<TMessage> {
  const keyMap = menuKeyBindings(options.items, options.selected, options.keys);
  return elementFromRenderNode<'menuBar', TMessage>({
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

export function contextMenu<const TMessage = never>(options: ContextMenuOptions<TMessage>): Element<TMessage> {
  const keyMap = menuKeyBindings(options.items, options.selected, options.keys);
  const meta = withMetaDefaults(options.meta, { layer: { opacity: 'opaque' } });
  return elementFromRenderNode<'contextMenu', TMessage>({
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

export function dropdown<const TMessage = never>(options: DropdownOptions<TMessage>): Element<TMessage> {
  const keyMap = menuKeyBindings(options.items, options.selected, options.keys);
  const meta = options.open === true
    ? withMetaDefaults(options.meta, { layer: { opacity: 'opaque' } })
    : options.meta;
  return elementFromRenderNode<'dropdown', TMessage>({
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

export function divider<const TMessage = never>(options: DividerOptions<TMessage> = {}): Element<TMessage> {
  return elementFromRenderNode<'divider', TMessage>({
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

export function tooltip<const TMessage = never>(options: TooltipOptions<TMessage>): Element<TMessage> {
  return elementFromRenderNode<'tooltip', TMessage>({
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

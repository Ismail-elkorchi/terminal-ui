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
  componentMetaProps,
  dropdownKeyBindings,
  interactionProps,
  menuItemsForRenderer,
  menuKeyBindings,
  withMetaDefaults
} from '../factory-internals/interaction.ts';
import { optionalId, requiredId } from '../factory-internals/render-node.ts';
import type {
  ComponentKeyBindingMessages,
  IndependentInteractionOptions,
  InferredComponentKeyBindings
} from '../factory-internals/messages.ts';

export function menu<
  const TActionMessage = never,
  const TKeys extends InferredComponentKeyBindings | undefined = undefined
>(options: IndependentInteractionOptions<
  MenuOptions,
  { readonly onAction: TActionMessage },
  Record<never, never>,
  TKeys
>): Element<TActionMessage | ComponentKeyBindingMessages<TKeys>>;
export function menu(options: MenuOptions<unknown>): Element<unknown> {
  const onAction = options.onAction;
  const keyMap = menuKeyBindings(options.items, options.selected, onAction, options.keys);
  return elementFromRenderNode<'menu', unknown>({
    ...requiredId(options.id, 'menu'),
    kind: 'menu',
    props: {
      items: menuItemsForRenderer(options.items),
      ...(options.selected === undefined ? {} : { selected: options.selected }),
      ...(options.emptyText === undefined ? {} : { emptyText: options.emptyText }),
      ...(options.scroll === undefined ? {} : { scroll: options.scroll }),
      ...(options.scrollbar === undefined ? {} : { scrollbar: options.scrollbar }),
      ...(options.scrollPolicy === undefined ? {} : { scrollPolicy: options.scrollPolicy }),
      ...(onAction === undefined ? {} : {
        toScrollMessage: (event: import('../../behavior/scroll.ts').ScrollEvent) => onAction({ kind: 'scroll', event })
      }),
      ...(onAction === undefined ? {} : { toActionMessage: onAction })
    },
    ...(keyMap === undefined ? {} : { keyMap }),
    ...interactionProps({ meta: options.meta })
  });
}

export function menuBar<
  const TActionMessage = never,
  const TKeys extends InferredComponentKeyBindings | undefined = undefined
>(options: IndependentInteractionOptions<
  MenuBarOptions,
  { readonly onAction: TActionMessage },
  Record<never, never>,
  TKeys
>): Element<TActionMessage | ComponentKeyBindingMessages<TKeys>>;
export function menuBar(options: MenuBarOptions<unknown>): Element<unknown> {
  const keyMap = menuKeyBindings(options.items, options.selected, options.onAction, options.keys);
  return elementFromRenderNode<'menuBar', unknown>({
    ...requiredId(options.id, 'menuBar'),
    kind: 'menuBar',
    props: {
      items: menuItemsForRenderer(options.items),
      ...(options.selected === undefined ? {} : { selected: options.selected }),
      ...(options.onAction === undefined ? {} : { toActionMessage: options.onAction })
    },
    ...(keyMap === undefined ? {} : { keyMap }),
    ...interactionProps({ meta: options.meta })
  });
}

export function contextMenu<
  const TActionMessage = never,
  const TKeys extends InferredComponentKeyBindings | undefined = undefined
>(options: IndependentInteractionOptions<
  ContextMenuOptions,
  { readonly onAction: TActionMessage },
  Record<never, never>,
  TKeys
>): Element<TActionMessage | ComponentKeyBindingMessages<TKeys>>;
export function contextMenu(options: ContextMenuOptions<unknown>): Element<unknown> {
  const onAction = options.onAction;
  const keyMap = menuKeyBindings(options.items, options.selected, onAction, options.keys);
  const meta = withMetaDefaults(options.meta, { layer: { opacity: 'opaque' } });
  return elementFromRenderNode<'contextMenu', unknown>({
    ...requiredId(options.id, 'contextMenu'),
    kind: 'contextMenu',
    props: {
      items: menuItemsForRenderer(options.items),
      ...(options.selected === undefined ? {} : { selected: options.selected }),
      ...(options.title === undefined ? {} : { title: options.title }),
      ...(options.emptyText === undefined ? {} : { emptyText: options.emptyText }),
      ...(options.scroll === undefined ? {} : { scroll: options.scroll }),
      ...(options.scrollbar === undefined ? {} : { scrollbar: options.scrollbar }),
      ...(options.scrollPolicy === undefined ? {} : { scrollPolicy: options.scrollPolicy }),
      ...(onAction === undefined ? {} : {
        toScrollMessage: (event: import('../../behavior/scroll.ts').ScrollEvent) => onAction({ kind: 'scroll', event })
      }),
      ...(onAction === undefined ? {} : { toActionMessage: onAction })
    },
    ...(keyMap === undefined ? {} : { keyMap }),
    ...interactionProps({ meta })
  });
}

export function dropdown<
  const TActionMessage = never,
  const TKeys extends InferredComponentKeyBindings | undefined = undefined
>(options: IndependentInteractionOptions<
  DropdownOptions,
  { readonly onAction: TActionMessage },
  Record<never, never>,
  TKeys
>): Element<TActionMessage | ComponentKeyBindingMessages<TKeys>>;
export function dropdown(options: DropdownOptions<unknown>): Element<unknown> {
  const keyMap = dropdownKeyBindings(
    options.items,
    options.selected,
    options.highlighted,
    options.open === true,
    options.onAction,
    options.keys
  );
  const meta = options.open === true
    ? withMetaDefaults(options.meta, { layer: { opacity: 'opaque' } })
    : options.meta;
  return elementFromRenderNode<'dropdown', unknown>({
    ...requiredId(options.id, 'dropdown'),
    kind: 'dropdown',
    props: {
      items: menuItemsForRenderer(options.items),
      ...(options.label === undefined ? {} : { label: options.label }),
      ...(options.selected === undefined ? {} : { selected: options.selected }),
      ...(options.highlighted === undefined ? {} : { highlighted: options.highlighted }),
      ...(options.open === undefined ? {} : { open: options.open }),
      ...(options.placeholder === undefined ? {} : { placeholder: options.placeholder }),
      ...(options.onAction === undefined ? {} : { toDropdownActionMessage: options.onAction })
    },
    ...(keyMap === undefined ? {} : { keyMap }),
    ...interactionProps({ meta })
  });
}

export function divider(options: DividerOptions = {}): Element {
  return elementFromRenderNode<'divider'>({
    ...optionalId(options.id),
    kind: 'divider',
    props: {
      ...(options.orientation === undefined ? {} : { orientation: options.orientation }),
      ...(options.line === undefined ? {} : { line: options.line }),
      ...(options.label === undefined ? {} : { label: options.label }),
      ...(options.labelAlign === undefined ? {} : { labelAlign: options.labelAlign })
    },
    ...componentMetaProps(options.meta)
  });
}

export function tooltip(options: TooltipOptions): Element {
  return elementFromRenderNode<'tooltip'>({
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
    ...componentMetaProps(options.meta)
  });
}

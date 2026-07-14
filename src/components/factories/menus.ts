import { elementFromRenderNode } from '../../renderer/model/element.ts';
import type { Element } from '../../element/index.ts';
import type {
  ContextMenuOptions,
  DividerOptions,
  DropdownMenuOptions,
  MenuBarOptions,
  MenuOptions,
  TooltipOptions
} from '../options/menus.ts';
import {
  componentMetaProps,
  dropdownMenuKeyBindings,
  interactionProps,
  menuItemsForRenderer,
  menuKeyBindings,
  withMetaDefaults
} from '../internal/interaction.ts';
import { optionalId, requiredId } from '../../authoring/render-node.ts';
import type {
  ComponentKeyBindingMessages,
  IndependentInteractionOptions,
  InferredElementKeyBindings
} from '../internal/messages.ts';

export function menu<
  const TActionMessage = never,
  const TPointerMessage = never,
  const TKeys extends InferredElementKeyBindings | undefined = undefined
>(options: IndependentInteractionOptions<
  MenuOptions,
  { readonly onAction: TActionMessage },
  Record<never, never>,
  TKeys,
  TPointerMessage
>): Element<TActionMessage | TPointerMessage | ComponentKeyBindingMessages<TKeys>>;
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
        toScrollMessage: (event: import('../../interaction/scroll.ts').ScrollEvent) => onAction({ kind: 'scroll', event })
      }),
      ...(onAction === undefined ? {} : { toActionMessage: onAction })
    },
    ...(keyMap === undefined ? {} : { keyMap }),
    ...interactionProps({ pointer: options.pointer, meta: options.meta })
  });
}

export function menuBar<
  const TActionMessage = never,
  const TPointerMessage = never,
  const TKeys extends InferredElementKeyBindings | undefined = undefined
>(options: IndependentInteractionOptions<
  MenuBarOptions,
  { readonly onAction: TActionMessage },
  Record<never, never>,
  TKeys,
  TPointerMessage
>): Element<TActionMessage | TPointerMessage | ComponentKeyBindingMessages<TKeys>>;
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
    ...interactionProps({ pointer: options.pointer, meta: options.meta })
  });
}

export function contextMenu<
  const TActionMessage = never,
  const TPointerMessage = never,
  const TKeys extends InferredElementKeyBindings | undefined = undefined
>(options: IndependentInteractionOptions<
  ContextMenuOptions,
  { readonly onAction: TActionMessage },
  Record<never, never>,
  TKeys,
  TPointerMessage
>): Element<TActionMessage | TPointerMessage | ComponentKeyBindingMessages<TKeys>>;
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
        toScrollMessage: (event: import('../../interaction/scroll.ts').ScrollEvent) => onAction({ kind: 'scroll', event })
      }),
      ...(onAction === undefined ? {} : { toActionMessage: onAction })
    },
    ...(keyMap === undefined ? {} : { keyMap }),
    ...interactionProps({ pointer: options.pointer, meta })
  });
}

export function dropdownMenu<
  const TActionMessage = never,
  const TPointerMessage = never,
  const TKeys extends InferredElementKeyBindings | undefined = undefined
>(options: IndependentInteractionOptions<
  DropdownMenuOptions,
  { readonly onAction: TActionMessage },
  Record<never, never>,
  TKeys,
  TPointerMessage
>): Element<TActionMessage | TPointerMessage | ComponentKeyBindingMessages<TKeys>>;
export function dropdownMenu(options: DropdownMenuOptions<unknown>): Element<unknown> {
  const selected = options.presentation.selected;
  const highlighted = options.presentation.kind === 'open' ? options.presentation.highlighted : undefined;
  const open = options.presentation.kind === 'open';
  const keyMap = dropdownMenuKeyBindings(
    options.items,
    selected,
    highlighted,
    open,
    options.onAction,
    options.keys
  );
  const meta = open
    ? withMetaDefaults(options.meta, { layer: { opacity: 'opaque' } })
    : options.meta;
  return elementFromRenderNode<'dropdownMenu', unknown>({
    ...requiredId(options.id, 'dropdownMenu'),
    kind: 'dropdownMenu',
    props: {
      items: menuItemsForRenderer(options.items),
      ...(options.label === undefined ? {} : { label: options.label }),
      presentation: options.presentation,
      ...(options.placeholder === undefined ? {} : { placeholder: options.placeholder }),
      ...(options.onAction === undefined ? {} : { toDropdownMenuActionMessage: options.onAction })
    },
    ...(keyMap === undefined ? {} : { keyMap }),
    ...interactionProps({ pointer: options.pointer, meta })
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

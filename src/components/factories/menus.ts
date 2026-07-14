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
  contextMenuKeyBindings,
  dropdownMenuKeyBindings,
  interactionProps,
  menuBarKeyBindings,
  menuItemsForRenderer,
  menuKeyBindings,
  withMetaDefaults
} from '../internal/interaction.ts';
import { menuPopupRenderNode } from '../internal/menu-popup.ts';
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
  const keyMap = menuKeyBindings(options.presentation, onAction, options.keys);
  return elementFromRenderNode<'menu', unknown>({
    ...requiredId(options.id, 'menu'),
    kind: 'menu',
    props: {
      items: menuItemsForRenderer(options.presentation.items),
      presentation: options.presentation,
      ...(options.emptyText === undefined ? {} : { emptyText: options.emptyText }),
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
  const onAction = options.onAction;
  const keyMap = menuBarKeyBindings(options.presentation, onAction, options.keys);
  const popup = options.presentation.kind === 'open'
    ? menuPopupRenderNode({
        ownerId: options.id,
        presentation: options.presentation.menu,
        ...(options.scrollbar === undefined ? {} : { scrollbar: options.scrollbar }),
        ...(options.scrollPolicy === undefined ? {} : { scrollPolicy: options.scrollPolicy }),
        ...(options.meta?.styles === undefined ? {} : { styles: options.meta.styles }),
        ...(onAction === undefined ? {} : {
          toActionMessage: (action) => onAction({ kind: 'menu', action })
        })
      })
    : undefined;
  return elementFromRenderNode<'menuBar', unknown>({
    ...requiredId(options.id, 'menuBar'),
    kind: 'menuBar',
    props: {
      items: menuItemsForRenderer(options.items),
      presentation: options.presentation,
      maxVisibleItems: positiveInteger(options.maxVisibleItems, 12, 'menuBar maxVisibleItems'),
      ...(onAction === undefined ? {} : { toActionMessage: onAction })
    },
    ...(popup === undefined ? {} : { children: [popup] }),
    ...(keyMap === undefined ? {} : { keyMap }),
    ...interactionProps({
      pointer: options.pointer,
      meta: options.presentation.kind === 'open'
        ? withMetaDefaults(options.meta, { focus: { scope: { kind: 'contain' } } })
        : options.meta
    })
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
  const keyMap = contextMenuKeyBindings(options.presentation, onAction, options.keys);
  const popup = options.presentation.kind === 'open'
    ? menuPopupRenderNode({
        ownerId: options.id,
        presentation: options.presentation.menu,
        ...(options.title === undefined ? {} : { title: options.title }),
        ...(options.emptyText === undefined ? {} : { emptyText: options.emptyText }),
        ...(options.scrollbar === undefined ? {} : { scrollbar: options.scrollbar }),
        ...(options.scrollPolicy === undefined ? {} : { scrollPolicy: options.scrollPolicy }),
        ...(options.meta?.styles === undefined ? {} : { styles: options.meta.styles }),
        ...(onAction === undefined ? {} : {
          toActionMessage: (action) => onAction({ kind: 'menu', action })
        })
      })
    : undefined;
  const meta = options.presentation.kind === 'open'
    ? withMetaDefaults(options.meta, { focus: { scope: { kind: 'contain' } }, layer: { opacity: 'transparent' } })
    : withMetaDefaults(options.meta, { focus: { disabled: true }, layer: { opacity: 'transparent' } });
  return elementFromRenderNode<'contextMenu', unknown>({
    ...requiredId(options.id, 'contextMenu'),
    kind: 'contextMenu',
    props: {
      presentation: options.presentation,
      ...(options.title === undefined ? {} : { title: options.title }),
      ...(options.placement === undefined ? {} : { placement: options.placement }),
      maxVisibleItems: positiveInteger(options.maxVisibleItems, 12, 'contextMenu maxVisibleItems'),
      ...(onAction === undefined ? {} : { toActionMessage: onAction })
    },
    ...(popup === undefined ? {} : { children: [popup] }),
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
  const open = options.presentation.kind === 'open';
  const onAction = options.onAction;
  const keyMap = dropdownMenuKeyBindings(options.presentation, onAction, options.keys);
  const popup = open
    ? menuPopupRenderNode({
        ownerId: options.id,
        presentation: options.presentation.menu,
        ...(options.scrollbar === undefined ? {} : { scrollbar: options.scrollbar }),
        ...(options.scrollPolicy === undefined ? {} : { scrollPolicy: options.scrollPolicy }),
        ...(options.meta?.styles === undefined ? {} : { styles: options.meta.styles }),
        ...(onAction === undefined ? {} : {
          toActionMessage: (action) => onAction({ kind: 'menu', action })
        })
      })
    : undefined;
  const meta = open
    ? withMetaDefaults(options.meta, { focus: { scope: { kind: 'contain' } }, layer: { opacity: 'opaque' } })
    : options.meta;
  return elementFromRenderNode<'dropdownMenu', unknown>({
    ...requiredId(options.id, 'dropdownMenu'),
    kind: 'dropdownMenu',
    props: {
      items: menuItemsForRenderer(options.items),
      ...(options.label === undefined ? {} : { label: options.label }),
      presentation: options.presentation,
      ...(options.placeholder === undefined ? {} : { placeholder: options.placeholder }),
      ...(options.placement === undefined ? {} : { placement: options.placement }),
      maxVisibleItems: positiveInteger(options.maxVisibleItems, 12, 'dropdownMenu maxVisibleItems'),
      ...(onAction === undefined ? {} : { toDropdownMenuActionMessage: onAction })
    },
    ...(popup === undefined ? {} : { children: [popup] }),
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
  const visible = options.presentation.kind === 'visible';
  const meta = withMetaDefaults(options.meta, {
    layer: { visible, zIndex: 20, opacity: 'opaque' }
  });
  return elementFromRenderNode<'tooltip'>({
    ...optionalId(options.id),
    kind: 'tooltip',
    props: {
      content: options.content,
      presentation: options.presentation,
      ...(options.title === undefined ? {} : { title: options.title }),
      ...(options.tone === undefined ? {} : { tone: options.tone }),
      ...(options.placement === undefined ? {} : { placement: options.placement }),
      ...(options.maxWidth === undefined ? {} : { maxWidth: options.maxWidth }),
      ...(options.border === undefined ? {} : { border: options.border })
    },
    ...componentMetaProps({
      ...meta,
      layer: { ...meta.layer, visible }
    })
  });
}

function positiveInteger(value: number | undefined, fallback: number, name: string): number {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value) || value < 1) throw new TypeError(`${name} must be a positive finite number.`);
  return Math.floor(value);
}

import type { AccessibleNode } from '../../accessibility/types.ts';
import type { ContextMenuTransition, ContextMenuView } from '../../behavior/menu.ts';
import type { ComponentAccessibilityInput } from '../../component/contracts.ts';
import { defineComponent } from '../../component/definition.ts';
import type { ComponentMessage } from '../../component/message.ts';
import {
  decodeComponentScrollbarOptions,
  decodeComponentScrollPolicy,
} from '../../component/scrollbar.ts';
import {
  assertOptionalCallback,
  isNonArrayObject,
  isStringMember,
} from '../../foundation/validation.ts';
import { ignoreMessage } from '../../interaction/message.ts';
import {
  containedPopupFocus,
  popupAllowsDismissal,
  popupFocusScope,
  standardPopupDismissal,
} from '../../interaction/popup.ts';
import { portal, surface } from '../../layout/factories/surfaces.ts';
import { text } from '../text-content/definition.ts';
import type {
  ContextMenuComponentAction,
  ContextMenuFactory,
  ContextMenuModel,
  ContextOwnOptions,
} from './contracts.ts';
import { decodeMenuView, flattenMenu, menu, menuAccessibleItems, publicMenuView } from './menu.ts';
import type { ContextMenuOptions } from './options.ts';
import {
  assertMenuCallbacks,
  clean,
  decodeAnchor,
  decodePlacement,
  optionalText,
  positiveInteger,
} from './shared.ts';

const instantiateContextMenu = defineComponent<ContextOwnOptions, ContextMenuComponentAction>()({
  name: 'terminal-ui/components/context-menu',
  identity: 'required',
  structure: 'composed',
  semantics: 'semantic',
  accessibleRole: 'menu',
  metadata: ['focus', 'layer', 'styles'],
  states: ['disabled', 'busy', 'inert'],
  parts: [
    'control',
    'title',
    'leading',
    'label',
    'marker',
    'shortcut',
    'trailing',
    'description',
    'separator',
    'placeholder',
    'empty',
    'scrollbarTrack', 'scrollbarThumb',
  ],
  visualStates: ['focused', 'hovered', 'pressed', 'active', 'selected', 'disabled', 'busy'],
  createModel: createContextMenuModel,
  compose(input) {
    if (input.model.view.kind === 'closed') {
      return text({ id: `${input.id ?? 'context-menu'}:closed`, content: '' });
    }
    const popup = menu({
      id: `${input.id ?? 'context-menu'}:popup:menu`,
      view: publicMenuView(input.model.view.menu),
      emptyText: input.model.emptyText,
      ...(input.model.scrollbar === undefined ? {} : { scrollbar: input.model.scrollbar }),
      ...(input.model.scrollPolicy === undefined ? {} : { scrollPolicy: input.model.scrollPolicy }),
      ...(input.styles === undefined ? {} : { styles: input.styles }),
      ...(input.busy ? { busy: true } : {}),
      onTransition: (transition) => input.emit(contextMenuComponentTransition({
        kind: 'menu',
        transition,
      })),
      onActivate: (event) => input.emit({ kind: 'activate', event }),
    });
    return portal(
      surface(popup, {
        id: `${input.id ?? 'context-menu'}:popup:surface`,
        ...(input.model.title === undefined ? {} : { title: input.model.title }),
        appearance: 'raised',
        border: { kind: 'single' },
        maxHeight: input.model.maxVisibleItems + 2,
      }),
      {
        id: `${input.id ?? 'context-menu'}:portal`,
        anchor: input.model.view.anchor,
        placement: input.model.placement,
        ...(popupAllowsDismissal(standardPopupDismissal, 'outsidePress') ? {
          onOutsidePress: () => input.emit(contextMenuComponentTransition({
            kind: 'dismiss',
            reason: 'outsidePress',
          })),
        } : {}),
        meta: {
          layer: {
            ...input.layer,
            zIndex: 20,
            underlay: 'clear',
          },
        },
      },
    );
  },
  keys: ({ model }) =>
    model.view.kind === 'open'
      ? { escape: () => contextMenuComponentTransition({ kind: 'dismiss', reason: 'escape' }) }
      : {},
  focusScope: ({ model }) => popupFocusScope(
    model.view.kind === 'open',
    containedPopupFocus,
  ),
  onFocus: (event, { model }) => event.kind === 'focusLeave'
    && model.view.kind === 'open'
    && popupAllowsDismissal(standardPopupDismissal, 'focusLoss')
    ? contextMenuComponentTransition({ kind: 'dismiss', reason: 'focusLoss' })
    : ignoreMessage(),
  accessibility: contextMenuAccessibility,
});

export const contextMenu: ContextMenuFactory = (options) => {
  const shared = contextMenuInstanceOptions(options);
  const instance = {
    ...shared,
    ...(options.disabled === undefined ? {} : { disabled: options.disabled }),
    ...(options.inert === undefined ? {} : { inert: options.inert }),
    ...(options.busy === undefined ? {} : { busy: options.busy }),
  };
  assertOptionalCallback(options.onActivate, 'contextMenu onActivate');
  if (options.onTransition === undefined) {
    if (options.disabled !== true && options.inert !== true) assertMenuCallbacks(options, 'contextMenu');
    return instantiateContextMenu({ ...instance, ...(options.disabled === true ? { disabled: true as const } : { inert: true as const }) });
  }
  assertMenuCallbacks(options, 'contextMenu');
  return instantiateContextMenu({
    ...instance,
    onAction: (action) => routeContextMenuAction(action, options),
  });
};

function contextMenuComponentTransition(
  transition: ContextMenuTransition,
): ContextMenuComponentAction {
  return { kind: 'transition', transition };
}

function contextMenuInstanceOptions<TMessage extends ComponentMessage>(
  options: ContextMenuOptions<TMessage>,
) {
  return {
    id: options.id,
    view: options.view,
    ...(options.title === undefined ? {} : { title: options.title }),
    ...(options.emptyText === undefined ? {} : { emptyText: options.emptyText }),
    ...(options.scrollbar === undefined ? {} : { scrollbar: options.scrollbar }),
    ...(options.scrollPolicy === undefined ? {} : { scrollPolicy: options.scrollPolicy }),
    ...(options.placement === undefined ? {} : { placement: options.placement }),
    ...(options.maxVisibleItems === undefined ? {} : { maxVisibleItems: options.maxVisibleItems }),
    ...(options.styles === undefined ? {} : { styles: options.styles }),
    ...(options.meta === undefined ? {} : { meta: options.meta }),
  };
}

function routeContextMenuAction<TMessage extends ComponentMessage>(
  action: ContextMenuComponentAction,
  options: ContextMenuOptions<TMessage> & { readonly onTransition: NonNullable<ContextMenuOptions<TMessage>["onTransition"]> },
) {
  if (action.kind === 'transition') return options.onTransition(action.transition);
  return options.onActivate?.(action.event) ?? ignoreMessage();
}

function contextMenuAccessibility(
  input: ComponentAccessibilityInput<ContextMenuModel>,
): AccessibleNode {
  const children = input.model.view.kind === 'closed' ? [] : menuAccessibleItems(
    `${input.id}:popup:menu`,
    flattenMenu(input.model.view.menu.items),
    input.model.view.menu.activePath,
    input.focus === 'descendant',
  );
  return {
    id: input.id,
    role: 'menu',
    ...(input.model.title === undefined ? {} : { label: input.model.title }),
    scope: { kind: 'menu' },
    children,
  };
}

function createContextMenuModel(value: Readonly<ContextOwnOptions>): ContextMenuModel {
  const view = decodeContextMenuView(value.view);
  const title = optionalText(value.title, 'contextMenu title');
  const emptyText = optionalText(value.emptyText, 'contextMenu emptyText') ?? 'No commands';
  const placement = decodePlacement(value.placement);
  const maxVisibleItems = positiveInteger(
    value.maxVisibleItems,
    12,
    'contextMenu maxVisibleItems',
  );
  const scrollbar = decodeComponentScrollbarOptions(value.scrollbar, 'contextMenu scrollbar');
  const scrollPolicy = decodeComponentScrollPolicy(
    value.scrollPolicy,
    'contextMenu scrollPolicy',
  );
  return {
    view,
    ...(title === undefined ? {} : { title: clean(title) }),
    emptyText,
    placement,
    maxVisibleItems,
    ...(scrollbar === undefined ? {} : { scrollbar }),
    ...(scrollPolicy === undefined ? {} : { scrollPolicy }),
  };
}

function decodeContextMenuView(value: ContextMenuView): ContextMenuModel['view'] {
  if (!isNonArrayObject(value) || !isStringMember(value.kind, ['closed', 'open'])) {
    throw new TypeError('contextMenu view is invalid.');
  }
  if (value.kind === 'closed') {
    return { kind: 'closed' };
  }
  return {
    kind: 'open',
    anchor: decodeAnchor(value.anchor),
    menu: decodeMenuView(value.menu, 'contextMenu menu'),
  };
}

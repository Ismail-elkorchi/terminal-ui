import { createScrollState } from '../../behavior/index.ts';
import type { AccessibleNode } from '../../accessibility/index.ts';
import {
  clipRenderSpans,
  componentScrollbarHitTargets,
  defineComponent,
  ignoreMessage,
  measureRenderSpans,
  paintComponentScrollbar,
  prepareComponentScrollbar,
  prepareComponentScrollbarOptions,
  prepareComponentScrollPolicy,
  prepareComponentScrollState,
  span,
} from '../../component/index.ts';
import type {
  ComponentMessage,
  ComponentAccessibilityInput,
  ComponentInput,
  ComponentMeasureInput,
  ComponentRenderInput,
} from '../../component/index.ts';
import type { Element } from '../../element/index.ts';
import {
  assertOptionalCallback,
  assertOptionalEnum,
  assertRequiredCallback,
  isNonArrayObject,
  isStringMember,
} from '../../foundation/validation.ts';
import type { Rect } from '../../geometry/types.ts';
import type {
  AnchoredSurfaceAnchor,
  AnchoredSurfacePlacement,
} from '../../interaction/anchored-surface.ts';
import { pointerVisualState } from '../../interaction/index.ts';
import { formatKeyboardBinding } from '../../interaction/key-binding.ts';
import type { PointerInteractionState } from '../../interaction/index.ts';
import { preparePointerInteractionState } from '../../interaction/pointer-interaction.ts';
import type { ScrollPolicy, ScrollState } from '../../interaction/scroll.ts';
import type { ScrollbarOptions } from '../../interaction/scrollbar.ts';
import { portal, surface } from '../../layout/index.ts';
import { measureTextCells, oneCellGlyph, sanitizeTerminalText } from '../../text/index.ts';
import type {
  ContextMenuTransition,
  ContextMenuPresentation,
  MenuTriggerTransition,
  MenuTriggerPresentation,
  MenuActivateEvent,
  MenuTransition,
  MenuBarTransition,
  MenuBarPresentation,
  MenuItem,
  MenuPresentation,
  MenuPresentationItem,
} from '../../ui-model/menu.ts';
import type { MenuStylePart } from '../../ui-model/style-parts.ts';
import {
  inlineContentAccessibleText,
  inlineSegmentText,
  normalizeInlineContent,
} from '../../visual/inline-content.ts';
import type { InlineContent } from '../../visual/inline-content.ts';
import type { RenderSpan, TerminalStyle } from '../../visual/render.ts';
import type { Measurement } from '../../renderer/index.ts';
import type {
  ContextMenuOptions,
  MenuTriggerOptions,
  MenuBarOptions,
  MenuOptions,
} from '../options/menus.ts';
import { text } from './content.ts';

interface PreparedMenuItemBase {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly disabled: boolean;
  readonly leading?: InlineContent;
  readonly trailing?: InlineContent;
  readonly shortcut?: import('../../interaction/key-binding.ts').KeyboardBinding;
  readonly tone: 'default' | 'destructive';
  readonly children: readonly PreparedMenuItem[];
}

type PreparedMenuItem =
  | (PreparedMenuItemBase & { readonly kind: 'action' })
  | (PreparedMenuItemBase & { readonly kind: 'check'; readonly checked: boolean })
  | (PreparedMenuItemBase & { readonly kind: 'radio'; readonly checked: boolean; readonly groupId: string })
  | (PreparedMenuItemBase & { readonly kind: 'separator' })
  | (PreparedMenuItemBase & { readonly kind: 'section' })
  | (PreparedMenuItemBase & { readonly kind: 'submenu'; readonly expanded?: boolean });

type MenuRow = PreparedMenuItem & { readonly depth: number };

interface PreparedMenuPresentation {
  readonly activePath: readonly string[];
  readonly items: readonly PreparedMenuItem[];
  readonly scroll?: ScrollState;
}

interface MenuModel {
  readonly items: readonly PreparedMenuItem[];
  readonly rows: readonly MenuRow[];
  readonly activePath: readonly string[];
  readonly emptyText: string;
  readonly scroll?: ScrollState;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
  readonly pointerState?: PointerInteractionState;
}

interface MenuOwnOptions {
  readonly presentation: MenuPresentation;
  readonly emptyText?: string;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
  readonly pointerState?: PointerInteractionState;
}

type MenuComponentAction =
  | { readonly kind: 'transition'; readonly transition: MenuTransition }
  | { readonly kind: 'activate'; readonly event: MenuActivateEvent }
  | { readonly kind: 'pointer'; readonly action: import('../../interaction/pointer-interaction.ts').PointerInteractionAction };

type MenuFactory = <const TMessage extends ComponentMessage = never>(
  options: MenuOptions<TMessage>,
) => Element<TMessage>;

const instantiateMenu = defineComponent<
  MenuOwnOptions,
  MenuModel,
  MenuComponentAction,
  MenuStylePart,
  readonly ['disabled', 'busy', 'readOnly', 'inert'],
  'required',
  readonly ['focus', 'layer', 'styles']
>({
  name: 'terminal-ui/components/menu',
  identity: 'required',
  structure: 'leaf',
  semantics: 'semantic',
  accessibleRole: 'menu',
  metadata: ['focus', 'layer', 'styles'],
  states: ['disabled', 'busy', 'readOnly', 'inert'],
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
    'scrollbar',
  ],
  prepare: (value, context) => prepareMenu(value, !context.disabled && !context.inert),
  measure: measureMenu,
  render: paintMenu,
  keys: ({ model, busy, readOnly }) => busy ? {} : ({
    arrowUp: () => menuComponentTransition({ kind: 'move', delta: -1 }),
    arrowDown: () => menuComponentTransition({ kind: 'move', delta: 1 }),
    home: () => menuComponentTransition({ kind: 'first' }),
    end: () => menuComponentTransition({ kind: 'last' }),
    arrowRight: () => menuComponentTransition({ kind: 'enter' }),
    arrowLeft: () => menuComponentTransition({ kind: 'back' }),
    enter: () =>
      activeMenuItem(model) === undefined
        ? ignoreMessage()
        : activeMenuItem(model)?.kind === 'submenu'
        ? menuComponentTransition({ kind: 'enter' })
        : readOnly ? ignoreMessage() : {
          kind: 'activate',
          event: { kind: 'activate', id: activeMenuItem(model)?.id ?? '' },
        },
  }),
  pointer: { state: ({ model }) => model.pointerState, onAction: (action) => ({ kind: 'pointer', action }) },
  focusTargets: ({ bounds }) => [{ id: 'self', bounds }],
  hitTargets: menuHitTargets,
  accessibility: menuAccessibility,
});

export const menu: MenuFactory = (options) => {
  const shared = menuInstanceOptions(options);
  if (options.disabled === true) return instantiateMenu({
    ...shared,
    disabled: true,
    ...(options.inert === undefined ? {} : { inert: options.inert }),
  });
  if (options.inert === true) return instantiateMenu({
    ...shared,
    inert: true,
    ...(options.busy === undefined ? {} : { busy: options.busy }),
  });
  assertMenuCallbacks(options, 'menu');
  return instantiateMenu({
    ...shared,
    ...(options.busy === undefined ? {} : { busy: options.busy }),
    ...(options.readOnly === undefined ? {} : { readOnly: options.readOnly }),
    onAction: (action) => routeMenuComponentAction(action, options),
  });
};

function menuComponentTransition(transition: MenuTransition): MenuComponentAction {
  return { kind: 'transition', transition };
}

function menuInstanceOptions<TMessage extends ComponentMessage>(options: MenuOptions<TMessage>) {
  return {
    id: options.id,
    presentation: options.presentation,
    ...(options.emptyText === undefined ? {} : { emptyText: options.emptyText }),
    ...(options.scrollbar === undefined ? {} : { scrollbar: options.scrollbar }),
    ...(options.scrollPolicy === undefined ? {} : { scrollPolicy: options.scrollPolicy }),
    ...(options.pointerState === undefined ? {} : { pointerState: options.pointerState }),
    ...(options.meta === undefined ? {} : { meta: options.meta }),
  };
}

function routeMenuComponentAction<TMessage extends ComponentMessage>(
  action: MenuComponentAction,
  options: MenuOptions<TMessage> & { readonly disabled?: false; readonly inert?: false },
) {
  if (action.kind === 'transition') return options.onTransition(action.transition);
  if (action.kind === 'activate') {
    return options.readOnly ? ignoreMessage() : options.onActivate?.(action.event) ?? ignoreMessage();
  }
  return options.onPointerAction?.(action.action) ?? ignoreMessage();
}

const popupSlot = {
  popup: { cardinality: 'optional', owner: 'implementation', messages: 'bubble' },
} as const;

interface MenuBarModel {
  readonly items: readonly PreparedMenuItem[];
  readonly presentation:
    | { readonly kind: 'closed'; readonly active?: string }
    | { readonly kind: 'open'; readonly active: string; readonly menu: PreparedMenuPresentation };
  readonly maxVisibleItems: number;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
  readonly pointerState?: PointerInteractionState;
}

interface MenuBarOwnOptions {
  readonly items: readonly MenuItem[];
  readonly presentation: MenuBarPresentation;
  readonly maxVisibleItems?: number;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
  readonly pointerState?: PointerInteractionState;
}

type MenuBarFactory = <const TMessage extends ComponentMessage = never>(
  options: MenuBarOptions<TMessage>,
) => Element<TMessage>;

type MenuBarComponentAction =
  | { readonly kind: 'transition'; readonly transition: MenuBarTransition }
  | { readonly kind: 'activate'; readonly event: MenuActivateEvent }
  | { readonly kind: 'pointer'; readonly action: import('../../interaction/pointer-interaction.ts').PointerInteractionAction };

const instantiateMenuBar = defineComponent<
  MenuBarOwnOptions,
  MenuBarModel,
  MenuBarComponentAction,
  MenuStylePart,
  readonly ['disabled', 'busy', 'readOnly', 'inert'],
  'required',
  readonly ['focus', 'layer', 'styles'],
  typeof popupSlot
>({
  name: 'terminal-ui/components/menu-bar',
  identity: 'required',
  structure: 'composite',
  semantics: 'semantic',
  accessibleRole: 'menubar',
  slots: popupSlot,
  metadata: ['focus', 'layer', 'styles'],
  states: ['disabled', 'busy', 'readOnly', 'inert'],
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
    'scrollbar',
  ],
  prepare: (value, context) => prepareMenuBar(value, !context.disabled && !context.inert),
  implementationSlots(input) {
    if (input.model.presentation.kind === 'closed') return { popup: undefined };
    return {
      popup: menuPopup(
        input.id,
        input.model.presentation.menu,
        input.model.maxVisibleItems,
        (action) => input.emit(menuBarChildAction(action)),
        input.model.scrollbar,
        input.model.scrollPolicy,
        input.styles,
        undefined,
        input.readOnly,
        input.busy,
      ),
    };
  },
  measure(input) {
    const width = input.model.items.reduce(
      (total, item, index) =>
        total + measureTextCells(item.label, { widthProfile: input.widthProfile }).cells + 2 +
        (index === 0 ? 0 : 2),
      0,
    );
    return { minWidth: 1, minHeight: 1, preferredWidth: Math.max(1, width), preferredHeight: 1 };
  },
  layout: (input) => ({
    popup: input.slots.count('popup') === 0
      ? undefined
      : { ...input.bounds, height: Math.min(1, input.bounds.height) },
  }),
  renderBeforeChildren: paintMenuBar,
  keys: ({ model, busy }) => busy ? {} : ({
    arrowLeft: () => menuBarComponentTransition({ kind: 'moveHeading', delta: -1 }),
    arrowRight: () => menuBarComponentTransition({ kind: 'moveHeading', delta: 1 }),
    home: () => menuBarComponentTransition({ kind: 'firstHeading' }),
    end: () => menuBarComponentTransition({ kind: 'lastHeading' }),
    enter: () =>
      menuBarComponentTransition(
        model.presentation.kind === 'open'
          ? { kind: 'close', reason: 'escape' }
          : { kind: 'open' },
      ),
    escape: () => menuBarComponentTransition({ kind: 'close', reason: 'escape' }),
  }),
  pointer: { state: ({ model }) => model.pointerState, onAction: (action) => ({ kind: 'pointer', action }) },
  focusScope: ({ model }) => model.presentation.kind === 'open' ? { kind: 'contain' } : undefined,
  focusTargets: (
    { bounds },
  ) => [{ id: 'self', bounds: { ...bounds, height: Math.min(1, bounds.height) } }],
  hitTargets: menuBarHitTargets,
  accessibility: menuBarAccessibility,
});

export const menuBar: MenuBarFactory = (options) => {
  const shared = menuBarInstanceOptions(options);
  if (options.disabled === true) return instantiateMenuBar({
    ...shared,
    disabled: true,
    ...(options.inert === undefined ? {} : { inert: options.inert }),
  });
  if (options.inert === true) return instantiateMenuBar({
    ...shared,
    inert: true,
    ...(options.busy === undefined ? {} : { busy: options.busy }),
  });
  assertMenuCallbacks(options, 'menuBar');
  return instantiateMenuBar({
    ...shared,
    ...(options.busy === undefined ? {} : { busy: options.busy }),
    ...(options.readOnly === undefined ? {} : { readOnly: options.readOnly }),
    onAction: (action) => routeMenuBarAction(action, options),
  });
};

function menuBarComponentTransition(transition: MenuBarTransition): MenuBarComponentAction {
  return { kind: 'transition', transition };
}

function menuBarChildAction(action: MenuComponentAction): MenuBarComponentAction {
  return action.kind === 'transition'
    ? menuBarComponentTransition({ kind: 'menu', transition: action.transition })
    : action;
}

function menuBarInstanceOptions<TMessage extends ComponentMessage>(options: MenuBarOptions<TMessage>) {
  return {
    id: options.id,
    items: options.items,
    presentation: options.presentation,
    ...(options.maxVisibleItems === undefined ? {} : { maxVisibleItems: options.maxVisibleItems }),
    ...(options.scrollbar === undefined ? {} : { scrollbar: options.scrollbar }),
    ...(options.scrollPolicy === undefined ? {} : { scrollPolicy: options.scrollPolicy }),
    ...(options.pointerState === undefined ? {} : { pointerState: options.pointerState }),
    ...(options.meta === undefined ? {} : { meta: options.meta }),
  };
}

function routeMenuBarAction<TMessage extends ComponentMessage>(
  action: MenuBarComponentAction,
  options: MenuBarOptions<TMessage> & { readonly disabled?: false; readonly inert?: false },
) {
  if (action.kind === 'transition') return options.onTransition(action.transition);
  if (action.kind === 'activate') {
    return options.readOnly ? ignoreMessage() : options.onActivate?.(action.event) ?? ignoreMessage();
  }
  return options.onPointerAction?.(action.action) ?? ignoreMessage();
}

interface ContextMenuModel {
  readonly presentation:
    | { readonly kind: 'closed' }
    | {
      readonly kind: 'open';
      readonly anchor: import('../../interaction/anchored-surface.ts').AnchoredSurfaceAnchor;
      readonly menu: PreparedMenuPresentation;
    };
  readonly title?: string;
  readonly emptyText: string;
  readonly placement: AnchoredSurfacePlacement;
  readonly maxVisibleItems: number;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
  readonly pointerState?: PointerInteractionState;
}

type ContextOwnOptions = Omit<
  ContextMenuOptions<ComponentMessage>,
  'id' | 'onTransition' | 'onActivate' | 'onPointerAction' | 'meta' | 'disabled' | 'busy' | 'readOnly' | 'inert'
>;

type ContextMenuFactory = <const TMessage extends ComponentMessage = never>(
  options: ContextMenuOptions<TMessage>,
) => Element<TMessage>;

type ContextMenuComponentAction =
  | { readonly kind: 'transition'; readonly transition: ContextMenuTransition }
  | { readonly kind: 'activate'; readonly event: MenuActivateEvent }
  | { readonly kind: 'pointer'; readonly action: import('../../interaction/pointer-interaction.ts').PointerInteractionAction };

const instantiateContextMenu = defineComponent<
  ContextOwnOptions,
  ContextMenuModel,
  ContextMenuComponentAction,
  MenuStylePart,
  readonly ['disabled', 'busy', 'readOnly', 'inert'],
  'required',
  readonly ['focus', 'layer', 'styles']
>({
  name: 'terminal-ui/components/context-menu',
  identity: 'required',
  structure: 'composed',
  semantics: 'semantic',
  accessibleRole: 'menu',
  metadata: ['focus', 'layer', 'styles'],
  states: ['disabled', 'busy', 'readOnly', 'inert'],
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
    'scrollbar',
  ],
  prepare: (value, context) => prepareContextMenu(value, !context.disabled && !context.inert),
  compose(input) {
    if (input.model.presentation.kind === 'closed') {
      return text({ id: `${input.id ?? 'context-menu'}:closed`, content: '' });
    }
    const popup = menu({
      id: `${input.id ?? 'context-menu'}:popup:menu`,
      presentation: publicMenuPresentation(input.model.presentation.menu),
      emptyText: input.model.emptyText,
      ...(input.model.scrollbar === undefined ? {} : { scrollbar: input.model.scrollbar }),
      ...(input.model.scrollPolicy === undefined ? {} : { scrollPolicy: input.model.scrollPolicy }),
      ...(input.styles === undefined ? {} : { meta: { styles: input.styles } }),
      ...(input.readOnly ? { readOnly: true } : {}),
      ...(input.busy ? { busy: true } : {}),
      onTransition: (transition) => input.emit(contextMenuComponentTransition({
        kind: 'menu',
        transition,
      })),
      onActivate: (event) => input.emit({ kind: 'activate', event }),
      onPointerAction: (action) => input.emit({ kind: 'pointer', action }),
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
        anchor: input.model.presentation.anchor,
        placement: input.model.placement,
        onOutsidePress: () => input.emit(contextMenuComponentTransition({
          kind: 'dismiss',
          reason: 'outsidePress',
        })),
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
    model.presentation.kind === 'open'
      ? { escape: () => contextMenuComponentTransition({ kind: 'dismiss', reason: 'escape' }) }
      : {},
  pointer: { state: ({ model }) => model.pointerState, onAction: (action) => ({ kind: 'pointer', action }) },
  focusScope: ({ model }) => model.presentation.kind === 'open' ? { kind: 'contain' } : undefined,
  accessibility: contextMenuAccessibility,
});

export const contextMenu: ContextMenuFactory = (options) => {
  const shared = contextMenuInstanceOptions(options);
  if (options.disabled === true) return instantiateContextMenu({
    ...shared,
    disabled: true,
    ...(options.inert === undefined ? {} : { inert: options.inert }),
  });
  if (options.inert === true) return instantiateContextMenu({
    ...shared,
    inert: true,
    ...(options.busy === undefined ? {} : { busy: options.busy }),
  });
  assertMenuCallbacks(options, 'contextMenu');
  return instantiateContextMenu({
    ...shared,
    ...(options.busy === undefined ? {} : { busy: options.busy }),
    ...(options.readOnly === undefined ? {} : { readOnly: options.readOnly }),
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
    presentation: options.presentation,
    ...(options.title === undefined ? {} : { title: options.title }),
    ...(options.emptyText === undefined ? {} : { emptyText: options.emptyText }),
    ...(options.scrollbar === undefined ? {} : { scrollbar: options.scrollbar }),
    ...(options.scrollPolicy === undefined ? {} : { scrollPolicy: options.scrollPolicy }),
    ...(options.placement === undefined ? {} : { placement: options.placement }),
    ...(options.maxVisibleItems === undefined ? {} : { maxVisibleItems: options.maxVisibleItems }),
    ...(options.pointerState === undefined ? {} : { pointerState: options.pointerState }),
    ...(options.meta === undefined ? {} : { meta: options.meta }),
  };
}

function routeContextMenuAction<TMessage extends ComponentMessage>(
  action: ContextMenuComponentAction,
  options: ContextMenuOptions<TMessage> & { readonly disabled?: false; readonly inert?: false },
) {
  if (action.kind === 'transition') return options.onTransition(action.transition);
  if (action.kind === 'activate') {
    return options.readOnly ? ignoreMessage() : options.onActivate?.(action.event) ?? ignoreMessage();
  }
  return options.onPointerAction?.(action.action) ?? ignoreMessage();
}

interface MenuTriggerModel {
  readonly label: string;
  readonly items: readonly PreparedMenuItem[];
  readonly presentation:
    | { readonly kind: 'closed'; readonly active?: string }
    | { readonly kind: 'open'; readonly active?: string; readonly menu: PreparedMenuPresentation };
  readonly placeholder: string;
  readonly placement: AnchoredSurfacePlacement;
  readonly maxVisibleItems: number;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
  readonly pointerState?: PointerInteractionState;
}

type MenuTriggerOwnOptions = Omit<
  MenuTriggerOptions<ComponentMessage>,
  'id' | 'onTransition' | 'onActivate' | 'onPointerAction' | 'meta' | 'disabled' | 'busy' | 'readOnly' | 'inert'
>;

type MenuTriggerFactory = <const TMessage extends ComponentMessage = never>(
  options: MenuTriggerOptions<TMessage>,
) => Element<TMessage>;

type MenuTriggerComponentAction =
  | { readonly kind: 'transition'; readonly transition: MenuTriggerTransition }
  | { readonly kind: 'activate'; readonly event: MenuActivateEvent }
  | { readonly kind: 'pointer'; readonly action: import('../../interaction/pointer-interaction.ts').PointerInteractionAction };

const instantiateMenuTrigger = defineComponent<
  MenuTriggerOwnOptions,
  MenuTriggerModel,
  MenuTriggerComponentAction,
  MenuStylePart,
  readonly ['disabled', 'busy', 'readOnly', 'inert'],
  'required',
  readonly ['focus', 'layer', 'styles'],
  typeof popupSlot
>({
  name: 'terminal-ui/components/menu-trigger',
  identity: 'required',
  structure: 'composite',
  semantics: 'semantic',
  accessibleRole: 'group',
  slots: popupSlot,
  metadata: ['focus', 'layer', 'styles'],
  states: ['disabled', 'busy', 'readOnly', 'inert'],
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
    'scrollbar',
  ],
  prepare: (value, context) => prepareMenuTrigger(value, !context.disabled && !context.inert),
  implementationSlots(input) {
    if (input.model.presentation.kind === 'closed') return { popup: undefined };
    return {
      popup: menuPopup(
        input.id,
        input.model.presentation.menu,
        input.model.maxVisibleItems,
        (action) => input.emit(menuTriggerChildAction(action)),
        input.model.scrollbar,
        input.model.scrollPolicy,
        input.styles,
        input.model.placement,
        input.readOnly,
        input.busy,
      ),
    };
  },
  measure(input) {
    const value = menuTriggerValue(input.model);
    return {
      minWidth: 1,
      minHeight: 1,
      preferredWidth: measureTextCells(
        `${input.model.label}${input.model.label === '' ? '' : ': '}  ${value}  `,
        { widthProfile: input.widthProfile },
      ).cells,
      preferredHeight: 1,
    };
  },
  layout: (input) => ({
    popup: input.slots.count('popup') === 0
      ? undefined
      : { ...input.bounds, height: Math.min(1, input.bounds.height) },
  }),
  renderBeforeChildren: paintMenuTrigger,
  keys: ({ model, busy }) => busy ? {} : ({
    enter: () => menuTriggerComponentTransition({ kind: 'toggle' }),
    space: () => menuTriggerComponentTransition({ kind: 'toggle' }),
    arrowDown: () =>
      model.presentation.kind === 'closed'
        ? menuTriggerComponentTransition({ kind: 'open' })
        : menuTriggerComponentTransition({ kind: 'menu', transition: { kind: 'move', delta: 1 } }),
    arrowUp: () =>
      model.presentation.kind === 'closed'
        ? menuTriggerComponentTransition({ kind: 'open' })
        : menuTriggerComponentTransition({ kind: 'menu', transition: { kind: 'move', delta: -1 } }),
    escape: () => menuTriggerComponentTransition({ kind: 'dismiss', reason: 'escape' }),
  }),
  pointer: { state: ({ model }) => model.pointerState, onAction: (action) => ({ kind: 'pointer', action }) },
  focusScope: ({ model }) => model.presentation.kind === 'open' ? { kind: 'contain' } : undefined,
  focusTargets: (
    { bounds },
  ) => [{ id: 'self', bounds: { ...bounds, height: Math.min(1, bounds.height) } }],
  hitTargets: (
    { id, bounds },
  ) => [{
    id: `${id ?? 'menu-trigger'}:trigger`,
    bounds: { ...bounds, height: Math.min(1, bounds.height) },
    accepts: ['click'],
    focus: { kind: 'target', targetId: 'self' },
    cursor: 'pointer',
    message: () => menuTriggerComponentTransition({ kind: 'toggle' }),
  }],
  accessibility: ({ id, model, focused, children }) => ({
    id,
    role: 'group',
    label: model.label || id,
    children: [{
      id: `${id}:trigger`,
      role: 'button',
      label: model.label || id,
      value: menuTriggerValue(model),
      expanded: model.presentation.kind === 'open',
      ...(focused ? { focused: true } : {}),
    }, ...children],
  }),
});

export const menuTrigger: MenuTriggerFactory = (options) => {
  const shared = menuTriggerInstanceOptions(options);
  if (options.disabled === true) return instantiateMenuTrigger({
    ...shared,
    disabled: true,
    ...(options.inert === undefined ? {} : { inert: options.inert }),
  });
  if (options.inert === true) return instantiateMenuTrigger({
    ...shared,
    inert: true,
    ...(options.busy === undefined ? {} : { busy: options.busy }),
  });
  assertMenuCallbacks(options, 'menuTrigger');
  return instantiateMenuTrigger({
    ...shared,
    ...(options.busy === undefined ? {} : { busy: options.busy }),
    ...(options.readOnly === undefined ? {} : { readOnly: options.readOnly }),
    onAction: (action) => routeMenuTriggerAction(action, options),
  });
};

function assertMenuCallbacks(
  options: {
    readonly onTransition?: unknown;
    readonly onActivate?: unknown;
    readonly onPointerAction?: unknown;
  },
  component: string,
): void {
  assertRequiredCallback(options.onTransition, `${component} onTransition`);
  assertOptionalCallback(options.onActivate, `${component} onActivate`);
  assertOptionalCallback(options.onPointerAction, `${component} onPointerAction`);
}

function menuTriggerComponentTransition(
  transition: MenuTriggerTransition,
): MenuTriggerComponentAction {
  return { kind: 'transition', transition };
}

function menuTriggerChildAction(action: MenuComponentAction): MenuTriggerComponentAction {
  return action.kind === 'transition'
    ? menuTriggerComponentTransition({ kind: 'menu', transition: action.transition })
    : action;
}

function menuTriggerInstanceOptions<TMessage extends ComponentMessage>(
  options: MenuTriggerOptions<TMessage>,
) {
  return {
    id: options.id,
    items: options.items,
    presentation: options.presentation,
    ...(options.label === undefined ? {} : { label: options.label }),
    ...(options.placeholder === undefined ? {} : { placeholder: options.placeholder }),
    ...(options.density === undefined ? {} : { density: options.density }),
    ...(options.placement === undefined ? {} : { placement: options.placement }),
    ...(options.maxVisibleItems === undefined ? {} : { maxVisibleItems: options.maxVisibleItems }),
    ...(options.scrollbar === undefined ? {} : { scrollbar: options.scrollbar }),
    ...(options.scrollPolicy === undefined ? {} : { scrollPolicy: options.scrollPolicy }),
    ...(options.pointerState === undefined ? {} : { pointerState: options.pointerState }),
    ...(options.meta === undefined ? {} : { meta: options.meta }),
  };
}

function routeMenuTriggerAction<TMessage extends ComponentMessage>(
  action: MenuTriggerComponentAction,
  options: MenuTriggerOptions<TMessage> & { readonly disabled?: false; readonly inert?: false },
) {
  if (action.kind === 'transition') return options.onTransition(action.transition);
  if (action.kind === 'activate') {
    return options.readOnly ? ignoreMessage() : options.onActivate?.(action.event) ?? ignoreMessage();
  }
  return options.onPointerAction?.(action.action) ?? ignoreMessage();
}

function prepareMenu(value: Readonly<MenuOwnOptions>, pointerAvailable: boolean): MenuModel {
  const presentation = prepareMenuPresentation(value.presentation, 'menu presentation');
  const emptyText = optionalText(value.emptyText, 'menu emptyText') ?? 'No commands';
  const scrollbar = prepareComponentScrollbarOptions(value.scrollbar, 'menu scrollbar');
  const scrollPolicy = prepareComponentScrollPolicy(value.scrollPolicy, 'menu scrollPolicy');
  const pointerState = preparePointerInteractionState(value.pointerState, 'menu pointerState', pointerAvailable);
  const scroll = presentation.scroll;
  const rows = flattenMenu(presentation.items);
  return {
    items: presentation.items,
    rows,
    activePath: presentation.activePath,
    emptyText,
    ...(scroll === undefined ? {} : { scroll }),
    ...(scrollbar === undefined ? {} : { scrollbar }),
    ...(scrollPolicy === undefined ? {} : { scrollPolicy }),
    ...(pointerState === undefined ? {} : { pointerState }),
  };
}

function prepareMenuPresentation(
  value: MenuPresentation,
  subject: string,
): PreparedMenuPresentation {
  if (!isNonArrayObject(value)) throw new TypeError(`${subject} must be an object.`);
  if (
    !Array.isArray(value.activePath) ||
    value.activePath.some((id) => typeof id !== 'string' || id.trim() === '')
  ) throw new TypeError(`${subject}.activePath must be an array of non-empty strings.`);
  if (!Array.isArray(value.items)) throw new TypeError(`${subject}.items must be an array.`);
  const items = prepareItems(value.items, `${subject}.items`);
  const ids = new Set<string>();
  const visit = (current: readonly PreparedMenuItem[]): void => {
    for (const item of current) {
      if (ids.has(item.id)) throw new TypeError(`${subject} contains duplicate id "${item.id}".`);
      ids.add(item.id);
      visit(item.children);
    }
  };
  visit(items);
  const scroll = prepareComponentScrollState(value.scroll, `${subject}.scroll`);
  return {
    activePath: value.activePath.map(clean),
    items,
    ...(scroll === undefined ? {} : { scroll }),
  };
}

function publicMenuPresentation(value: PreparedMenuPresentation): MenuPresentation {
  return {
    activePath: value.activePath,
    items: value.items.map(publicMenuItem),
    ...(value.scroll === undefined ? {} : { scroll: value.scroll }),
  };
}

function publicMenuItem(value: PreparedMenuItem): MenuPresentation['items'][number] {
  if (value.kind === 'separator') return { kind: 'separator', id: value.id };
  if (value.kind === 'section') return {
    kind: 'section',
    id: value.id,
    ...(value.label === '' ? {} : { label: value.label }),
    children: value.children.map(publicMenuItem),
  };
  const common = {
    id: value.id,
    label: value.label,
    ...(value.description === undefined ? {} : { description: value.description }),
    ...(value.disabled ? { disabled: true } : {}),
    ...(value.leading === undefined ? {} : { leading: value.leading }),
    ...(value.trailing === undefined ? {} : { trailing: value.trailing }),
    ...(value.shortcut === undefined ? {} : { shortcut: value.shortcut }),
    ...(value.tone === 'default' ? {} : { tone: value.tone }),
  };
  if (value.kind === 'action') return { ...common, kind: value.kind };
  if (value.kind === 'check') return { ...common, kind: value.kind, checked: value.checked };
  if (value.kind === 'radio') {
    return { ...common, kind: value.kind, checked: value.checked, groupId: value.groupId };
  }
  return {
    ...common,
    kind: value.kind,
    ...(value.expanded === undefined ? {} : { expanded: value.expanded }),
    children: value.children.map(publicMenuItem),
  };
}

function prepareItems(
  values: readonly MenuPresentationItem[],
  subject: string,
): readonly PreparedMenuItem[] {
  return values.map((value, index) => {
    const kind = value.kind;
    if (!isStringMember(kind, ['action', 'check', 'radio', 'separator', 'section', 'submenu'])) {
      throw new TypeError(`${subject}[${String(index)}].kind is invalid.`);
    }
    const id = requiredText(value.id, `${subject}[${String(index)}].id`);
    if (kind === 'separator') {
      return {
        id: clean(id),
        label: '',
        disabled: true,
        tone: 'default',
        kind,
        children: [],
      };
    }
    if (kind === 'section') {
      if (!Array.isArray(value.children) || value.children.length === 0) {
        throw new TypeError(`${subject}[${String(index)}].children must be a non-empty array.`);
      }
      return {
        id: clean(id),
        label: optionalText(value.label, `${subject}[${String(index)}].label`) ?? '',
        disabled: true,
        tone: 'default',
        kind,
        children: prepareItems(value.children, `${subject}[${String(index)}].children`),
      };
    }
    const label = requiredText(value.label, `${subject}[${String(index)}].label`);
    const description = optionalText(
      value.description,
      `${subject}[${String(index)}].description`,
    );
    const shortcut = value.shortcut;
    if (shortcut !== undefined) formatKeyboardBinding(shortcut);
    if (value.disabled !== undefined && typeof value.disabled !== 'boolean') {
      throw new TypeError(`${subject}[${String(index)}].disabled must be boolean.`);
    }
    assertOptionalEnum(
      value.tone,
      ['default', 'destructive'],
      `${subject}[${String(index)}].tone`,
    );
    if ((kind === 'check' || kind === 'radio') && typeof value.checked !== 'boolean') {
      throw new TypeError(`${subject}[${String(index)}].checked must be boolean.`);
    }
    if (kind === 'submenu' && !Array.isArray(value.children)) {
      throw new TypeError(`${subject}[${String(index)}].children must be an array.`);
    }
    const base: Omit<PreparedMenuItemBase, 'children'> = {
      id: clean(id),
      label: clean(label),
      ...(description === undefined ? {} : { description: clean(description) }),
      disabled: value.disabled === true,
      ...(value.leading === undefined
        ? {}
        : { leading: prepareInline(value.leading, `${subject}[${String(index)}].leading`) }),
      ...(value.trailing === undefined
        ? {}
        : { trailing: prepareInline(value.trailing, `${subject}[${String(index)}].trailing`) }),
      ...(shortcut === undefined ? {} : { shortcut }),
      tone: value.tone === 'destructive' ? 'destructive' : 'default',
    };
    if (kind === 'action') return { ...base, kind, children: [] };
    if (kind === 'check') {
      return {
        ...base,
        kind,
        checked: checkedValue(value.checked, subject, index),
        children: [],
      };
    }
    if (kind === 'radio') {
      return {
        ...base,
        kind,
        checked: checkedValue(value.checked, subject, index),
        groupId: requiredText(value.groupId, `${subject}[${String(index)}].groupId`),
        children: [],
      };
    }
    return {
      ...base,
      kind,
      expanded: optionalBoolean(
        value.expanded,
        `${subject}[${String(index)}].expanded`,
      ) ?? false,
      children: prepareItems(value.children, `${subject}[${String(index)}].children`),
    };
  });
}

function flattenMenu(items: readonly PreparedMenuItem[], depth = 0): readonly MenuRow[] {
  return items.flatMap((
    item,
  ): readonly MenuRow[] => [
    { ...item, depth },
    ...(item.kind === 'submenu' && item.expanded
      ? flattenMenu(item.children, depth + 1)
      : item.kind === 'section' ? flattenMenu(item.children, depth) : []),
  ]);
}

function measureMenu(input: ComponentMeasureInput<MenuModel>): Measurement {
  const rows = input.model.rows.slice(0, 64);
  const width = Math.max(
    1,
    ...rows.map((item) =>
      measureTextCells(menuRowText(item, input.theme), { widthProfile: input.widthProfile }).cells
    ),
  );
  return {
    minWidth: 1,
    minHeight: 1,
    preferredWidth: width,
    preferredHeight: Math.max(1, Math.min(64, input.model.rows.length)),
  };
}

function menuPlan(model: MenuModel, bounds: Rect) {
  const scroll = model.scroll ??
    createScrollState();
  const plan = prepareComponentScrollbar({
    bounds,
    scroll,
    contentRows: model.rows.length,
    contentColumns: bounds.width,
    ...(model.scrollbar === undefined ? {} : { options: model.scrollbar }),
    defaultAxis: 'vertical',
  });
  return {
    plan,
    rows: model.rows.slice(
      plan.scroll.offsetRow,
      plan.scroll.offsetRow + plan.contentBounds.height,
    ),
  };
}

function paintMenu(input: ComponentRenderInput<MenuModel, MenuStylePart>): void {
  const { plan, rows } = menuPlan(input.model, input.bounds);
  if (rows.length === 0 && plan.contentBounds.height > 0) {
    input.target.write(plan.contentBounds.row, plan.contentBounds.column, [
      menuSpan(input, input.model.emptyText, 'empty', 'empty', undefined, {
        fg: { kind: 'theme', token: 'text.muted' },
        dim: true,
      }),
    ]);
  }
  rows.forEach((item, index) => {
    const active = input.model.activePath.at(-1) === item.id;
    const target = `${input.id ?? 'menu'}:item:${item.id}`;
    const state = item.disabled
      ? 'disabled' as const
      : pointerVisualState(input.model.pointerState, target) ??
        (active ? 'selected' as const : undefined);
    const base: TerminalStyle = state === 'selected'
      ? {
        fg: { kind: 'theme', token: 'menu.selected' },
        bg: { kind: 'theme', token: 'selection.background' },
        bold: true,
      }
      : item.tone === 'destructive'
      ? { fg: { kind: 'theme', token: 'status.error' } }
      : {};
    const spans = menuRowSpans(input, item, state, base);
    const used = measureRenderSpans(spans, { widthProfile: input.widthProfile });
    input.target.write(
      plan.contentBounds.row + index,
      plan.contentBounds.column,
      clipRenderSpans(
        [
          ...spans,
          ...(used >= plan.contentBounds.width ? [] : [
            menuSpan(
              input,
              ' '.repeat(plan.contentBounds.width - used),
              'control',
              `item.${item.id}.fill`,
              item.id,
              base,
              state,
            ),
          ]),
        ],
        plan.contentBounds.width,
        { widthProfile: input.widthProfile },
      ),
    );
  });
  paintComponentScrollbar({
    target: input.target,
    plan,
    theme: input.theme,
    source: (source) => input.source({ ...source, partType: source.partType }),
  });
}

function menuRowSpans(
  input: ComponentRenderInput<MenuModel, MenuStylePart>,
  item: MenuRow,
  state: Exclude<import('../../element/metadata.ts').ElementVisualState, 'default'> | undefined,
  base: TerminalStyle,
): readonly RenderSpan[] {
  const indent = '  '.repeat(item.depth);
  if (item.kind === 'separator') {
    return [menuSpan(
      input,
      input.theme.tokens.symbols.borderSingle.horizontal,
      'separator',
      `item.${item.id}.separator`,
      item.id,
      base,
    )];
  }
  if (item.kind === 'section') {
    return [menuSpan(
      input,
      `${indent}${item.label}`,
      'title',
      `item.${item.id}.section`,
      item.id,
      { ...base, bold: true },
    )];
  }
  const marker = item.kind === 'check' || item.kind === 'radio'
    ? item.checked
      ? input.theme.tokens.symbols.checkboxChecked
      : input.theme.tokens.symbols.checkboxUnchecked
    : item.kind === 'submenu'
    ? item.expanded ? input.theme.tokens.symbols.expanded : input.theme.tokens.symbols.collapsed
    : item.tone === 'destructive'
    ? input.theme.tokens.symbols.statusError
    : item.id === input.model.activePath.at(-1)
    ? input.theme.tokens.symbols.pointer
    : ' ';
  return [
    menuSpan(input, indent, 'separator', `item.${item.id}.indent`, item.id, base, state),
    menuSpan(
      input,
      `${oneCellGlyph(marker, marker === ' ' ? ' ' : '>', { widthProfile: input.widthProfile })} `,
      'marker',
      `item.${item.id}.marker`,
      item.id,
      base,
      state,
    ),
    ...(item.leading === undefined ? [] : [
      ...inlineSpans(input, item.leading, 'leading', item.id, base, state),
      menuSpan(input, ' ', 'separator', `item.${item.id}.leading-gap`, item.id, base, state),
    ]),
    menuSpan(input, item.label, 'label', `item.${item.id}.label`, item.id, base, state),
    ...(item.description === undefined ? [] : [
      menuSpan(
        input,
        `  ${item.description}`,
        'description',
        `item.${item.id}.description`,
        item.id,
        base,
        state,
      ),
    ]),
    ...(item.shortcut === undefined ? [] : [
      menuSpan(
        input,
        `  ${formatKeyboardBinding(item.shortcut)}`,
        'shortcut',
        `item.${item.id}.shortcut`,
        item.id,
        base,
        state,
      ),
    ]),
    ...(item.trailing === undefined ? [] : [
      menuSpan(input, ' ', 'separator', `item.${item.id}.trailing-gap`, item.id, base, state),
      ...inlineSpans(input, item.trailing, 'trailing', item.id, base, state),
    ]),
  ];
}

function menuHitTargets(
  input: ComponentInput<MenuModel>,
): readonly import('../../renderer/index.ts').HitTarget<MenuComponentAction>[] {
  const { plan, rows } = menuPlan(input.model, input.bounds);
  const scrollTargets = componentScrollbarHitTargets<MenuComponentAction>({
    id: input.id ?? 'menu',
    plan,
    ...(input.model.scrollPolicy === undefined ? {} : { policy: input.model.scrollPolicy }),
    onScroll: (event) => menuComponentTransition({ kind: 'scroll', event }),
  });
  if (input.busy) return scrollTargets;
  return [
    ...rows.flatMap((item, index) =>
      item.disabled ? [] : [{
        id: `${input.id ?? 'menu'}:item:${item.id}`,
        bounds: {
          row: plan.contentBounds.row + index,
          column: plan.contentBounds.column,
          width: plan.contentBounds.width,
          height: 1,
        },
        accepts: ['click' as const],
        focus: { kind: 'target' as const, targetId: 'self' },
        cursor: 'pointer' as const,
        message: () => item.kind === 'submenu'
          ? menuComponentTransition({ kind: 'setActive', id: item.id })
          : input.readOnly ? ignoreMessage() : ({
            kind: 'activate' as const,
            event: { kind: 'activate' as const, id: item.id },
          }),
      }]
    ),
    ...scrollTargets,
  ];
}

function menuAccessibility(input: ComponentAccessibilityInput<MenuModel>): AccessibleNode {
  return {
    id: input.id,
    role: 'menu',
    label: input.id,
    scope: { kind: 'menu' },
    children: menuAccessibleItems(
      input.id,
      input.model.rows,
      input.model.activePath,
      input.focused,
    ),
  };
}

function menuAccessibleItems(
  menuId: string,
  rows: readonly MenuRow[],
  activePath: readonly string[],
  focused: boolean,
): readonly AccessibleNode[] {
  const activeId = activePath.at(-1);
  return rows.map((item): AccessibleNode => item.kind === 'separator'
    ? {
      id: `${menuId}:item:${item.id}`,
      role: 'separator',
      orientation: 'horizontal',
    }
    : item.kind === 'section'
    ? {
      id: `${menuId}:item:${item.id}`,
      role: 'group',
      ...(item.label === '' ? {} : { label: item.label }),
    }
    : ({
    id: `${menuId}:item:${item.id}`,
    role: item.kind === 'check'
      ? 'menuitemcheckbox'
      : item.kind === 'radio' ? 'menuitemradio' : 'menuitem',
    label: item.label,
    ...(item.description === undefined ? {} : { description: item.description }),
    ...(item.kind === 'check' || item.kind === 'radio' ? { checked: item.checked } : {}),
    ...(item.disabled ? { disabled: true } : {}),
    ...(focused && item.id === activeId ? { focused: true } : {}),
  }));
}

function activeMenuItem(model: MenuModel): MenuRow | undefined {
  const id = model.activePath.at(-1);
  return id === undefined ? undefined : model.rows.find((item) => item.id === id && !item.disabled);
}

function prepareMenuBar(value: Readonly<MenuBarOwnOptions>, pointerAvailable: boolean): MenuBarModel {
  if (!Array.isArray(value.items)) {
    throw new TypeError('menuBar items must be an array.');
  }
  const items = prepareItems(value.items, 'menuBar items');
  const presentation = prepareMenuBarPresentation(value.presentation);
  const maxVisibleItems = positiveInteger(value.maxVisibleItems, 12, 'menuBar maxVisibleItems');
  const scrollbar = prepareComponentScrollbarOptions(value.scrollbar, 'menuBar scrollbar');
  const scrollPolicy = prepareComponentScrollPolicy(value.scrollPolicy, 'menuBar scrollPolicy');
  const pointerState = preparePointerInteractionState(value.pointerState, 'menuBar pointerState', pointerAvailable);
  return {
    items,
    presentation,
    maxVisibleItems,
    ...(scrollbar === undefined ? {} : { scrollbar }),
    ...(scrollPolicy === undefined ? {} : { scrollPolicy }),
    ...(pointerState === undefined ? {} : { pointerState }),
  };
}

function prepareMenuBarPresentation(value: MenuBarPresentation): MenuBarModel['presentation'] {
  if (!isNonArrayObject(value) || !isStringMember(value.kind, ['closed', 'open'])) {
    throw new TypeError('menuBar presentation is invalid.');
  }
  const active = optionalText(value.active, 'menuBar active');
  if (value.kind === 'closed') {
    return { kind: 'closed', ...(active === undefined ? {} : { active: clean(active) }) };
  }
  if (active === undefined) throw new TypeError('Open menuBar requires active.');
  const menuValue = prepareMenuPresentation(value.menu, 'menuBar menu');
  return { kind: 'open', active: clean(active), menu: menuValue };
}

function paintMenuBar(input: ComponentRenderInput<MenuBarModel, MenuStylePart>): void {
  const spans = input.model.items.flatMap((item, index): readonly RenderSpan[] => {
    const active = input.model.presentation.active === item.id;
    const state = pointerVisualState(
      input.model.pointerState,
      `${input.id ?? 'menu-bar'}:heading:${item.id}`,
    ) ?? (active ? 'selected' as const : undefined);
    const marker = active
      ? oneCellGlyph(input.theme.tokens.symbols.pointer, '>', { widthProfile: input.widthProfile })
      : item.disabled
      ? '-'
      : ' ';
    return [
      ...(index === 0 ? [] : [menuSpan(input, '  ', 'separator', 'heading.separator')]),
      menuSpan(
        input,
        `${marker} ${item.label}`,
        'label',
        `heading.${item.id}`,
        item.id,
        active
          ? {
            fg: { kind: 'theme', token: 'menu.selected' },
            bg: { kind: 'theme', token: 'selection.background' },
            bold: true,
          }
          : undefined,
        state,
      ),
    ];
  });
  input.target.write(
    0,
    0,
    clipRenderSpans(spans, input.bounds.width, { widthProfile: input.widthProfile }),
  );
}

function menuBarHitTargets(
  input: ComponentInput<MenuBarModel>,
): readonly import('../../renderer/index.ts').HitTarget<MenuBarComponentAction>[] {
  let column = 0;
  return input.model.items.flatMap((item, index) => {
    if (index > 0) column += 2;
    const width = measureTextCells(` ${item.label} `, { widthProfile: input.widthProfile }).cells;
    const start = column;
    column += width;
    return item.disabled ? [] : [{
      id: `${input.id ?? 'menu-bar'}:heading:${item.id}`,
      bounds: { row: 0, column: start, width, height: 1 },
      accepts: ['click' as const],
      focus: { kind: 'target' as const, targetId: 'self' },
      cursor: 'pointer' as const,
      message: () => item.kind === 'submenu'
        ? menuBarComponentTransition({ kind: 'activateHeading', id: item.id })
        : input.readOnly ? ignoreMessage() : ({
          kind: 'activate' as const,
          event: { kind: 'activate' as const, id: item.id },
        }),
    }];
  });
}

function menuBarAccessibility(
  input: ComponentAccessibilityInput<MenuBarModel, typeof popupSlot>,
): AccessibleNode {
  return {
    id: input.id,
    role: 'menubar' as const,
    label: input.id,
    scope: { kind: 'menu' as const },
    ...(input.focused ? { focused: true } : {}),
    children: [
      ...input.model.items.map((item) => ({
        id: `${input.id}:heading:${item.id}`,
        role: 'menuitem' as const,
        label: item.label,
        ...(item.disabled ? { disabled: true } : {}),
      })),
      ...input.slots.popup,
    ],
  };
}

function menuPopup(
  id: string | undefined,
  presentation: PreparedMenuPresentation,
  maxVisibleItems: number,
  emit: (
    action: MenuComponentAction,
  ) => import('../../interaction/index.ts').MessageResolution<ComponentMessage>,
  scrollbar?: ScrollbarOptions,
  scrollPolicy?: ScrollPolicy,
  styles?: import('../../element/metadata.ts').ElementStyles<MenuStylePart>,
  placement: AnchoredSurfacePlacement = 'auto',
  readOnly = false,
  busy = false,
): Element<ComponentMessage> {
  const popupMenu = menu({
    id: `${id ?? 'menu'}:popup:menu`,
    presentation: publicMenuPresentation(presentation),
    ...(scrollbar === undefined ? {} : { scrollbar }),
    ...(scrollPolicy === undefined ? {} : { scrollPolicy }),
    ...(styles === undefined ? {} : { meta: { styles } }),
    ...(readOnly ? { readOnly: true } : {}),
    ...(busy ? { busy: true } : {}),
    onTransition: (transition) => emit(menuComponentTransition(transition)),
    onActivate: (event) => emit({ kind: 'activate', event }),
    onPointerAction: (action) => emit({ kind: 'pointer', action }),
  });
  return portal(
    surface(popupMenu, {
      id: `${id ?? 'menu'}:popup`,
      appearance: 'raised',
      border: { kind: 'single' },
      maxHeight: maxVisibleItems + 2,
    }),
    {
      id: `${id ?? 'menu'}:portal`,
      anchor: { kind: 'allocation' },
      placement,
      margin: 0,
      fit: 'available',
      meta: { layer: { zIndex: 20, underlay: 'clear' } },
    },
  );
}

function contextMenuAccessibility(
  input: ComponentAccessibilityInput<ContextMenuModel>,
): AccessibleNode {
  const children = input.model.presentation.kind === 'closed' ? [] : menuAccessibleItems(
    `${input.id}:popup:menu`,
    flattenMenu(input.model.presentation.menu.items),
    input.model.presentation.menu.activePath,
    input.focus === 'descendant',
  );
  return {
    id: input.id,
    role: 'menu',
    label: input.model.title ?? input.id,
    scope: { kind: 'menu' },
    children,
  };
}

function prepareContextMenu(value: Readonly<ContextOwnOptions>, pointerAvailable: boolean): ContextMenuModel {
  const presentation = prepareContextPresentation(value.presentation);
  const title = optionalText(value.title, 'contextMenu title');
  const emptyText = optionalText(value.emptyText, 'contextMenu emptyText') ?? 'No commands';
  const placement = preparePlacement(value.placement);
  const maxVisibleItems = positiveInteger(
    value.maxVisibleItems,
    12,
    'contextMenu maxVisibleItems',
  );
  const scrollbar = prepareComponentScrollbarOptions(value.scrollbar, 'contextMenu scrollbar');
  const scrollPolicy = prepareComponentScrollPolicy(
    value.scrollPolicy,
    'contextMenu scrollPolicy',
  );
  const pointerState = preparePointerInteractionState(value.pointerState, 'contextMenu pointerState', pointerAvailable);
  return {
    presentation,
    ...(title === undefined ? {} : { title: clean(title) }),
    emptyText,
    placement,
    maxVisibleItems,
    ...(scrollbar === undefined ? {} : { scrollbar }),
    ...(scrollPolicy === undefined ? {} : { scrollPolicy }),
    ...(pointerState === undefined ? {} : { pointerState }),
  };
}

function prepareContextPresentation(value: ContextMenuPresentation): ContextMenuModel['presentation'] {
  if (!isNonArrayObject(value) || !isStringMember(value.kind, ['closed', 'open'])) {
    throw new TypeError('contextMenu presentation is invalid.');
  }
  if (value.kind === 'closed') {
    return { kind: 'closed' };
  }
  return {
    kind: 'open',
    anchor: prepareAnchor(value.anchor),
    menu: prepareMenuPresentation(value.menu, 'contextMenu menu'),
  };
}

function prepareMenuTrigger(value: Readonly<MenuTriggerOwnOptions>, pointerAvailable: boolean): MenuTriggerModel {
  if (!Array.isArray(value.items)) {
    throw new TypeError('menuTrigger items must be an array.');
  }
  const label = optionalText(value.label, 'menuTrigger label') ?? '';
  const items = prepareItems(value.items, 'menuTrigger items');
  const presentation = prepareMenuTriggerPresentation(value.presentation);
  const placeholder = optionalText(value.placeholder, 'menuTrigger placeholder') ?? 'Select…';
  assertOptionalEnum(value.density, ['compact', 'regular'], 'menuTrigger density');
  const placement = preparePlacement(value.placement);
  const maxVisibleItems = positiveInteger(
    value.maxVisibleItems,
    12,
    'menuTrigger maxVisibleItems',
  );
  const scrollbar = prepareComponentScrollbarOptions(value.scrollbar, 'menuTrigger scrollbar');
  const scrollPolicy = prepareComponentScrollPolicy(
    value.scrollPolicy,
    'menuTrigger scrollPolicy',
  );
  const pointerState = preparePointerInteractionState(value.pointerState, 'menuTrigger pointerState', pointerAvailable);
  return {
    label: clean(label),
    items,
    presentation,
    placeholder: clean(placeholder),
    placement,
    maxVisibleItems,
    ...(scrollbar === undefined ? {} : { scrollbar }),
    ...(scrollPolicy === undefined ? {} : { scrollPolicy }),
    ...(pointerState === undefined ? {} : { pointerState }),
  };
}

function prepareMenuTriggerPresentation(value: MenuTriggerPresentation): MenuTriggerModel['presentation'] {
  if (!isNonArrayObject(value) || !isStringMember(value.kind, ['closed', 'open'])) {
    throw new TypeError('menuTrigger presentation is invalid.');
  }
  const active = optionalText(value.active, 'menuTrigger active');
  if (value.kind === 'closed') {
    return { kind: 'closed', ...(active === undefined ? {} : { active: clean(active) }) };
  }
  return {
    kind: 'open',
    ...(active === undefined ? {} : { active: clean(active) }),
    menu: prepareMenuPresentation(value.menu, 'menuTrigger menu'),
  };
}

function paintMenuTrigger(input: ComponentRenderInput<MenuTriggerModel, MenuStylePart>): void {
  const value = menuTriggerValue(input.model);
  const state = pointerVisualState(input.model.pointerState, `${input.id ?? 'menu-trigger'}:trigger`) ??
    (input.focus === 'self' ? 'focused' as const : undefined);
  const selected = input.model.presentation.active === undefined
    ? ' '
    : oneCellGlyph(input.theme.tokens.symbols.pointer, '>', { widthProfile: input.widthProfile });
  const spans = [
    menuSpan(
      input,
      input.model.label === '' ? '' : `${input.model.label}: `,
      'label',
      'label',
      undefined,
      undefined,
      state,
    ),
    menuSpan(
      input,
      `${selected} `,
      'marker',
      'selection',
      input.model.presentation.active,
      undefined,
      state,
    ),
    menuSpan(
      input,
      value,
      value === input.model.placeholder ? 'placeholder' : 'label',
      'value',
      input.model.presentation.active,
      undefined,
      state,
    ),
    menuSpan(
      input,
      ` ${
        input.model.presentation.kind === 'open'
          ? input.theme.tokens.symbols.expanded
          : input.theme.tokens.symbols.collapsed
      }`,
      'marker',
      'marker',
      undefined,
      undefined,
      state,
    ),
  ];
  input.target.write(
    0,
    0,
    clipRenderSpans(spans, input.bounds.width, { widthProfile: input.widthProfile }),
  );
}

function menuTriggerValue(model: MenuTriggerModel): string {
  const active = model.presentation.active;
  return active === undefined
    ? model.placeholder
    : model.items.find((item) => item.id === active)?.label ?? model.placeholder;
}

function menuSpan<TModel extends object>(
  input: ComponentRenderInput<TModel, MenuStylePart>,
  text: string,
  part: MenuStylePart,
  partName: string,
  itemId?: string,
  base?: TerminalStyle,
  state?: Exclude<import('../../element/metadata.ts').ElementVisualState, 'default'>,
): RenderSpan {
  const value = input.style({
    part,
    ...(base === undefined ? {} : { base }),
    ...(state === undefined ? {} : { state }),
  });
  return span(text, {
    ...(value === undefined ? {} : { style: value }),
    source: input.source({
      cellRole: part === 'marker' || part === 'separator' || part === 'control'
        ? 'decoration'
        : 'text',
      partName,
      partType: part,
      description: partName,
      ...(itemId === undefined ? {} : { itemId }),
      ...(state === undefined ? {} : { interactionState: state }),
    }),
  });
}

function inlineSpans(
  input: ComponentRenderInput<MenuModel, MenuStylePart>,
  content: InlineContent,
  part: 'leading' | 'trailing',
  itemId: string,
  base: TerminalStyle,
  state: Exclude<import('../../element/metadata.ts').ElementVisualState, 'default'> | undefined,
): readonly RenderSpan[] {
  return content.map((segment, index) =>
    menuSpan(
      input,
      inlineSegmentText(segment, input.theme.tokens.symbols.mode),
      part,
      `item.${itemId}.${part}.${String(index)}`,
      itemId,
      { ...base, ...segment.style },
      state,
    )
  );
}

function menuRowText(item: MenuRow, theme: ComponentMeasureInput<MenuModel>['theme']): string {
  return `${'  '.repeat(item.depth)}${theme.tokens.symbols.pointer} ${
    item.leading === undefined ? '' : `${inlineContentAccessibleText(item.leading)} `
  }${item.label}${item.description === undefined ? '' : `  ${item.description}`}${
    item.shortcut === undefined ? '' : `  ${formatKeyboardBinding(item.shortcut)}`
  }${item.trailing === undefined ? '' : ` ${inlineContentAccessibleText(item.trailing)}`}`;
}

function prepareInline(value: InlineContent, subject: string): InlineContent {
  try {
    return normalizeInlineContent(value);
  } catch (cause) {
    throw new TypeError(`${subject} must be inline content.`, { cause });
  }
}
function checkedValue(value: unknown, subject: string, index: number): boolean {
  if (typeof value !== 'boolean') {
    throw new TypeError(`${subject}[${String(index)}].checked must be boolean.`);
  }
  return value;
}
function requiredText(value: unknown, subject: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${subject} must be a non-empty string.`);
  }
  return value;
}
function optionalBoolean(value: unknown, subject: string): boolean | undefined {
  if (value === undefined || typeof value === 'boolean') return value;
  throw new TypeError(`${subject} must be boolean.`);
}
function optionalText(value: unknown, subject: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new TypeError(`${subject} must be a string.`);
  return value;
}
function clean(value: string): string {
  return sanitizeTerminalText(value).text.replace(/\s*\n\s*/gu, ' ');
}
function positiveInteger(value: unknown, fallback: number, subject: string): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${subject} must be a positive safe integer.`);
  }
  return value;
}
function preparePlacement(value: AnchoredSurfacePlacement | undefined): AnchoredSurfacePlacement {
  if (value === undefined) return 'auto';
  assertOptionalEnum(
    value,
    ['above', 'below', 'left', 'right', 'auto', 'cursor'],
    'menu placement',
  );
  return value;
}
function prepareAnchor(
  value: AnchoredSurfaceAnchor,
): AnchoredSurfaceAnchor {
  if (!isNonArrayObject(value)) throw new TypeError('menu anchor must be an object.');
  if (
    value.kind === 'cursor' && typeof value.row === 'number' &&
    Number.isFinite(value.row) && typeof value.column === 'number' &&
    Number.isFinite(value.column)
  ) return { kind: 'cursor', row: value.row, column: value.column };
  if (
    value.kind === 'target' && isNonArrayObject(value.bounds)
  ) {
    const bounds = value.bounds;
    if (
      typeof bounds.row === 'number' && Number.isFinite(bounds.row) &&
      typeof bounds.column === 'number' && Number.isFinite(bounds.column) &&
      typeof bounds.width === 'number' && Number.isFinite(bounds.width) &&
      bounds.width >= 0 && typeof bounds.height === 'number' &&
      Number.isFinite(bounds.height) && bounds.height >= 0
    ) {
      return {
        kind: 'target',
        bounds: {
          row: bounds.row,
          column: bounds.column,
          width: bounds.width,
          height: bounds.height,
        },
      };
    }
  }
  throw new TypeError('menu anchor is invalid.');
}

import type { AccessibleNode } from '../../accessibility/types.ts';
import type { MenuBarTransition, MenuBarView } from '../../behavior/menu.ts';
import type {
  ComponentAccessibilityInput,
  ComponentInput,
  ComponentRenderInput,
} from '../../component/contracts.ts';
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
import { pointerVisualState } from '../../interaction/pointer-interaction.ts';
import {
  containedPopupFocus,
  popupAllowsDismissal,
  popupFocusScope,
  standardPopupDismissal,
} from '../../interaction/popup.ts';
import { oneCellGlyph } from '../../text/cell-geometry.ts';
import { measureTextCells } from '../../text/measure.ts';
import type { RenderSpan } from '../../visual/render-content.ts';
import { clipRenderSpans, layoutRenderSpans } from '../../visual/render-content.ts';
import type { MenuStylePart } from '../style-parts.ts';
import type {
  MenuBarComponentAction,
  MenuBarFactory,
  MenuBarModel,
  MenuBarOwnOptions,
  MenuComponentAction,
  MenuItemModel,
} from './contracts.ts';
import { createMenuItemModels, decodeMenuView } from './menu.ts';
import type { MenuBarOptions } from './options.ts';
import { menuPopup } from './popup.ts';
import {
  assertMenuCallbacks,
  clean,
  menuSpan,
  optionalText,
  popupSlot,
  positiveInteger,
} from './shared.ts';

const instantiateMenuBar = defineComponent<MenuBarOwnOptions, MenuBarComponentAction>()({
  name: 'terminal-ui/components/menu-bar',
  identity: 'required',
  structure: 'composite',
  semantics: 'semantic',
  accessibleRole: 'menubar',
  slots: popupSlot,
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
  createModel: createMenuBarModel,
  implementationSlots(input) {
    if (input.model.view.kind === 'closed') return { popup: undefined };
    return {
      popup: menuPopup({
        ...(input.id === undefined ? {} : { id: input.id }),
        view: input.model.view.menu,
        accessibleName: input.model.view.popupAccessibleName,
        maxVisibleItems: input.model.maxVisibleItems,
        emit: (action) => input.emit(menuBarChildAction(action)),
        dismissOutside: () => input.emit(menuBarComponentTransition({
          kind: 'close',
          reason: 'outsidePress',
        })),
        ...(input.model.scrollbar === undefined ? {} : { scrollbar: input.model.scrollbar }),
        ...(input.model.scrollPolicy === undefined
          ? {}
          : { scrollPolicy: input.model.scrollPolicy }),
        ...(input.styles === undefined ? {} : { styles: input.styles }),
        busy: input.busy,
      }),
    };
  },
  measure(input) {
    const width = input.model.items.reduce(
      (total, item, index) =>
        total + measureTextCells(item.label, { widthProfile: input.widthProfile, textPresentation: input.textPresentation }).cells + 2 +
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
  keys: ({ model, busy }) => busy
    ? model.view.kind === 'open'
      ? { escape: () => menuBarComponentTransition({ kind: 'close', reason: 'escape' }) }
      : {}
    : ({
    arrowLeft: () => menuBarComponentTransition({ kind: 'moveHeading', delta: -1 }),
    arrowRight: () => menuBarComponentTransition({ kind: 'moveHeading', delta: 1 }),
    home: () => menuBarComponentTransition({ kind: 'firstHeading' }),
    end: () => menuBarComponentTransition({ kind: 'lastHeading' }),
    enter: () =>
      menuBarComponentTransition(
        model.view.kind === 'open'
          ? { kind: 'close', reason: 'escape' }
          : { kind: 'open' },
      ),
    escape: () => menuBarComponentTransition({ kind: 'close', reason: 'escape' }),
  }),
  focusScope: ({ model }) => popupFocusScope(
    model.view.kind === 'open',
    containedPopupFocus,
  ),
  onFocus: (event, { model }) => event.kind === 'focusLeave'
    && model.view.kind === 'open'
    && popupAllowsDismissal(standardPopupDismissal, 'focusLoss')
    ? menuBarComponentTransition({ kind: 'close', reason: 'focusLoss' })
    : ignoreMessage(),
  focusTargets: (
    { bounds },
  ) => [{ id: 'self', bounds: { ...bounds, height: Math.min(1, bounds.height) } }],
  hitTargets: menuBarHitTargets,
  accessibility: menuBarAccessibility,
});

export const menuBar: MenuBarFactory = (options) => {
  const shared = menuBarInstanceOptions(options);
  const instance = {
    ...shared,
    ...(options.disabled === undefined ? {} : { disabled: options.disabled }),
    ...(options.inert === undefined ? {} : { inert: options.inert }),
    ...(options.busy === undefined ? {} : { busy: options.busy }),
  };
  assertOptionalCallback(options.onActivate, 'menuBar onActivate');
  if (options.onTransition === undefined) {
    if (options.disabled !== true && options.inert !== true) assertMenuCallbacks(options, 'menuBar');
    return instantiateMenuBar({ ...instance, ...(options.disabled === true ? { disabled: true as const } : { inert: true as const }) });
  }
  assertMenuCallbacks(options, 'menuBar');
  return instantiateMenuBar({
    ...instance,
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
    view: options.view,
    ...(options.maxVisibleItems === undefined ? {} : { maxVisibleItems: options.maxVisibleItems }),
    ...(options.scrollbar === undefined ? {} : { scrollbar: options.scrollbar }),
    ...(options.scrollPolicy === undefined ? {} : { scrollPolicy: options.scrollPolicy }),
    ...(options.styles === undefined ? {} : { styles: options.styles }),
    ...(options.meta === undefined ? {} : { meta: options.meta }),
  };
}

function routeMenuBarAction<TMessage extends ComponentMessage>(
  action: MenuBarComponentAction,
  options: MenuBarOptions<TMessage> & { readonly onTransition: NonNullable<MenuBarOptions<TMessage>["onTransition"]> },
) {
  if (action.kind === 'transition') return options.onTransition(action.transition);
  return options.onActivate?.(action.event) ?? ignoreMessage();
}

function createMenuBarModel(value: Readonly<MenuBarOwnOptions>): MenuBarModel {
  if (!Array.isArray(value.items)) {
    throw new TypeError('menuBar items must be an array.');
  }
  const items = createMenuItemModels(value.items, 'menuBar items');
  const view = decodeMenuBarView(value.view, items);
  const maxVisibleItems = positiveInteger(value.maxVisibleItems, 12, 'menuBar maxVisibleItems');
  const scrollbar = decodeComponentScrollbarOptions(value.scrollbar, 'menuBar scrollbar');
  const scrollPolicy = decodeComponentScrollPolicy(value.scrollPolicy, 'menuBar scrollPolicy');
  return {
    items,
    view,
    maxVisibleItems,
    ...(scrollbar === undefined ? {} : { scrollbar }),
    ...(scrollPolicy === undefined ? {} : { scrollPolicy }),
  };
}

function decodeMenuBarView(
  value: MenuBarView,
  items: readonly MenuItemModel[],
): MenuBarModel['view'] {
  if (!isNonArrayObject(value) || !isStringMember(value.kind, ['closed', 'open'])) {
    throw new TypeError('menuBar view is invalid.');
  }
  const active = optionalText(value.active, 'menuBar active');
  if (value.kind === 'closed') {
    return { kind: 'closed', ...(active === undefined ? {} : { active: clean(active) }) };
  }
  if (active === undefined) throw new TypeError('Open menuBar requires active.');
  const activeId = clean(active);
  const heading = items.find((item) => item.id === activeId);
  if (heading?.kind !== 'submenu' || heading.disabled) {
    throw new TypeError('Open menuBar active must identify an enabled submenu heading.');
  }
  if (heading.label.trim() === '') {
    throw new TypeError('Open menuBar heading must have a non-empty label.');
  }
  const menuValue = decodeMenuView(value.menu, 'menuBar menu');
  return {
    kind: 'open',
    active: activeId,
    popupAccessibleName: heading.label,
    menu: menuValue,
  };
}

function paintMenuBar(input: ComponentRenderInput<MenuBarModel, MenuStylePart>): undefined {
  const spans = input.model.items.flatMap((item, index): readonly RenderSpan[] => {
    const active = input.model.view.active === item.id;
    const pointer = pointerVisualState(
      input.pointerState,
      `${input.id ?? 'menu-bar'}:heading:${item.id}`,
    );
    const states = [
      ...(active ? ['selected' as const] : []),
      ...(pointer === undefined ? [] : [pointer]),
    ];
    const marker = active
      ? oneCellGlyph(input.theme.tokens.symbols.pointer, '>', { widthProfile: input.widthProfile, textPresentation: input.textPresentation })
      : item.disabled
      ? '-'
      : ' ';
    const headingStyle = active ? { fg: { kind: 'theme', token: 'menu.selected' },
      bg: { kind: 'theme', token: 'selection.background' }, bold: true } as const : undefined;
    return [
      ...(index === 0 ? [] : [{ ...menuSpan(input, '  ', 'separator', 'heading.separator'), textOrder: 'visual' as const }]),
      { ...menuSpan(input, `${marker} `, 'label', `heading.${item.id}`, item.id, headingStyle, states), textOrder: 'visual' as const },
      ...layoutRenderSpans([menuSpan(
        input, item.label, 'label', `heading.${item.id}`, item.id,
        headingStyle,
        states,
      )], { widthProfile: input.widthProfile, textPresentation: input.textPresentation }),
    ];
  });
  input.target.write(
    0,
    0,
    clipRenderSpans(spans, input.bounds.width, { widthProfile: input.widthProfile, textPresentation: input.textPresentation }),
  );
}

function menuBarHitTargets(
  input: ComponentInput<MenuBarModel>,
): readonly import('../../renderer/index.ts').HitTarget<MenuBarComponentAction>[] {
  if (input.busy) return [];
  let column = 0;
  return input.model.items.flatMap((item, index) => {
    if (index > 0) column += 2;
    const width = measureTextCells(` ${item.label} `, { widthProfile: input.widthProfile, textPresentation: input.textPresentation }).cells;
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
        : ({
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

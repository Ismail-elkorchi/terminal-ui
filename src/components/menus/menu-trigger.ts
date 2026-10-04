import type { MenuTriggerTransition, MenuTriggerView } from '../../behavior/menu.ts';
import type { ComponentRenderInput } from '../../component/contracts.ts';
import { defineComponent } from '../../component/definition.ts';
import type { ComponentMessage } from '../../component/message.ts';
import {
  decodeComponentScrollbarOptions,
  decodeComponentScrollPolicy,
} from '../../component/scrollbar.ts';
import {
  assertOptionalCallback,
  assertOptionalEnum,
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
import { clipRenderSpans } from '../../visual/render-content.ts';
import type { MenuStylePart } from '../style-parts.ts';
import type {
  MenuComponentAction,
  MenuTriggerComponentAction,
  MenuTriggerFactory,
  MenuTriggerModel,
  MenuTriggerOwnOptions,
} from './contracts.ts';
import { createMenuItemModels, decodeMenuView } from './menu.ts';
import type { MenuTriggerOptions } from './options.ts';
import { menuPopup } from './popup.ts';
import {
  assertMenuCallbacks,
  clean,
  decodePlacement,
  menuSpan,
  optionalText,
  popupSlot,
  positiveInteger,
} from './shared.ts';

const instantiateMenuTrigger = defineComponent<MenuTriggerOwnOptions, MenuTriggerComponentAction>()({
  name: 'terminal-ui/components/menu-trigger',
  identity: 'required',
  structure: 'composite',
  semantics: 'semantic',
  accessibleRole: 'group',
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
  createModel: createMenuTriggerModel,
  implementationSlots(input) {
    if (input.model.view.kind === 'closed') return { popup: undefined };
    return {
      popup: menuPopup({
        ...(input.id === undefined ? {} : { id: input.id }),
        view: input.model.view.menu,
        accessibleName: menuTriggerAccessibleName(input.model, input.accessibleName),
        maxVisibleItems: input.model.maxVisibleItems,
        emit: (action) => input.emit(menuTriggerChildAction(action)),
        dismissOutside: () => input.emit(menuTriggerComponentTransition({
          kind: 'dismiss',
          reason: 'outsidePress',
        })),
        ...(input.model.scrollbar === undefined ? {} : { scrollbar: input.model.scrollbar }),
        ...(input.model.scrollPolicy === undefined
          ? {}
          : { scrollPolicy: input.model.scrollPolicy }),
        ...(input.styles === undefined ? {} : { styles: input.styles }),
        placement: input.model.placement,
        busy: input.busy,
      }),
    };
  },
  measure(input) {
    const value = menuTriggerValue(input.model);
    return {
      minWidth: 1,
      minHeight: 1,
      preferredWidth: measureTextCells(
        `${input.model.label}${input.model.label === '' ? '' : ': '}  ${value}  `,
        { widthProfile: input.widthProfile, textPresentation: input.textPresentation },
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
  keys: ({ model, busy }) => busy
    ? model.view.kind === 'open'
      ? { escape: () => menuTriggerComponentTransition({ kind: 'dismiss', reason: 'escape' }) }
      : {}
    : ({
    enter: () => menuTriggerComponentTransition({ kind: 'toggle' }),
    space: () => menuTriggerComponentTransition({ kind: 'toggle' }),
    arrowDown: () =>
      model.view.kind === 'closed'
        ? menuTriggerComponentTransition({ kind: 'open' })
        : menuTriggerComponentTransition({ kind: 'menu', transition: { kind: 'move', delta: 1 } }),
    arrowUp: () =>
      model.view.kind === 'closed'
        ? menuTriggerComponentTransition({ kind: 'open' })
        : menuTriggerComponentTransition({ kind: 'menu', transition: { kind: 'move', delta: -1 } }),
    escape: () => menuTriggerComponentTransition({ kind: 'dismiss', reason: 'escape' }),
  }),
  focusScope: ({ model }) => popupFocusScope(
    model.view.kind === 'open',
    containedPopupFocus,
  ),
  onFocus: (event, { model }) => event.kind === 'focusLeave'
    && model.view.kind === 'open'
    && popupAllowsDismissal(standardPopupDismissal, 'focusLoss')
    ? menuTriggerComponentTransition({ kind: 'dismiss', reason: 'focusLoss' })
    : ignoreMessage(),
  focusTargets: (
    { bounds },
  ) => [{ id: 'self', bounds: { ...bounds, height: Math.min(1, bounds.height) } }],
  hitTargets: (
    { id, bounds, busy },
  ) => busy ? [] : [{
    id: `${id ?? 'menu-trigger'}:trigger`,
    bounds: { ...bounds, height: Math.min(1, bounds.height) },
    accepts: ['click'],
    focus: { kind: 'target', targetId: 'self' },
    cursor: 'pointer',
    message: () => menuTriggerComponentTransition({ kind: 'toggle' }),
  }],
  accessibility: ({ id, model, focused, children, accessibleName }) => ({
    id,
    role: 'group',
    ...(model.label === ''
      ? accessibleName === undefined ? {} : { label: accessibleName }
      : { label: model.label }),
    children: [{
      id: `${id}:trigger`,
      role: 'button',
      ...(model.label === ''
        ? accessibleName === undefined ? {} : { label: accessibleName }
        : { label: model.label }),
      value: menuTriggerValue(model),
      expanded: model.view.kind === 'open',
      ...(focused ? { focused: true } : {}),
    }, ...children],
  }),
});

export const menuTrigger: MenuTriggerFactory = (options) => {
  const shared = menuTriggerInstanceOptions(options);
  const instance = {
    ...shared,
    ...(options.disabled === undefined ? {} : { disabled: options.disabled }),
    ...(options.inert === undefined ? {} : { inert: options.inert }),
    ...(options.busy === undefined ? {} : { busy: options.busy }),
  };
  assertOptionalCallback(options.onActivate, 'menuTrigger onActivate');
  if (options.onTransition === undefined) {
    if (options.disabled !== true && options.inert !== true) assertMenuCallbacks(options, 'menuTrigger');
    return instantiateMenuTrigger({ ...instance, ...(options.disabled === true ? { disabled: true as const } : { inert: true as const }) });
  }
  assertMenuCallbacks(options, 'menuTrigger');
  return instantiateMenuTrigger({
    ...instance,
    onAction: (action) => routeMenuTriggerAction(action, options),
  });
};

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
    view: options.view,
    ...(options.label === undefined ? {} : { label: options.label }),
    ...(options.placeholder === undefined ? {} : { placeholder: options.placeholder }),
    ...(options.density === undefined ? {} : { density: options.density }),
    ...(options.placement === undefined ? {} : { placement: options.placement }),
    ...(options.maxVisibleItems === undefined ? {} : { maxVisibleItems: options.maxVisibleItems }),
    ...(options.scrollbar === undefined ? {} : { scrollbar: options.scrollbar }),
    ...(options.scrollPolicy === undefined ? {} : { scrollPolicy: options.scrollPolicy }),
    ...(options.styles === undefined ? {} : { styles: options.styles }),
    ...(options.meta === undefined ? {} : { meta: options.meta }),
  };
}

function routeMenuTriggerAction<TMessage extends ComponentMessage>(
  action: MenuTriggerComponentAction,
  options: MenuTriggerOptions<TMessage> & { readonly onTransition: NonNullable<MenuTriggerOptions<TMessage>["onTransition"]> },
) {
  if (action.kind === 'transition') return options.onTransition(action.transition);
  return options.onActivate?.(action.event) ?? ignoreMessage();
}

function menuTriggerAccessibleName(
  model: MenuTriggerModel,
  callerAccessibleName: string | undefined,
): string {
  if (model.label.trim() !== '') return model.label;
  if (callerAccessibleName !== undefined) return callerAccessibleName;
  throw new TypeError('menuTrigger requires a non-empty label or accessibleName.');
}

function createMenuTriggerModel(value: Readonly<MenuTriggerOwnOptions>): MenuTriggerModel {
  if (!Array.isArray(value.items)) {
    throw new TypeError('menuTrigger items must be an array.');
  }
  const label = optionalText(value.label, 'menuTrigger label') ?? '';
  const items = createMenuItemModels(value.items, 'menuTrigger items');
  const view = decodeMenuTriggerView(value.view);
  const placeholder = optionalText(value.placeholder, 'menuTrigger placeholder') ?? 'Select…';
  assertOptionalEnum(value.density, ['compact', 'regular'], 'menuTrigger density');
  const placement = decodePlacement(value.placement);
  const maxVisibleItems = positiveInteger(
    value.maxVisibleItems,
    12,
    'menuTrigger maxVisibleItems',
  );
  const scrollbar = decodeComponentScrollbarOptions(value.scrollbar, 'menuTrigger scrollbar');
  const scrollPolicy = decodeComponentScrollPolicy(
    value.scrollPolicy,
    'menuTrigger scrollPolicy',
  );
  return {
    label: clean(label),
    items,
    view,
    placeholder: clean(placeholder),
    placement,
    maxVisibleItems,
    ...(scrollbar === undefined ? {} : { scrollbar }),
    ...(scrollPolicy === undefined ? {} : { scrollPolicy }),
  };
}

function decodeMenuTriggerView(value: MenuTriggerView): MenuTriggerModel['view'] {
  if (!isNonArrayObject(value) || !isStringMember(value.kind, ['closed', 'open'])) {
    throw new TypeError('menuTrigger view is invalid.');
  }
  const active = optionalText(value.active, 'menuTrigger active');
  if (value.kind === 'closed') {
    return { kind: 'closed', ...(active === undefined ? {} : { active: clean(active) }) };
  }
  return {
    kind: 'open',
    ...(active === undefined ? {} : { active: clean(active) }),
    menu: decodeMenuView(value.menu, 'menuTrigger menu'),
  };
}

function paintMenuTrigger(input: ComponentRenderInput<MenuTriggerModel, MenuStylePart>): undefined {
  const value = menuTriggerValue(input.model);
  const pointer = pointerVisualState(input.pointerState, `${input.id ?? 'menu-trigger'}:trigger`);
  const states = [
    ...(input.focus === 'self' ? ['focused' as const] : []),
    ...(pointer === undefined ? [] : [pointer]),
  ];
  const selected = input.model.view.active === undefined
    ? ' '
    : oneCellGlyph(input.theme.tokens.symbols.pointer, '>', { widthProfile: input.widthProfile, textPresentation: input.textPresentation });
  const spans = [
    menuSpan(
      input,
      input.model.label === '' ? '' : `${input.model.label}: `,
      'label',
      'label',
      undefined,
      { fg: { kind: 'theme', token: 'text.strong' } },
      states,
    ),
    menuSpan(
      input,
      `${selected} `,
      'marker',
      'selection',
      input.model.view.active,
      undefined,
      states,
    ),
    menuSpan(
      input,
      value,
      value === input.model.placeholder ? 'placeholder' : 'label',
      'value',
      input.model.view.active,
      {
        fg: {
          kind: 'theme',
          token: value === input.model.placeholder ? 'input.placeholder' : 'text.strong',
        },
      },
      states,
    ),
    menuSpan(
      input,
      ` ${
        input.model.view.kind === 'open'
          ? input.theme.tokens.symbols.expanded
          : input.theme.tokens.symbols.collapsed
      }`,
      'marker',
      'marker',
      undefined,
      undefined,
      states,
    ),
  ];
  input.target.write(
    0,
    0,
    clipRenderSpans(spans, input.bounds.width, { widthProfile: input.widthProfile, textPresentation: input.textPresentation }),
  );
}

function menuTriggerValue(model: MenuTriggerModel): string {
  const active = model.view.active;
  return active === undefined
    ? model.placeholder
    : model.items.find((item) => item.id === active)?.label ?? model.placeholder;
}

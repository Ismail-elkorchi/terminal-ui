import type { AccessibleNode } from '../../accessibility/types.ts';
import type { MenuTransition, MenuView, MenuViewItem } from '../../behavior/menu.ts';
import { createScrollState } from '../../behavior/scroll.ts';
import type {
  ComponentAccessibilityInput,
  ComponentInput,
  ComponentMeasureInput,
  ComponentRenderInput,
} from '../../component/contracts.ts';
import { defineComponent } from '../../component/definition.ts';
import type { ComponentMessage } from '../../component/message.ts';
import {
  componentScrollbarHitTargets,
  decodeComponentScrollbarOptions,
  decodeComponentScrollPolicy,
  decodeComponentScrollState,
  layoutComponentScrollbar,
  paintComponentScrollbar,
} from '../../component/scrollbar.ts';
import {
  assertOptionalCallback,
  assertOptionalEnum,
  isNonArrayObject,
  isStringMember,
} from '../../foundation/validation.ts';
import type { Rect } from '../../geometry/types.ts';
import { decodeInputTrigger } from '../../input/triggers.ts';
import type { KeyboardBinding } from '../../interaction/key-binding.ts';
import { formatKeyboardBinding } from '../../interaction/key-binding.ts';
import { ignoreMessage } from '../../interaction/message.ts';
import { pointerVisualState } from '../../interaction/pointer-interaction.ts';
import type { Measurement } from '../../renderer/contracts.ts';
import { oneCellGlyph } from '../../text/cell-geometry.ts';
import { measureTextCells } from '../../text/measure.ts';
import type { RenderSpan, TerminalStyle } from '../../visual/render-content.ts';
import { clipRenderSpans, measureRenderSpans } from '../../visual/render-content.ts';
import type { MenuStylePart } from '../style-parts.ts';
import type {
  MenuComponentAction,
  MenuContentModel,
  MenuFactory,
  MenuItemModel,
  MenuItemModelBase,
  MenuModel,
  MenuOwnOptions,
  MenuRow,
} from './contracts.ts';
import type { MenuOptions } from './options.ts';
import {
  assertMenuCallbacks,
  checkedValue,
  clean,
  decodeInlineContent,
  inlineSpans,
  menuRowText,
  menuSpan,
  optionalBoolean,
  optionalText,
  requiredText,
} from './shared.ts';

const instantiateMenu = defineComponent<MenuOwnOptions, MenuComponentAction>()({
  name: 'terminal-ui/components/menu',
  identity: 'required',
  structure: 'leaf',
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
  createModel: createMenuModel,
  measure: measureMenu,
  retainPaint: true as const,
  render: paintMenu,
  keys: ({ model, busy }) => busy ? {} : ({
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
        : {
          kind: 'activate',
          event: { kind: 'activate', id: activeMenuItem(model)?.id ?? '' },
        },
  }),
  focusTargets: ({ bounds }) => [{ id: 'self', bounds }],
  hitTargets: menuHitTargets,
  accessibility: menuAccessibility,
});

export const menu: MenuFactory = (options) => {
  const shared = menuInstanceOptions(options);
  const instance = {
    ...shared,
    ...(options.disabled === undefined ? {} : { disabled: options.disabled }),
    ...(options.inert === undefined ? {} : { inert: options.inert }),
    ...(options.busy === undefined ? {} : { busy: options.busy }),
  };
  assertOptionalCallback(options.onActivate, 'menu onActivate');
  if (options.onTransition === undefined) {
    if (options.disabled !== true && options.inert !== true) assertMenuCallbacks(options, 'menu');
    return instantiateMenu({ ...instance, ...(options.disabled === true ? { disabled: true as const } : { inert: true as const }) });
  }
  assertMenuCallbacks(options, 'menu');
  return instantiateMenu({
    ...instance,
    onAction: (action) => routeMenuComponentAction(action, options),
  });
};

export function menuComponentTransition(transition: MenuTransition): MenuComponentAction {
  return { kind: 'transition', transition };
}

function menuInstanceOptions<TMessage extends ComponentMessage>(options: MenuOptions<TMessage>) {
  return {
    id: options.id,
    view: options.view,
    ...(options.emptyText === undefined ? {} : { emptyText: options.emptyText }),
    ...(options.scrollbar === undefined ? {} : { scrollbar: options.scrollbar }),
    ...(options.scrollPolicy === undefined ? {} : { scrollPolicy: options.scrollPolicy }),
    ...(options.styles === undefined ? {} : { styles: options.styles }),
    ...(options.meta === undefined ? {} : { meta: options.meta }),
  };
}

function routeMenuComponentAction<TMessage extends ComponentMessage>(
  action: MenuComponentAction,
  options: MenuOptions<TMessage> & { readonly onTransition: NonNullable<MenuOptions<TMessage>["onTransition"]> },
) {
  if (action.kind === 'transition') return options.onTransition(action.transition);
  return options.onActivate?.(action.event) ?? ignoreMessage();
}

function createMenuModel(value: Readonly<MenuOwnOptions>): MenuModel {
  const view = decodeMenuView(value.view, 'menu view');
  const emptyText = optionalText(value.emptyText, 'menu emptyText') ?? 'No commands';
  const scrollbar = decodeComponentScrollbarOptions(value.scrollbar, 'menu scrollbar');
  const scrollPolicy = decodeComponentScrollPolicy(value.scrollPolicy, 'menu scrollPolicy');
  const scroll = view.scroll;
  const rows = flattenMenu(view.items);
  return {
    items: view.items,
    rows,
    activePath: view.activePath,
    emptyText,
    ...(scroll === undefined ? {} : { scroll }),
    ...(scrollbar === undefined ? {} : { scrollbar }),
    ...(scrollPolicy === undefined ? {} : { scrollPolicy }),
  };
}

export function decodeMenuView(
  value: MenuView,
  subject: string,
): MenuContentModel {
  if (!isNonArrayObject(value)) throw new TypeError(`${subject} must be an object.`);
  if (
    !Array.isArray(value.activePath) ||
    value.activePath.some((id) => typeof id !== 'string' || id.trim() === '')
  ) throw new TypeError(`${subject}.activePath must be an array of non-empty strings.`);
  if (!Array.isArray(value.items)) throw new TypeError(`${subject}.items must be an array.`);
  const items = createMenuItemModels(value.items, `${subject}.items`);
  const ids = new Set<string>();
  const visit = (current: readonly MenuItemModel[]): void => {
    for (const item of current) {
      if (ids.has(item.id)) throw new TypeError(`${subject} contains duplicate id "${item.id}".`);
      ids.add(item.id);
      visit(item.children);
    }
  };
  visit(items);
  const scroll = decodeComponentScrollState(value.scroll, `${subject}.scroll`);
  return {
    activePath: value.activePath.map(clean),
    items,
    ...(scroll === undefined ? {} : { scroll }),
  };
}

export function publicMenuView(value: MenuContentModel): MenuView {
  return {
    activePath: value.activePath,
    items: value.items.map(publicMenuItem),
    ...(value.scroll === undefined ? {} : { scroll: value.scroll }),
  };
}

function publicMenuItem(value: MenuItemModel): MenuView['items'][number] {
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

export function createMenuItemModels(
  values: readonly MenuViewItem[],
  subject: string,
): readonly MenuItemModel[] {
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
        children: createMenuItemModels(value.children, `${subject}[${String(index)}].children`),
      };
    }
    const label = requiredText(value.label, `${subject}[${String(index)}].label`);
    const description = optionalText(
      value.description,
      `${subject}[${String(index)}].description`,
    );
    const shortcut = createMenuModelShortcut(
      value.shortcut,
      `${subject}[${String(index)}].shortcut`,
    );
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
    const base: Omit<MenuItemModelBase, 'children'> = {
      id: clean(id),
      label: clean(label),
      ...(description === undefined ? {} : { description: clean(description) }),
      disabled: value.disabled === true,
      ...(value.leading === undefined
        ? {}
        : { leading: decodeInlineContent(value.leading, `${subject}[${String(index)}].leading`) }),
      ...(value.trailing === undefined
        ? {}
        : { trailing: decodeInlineContent(value.trailing, `${subject}[${String(index)}].trailing`) }),
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
      children: createMenuItemModels(value.children, `${subject}[${String(index)}].children`),
    };
  });
}

function createMenuModelShortcut(value: unknown, subject: string): KeyboardBinding | undefined {
  if (value === undefined) return undefined;
  try {
    const trigger = decodeInputTrigger(value);
    if (trigger.kind === 'text' || trigger.kind === 'focus') {
      throw new TypeError('must be a key, codePoint, or physicalKey trigger');
    }
    return trigger;
  } catch (cause) {
    const detail = cause instanceof Error ? ` ${cause.message}` : '';
    throw new TypeError(`${subject} is invalid.${detail}`, { cause });
  }
}

export function flattenMenu(items: readonly MenuItemModel[], depth = 0): readonly MenuRow[] {
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
  const plan = layoutComponentScrollbar({
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

function paintMenu(input: ComponentRenderInput<MenuModel, MenuStylePart>): undefined {
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
    const pointer = pointerVisualState(input.pointerState, target);
    const states = item.disabled
      ? ['disabled' as const]
      : [
        ...(active ? ['active' as const] : []),
        ...(pointer === undefined ? [] : [pointer]),
      ];
    const base: TerminalStyle = active
      ? {
        fg: { kind: 'theme', token: 'menu.selected' },
        bg: { kind: 'theme', token: 'selection.background' },
        bold: true,
      }
      : item.tone === 'destructive'
      ? { fg: { kind: 'theme', token: 'status.error' } }
      : {};
    const spans = menuRowSpans(input, item, states, base);
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
              states,
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
    style: (part, state, base) => input.style({ part, base, ...(state === undefined ? {} : { states: [state] }) }),
    frameSource: (source) => input.frameSource({ ...source, partType: source.partType }),
  });
}

function menuRowSpans(
  input: ComponentRenderInput<MenuModel, MenuStylePart>,
  item: MenuRow,
  states: readonly Exclude<import('../../element/metadata.ts').ElementVisualState, 'default'>[],
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
    menuSpan(input, indent, 'separator', `item.${item.id}.indent`, item.id, base, states),
    menuSpan(
      input,
      `${oneCellGlyph(marker, marker === ' ' ? ' ' : '>', { widthProfile: input.widthProfile })} `,
      'marker',
      `item.${item.id}.marker`,
      item.id,
      base,
      states,
    ),
    ...(item.leading === undefined ? [] : [
      ...inlineSpans(input, item.leading, 'leading', item.id, base, states),
      menuSpan(input, ' ', 'separator', `item.${item.id}.leading-gap`, item.id, base, states),
    ]),
    menuSpan(input, item.label, 'label', `item.${item.id}.label`, item.id, base, states),
    ...(item.description === undefined ? [] : [
      menuSpan(
        input,
        `  ${item.description}`,
        'description',
        `item.${item.id}.description`,
        item.id,
        base,
        states,
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
        states,
      ),
    ]),
    ...(item.trailing === undefined ? [] : [
      menuSpan(input, ' ', 'separator', `item.${item.id}.trailing-gap`, item.id, base, states),
      ...inlineSpans(input, item.trailing, 'trailing', item.id, base, states),
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
    onScroll: (request) => menuComponentTransition({ kind: 'scroll', request }),
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
          : ({
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
    scope: { kind: 'menu' },
    children: menuAccessibleItems(
      input.id,
      input.model.rows,
      input.model.activePath,
      input.focused,
    ),
  };
}

export function menuAccessibleItems(
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

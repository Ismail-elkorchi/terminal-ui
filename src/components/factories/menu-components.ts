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
import { isNonArrayObject } from '../../foundation/validation.ts';
import type { Rect } from '../../geometry/types.ts';
import type { AnchoredSurfacePlacement } from '../../interaction/anchored-surface.ts';
import { pointerVisualState } from '../../interaction/index.ts';
import type { PointerInteractionState } from '../../interaction/index.ts';
import type { ScrollPolicy, ScrollState } from '../../interaction/scroll.ts';
import type { ScrollbarOptions } from '../../interaction/scrollbar.ts';
import { portal, surface } from '../../layout/index.ts';
import { measureTextCells, oneCellGlyph, sanitizeTerminalText } from '../../text/index.ts';
import type {
  ContextMenuAction,
  DropdownMenuAction,
  MenuAction,
  MenuBarAction,
  MenuBarPresentation,
  MenuItem,
  MenuPresentation,
} from '../../ui-model/menu.ts';
import type { MenuStylePart } from '../../ui-model/style-parts.ts';
import {
  inlineContentAccessibleText,
  inlineSegmentText,
  isInlineContent,
  normalizeInlineContent,
} from '../../visual/inline-content.ts';
import type { InlineContent } from '../../visual/inline-content.ts';
import type { RenderSpan, TerminalStyle } from '../../visual/render.ts';
import type { Measurement } from '../../renderer/index.ts';
import type {
  ContextMenuOptions,
  DropdownMenuOptions,
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
  readonly shortcut?: string;
  readonly tone: 'default' | 'destructive';
  readonly children: readonly PreparedMenuItem[];
}

type PreparedMenuItem =
  | (PreparedMenuItemBase & { readonly kind: 'action' })
  | (PreparedMenuItemBase & { readonly kind: 'check'; readonly checked: boolean })
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

type MenuFactory = <const TMessage extends ComponentMessage = never>(
  options: MenuOptions<TMessage>,
) => Element<TMessage>;

const instantiateMenu = defineComponent<
  MenuOwnOptions,
  MenuModel,
  MenuAction,
  MenuStylePart,
  readonly [],
  'required',
  readonly ['focus', 'layer', 'styles']
>({
  name: 'terminal-ui/components/menu',
  identity: 'required',
  structure: 'leaf',
  semantics: 'semantic',
  optionFields: {
    presentation: null,
    emptyText: null,
    scrollbar: null,
    scrollPolicy: null,
    pointerState: null,
  },
  metadata: ['focus', 'layer', 'styles'],
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
  prepare: prepareMenu,
  measure: measureMenu,
  render: paintMenu,
  keys: ({ model }) => ({
    arrowUp: () => ({ kind: 'move', delta: -1 }),
    arrowDown: () => ({ kind: 'move', delta: 1 }),
    home: () => ({ kind: 'first' }),
    end: () => ({ kind: 'last' }),
    arrowRight: () => ({ kind: 'enter' }),
    arrowLeft: () => ({ kind: 'back' }),
    enter: () =>
      activeMenuItem(model) === undefined
        ? ignoreMessage()
        : { kind: 'activate', id: activeMenuItem(model)?.id ?? '' },
  }),
  pointer: { state: ({ model }) => model.pointerState, onAction: () => ignoreMessage() },
  focusTargets: ({ bounds }) => [{ id: 'self', bounds }],
  hitTargets: menuHitTargets,
  accessibility: menuAccessibility,
});

export const menu: MenuFactory = (options) => instantiateMenu(options);

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

const instantiateMenuBar = defineComponent<
  MenuBarOwnOptions,
  MenuBarModel,
  MenuBarAction,
  MenuStylePart,
  readonly [],
  'required',
  readonly ['focus', 'layer', 'styles'],
  typeof popupSlot
>({
  name: 'terminal-ui/components/menu-bar',
  identity: 'required',
  structure: 'composite',
  semantics: 'semantic',
  slots: popupSlot,
  optionFields: {
    items: null,
    presentation: null,
    maxVisibleItems: null,
    scrollbar: null,
    scrollPolicy: null,
    pointerState: null,
  },
  metadata: ['focus', 'layer', 'styles'],
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
  prepare: prepareMenuBar,
  implementationSlots(input) {
    if (input.model.presentation.kind === 'closed') return { popup: undefined };
    return {
      popup: menuPopup(
        input.id,
        input.model.presentation.menu,
        input.model.maxVisibleItems,
        (action) => input.emit({ kind: 'menu', action }),
        input.model.scrollbar,
        input.model.scrollPolicy,
        input.styles,
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
  keys: ({ model }) => ({
    arrowLeft: () => ({ kind: 'moveHeading', delta: -1 }),
    arrowRight: () => ({ kind: 'moveHeading', delta: 1 }),
    home: () => ({ kind: 'firstHeading' }),
    end: () => ({ kind: 'lastHeading' }),
    enter: () =>
      model.presentation.kind === 'open' ? { kind: 'close', reason: 'escape' } : { kind: 'open' },
    escape: () => ({ kind: 'close', reason: 'escape' }),
  }),
  pointer: { state: ({ model }) => model.pointerState, onAction: () => ignoreMessage() },
  focusScope: ({ model }) => model.presentation.kind === 'open' ? { kind: 'contain' } : undefined,
  focusTargets: (
    { bounds },
  ) => [{ id: 'self', bounds: { ...bounds, height: Math.min(1, bounds.height) } }],
  hitTargets: menuBarHitTargets,
  accessibility: menuBarAccessibility,
});

export const menuBar: MenuBarFactory = (options) => instantiateMenuBar(options);

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

type ContextOwnOptions = Omit<ContextMenuOptions<ComponentMessage>, 'id' | 'onAction' | 'keys' | 'meta'>;

type ContextMenuFactory = <const TMessage extends ComponentMessage = never>(
  options: ContextMenuOptions<TMessage>,
) => Element<TMessage>;

const instantiateContextMenu = defineComponent<
  ContextOwnOptions,
  ContextMenuModel,
  ContextMenuAction,
  MenuStylePart,
  readonly [],
  'required',
  readonly ['focus', 'layer', 'styles']
>({
  name: 'terminal-ui/components/context-menu',
  identity: 'required',
  structure: 'composed',
  semantics: 'semantic',
  optionFields: {
    presentation: null,
    title: null,
    emptyText: null,
    scrollbar: null,
    scrollPolicy: null,
    placement: null,
    maxVisibleItems: null,
    pointerState: null,
  },
  metadata: ['focus', 'layer', 'styles'],
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
  prepare: prepareContextMenu,
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
      onAction: (action) => input.emit({ kind: 'menu', action }),
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
        onOutsidePress: () => input.emit({ kind: 'dismiss', reason: 'outsidePress' }),
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
      ? { escape: () => ({ kind: 'dismiss', reason: 'escape' }) }
      : {},
  pointer: { state: ({ model }) => model.pointerState, onAction: () => ignoreMessage() },
  focusScope: ({ model }) => model.presentation.kind === 'open' ? { kind: 'contain' } : undefined,
  accessibility: contextMenuAccessibility,
});

export const contextMenu: ContextMenuFactory = (options) => instantiateContextMenu(options);

interface DropdownModel {
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

type DropdownOwnOptions = Omit<DropdownMenuOptions<ComponentMessage>, 'id' | 'onAction' | 'keys' | 'meta'>;

type DropdownMenuFactory = <const TMessage extends ComponentMessage = never>(
  options: DropdownMenuOptions<TMessage>,
) => Element<TMessage>;

const instantiateDropdownMenu = defineComponent<
  DropdownOwnOptions,
  DropdownModel,
  DropdownMenuAction,
  MenuStylePart,
  readonly [],
  'required',
  readonly ['focus', 'layer', 'styles'],
  typeof popupSlot
>({
  name: 'terminal-ui/components/dropdown-menu',
  identity: 'required',
  structure: 'composite',
  semantics: 'semantic',
  slots: popupSlot,
  optionFields: {
    label: null,
    items: null,
    presentation: null,
    placeholder: null,
    density: null,
    placement: null,
    maxVisibleItems: null,
    scrollbar: null,
    scrollPolicy: null,
    pointerState: null,
  },
  metadata: ['focus', 'layer', 'styles'],
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
  prepare: prepareDropdown,
  implementationSlots(input) {
    if (input.model.presentation.kind === 'closed') return { popup: undefined };
    return {
      popup: menuPopup(
        input.id,
        input.model.presentation.menu,
        input.model.maxVisibleItems,
        (action) => input.emit({ kind: 'menu', action }),
        input.model.scrollbar,
        input.model.scrollPolicy,
        input.styles,
        input.model.placement,
      ),
    };
  },
  measure(input) {
    const value = dropdownValue(input.model);
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
  renderBeforeChildren: paintDropdown,
  keys: ({ model }) => ({
    enter: () => ({ kind: 'toggle' }),
    space: () => ({ kind: 'toggle' }),
    arrowDown: () =>
      model.presentation.kind === 'closed'
        ? { kind: 'open' }
        : { kind: 'menu', action: { kind: 'move', delta: 1 } },
    arrowUp: () =>
      model.presentation.kind === 'closed'
        ? { kind: 'open' }
        : { kind: 'menu', action: { kind: 'move', delta: -1 } },
    escape: () => ({ kind: 'dismiss', reason: 'escape' }),
  }),
  pointer: { state: ({ model }) => model.pointerState, onAction: () => ignoreMessage() },
  focusScope: ({ model }) => model.presentation.kind === 'open' ? { kind: 'contain' } : undefined,
  focusTargets: (
    { bounds },
  ) => [{ id: 'self', bounds: { ...bounds, height: Math.min(1, bounds.height) } }],
  hitTargets: (
    { id, bounds },
  ) => [{
    id: `${id ?? 'dropdown'}:trigger`,
    bounds: { ...bounds, height: Math.min(1, bounds.height) },
    accepts: ['click'],
    focus: { kind: 'target', targetId: 'self' },
    cursor: 'pointer',
    message: () => ({ kind: 'toggle' }),
  }],
  accessibility: ({ id, model, focused, children }) => ({
    id,
    role: 'group',
    label: model.label || id,
    children: [{
      id: `${id}:trigger`,
      role: 'button',
      label: model.label || id,
      value: dropdownValue(model),
      expanded: model.presentation.kind === 'open',
      ...(focused ? { focused: true } : {}),
    }, ...children],
  }),
});

export const dropdownMenu: DropdownMenuFactory = (options) => instantiateDropdownMenu(options);

function prepareMenu(value: unknown): MenuModel {
  if (!isNonArrayObject(value)) throw new TypeError('menu options must be an object.');
  const presentation = prepareMenuPresentation(value['presentation'], 'menu presentation');
  const emptyText = optionalText(value['emptyText'], 'menu emptyText') ?? 'No commands';
  const scrollbar = prepareComponentScrollbarOptions(value['scrollbar'], 'menu scrollbar');
  const scrollPolicy = prepareComponentScrollPolicy(value['scrollPolicy'], 'menu scrollPolicy');
  const pointerState = preparePointerState(value['pointerState'], 'menu');
  const scroll = presentation.scroll ?? prepareComponentScrollState(value['scroll'], 'menu scroll');
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

function prepareMenuPresentation(value: unknown, subject: string): PreparedMenuPresentation {
  if (!isNonArrayObject(value)) throw new TypeError(`${subject} must be an object.`);
  const unknown = Object.keys(value).find((field) =>
    field !== 'activePath' && field !== 'items' && field !== 'scroll'
  );
  if (unknown !== undefined) throw new TypeError(`${subject} contains unknown field "${unknown}".`);
  if (
    !Array.isArray(value['activePath']) ||
    value['activePath'].some((id) => typeof id !== 'string' || id.trim() === '')
  ) throw new TypeError(`${subject}.activePath must be an array of non-empty strings.`);
  if (!Array.isArray(value['items'])) throw new TypeError(`${subject}.items must be an array.`);
  const items = prepareItems(value['items'], `${subject}.items`);
  const ids = new Set<string>();
  const visit = (current: readonly PreparedMenuItem[]): void => {
    for (const item of current) {
      if (ids.has(item.id)) throw new TypeError(`${subject} contains duplicate id "${item.id}".`);
      ids.add(item.id);
      visit(item.children);
    }
  };
  visit(items);
  const scroll = prepareComponentScrollState(value['scroll'], `${subject}.scroll`);
  return {
    activePath: value['activePath'].map(clean),
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
  return {
    ...common,
    kind: value.kind,
    ...(value.expanded === undefined ? {} : { expanded: value.expanded }),
    children: value.children.map(publicMenuItem),
  };
}

function prepareItems(values: readonly unknown[], subject: string): readonly PreparedMenuItem[] {
  return values.map((value, index) => {
    if (!isNonArrayObject(value)) {
      throw new TypeError(`${subject}[${String(index)}] must be an object.`);
    }
    const allowed = new Set([
      'kind',
      'id',
      'label',
      'description',
      'disabled',
      'leading',
      'trailing',
      'shortcut',
      'tone',
      'checked',
      'expanded',
      'children',
    ]);
    const unknown = Object.keys(value).find((field) => !allowed.has(field));
    if (unknown !== undefined) {
      throw new TypeError(`${subject}[${String(index)}] contains unknown field "${unknown}".`);
    }
    const kind = value['kind'];
    if (kind !== 'action' && kind !== 'check' && kind !== 'submenu') {
      throw new TypeError(`${subject}[${String(index)}].kind is invalid.`);
    }
    const id = requiredText(value['id'], `${subject}[${String(index)}].id`);
    const label = requiredText(value['label'], `${subject}[${String(index)}].label`);
    const description = optionalText(
      value['description'],
      `${subject}[${String(index)}].description`,
    );
    const shortcut = optionalText(value['shortcut'], `${subject}[${String(index)}].shortcut`);
    if (value['disabled'] !== undefined && typeof value['disabled'] !== 'boolean') {
      throw new TypeError(`${subject}[${String(index)}].disabled must be boolean.`);
    }
    if (
      value['tone'] !== undefined && value['tone'] !== 'default' && value['tone'] !== 'destructive'
    ) throw new TypeError(`${subject}[${String(index)}].tone is invalid.`);
    if (kind === 'check' && typeof value['checked'] !== 'boolean') {
      throw new TypeError(`${subject}[${String(index)}].checked must be boolean.`);
    }
    if (kind !== 'check' && value['checked'] !== undefined) {
      throw new TypeError(`${subject}[${String(index)}].checked is only valid for check items.`);
    }
    if (kind === 'submenu' && !Array.isArray(value['children'])) {
      throw new TypeError(`${subject}[${String(index)}].children must be an array.`);
    }
    if (kind !== 'submenu' && value['children'] !== undefined) {
      throw new TypeError(`${subject}[${String(index)}].children is only valid for submenu items.`);
    }
    if (
      value['expanded'] !== undefined &&
      (kind !== 'submenu' || typeof value['expanded'] !== 'boolean')
    ) throw new TypeError(`${subject}[${String(index)}].expanded is invalid.`);
    const base: Omit<PreparedMenuItemBase, 'children'> = {
      id: clean(id),
      label: clean(label),
      ...(description === undefined ? {} : { description: clean(description) }),
      disabled: value['disabled'] === true,
      ...(value['leading'] === undefined
        ? {}
        : { leading: prepareInline(value['leading'], `${subject}[${String(index)}].leading`) }),
      ...(value['trailing'] === undefined
        ? {}
        : { trailing: prepareInline(value['trailing'], `${subject}[${String(index)}].trailing`) }),
      ...(shortcut === undefined ? {} : { shortcut: clean(shortcut) }),
      tone: value['tone'] === 'destructive' ? 'destructive' : 'default',
    };
    if (kind === 'action') return { ...base, kind, children: [] };
    if (kind === 'check') {
      return {
        ...base,
        kind,
        checked: checkedValue(value['checked'], subject, index),
        children: [],
      };
    }
    return {
      ...base,
      kind,
      expanded: value['expanded'] === true,
      children: prepareItems(
        submenuChildren(value['children'], subject, index),
        `${subject}[${String(index)}].children`,
      ),
    };
  });
}

function flattenMenu(items: readonly PreparedMenuItem[], depth = 0): readonly MenuRow[] {
  return items.flatMap((
    item,
  ): readonly MenuRow[] => [
    { ...item, depth },
    ...(item.kind === 'submenu' && item.expanded ? flattenMenu(item.children, depth + 1) : []),
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
    createScrollState({
      contentRows: model.rows.length,
      contentColumns: bounds.width,
      viewportRows: bounds.height,
      viewportColumns: bounds.width,
    });
  const plan = prepareComponentScrollbar({
    bounds,
    scroll: { ...scroll, contentRows: model.rows.length },
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
  const marker = item.kind === 'check'
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
        `  ${item.shortcut}`,
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
): readonly import('../../renderer/index.ts').HitTarget<MenuAction>[] {
  const { plan, rows } = menuPlan(input.model, input.bounds);
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
        message: () => ({ kind: 'activate' as const, id: item.id }),
      }]
    ),
    ...componentScrollbarHitTargets<MenuAction>({
      id: input.id ?? 'menu',
      plan,
      ...(input.model.scrollPolicy === undefined ? {} : { policy: input.model.scrollPolicy }),
      onScroll: (event) => ({ kind: 'scroll', event }),
    }),
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
  return rows.map((item) => ({
    id: `${menuId}:item:${item.id}`,
    role: item.kind === 'check' ? 'menuitemcheckbox' : 'menuitem',
    label: item.label,
    ...(item.description === undefined ? {} : { description: item.description }),
    ...(item.kind === 'check' ? { checked: item.checked } : {}),
    ...(item.disabled ? { disabled: true } : {}),
    ...(focused && item.id === activeId ? { focused: true } : {}),
  }));
}

function activeMenuItem(model: MenuModel): MenuRow | undefined {
  const id = model.activePath.at(-1);
  return id === undefined ? undefined : model.rows.find((item) => item.id === id && !item.disabled);
}

function prepareMenuBar(value: unknown): MenuBarModel {
  if (!isNonArrayObject(value) || !Array.isArray(value['items'])) {
    throw new TypeError('menuBar items must be an array.');
  }
  const items = prepareItems(value['items'], 'menuBar items');
  const presentation = prepareMenuBarPresentation(value['presentation']);
  const maxVisibleItems = positiveInteger(value['maxVisibleItems'], 12, 'menuBar maxVisibleItems');
  const scrollbar = prepareComponentScrollbarOptions(value['scrollbar'], 'menuBar scrollbar');
  const scrollPolicy = prepareComponentScrollPolicy(value['scrollPolicy'], 'menuBar scrollPolicy');
  const pointerState = preparePointerState(value['pointerState'], 'menuBar');
  return {
    items,
    presentation,
    maxVisibleItems,
    ...(scrollbar === undefined ? {} : { scrollbar }),
    ...(scrollPolicy === undefined ? {} : { scrollPolicy }),
    ...(pointerState === undefined ? {} : { pointerState }),
  };
}

function prepareMenuBarPresentation(value: unknown): MenuBarModel['presentation'] {
  if (!isNonArrayObject(value) || value['kind'] !== 'closed' && value['kind'] !== 'open') {
    throw new TypeError('menuBar presentation is invalid.');
  }
  const allowed = value['kind'] === 'open'
    ? new Set(['kind', 'active', 'menu'])
    : new Set(['kind', 'active']);
  const unknown = Object.keys(value).find((field) => !allowed.has(field));
  if (unknown !== undefined) {
    throw new TypeError(`menuBar presentation contains unknown field "${unknown}".`);
  }
  const active = optionalText(value['active'], 'menuBar active');
  if (value['kind'] === 'closed') {
    return { kind: 'closed', ...(active === undefined ? {} : { active: clean(active) }) };
  }
  if (active === undefined) throw new TypeError('Open menuBar requires active.');
  const menuValue = prepareMenuPresentation(value['menu'], 'menuBar menu');
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
): readonly import('../../renderer/index.ts').HitTarget<MenuBarAction>[] {
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
      message: () => ({ kind: 'activateHeading' as const, id: item.id }),
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
    action: MenuAction,
  ) => import('../../interaction/index.ts').MessageResolution<ComponentMessage>,
  scrollbar?: ScrollbarOptions,
  scrollPolicy?: ScrollPolicy,
  styles?: import('../../element/metadata.ts').ElementStyles<MenuStylePart>,
  placement: AnchoredSurfacePlacement = 'auto',
): Element<ComponentMessage> {
  const popupMenu = menu({
    id: `${id ?? 'menu'}:popup:menu`,
    presentation: publicMenuPresentation(presentation),
    ...(scrollbar === undefined ? {} : { scrollbar }),
    ...(scrollPolicy === undefined ? {} : { scrollPolicy }),
    ...(styles === undefined ? {} : { meta: { styles } }),
    onAction: (action) => emit(action),
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

function prepareContextMenu(value: unknown): ContextMenuModel {
  if (!isNonArrayObject(value)) throw new TypeError('contextMenu options must be an object.');
  const presentation = prepareContextPresentation(value['presentation']);
  const title = optionalText(value['title'], 'contextMenu title');
  const emptyText = optionalText(value['emptyText'], 'contextMenu emptyText') ?? 'No commands';
  const placement = preparePlacement(value['placement']);
  const maxVisibleItems = positiveInteger(
    value['maxVisibleItems'],
    12,
    'contextMenu maxVisibleItems',
  );
  const scrollbar = prepareComponentScrollbarOptions(value['scrollbar'], 'contextMenu scrollbar');
  const scrollPolicy = prepareComponentScrollPolicy(
    value['scrollPolicy'],
    'contextMenu scrollPolicy',
  );
  const pointerState = preparePointerState(value['pointerState'], 'contextMenu');
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

function prepareContextPresentation(value: unknown): ContextMenuModel['presentation'] {
  if (!isNonArrayObject(value) || value['kind'] !== 'closed' && value['kind'] !== 'open') {
    throw new TypeError('contextMenu presentation is invalid.');
  }
  if (value['kind'] === 'closed') {
    if (Object.keys(value).some((field) => field !== 'kind')) {
      throw new TypeError('Closed contextMenu presentation contains unknown fields.');
    }
    return { kind: 'closed' };
  }
  if (
    Object.keys(value).some((field) => field !== 'kind' && field !== 'anchor' && field !== 'menu')
  ) throw new TypeError('Open contextMenu presentation contains unknown fields.');
  return {
    kind: 'open',
    anchor: prepareAnchor(value['anchor']),
    menu: prepareMenuPresentation(value['menu'], 'contextMenu menu'),
  };
}

function prepareDropdown(value: unknown): DropdownModel {
  if (!isNonArrayObject(value) || !Array.isArray(value['items'])) {
    throw new TypeError('dropdownMenu items must be an array.');
  }
  const label = optionalText(value['label'], 'dropdownMenu label') ?? '';
  const items = prepareItems(value['items'], 'dropdownMenu items');
  const presentation = prepareDropdownPresentation(value['presentation']);
  const placeholder = optionalText(value['placeholder'], 'dropdownMenu placeholder') ?? 'Select…';
  if (
    value['density'] !== undefined && value['density'] !== 'compact' &&
    value['density'] !== 'comfortable'
  ) throw new TypeError('dropdownMenu density is invalid.');
  const placement = preparePlacement(value['placement']);
  const maxVisibleItems = positiveInteger(
    value['maxVisibleItems'],
    12,
    'dropdownMenu maxVisibleItems',
  );
  const scrollbar = prepareComponentScrollbarOptions(value['scrollbar'], 'dropdownMenu scrollbar');
  const scrollPolicy = prepareComponentScrollPolicy(
    value['scrollPolicy'],
    'dropdownMenu scrollPolicy',
  );
  const pointerState = preparePointerState(value['pointerState'], 'dropdownMenu');
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

function prepareDropdownPresentation(value: unknown): DropdownModel['presentation'] {
  if (!isNonArrayObject(value) || value['kind'] !== 'closed' && value['kind'] !== 'open') {
    throw new TypeError('dropdownMenu presentation is invalid.');
  }
  const allowed = value['kind'] === 'open'
    ? new Set(['kind', 'active', 'menu'])
    : new Set(['kind', 'active']);
  const unknown = Object.keys(value).find((field) => !allowed.has(field));
  if (unknown !== undefined) {
    throw new TypeError(`dropdownMenu presentation contains unknown field "${unknown}".`);
  }
  const active = optionalText(value['active'], 'dropdownMenu active');
  if (value['kind'] === 'closed') {
    return { kind: 'closed', ...(active === undefined ? {} : { active: clean(active) }) };
  }
  return {
    kind: 'open',
    ...(active === undefined ? {} : { active: clean(active) }),
    menu: prepareMenuPresentation(value['menu'], 'dropdownMenu menu'),
  };
}

function paintDropdown(input: ComponentRenderInput<DropdownModel, MenuStylePart>): void {
  const value = dropdownValue(input.model);
  const state = pointerVisualState(input.model.pointerState, `${input.id ?? 'dropdown'}:trigger`) ??
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

function dropdownValue(model: DropdownModel): string {
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
    item.shortcut === undefined ? '' : `  ${item.shortcut}`
  }${item.trailing === undefined ? '' : ` ${inlineContentAccessibleText(item.trailing)}`}`;
}

function prepareInline(value: unknown, subject: string): InlineContent {
  if (!isInlineContent(value)) throw new TypeError(`${subject} must be inline content.`);
  return normalizeInlineContent(value);
}
function checkedValue(value: unknown, subject: string, index: number): boolean {
  if (typeof value !== 'boolean') {
    throw new TypeError(`${subject}[${String(index)}].checked must be boolean.`);
  }
  return value;
}
function submenuChildren(value: unknown, subject: string, index: number): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`${subject}[${String(index)}].children must be an array.`);
  }
  return value;
}
function requiredText(value: unknown, subject: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${subject} must be a non-empty string.`);
  }
  return value;
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
function preparePointerState(value: unknown, subject: string): PointerInteractionState | undefined {
  if (value === undefined) return undefined;
  if (
    !isNonArrayObject(value) ||
    Object.keys(value).some((field) => field !== 'hoveredTargetId' && field !== 'pressedTargetId')
  ) throw new TypeError(`${subject} pointerState is invalid.`);
  if (
    value['hoveredTargetId'] !== undefined && typeof value['hoveredTargetId'] !== 'string' ||
    value['pressedTargetId'] !== undefined && typeof value['pressedTargetId'] !== 'string'
  ) throw new TypeError(`${subject} pointerState values must be strings.`);
  return {
    ...(value['hoveredTargetId'] === undefined
      ? {}
      : { hoveredTargetId: value['hoveredTargetId'] }),
    ...(value['pressedTargetId'] === undefined
      ? {}
      : { pressedTargetId: value['pressedTargetId'] }),
  };
}
function preparePlacement(value: unknown): AnchoredSurfacePlacement {
  if (value === undefined) return 'auto';
  if (
    value === 'above' || value === 'below' || value === 'left' || value === 'right' ||
    value === 'auto' || value === 'cursor'
  ) return value;
  throw new TypeError('menu placement is invalid.');
}
function prepareAnchor(
  value: unknown,
): import('../../interaction/anchored-surface.ts').AnchoredSurfaceAnchor {
  if (!isNonArrayObject(value)) throw new TypeError('menu anchor must be an object.');
  if (
    value['kind'] === 'cursor' && typeof value['row'] === 'number' &&
    Number.isFinite(value['row']) && typeof value['column'] === 'number' &&
    Number.isFinite(value['column']) &&
    Object.keys(value).every((field) => field === 'kind' || field === 'row' || field === 'column')
  ) return { kind: 'cursor', row: value['row'], column: value['column'] };
  if (
    value['kind'] === 'target' && isNonArrayObject(value['bounds']) &&
    Object.keys(value).every((field) => field === 'kind' || field === 'bounds')
  ) {
    const bounds = value['bounds'];
    if (
      typeof bounds['row'] === 'number' && Number.isFinite(bounds['row']) &&
      typeof bounds['column'] === 'number' && Number.isFinite(bounds['column']) &&
      typeof bounds['width'] === 'number' && Number.isFinite(bounds['width']) &&
      bounds['width'] >= 0 && typeof bounds['height'] === 'number' &&
      Number.isFinite(bounds['height']) && bounds['height'] >= 0 &&
      Object.keys(bounds).every((field) =>
        field === 'row' || field === 'column' || field === 'width' || field === 'height'
      )
    ) {
      return {
        kind: 'target',
        bounds: {
          row: bounds['row'],
          column: bounds['column'],
          width: bounds['width'],
          height: bounds['height'],
        },
      };
    }
  }
  throw new TypeError('menu anchor is invalid.');
}

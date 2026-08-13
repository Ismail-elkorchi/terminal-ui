import {
  clipRenderLine,
  componentScrollbarHitTargets,
  defineComponent,
  ignoreMessage,
  line,
  padRenderLine,
  paintComponentScrollbar,
  prepareComponentScrollbar,
  prepareComponentScrollbarOptions,
  prepareComponentScrollPolicy,
  prepareComponentScrollState,
} from '../../component/index.ts';
import type { ComponentMessage } from '../../component/index.ts';
import {
  createScrollState,
  isCollectionProjection,
  normalizeScrollState,
  scrollReducer,
} from '../../behavior/index.ts';
import type { Element } from '../../element/index.ts';
import {
  assertOptionalCallback,
  assertRequiredCallback,
  isNonArrayObject,
} from '../../foundation/validation.ts';
import type { RoutedPointerEvent } from '../../input/pointer.ts';
import {
  pointerVisualState,
  preparePointerInteractionState,
} from '../../interaction/pointer-interaction.ts';
import type { PointerInteractionAction, PointerInteractionState } from '../../interaction/pointer-interaction.ts';
import { ownSelectionState, type SelectionState } from '../../interaction/collection.ts';
import type { ScrollPolicy, ScrollState } from '../../interaction/scroll.ts';
import type { ScrollbarOptions } from '../../interaction/scrollbar.ts';
import { measureTextCells, sanitizeTerminalText } from '../../text/index.ts';
import { terminalStyleHasBackground } from '../../theme/index.ts';
import type {
  CompleteListboxCollection,
  ListboxActivateEvent,
  ListboxCollectionRecord,
  ListboxOption,
  ListboxOptionProjector,
  ListboxTransition,
  WindowedListboxCollection,
} from '../../ui-model/list.ts';
import { matchNormalizedCollectionQuery, normalizeCollectionQuery } from '../../ui-model/query.ts';
import type { CollectionQuery, QueryMatchRange } from '../../ui-model/query.ts';
import type { DataListStylePart } from '../../ui-model/style-parts.ts';
import type { RenderSpan, TerminalStyle } from '../../visual/render.ts';
import type {
  ListboxOptions,
  UnscrolledListboxOptions,
  ScrollableListboxOptions,
} from '../options/content.ts';

interface PreparedListEntry {
  readonly id: string;
  readonly itemIndex: number;
  readonly position: number;
  readonly label: string;
  readonly description?: string;
  readonly disabled: boolean;
  readonly match?: QueryMatchRange;
}

interface PreparedListbox {
  readonly entries: readonly PreparedListEntry[];
  readonly startIndex: number;
  readonly totalCount: number;
  readonly windowed: boolean;
  readonly query: Required<CollectionQuery>;
  readonly activeId?: string;
  readonly selection: SelectionState;
  readonly scroll?: ScrollState;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
  readonly pointerState?: PointerInteractionState;
}

const listboxDefinitionBase = {
  name: 'terminal-ui/components/listbox' as const,
  identity: 'required' as const,
  structure: 'leaf' as const,
  semantics: 'semantic' as const,
  accessibleRole: 'listbox' as const,
  metadata: ['focus', 'layer', 'styles'] as const,
  parts: ['marker', 'item', 'description', 'match', 'empty', 'scrollbar'] as const,
  states: ['disabled', 'busy', 'readOnly', 'inert'] as const,
  measure: measureListbox,
  render: renderListbox,
  accessibility: accessibleListbox,
};

type ListboxComponentAction =
  | { readonly kind: 'transition'; readonly action: ListboxTransition }
  | { readonly kind: 'activate'; readonly event: ListboxActivateEvent }
  | { readonly kind: 'pointer'; readonly action: PointerInteractionAction };

const instantiateListbox = defineComponent<
  PreparedListbox,
  PreparedListbox,
  ListboxComponentAction,
  DataListStylePart,
  readonly ['disabled', 'busy', 'readOnly', 'inert'],
  'required',
  readonly ['focus', 'layer', 'styles']
>({
  ...listboxDefinitionBase,
  pointer: {
    state: ({ model }) => model.pointerState,
    onAction: (action) => ({ kind: 'pointer', action }),
  },
  keys({ model, busy, readOnly }) {
    if (busy) return {};
    const active = activeEntry(model);
    return {
      arrowUp: () => transition({ kind: 'moveActive', delta: -1 }),
      arrowDown: () => transition({ kind: 'moveActive', delta: 1 }),
      pageUp: () => transition({ kind: 'pageActive', delta: -1 }),
      pageDown: () => transition({ kind: 'pageActive', delta: 1 }),
      home: () => transition({ kind: 'firstActive' }),
      end: () => transition({ kind: 'lastActive' }),
      ...(readOnly ? {} : { space: () => transition({ kind: 'commitActive' }) }),
      ...(readOnly || active === undefined || active.disabled
        ? {}
        : { enter: () => activate(active) }),
    };
  },
  focusTargets(input) {
    const plan = listPlan(input.model, input.bounds);
    const active = plan.rows.findIndex((entry) => entry.id === input.model.activeId);
    return [{
      id: 'self',
      bounds: plan.scrollbar.contentBounds,
      ...(active < 0 ? {} : {
        cursor: {
          row: plan.scrollbar.contentBounds.row + active,
          column: plan.scrollbar.contentBounds.column,
        },
      }),
    }];
  },
  hitTargets(input) {
    if (input.busy) return [];
    const plan = listPlan(input.model, input.bounds);
    return [
      ...plan.rows.flatMap((entry, row) =>
        entry.disabled ? [] : [{
          id: `${input.id ?? 'list'}:option:${entry.id}`,
          bounds: {
            row: plan.scrollbar.contentBounds.row + row,
            column: plan.scrollbar.contentBounds.column,
            width: plan.scrollbar.contentBounds.width,
            height: 1,
          },
          accepts: ['click'] as const,
          cursor: 'pointer' as const,
          message: (event: RoutedPointerEvent) =>
            event.clickCount === 2 && !input.readOnly
              ? activate(entry)
              : transition({ kind: 'setActive', id: entry.id }),
        }]
      ),
      ...(input.model.scroll === undefined ? [] : componentScrollbarHitTargets<ListboxComponentAction>({
        id: input.id ?? 'listbox',
        plan: plan.scrollbar,
        ...(input.model.scrollPolicy === undefined ? {} : { policy: input.model.scrollPolicy }),
        onScroll: (event) => transition({ kind: 'scroll', event }),
      })),
    ];
  },
});

export function listbox<TValue, const TMessage extends ComponentMessage = never>(
  options: ScrollableListboxOptions<TValue, TMessage>,
): Element<TMessage>;
export function listbox<TValue, const TMessage extends ComponentMessage = never>(
  // eslint-disable-next-line @typescript-eslint/unified-signatures
  options: UnscrolledListboxOptions<TValue, TMessage>,
): Element<TMessage>;
export function listbox<TValue, const TMessage extends ComponentMessage = never>(
  options: ListboxOptions<TValue, TMessage>,
): Element<TMessage> {
  const prepared = prepareListbox(
    options,
    options.disabled !== true && options.inert !== true,
  );
  if (options.disabled === true) return instantiateListbox({
    ...prepared,
    id: options.id,
    disabled: true,
    ...(options.inert === undefined ? {} : { inert: options.inert }),
    ...(options.meta === undefined ? {} : { meta: options.meta }),
  });
  if (options.inert === true) return instantiateListbox({
    ...prepared,
    id: options.id,
    inert: true,
    ...(options.busy === undefined ? {} : { busy: options.busy }),
    ...(options.meta === undefined ? {} : { meta: options.meta }),
  });
  assertRequiredCallback(options.onTransition, 'listbox onTransition');
  assertOptionalCallback(options.onActivate, 'listbox onActivate');
  assertOptionalCallback(options.onPointerAction, 'listbox onPointerAction');
  return instantiateListbox({
    ...prepared,
    id: options.id,
    ...(options.busy === undefined ? {} : { busy: options.busy }),
    ...(options.readOnly === undefined ? {} : { readOnly: options.readOnly }),
    ...(options.meta === undefined ? {} : { meta: options.meta }),
    onAction: (action) => {
      if (action.kind === 'activate') return options.onActivate?.(action.event) ?? ignoreMessage();
      if (action.kind === 'pointer') return options.onPointerAction?.(action.action) ?? ignoreMessage();
      if (isScrollableListboxOptions(options)) return options.onTransition(action.action);
      return action.action.kind === 'scroll'
        ? ignoreMessage()
        : options.onTransition(action.action);
    },
  });
}

function isScrollableListboxOptions<TValue, TMessage extends ComponentMessage>(
  options: ListboxOptions<TValue, TMessage>,
): options is ScrollableListboxOptions<TValue, TMessage> {
  return options.presentation.scroll !== undefined;
}

function prepareListbox<TValue, TMessage extends ComponentMessage>(
  value: Readonly<ListboxOptions<TValue, TMessage>>,
  pointerAvailable: boolean,
): PreparedListbox {
  const rawItems = value.items;
  const rawProjector = value.projectItem;
  const rawCollection = value.collection;
  const dataForms = Number(rawItems !== undefined || rawProjector !== undefined) +
    Number(rawCollection !== undefined);
  if (dataForms !== 1) {
    throw new TypeError('list requires either items with projectItem, or collection.');
  }
  let projected: ProjectedListData;
  if (rawCollection === undefined) {
    if (rawItems === undefined || rawProjector === undefined) {
      throw new TypeError('list requires items and projectItem together.');
    }
    projected = prepareProjectedItems(rawItems, rawProjector);
  } else {
    projected = prepareProjectedCollection(rawCollection);
  }
  const requestedQuery = value.filterQuery;
  if (projected.windowed && requestedQuery !== undefined) {
    throw new TypeError('Windowed list collections own their filter query.');
  }
  const query = projected.windowed
    ? projected.query
    : normalizeCollectionQuery(requestedQuery ?? { text: '', mode: 'contains' });
  const entries = preparedListEntries(projected, query);
  const activeId = optionalCleanString(value.presentation.activeId, 'listbox activeId');
  const selection = ownSelectionState(value.presentation.selection, 'listbox selection');
  const scroll = prepareComponentScrollState(value.presentation.scroll, 'list scroll');
  const scrollbar = prepareComponentScrollbarOptions(value.scrollbar, 'list scrollbar');
  const scrollPolicy = prepareComponentScrollPolicy(value.scrollPolicy, 'list scrollPolicy');
  const pointerState = preparePointerInteractionState(
    value.pointerState,
    'listbox pointerState',
    pointerAvailable,
  );
  if (scroll === undefined && (scrollbar !== undefined || scrollPolicy !== undefined)) {
    throw new TypeError('list scrollbar and scrollPolicy require scroll state.');
  }
  return {
    entries,
    startIndex: projected.windowed ? projected.startIndex : 0,
    totalCount: projected.windowed ? projected.totalCount : entries.length,
    windowed: projected.windowed,
    query,
    ...(activeId === undefined ? {} : { activeId }),
    selection,
    ...(scroll === undefined ? {} : { scroll }),
    ...(scrollbar === undefined ? {} : { scrollbar }),
    ...(scrollPolicy === undefined ? {} : { scrollPolicy }),
    ...(pointerState === undefined ? {} : { pointerState }),
  };
}

interface ProjectedListData {
  readonly entries: readonly PreparedListSourceEntry[];
  readonly windowed: boolean;
  readonly startIndex: number;
  readonly totalCount: number;
  readonly query: Required<CollectionQuery>;
}

type PreparedListSourceEntry = Omit<PreparedListEntry, 'position'> & {
  readonly searchText: string;
};

const preparedListboxCollections = new WeakMap<object, ProjectedListData>();
const preparedListEntryViews = new WeakMap<
  object,
  { readonly queryKey: string; readonly entries: readonly PreparedListEntry[] }
>();

function preparedListEntries(
  projected: ProjectedListData,
  query: Required<CollectionQuery>,
): readonly PreparedListEntry[] {
  const cached = preparedListEntryViews.get(projected);
  const queryKey = `${query.mode}:${query.caseSensitive ? '1' : '0'}:${query.text}`;
  if (cached?.queryKey === queryKey) return cached.entries;
  const matched: {
    readonly entry: PreparedListSourceEntry;
    readonly match?: QueryMatchRange;
  }[] = [];
  for (const entry of projected.entries) {
    if (projected.windowed || query.text.length === 0) {
      matched.push({ entry });
      continue;
    }
    const match = matchNormalizedCollectionQuery({
      id: entry.id,
      primary: entry.label,
      secondary: [entry.searchText],
    }, query);
    if (match !== undefined) {
      const primary = match.ranges.find((range) => range.field === 'primary');
      matched.push({ entry, ...(primary === undefined ? {} : { match: primary }) });
    }
  }
  const entries = Object.freeze(matched.map(({ entry, match }, position): PreparedListEntry =>
    Object.freeze({
      id: entry.id,
      itemIndex: entry.itemIndex,
      position: projected.windowed ? entry.itemIndex : position,
      label: entry.label,
      ...(entry.description === undefined ? {} : { description: entry.description }),
      disabled: entry.disabled,
      ...(match === undefined ? {} : { match }),
    })
  ));
  preparedListEntryViews.set(projected, Object.freeze({ queryKey, entries }));
  return entries;
}

function prepareProjectedItems<TValue>(
  items: readonly TValue[],
  projector: ListboxOptionProjector<TValue>,
): ProjectedListData {
  const ids = new Set<string>();
  return {
    entries: Object.freeze(items.map((item, index) => {
      const projected = projector(item, index);
      return prepareListEntry(
        isNonArrayObject(projected) ? projected.id : undefined,
        index,
        projected,
        ids,
      );
    })),
    windowed: false,
    startIndex: 0,
    totalCount: items.length,
    query: normalizeCollectionQuery({ text: '', mode: 'contains' }),
  };
}

function prepareProjectedCollection<TValue>(
  value: CompleteListboxCollection<TValue> | WindowedListboxCollection<TValue>,
): ProjectedListData {
  if (!isCollectionProjection(value)) {
    throw new TypeError('list collection must be prepared with prepareListboxCollection().');
  }
  const cached = preparedListboxCollections.get(value);
  if (cached !== undefined) return cached;
  const kind = value.kind;
  const query = normalizeCollectionQuery({
    text: kind === 'window' && value.domain.kind === 'projection'
      ? value.domain.filterQuery ?? ''
      : '',
    mode: 'contains',
  });
  const prepared = Object.freeze({
    entries: prepareEntries(value.records),
    windowed: kind === 'window',
    startIndex: value.startIndex,
    totalCount: value.totalCount,
    query,
  });
  preparedListboxCollections.set(value, prepared);
  return prepared;
}

function prepareEntries<TValue>(
  records: readonly ListboxCollectionRecord<TValue>[],
): readonly PreparedListSourceEntry[] {
  return Object.freeze(records.map((record) => {
    const item = prepareListItem(record.item);
    if (record.id !== item.id) throw new TypeError('list record and projected item ids must match.');
    return Object.freeze({
      id: record.id,
      itemIndex: record.itemIndex,
      label: item.label,
      ...(item.description === undefined ? {} : { description: item.description }),
      disabled: item.disabled,
      searchText: item.searchText,
    });
  }));
}

function prepareListEntry(
  rawId: unknown,
  rawItemIndex: number,
  rawItem: ListboxOption,
  ids: Set<string>,
): PreparedListSourceEntry {
  const itemIndex = nonNegativeSafeInteger(rawItemIndex, 'list record itemIndex');
  const item = prepareListItem(rawItem);
  const id = requiredCleanString(rawId, 'list record id');
  if (id !== item.id) throw new TypeError('list record and projected item ids must match.');
  if (ids.has(id)) throw new TypeError(`list item ids must be unique; duplicate id: ${id}`);
  ids.add(id);
  return Object.freeze({
    id,
    itemIndex,
    label: item.label,
    ...(item.description === undefined ? {} : { description: item.description }),
    disabled: item.disabled,
    searchText: item.searchText,
  });
}

function prepareListItem(value: ListboxOption): {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly disabled: boolean;
  readonly searchText: string;
} {
  if (!isNonArrayObject(value)) throw new TypeError('list projected item must be an object.');
  const id = requiredCleanString(value.id, 'list item id');
  const label = requiredString(value.label, 'list item label');
  const description = optionalString(value.description, 'list item description');
  const keywords = value.keywords === undefined
    ? []
    : Array.isArray(value.keywords)
    ? value.keywords.map((entry) => requiredString(entry, 'list item keyword'))
    : undefined;
  if (keywords === undefined) {
    throw new TypeError('list item keywords must be an array of strings.');
  }
  if (value.disabled !== undefined && typeof value.disabled !== 'boolean') {
    throw new TypeError('list item disabled must be a boolean.');
  }
  const cleanLabel = cleanLine(label);
  const cleanDescription = description === undefined ? undefined : cleanLine(description);
  return {
    id,
    label: cleanLabel,
    ...(cleanDescription === undefined ? {} : { description: cleanDescription }),
    disabled: value.disabled === true,
    searchText: normalizedQuery(
      [cleanLabel, cleanDescription, ...keywords].filter(Boolean).join(' '),
    ),
  };
}

function measureListbox(
  { model, widthProfile }: {
    readonly model: PreparedListbox;
    readonly widthProfile: import('../../text/index.ts').TextWidthProfile;
  },
) {
  const rows = model.entries.slice(0, 64);
  const preferredWidth = Math.max(
    1,
    ...rows.map((entry) =>
      measureTextCells(
        `${entry.label}${entry.description === undefined ? '' : ` · ${entry.description}`}`,
        { widthProfile },
      ).cells + 2
    ),
  );
  return {
    minWidth: 1,
    minHeight: 1,
    preferredWidth,
    preferredHeight: Math.max(1, Math.min(64, model.totalCount)),
  };
}

function renderListbox(
  input: import('../../component/index.ts').ComponentRenderInput<PreparedListbox, DataListStylePart>,
): void {
  const plan = listPlan(input.model, input.bounds);
  if (plan.rows.length === 0 && plan.scrollbar.contentBounds.height > 0) {
    const emptyStyle = input.style({
      part: 'empty',
      base: { fg: { kind: 'theme', token: 'text.muted' }, dim: true },
    });
    input.target.write(0, 0, [{
      text: input.model.query.text.length === 0 ? 'No items' : 'No matching items',
      ...(emptyStyle === undefined ? {} : { style: emptyStyle }),
      source: input.source({
        cellRole: 'text',
        partName: 'empty',
        partType: 'text',
        description: input.model.query.text.length === 0 ? 'empty' : 'filter.empty',
      }),
    }]);
  }
  for (const [row, entry] of plan.rows.entries()) {
    const selected = selectionContains(input.model.selection, entry.id);
    const active = entry.id === input.model.activeId;
    const pointer = pointerVisualState(
      input.model.pointerState,
      `${input.id ?? 'listbox'}:option:${entry.id}`,
    );
    const state = entry.disabled ? 'disabled' : pointer ?? (selected ? 'selected' : active ? 'active' : undefined);
    const itemStyle = input.style({
      part: 'item',
      base: selected
        ? {
          fg: { kind: 'theme', token: 'selection.foreground' },
          bg: { kind: 'theme', token: 'selection.background' },
        }
        : { fg: { kind: 'theme', token: 'text.default' } },
      ...(state === undefined ? {} : { state }),
    });
    const markerStyle = input.style({
      part: 'marker',
      ...(state === undefined ? {} : { state }),
      ...(itemStyle === undefined ? {} : { base: itemStyle }),
    });
    const spans: RenderSpan[] = [
      {
        text: selected && !terminalStyleHasBackground(markerStyle, input.theme)
          ? input.theme.tokens.symbols.selected
          : input.theme.tokens.symbols.unselected,
        ...(markerStyle === undefined ? {} : { style: markerStyle }),
        source: input.source({
          cellRole: 'decoration',
          partName: 'marker',
          partType: 'marker',
          description: `item.${entry.id}.marker`,
          itemId: entry.id,
          itemIndex: entry.itemIndex,
          ...(state === undefined ? {} : { interactionState: state }),
        }),
      },
      {
        text: ' ',
        ...(markerStyle === undefined ? {} : { style: markerStyle }),
        source: input.source({
          cellRole: 'decoration',
          partName: 'marker.gap',
          partType: 'spacing',
          description: `item.${entry.id}.marker.gap`,
          itemId: entry.id,
          itemIndex: entry.itemIndex,
        }),
      },
      ...highlightedListLabel(entry.label, entry.match, itemStyle, input, entry, state),
      ...(entry.description === undefined ? [] : [{
        text: ` · ${entry.description}`,
        ...optionalSpanStyle(input.style({
          part: 'description',
          base: { fg: { kind: 'theme', token: 'text.muted' }, dim: true },
        })),
        source: input.source({
          cellRole: 'text',
          partName: 'description',
          partType: 'text',
          description: `item.${entry.id}.description`,
          itemId: entry.id,
          itemIndex: entry.itemIndex,
          ...(state === undefined ? {} : { interactionState: state }),
        }),
      }]),
    ];
    const clipped = clipRenderLine(line(spans), plan.scrollbar.contentBounds.width, {
      widthProfile: input.widthProfile,
    });
    input.target.writeLine(
      plan.scrollbar.contentBounds.row + row,
      plan.scrollbar.contentBounds.column,
      padRenderLine(clipped, plan.scrollbar.contentBounds.width, {
        widthProfile: input.widthProfile,
        fill: {
          text: ' ',
          ...(itemStyle === undefined ? {} : { style: itemStyle }),
          source: input.source({
            cellRole: 'decoration',
            partName: 'padding',
            partType: 'spacing',
            description: `item.${entry.id}.padding`,
            itemId: entry.id,
            itemIndex: entry.itemIndex,
            ...(state === undefined ? {} : { interactionState: state }),
          }),
        },
      }),
    );
  }
  paintComponentScrollbar({
    target: input.target,
    plan: plan.scrollbar,
    theme: input.theme,
    source: (sourceInput) => input.source(sourceInput),
  });
}

function accessibleListbox(
  input: import('../../component/index.ts').ComponentAccessibilityInput<PreparedListbox>,
) {
  const plan = listPlan(input.model, input.bounds);
  return {
    id: input.id,
    role: 'listbox' as const,
    label: input.id,
    description: input.model.totalCount === 0
      ? 'Showing 0 items.'
      : `Showing ${String(plan.startIndex + 1)}-${String(plan.startIndex + plan.rows.length)} of ${
        String(input.model.totalCount)
      } items.`,
    ...(input.focused ? { focused: true } : {}),
    ...(input.model.activeId === undefined
      ? {}
      : { activeDescendant: `${input.id}:option:${input.model.activeId}` }),
    ...(input.model.selection.mode === 'multiple' ? { multiSelectable: true } : {}),
    window: {
      startIndex: plan.startIndex,
      endIndexExclusive: plan.startIndex + plan.rows.length,
      totalCount: input.model.totalCount,
      omittedBefore: plan.startIndex,
      omittedAfter: Math.max(0, input.model.totalCount - plan.startIndex - plan.rows.length),
    },
    children: plan.rows.map((entry) => ({
      id: `${input.id}:option:${entry.id}`,
      role: 'option' as const,
      label: entry.label,
      ...(entry.description === undefined ? {} : { description: entry.description }),
      selected: selectionContains(input.model.selection, entry.id),
      disabled: entry.disabled,
      position: { positionInSet: entry.position + 1, setSize: input.model.totalCount },
    })),
  };
}

function listPlan(model: PreparedListbox, bounds: import('../../geometry/types.ts').Rect) {
  const active = activeEntry(model);
  const base = model.scroll === undefined
    ? active === undefined
      ? createScrollState()
      : scrollReducer(
        createScrollState(),
        { kind: 'itemIntoView', itemIndex: active.position, alignment: 'center' },
        {
          contentRows: model.totalCount,
          contentColumns: bounds.width,
          viewportRows: bounds.height,
          viewportColumns: bounds.width,
        },
      )
    : normalizeScrollState(model.scroll, {
      contentRows: model.totalCount,
      contentColumns: bounds.width,
      viewportRows: bounds.height,
      viewportColumns: bounds.width,
    });
  const scrollbar = prepareComponentScrollbar({
    bounds,
    scroll: base,
    contentRows: model.totalCount,
    contentColumns: bounds.width,
    ...(model.scrollbar === undefined ? {} : { options: model.scrollbar }),
    defaultAxis: 'vertical',
  });
  const requestedStart = scrollbar.scroll.offsetRow;
  const startIndex = model.windowed
    ? Math.max(
      model.startIndex,
      Math.min(
        Math.max(
          model.startIndex,
          model.startIndex + model.entries.length - scrollbar.contentBounds.height,
        ),
        requestedStart,
      ),
    )
    : requestedStart;
  const rows = model.windowed
    ? model.entries.slice(
      startIndex - model.startIndex,
      startIndex - model.startIndex + scrollbar.contentBounds.height,
    )
    : model.entries.slice(startIndex, startIndex + scrollbar.contentBounds.height);
  return { scrollbar, startIndex, rows };
}

function highlightedListLabel(
  label: string,
  match: QueryMatchRange | undefined,
  base: TerminalStyle | undefined,
  input: import('../../component/index.ts').ComponentRenderInput<PreparedListbox, DataListStylePart>,
  entry: PreparedListEntry,
  state: import('../../element/metadata.ts').ElementVisualState | undefined,
): readonly RenderSpan[] {
  const sourceState = state === 'default' ? undefined : state;
  if (match === undefined) {
    return [{
      text: label,
      ...(base === undefined ? {} : { style: base }),
      source: input.source({
        cellRole: 'text',
        partName: 'item',
        partType: 'text',
        description: `item.${entry.id}.value`,
        itemId: entry.id,
        itemIndex: entry.itemIndex,
        ...(sourceState === undefined ? {} : { interactionState: sourceState }),
      }),
    }];
  }
  const matchStyle = input.style({
    part: 'match',
    base: { ...(base ?? {}), fg: { kind: 'theme', token: 'menu.match' }, underline: true },
  });
  return [
    label.slice(0, match.start),
    label.slice(match.start, match.end),
    label.slice(match.end),
  ].map((text, part) => ({
    text,
    ...(part === 1
      ? matchStyle === undefined ? {} : { style: matchStyle }
      : base === undefined
      ? {}
      : { style: base }),
    source: input.source({
      cellRole: 'text',
      partName: part === 1 ? 'match' : 'item',
      partType: 'text',
      description: `item.${entry.id}.${part === 1 ? 'match' : 'value'}`,
      itemId: entry.id,
      itemIndex: entry.itemIndex,
      ...(sourceState === undefined ? {} : { interactionState: sourceState }),
    }),
  })).filter((span) => span.text.length > 0);
}

function optionalSpanStyle(style: TerminalStyle | undefined): { readonly style?: TerminalStyle } {
  return style === undefined ? {} : { style };
}

function activeEntry(model: PreparedListbox): PreparedListEntry | undefined {
  return model.activeId === undefined
    ? undefined
    : model.entries.find((entry) => entry.id === model.activeId);
}

function selectionContains(selection: SelectionState, id: string): boolean {
  return selection.mode === 'single'
    ? selection.selectedId === id
    : selection.mode === 'multiple' && selection.selectedIds.includes(id);
}

function transition(action: ListboxTransition): ListboxComponentAction {
  return { kind: 'transition', action };
}

function activate(entry: PreparedListEntry): ListboxComponentAction {
  return { kind: 'activate', event: { kind: 'activate', id: entry.id, itemIndex: entry.itemIndex } };
}

function requiredString(value: unknown, subject: string): string {
  if (typeof value !== 'string') throw new TypeError(`${subject} must be a string.`);
  return value;
}

function optionalString(value: unknown, subject: string): string | undefined {
  return value === undefined ? undefined : requiredString(value, subject);
}

function requiredCleanString(value: unknown, subject: string): string {
  const clean = cleanLine(requiredString(value, subject));
  if (clean.trim() === '') throw new TypeError(`${subject} must be non-empty.`);
  return clean;
}

function optionalCleanString(value: unknown, subject: string): string | undefined {
  return value === undefined ? undefined : requiredCleanString(value, subject);
}

function cleanLine(value: string): string {
  return sanitizeTerminalText(value).text.replace(/\s*\n\s*/gu, ' ');
}

function normalizedQuery(value: string): string {
  return cleanLine(value).trim().toLocaleLowerCase();
}

function nonNegativeSafeInteger(value: unknown, subject: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${subject} must be a non-negative safe integer.`);
  }
  return value;
}

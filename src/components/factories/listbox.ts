import {
  clipRenderLine,
  componentScrollbarHitTargets,
  defineComponent,
  ignoreMessage,
  line,
  padRenderLine,
  paintComponentScrollbar,
  layoutComponentScrollbar,
  decodeComponentScrollbarOptions,
  decodeComponentScrollPolicy,
  decodeComponentScrollState,
} from '../../component/index.ts';
import type { ComponentMessage } from '../../component/index.ts';
import {
  createScrollState,
  normalizeScrollState,
  scrollReducer,
} from '../../behavior/index.ts';
import { isCollectionSnapshot } from '../../collection/snapshot.ts';
import type { Element } from '../../element/index.ts';
import {
  assertOptionalCallback,
  assertRequiredCallback,
  isNonArrayObject,
} from '../../foundation/validation.ts';
import type { RoutedPointerEvent } from '../../input/pointer.ts';
import {
  pointerVisualState,
} from '../../interaction/pointer-interaction.ts';
import { decodeSelectionState, type SelectionState } from '../../interaction/collection-interaction.ts';
import type { ScrollPolicy, ScrollState } from '../../interaction/scroll.ts';
import type { ScrollbarOptions } from '../../interaction/scrollbar.ts';
import { measureTextCells, sanitizeTerminalText } from '../../text/index.ts';
import { terminalStyleHasBackground } from '../../theme/index.ts';
import type {
  CompleteListboxCollection,
  ListboxActivateEvent,
  ListboxCollectionItem,
  ListboxOption,
  ListboxOptionMapper,
  ListboxTransition,
  WindowedListboxCollection,
} from '../../behavior/listbox.ts';
import { matchCompiledCollectionQuery, compileCollectionQuery, indexQueryCandidate } from '../../text/query.ts';
import type {
  CompiledCollectionQuery,
  IndexedQueryCandidate,
  QueryMatchRange,
} from '../../text/query.ts';
import type { DataListStylePart } from '../style-parts.ts';
import type { RenderSpan, TerminalStyle } from '../../visual/render-content.ts';
import type {
  ListboxOptions,
  UnscrolledListboxOptions,
  ScrollableListboxOptions,
} from '../options/content-and-collections.ts';
import { inspectSelection } from '../internal/inspection.ts';

interface ListEntryModel {
  readonly id: string;
  readonly itemIndex: number;
  readonly position: number;
  readonly label: string;
  readonly description?: string;
  readonly disabled: boolean;
  readonly matches?: readonly QueryMatchRange[];
}

interface ListboxModel {
  readonly entries: readonly ListEntryModel[];
  readonly startIndex: number;
  readonly totalCount: number;
  readonly windowed: boolean;
  readonly query: CompiledCollectionQuery;
  readonly activeId?: string;
  readonly selection: SelectionState;
  readonly scroll?: ScrollState;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
}

const listboxDefinitionBase = {
  name: 'terminal-ui/components/listbox' as const,
  identity: 'required' as const,
  structure: 'leaf' as const,
  semantics: 'semantic' as const,
  accessibleRole: 'listbox' as const,
  metadata: ['focus', 'layer', 'styles'] as const,
  parts: ['marker', 'item', 'description', 'match', 'empty', 'scrollbarTrack', 'scrollbarThumb'] as const,
  visualStates: ['focused', 'hovered', 'pressed', 'active', 'selected', 'disabled', 'busy'] as const,
  states: ['disabled', 'busy', 'inert'] as const,
  measure: measureListbox,
  render: renderListbox,
  accessibility: accessibleListbox,
  inspection: ({ model }: { readonly model: Readonly<ListboxModel> }) => ({
    ...(model.activeId === undefined ? {} : { active: model.activeId }),
    selection: inspectSelection(model.selection),
    collection: {
      startIndex: model.startIndex,
      totalCount: model.totalCount,
      visibleCount: model.entries.length,
    },
  }),
};

type ListboxComponentAction =
  | { readonly kind: 'transition'; readonly transition: ListboxTransition }
  | { readonly kind: 'activate'; readonly event: ListboxActivateEvent };

const instantiateListbox = defineComponent<
  ListboxModel,
  ListboxModel,
  ListboxComponentAction,
  DataListStylePart,
  readonly ['disabled', 'busy', 'inert'],
  'required',
  readonly ['focus', 'layer', 'styles'],
  readonly ['focused', 'hovered', 'pressed', 'active', 'selected', 'disabled', 'busy']
>({
  ...listboxDefinitionBase,
  keys({ model, busy }) {
    if (busy) return {};
    const active = activeEntry(model);
    return {
      arrowUp: () => transition({ kind: 'moveActive', delta: -1 }),
      arrowDown: () => transition({ kind: 'moveActive', delta: 1 }),
      pageUp: () => transition({ kind: 'pageActive', delta: -1 }),
      pageDown: () => transition({ kind: 'pageActive', delta: 1 }),
      home: () => transition({ kind: 'firstActive' }),
      end: () => transition({ kind: 'lastActive' }),
      space: () => transition({ kind: 'commitActive' }),
      ...(active === undefined || active.disabled
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
          accepts: ['pointerDown', 'click'] as const,
          cursor: 'pointer' as const,
          message: (event: RoutedPointerEvent) => {
            if (event.button !== 'left') return ignoreMessage();
            if (event.kind === 'pointerDown') return transition({ kind: 'setActive', id: entry.id });
            return event.clickCount === 2
              ? activate(entry)
              : ignoreMessage();
          },
        }]
      ),
      ...(input.model.scroll === undefined ? [] : componentScrollbarHitTargets<ListboxComponentAction>({
        id: input.id ?? 'listbox',
        plan: plan.scrollbar,
        ...(input.model.scrollPolicy === undefined ? {} : { policy: input.model.scrollPolicy }),
        onScroll: (request) => transition({ kind: 'scroll', request }),
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
  const model = createListboxModel(options);
  if (options.disabled === true) return instantiateListbox({
    ...model,
    id: options.id,
    disabled: true,
    ...(options.inert === undefined ? {} : { inert: options.inert }),
    ...(options.styles === undefined ? {} : { styles: options.styles }),
    ...(options.meta === undefined ? {} : { meta: options.meta }),
  });
  if (options.inert === true) return instantiateListbox({
    ...model,
    id: options.id,
    inert: true,
    ...(options.busy === undefined ? {} : { busy: options.busy }),
    ...(options.styles === undefined ? {} : { styles: options.styles }),
    ...(options.meta === undefined ? {} : { meta: options.meta }),
  });
  assertRequiredCallback(options.onTransition, 'listbox onTransition');
  assertOptionalCallback(options.onActivate, 'listbox onActivate');
  return instantiateListbox({
    ...model,
    id: options.id,
    ...(options.busy === undefined ? {} : { busy: options.busy }),
    ...(options.styles === undefined ? {} : { styles: options.styles }),
    ...(options.meta === undefined ? {} : { meta: options.meta }),
    onAction: (action) => {
      if (action.kind === 'activate') return options.onActivate?.(action.event) ?? ignoreMessage();
      if (isScrollableListboxOptions(options)) return options.onTransition(action.transition);
      return action.transition.kind === 'scroll'
        ? ignoreMessage()
        : options.onTransition(action.transition);
    },
  });
}

function isScrollableListboxOptions<TValue, TMessage extends ComponentMessage>(
  options: ListboxOptions<TValue, TMessage>,
): options is ScrollableListboxOptions<TValue, TMessage> {
  return options.state.scroll !== undefined;
}

function createListboxModel<TValue, TMessage extends ComponentMessage>(
  value: Readonly<ListboxOptions<TValue, TMessage>>,
): ListboxModel {
  const rawItems = value.items;
  const toOption = value.toOption;
  const rawCollection = value.collection;
  const dataForms = Number(rawItems !== undefined || toOption !== undefined) +
    Number(rawCollection !== undefined);
  if (dataForms !== 1) {
    throw new TypeError('listbox requires either items with toOption, or collection.');
  }
  let source: ListSourceData;
  if (rawCollection === undefined) {
    if (rawItems === undefined || toOption === undefined) {
      throw new TypeError('listbox requires items and toOption together.');
    }
    source = createListSourceFromItems(rawItems, toOption);
  } else {
    source = createListSourceFromSnapshot(rawCollection);
  }
  const requestedQuery = value.query;
  if (source.windowed && requestedQuery !== undefined) {
    throw new TypeError('Windowed listbox collections own their filter query.');
  }
  const query = source.windowed
    ? source.query
    : compileCollectionQuery(requestedQuery ?? { text: '', mode: 'contains' });
  const entries = listEntriesForQuery(source, query);
  const activeId = optionalCleanString(value.state.activeId, 'listbox activeId');
  const selection = decodeSelectionState(value.state.selection, 'listbox selection');
  const scroll = decodeComponentScrollState(value.state.scroll, 'listbox scroll');
  const scrollbar = decodeComponentScrollbarOptions(value.scrollbar, 'listbox scrollbar');
  const scrollPolicy = decodeComponentScrollPolicy(value.scrollPolicy, 'listbox scrollPolicy');
  if (scroll === undefined && (scrollbar !== undefined || scrollPolicy !== undefined)) {
    throw new TypeError('listbox scrollbar and scrollPolicy require scroll state.');
  }
  return {
    entries,
    startIndex: source.windowed ? source.startIndex : 0,
    totalCount: source.windowed ? source.totalCount : entries.length,
    windowed: source.windowed,
    query,
    ...(activeId === undefined ? {} : { activeId }),
    selection,
    ...(scroll === undefined ? {} : { scroll }),
    ...(scrollbar === undefined ? {} : { scrollbar }),
    ...(scrollPolicy === undefined ? {} : { scrollPolicy }),
  };
}

interface ListSourceData {
  readonly entries: readonly ListSourceEntryModel[];
  readonly windowed: boolean;
  readonly startIndex: number;
  readonly totalCount: number;
  readonly query: CompiledCollectionQuery;
}

type ListSourceEntryModel = Omit<ListEntryModel, 'position'> & {
  readonly searchText: string;
  readonly candidate: IndexedQueryCandidate;
};

const listboxCollectionModels = new WeakMap<object, ListSourceData>();
const listEntryViewCache = new WeakMap<
  object,
  { readonly queryKey: string; readonly entries: readonly ListEntryModel[] }
>();

function listEntriesForQuery(
  source: ListSourceData,
  query: CompiledCollectionQuery,
): readonly ListEntryModel[] {
  const cached = listEntryViewCache.get(source);
  const queryKey = `${query.mode}:${query.caseSensitive ? '1' : '0'}:${query.text}`;
  if (cached?.queryKey === queryKey) return cached.entries;
  const matched: {
    readonly entry: ListSourceEntryModel;
    readonly matches?: readonly QueryMatchRange[];
  }[] = [];
  for (const entry of source.entries) {
    if (source.windowed || query.text.length === 0) {
      matched.push({ entry });
      continue;
    }
    const match = matchCompiledCollectionQuery(entry.candidate, query);
    if (match !== undefined) {
      const primary = Object.freeze(match.ranges.filter((range) => range.field === 'primary'));
      matched.push({ entry, ...(primary.length === 0 ? {} : { matches: primary }) });
    }
  }
  const entries = Object.freeze(matched.map(({ entry, matches }, position): ListEntryModel =>
    Object.freeze({
      id: entry.id,
      itemIndex: entry.itemIndex,
      position: source.windowed ? entry.itemIndex : position,
      label: entry.label,
      ...(entry.description === undefined ? {} : { description: entry.description }),
      disabled: entry.disabled,
      ...(matches === undefined ? {} : { matches }),
    })
  ));
  listEntryViewCache.set(source, Object.freeze({ queryKey, entries }));
  return entries;
}

function createListSourceFromItems<TValue>(
  items: readonly TValue[],
  toOption: ListboxOptionMapper<TValue>,
): ListSourceData {
  const ids = new Set<string>();
  return {
    entries: Object.freeze(items.map((item, index) => {
      const option = toOption(item, index);
      return decodeListEntry(
        isNonArrayObject(option) ? option.id : undefined,
        index,
        option,
        ids,
      );
    })),
    windowed: false,
    startIndex: 0,
    totalCount: items.length,
    query: compileCollectionQuery({ text: '', mode: 'contains' }),
  };
}

function createListSourceFromSnapshot<TValue>(
  value: CompleteListboxCollection<TValue> | WindowedListboxCollection<TValue>,
): ListSourceData {
  if (!isCollectionSnapshot(value)) {
    throw new TypeError('listbox collection must be created with createListboxCollection().');
  }
  const cached = listboxCollectionModels.get(value);
  if (cached !== undefined) return cached;
  const kind = value.kind;
  const query = kind === 'window'
    && value.scope.kind === 'query'
    && value.scope.query !== undefined
    ? value.scope.query
    : compileCollectionQuery({ text: '', mode: 'contains' });
  const model = Object.freeze({
    entries: createListSourceEntries(value.items),
    windowed: kind === 'window',
    startIndex: value.startIndex,
    totalCount: value.totalCount,
    query,
  });
  listboxCollectionModels.set(value, model);
  return model;
}

function createListSourceEntries<TValue>(
  items: readonly ListboxCollectionItem<TValue>[],
): readonly ListSourceEntryModel[] {
  return Object.freeze(items.map((collectionItem) => {
    const option = decodeListItem(collectionItem.option);
    if (collectionItem.id !== option.id) throw new TypeError('Listbox collection item and option ids must match.');
    return Object.freeze({
      id: collectionItem.id,
      itemIndex: collectionItem.itemIndex,
      label: option.label,
      ...(option.description === undefined ? {} : { description: option.description }),
      disabled: option.disabled,
      searchText: option.searchText,
      candidate: indexQueryCandidate({
        id: collectionItem.id,
        primary: option.label,
        secondary: [option.searchText],
      }),
    });
  }));
}

function decodeListEntry(
  rawId: unknown,
  rawItemIndex: number,
  rawItem: ListboxOption,
  ids: Set<string>,
): ListSourceEntryModel {
  const itemIndex = nonNegativeSafeInteger(rawItemIndex, 'listbox item itemIndex');
  const item = decodeListItem(rawItem);
  const id = requiredCleanString(rawId, 'listbox item id');
  if (id !== item.id) throw new TypeError('Listbox item and option ids must match.');
  if (ids.has(id)) throw new TypeError(`Listbox option ids must be unique; duplicate id: ${id}`);
  ids.add(id);
  return Object.freeze({
    id,
    itemIndex,
    label: item.label,
    ...(item.description === undefined ? {} : { description: item.description }),
    disabled: item.disabled,
    searchText: item.searchText,
    candidate: indexQueryCandidate({ id, primary: item.label, secondary: [item.searchText] }),
  });
}

function decodeListItem(value: ListboxOption): {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly disabled: boolean;
  readonly searchText: string;
} {
  if (!isNonArrayObject(value)) throw new TypeError('Listbox option must be an object.');
  const id = requiredCleanString(value.id, 'listbox option id');
  const label = requiredString(value.label, 'listbox option label');
  const description = optionalString(value.description, 'listbox option description');
  const keywords = value.keywords === undefined
    ? []
    : Array.isArray(value.keywords)
    ? value.keywords.map((entry) => requiredString(entry, 'listbox option keyword'))
    : undefined;
  if (keywords === undefined) {
    throw new TypeError('Listbox option keywords must be an array of strings.');
  }
  if (value.disabled !== undefined && typeof value.disabled !== 'boolean') {
    throw new TypeError('Listbox option disabled must be a boolean.');
  }
  const cleanLabel = cleanLine(label);
  const cleanDescription = description === undefined ? undefined : cleanLine(description);
  return {
    id,
    label: cleanLabel,
    ...(cleanDescription === undefined ? {} : { description: cleanDescription }),
    disabled: value.disabled === true,
    searchText: searchableText(
      [cleanLabel, cleanDescription, ...keywords].filter(Boolean).join(' '),
    ),
  };
}

function measureListbox(
  { model, widthProfile }: {
    readonly model: ListboxModel;
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
  input: import('../../component/index.ts').ComponentRenderInput<ListboxModel, DataListStylePart>,
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
      source: input.frameSource({
        cellRole: 'text',
        partName: 'empty',
        partType: 'text',
        description: input.model.query.text.length === 0 ? 'empty' : 'filter.empty',
      }),
    }]);
  }
  for (const [row, entry] of plan.rows.entries()) {
    renderListboxRow(input, plan, entry, row);
  }
  paintComponentScrollbar({
    target: input.target,
    plan: plan.scrollbar,
    theme: input.theme,
    style: (part, state, base) => input.style({ part, base, ...(state === undefined ? {} : { states: [state] }) }),
    frameSource: (sourceInput) => input.frameSource(sourceInput),
  });
}

function renderListboxRow(
  input: import('../../component/index.ts').ComponentRenderInput<ListboxModel, DataListStylePart>,
  plan: ReturnType<typeof listPlan>,
  entry: ListEntryModel,
  row: number,
): void {
  const selected = selectionContains(input.model.selection, entry.id);
  const active = entry.id === input.model.activeId;
  const pointer = pointerVisualState(input.pointerState, `${input.id ?? 'listbox'}:option:${entry.id}`);
  const states = entry.disabled
    ? ['disabled' as const]
    : [
      ...(selected ? ['selected' as const] : []),
      ...(active ? ['active' as const] : []),
      ...(pointer === undefined ? [] : [pointer]),
    ];
  const state = states.at(-1);
  const itemStyle = input.style({
    part: 'item',
    base: selected
      ? {
        fg: { kind: 'theme', token: 'selection.foreground' },
        bg: { kind: 'theme', token: 'selection.background' },
      }
      : { fg: { kind: 'theme', token: 'text.default' } },
    ...(states.length === 0 ? {} : { states }),
  });
  const markerStyle = input.style({
    part: 'marker',
    ...(states.length === 0 ? {} : { states }),
    ...(itemStyle === undefined ? {} : { base: itemStyle }),
  });
  const spans = listboxRowSpans(input, entry, selected, states, state, itemStyle, markerStyle);
  const clipped = clipRenderLine(line(spans), plan.scrollbar.contentBounds.width, {
    widthProfile: input.widthProfile,
  });
  input.target.writeLine(
    plan.scrollbar.contentBounds.row + row,
    plan.scrollbar.contentBounds.column,
    padRenderLine(clipped, plan.scrollbar.contentBounds.width, {
      widthProfile: input.widthProfile,
      fill: listboxPaddingSpan(input, entry, state, itemStyle),
    }),
  );
}

function listboxRowSpans(
  input: import('../../component/index.ts').ComponentRenderInput<ListboxModel, DataListStylePart>,
  entry: ListEntryModel,
  selected: boolean,
  states: readonly Exclude<import('../../element/metadata.ts').ElementVisualState, 'default'>[],
  state: Exclude<import('../../element/metadata.ts').ElementVisualState, 'default'> | undefined,
  itemStyle: TerminalStyle | undefined,
  markerStyle: TerminalStyle | undefined,
): readonly RenderSpan[] {
  return [
    {
      text: selected && !terminalStyleHasBackground(markerStyle, input.theme)
        ? input.theme.tokens.symbols.selected
        : input.theme.tokens.symbols.unselected,
      ...(markerStyle === undefined ? {} : { style: markerStyle }),
      source: input.frameSource({
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
      source: input.frameSource({
        cellRole: 'decoration',
        partName: 'marker.gap',
        partType: 'spacing',
        description: `item.${entry.id}.marker.gap`,
        itemId: entry.id,
        itemIndex: entry.itemIndex,
      }),
    },
    ...highlightedListLabel(entry.label, entry.matches, itemStyle, input, entry, states),
    ...listboxDescriptionSpans(input, entry, states, state),
  ];
}

function listboxDescriptionSpans(
  input: import('../../component/index.ts').ComponentRenderInput<ListboxModel, DataListStylePart>,
  entry: ListEntryModel,
  states: readonly Exclude<import('../../element/metadata.ts').ElementVisualState, 'default'>[],
  state: Exclude<import('../../element/metadata.ts').ElementVisualState, 'default'> | undefined,
): readonly RenderSpan[] {
  if (entry.description === undefined) return [];
  return [{
    text: ` · ${entry.description}`,
    ...optionalSpanStyle(input.style({
      part: 'description',
      base: { fg: { kind: 'theme', token: 'text.muted' }, dim: true },
      ...(states.length === 0 ? {} : { states }),
    })),
    source: input.frameSource({
      cellRole: 'text',
      partName: 'description',
      partType: 'text',
      description: `item.${entry.id}.description`,
      itemId: entry.id,
      itemIndex: entry.itemIndex,
      ...(state === undefined ? {} : { interactionState: state }),
    }),
  }];
}

function listboxPaddingSpan(
  input: import('../../component/index.ts').ComponentRenderInput<ListboxModel, DataListStylePart>,
  entry: ListEntryModel,
  state: Exclude<import('../../element/metadata.ts').ElementVisualState, 'default'> | undefined,
  style: TerminalStyle | undefined,
): RenderSpan {
  return {
    text: ' ',
    ...(style === undefined ? {} : { style }),
    source: input.frameSource({
      cellRole: 'decoration',
      partName: 'padding',
      partType: 'spacing',
      description: `item.${entry.id}.padding`,
      itemId: entry.id,
      itemIndex: entry.itemIndex,
      ...(state === undefined ? {} : { interactionState: state }),
    }),
  };
}

function accessibleListbox(
  input: import('../../component/index.ts').ComponentAccessibilityInput<ListboxModel>,
) {
  const plan = listPlan(input.model, input.bounds);
  return {
    id: input.id,
    role: 'listbox' as const,
    description: input.model.totalCount === 0
      ? 'Showing 0 items.'
      : `Showing ${String(plan.startIndex + 1)}-${String(plan.startIndex + plan.rows.length)} of ${
        String(input.model.totalCount)
      } items.`,
    ...(input.focused ? { focused: true } : {}),
    ...(input.model.activeId === undefined
      ? {}
      : input.model.entries.some((item) => item.id === input.model.activeId)
        ? { activeDescendant: `${input.id}:option:${input.model.activeId}` }
        : {}),
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

function listPlan(model: ListboxModel, bounds: import('../../geometry/types.ts').Rect) {
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
  const scrollbar = layoutComponentScrollbar({
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
  matches: readonly QueryMatchRange[] | undefined,
  base: TerminalStyle | undefined,
  input: import('../../component/index.ts').ComponentRenderInput<ListboxModel, DataListStylePart>,
  entry: ListEntryModel,
  states: readonly Exclude<import('../../element/metadata.ts').ElementVisualState, 'default'>[],
): readonly RenderSpan[] {
  const state = states.at(-1);
  const sourceState = state;
  if (matches === undefined || matches.length === 0) {
    return [{
      text: label,
      ...(base === undefined ? {} : { style: base }),
      source: input.frameSource({
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
    applyDefaultStateStyle: false,
    ...(states.length === 0 ? {} : { states }),
  });
  const spans: RenderSpan[] = [];
  let cursor = 0;
  for (const match of matches) {
    if (match.start > cursor) spans.push(labelSpan(label.slice(cursor, match.start), false));
    if (match.end > match.start) spans.push(labelSpan(label.slice(match.start, match.end), true));
    cursor = Math.max(cursor, match.end);
  }
  if (cursor < label.length) spans.push(labelSpan(label.slice(cursor), false));
  return spans;

  function labelSpan(text: string, matched: boolean): RenderSpan {
    return {
      text,
      ...(matched
        ? matchStyle === undefined ? {} : { style: matchStyle }
        : base === undefined ? {} : { style: base }),
      source: input.frameSource({
        cellRole: 'text',
        partName: matched ? 'match' : 'item',
        partType: 'text',
        description: `item.${entry.id}.${matched ? 'match' : 'value'}`,
        itemId: entry.id,
        itemIndex: entry.itemIndex,
        ...(sourceState === undefined ? {} : { interactionState: sourceState }),
      }),
    };
  }
}

function optionalSpanStyle(style: TerminalStyle | undefined): { readonly style?: TerminalStyle } {
  return style === undefined ? {} : { style };
}

function activeEntry(model: ListboxModel): ListEntryModel | undefined {
  return model.activeId === undefined
    ? undefined
    : model.entries.find((entry) => entry.id === model.activeId);
}

function selectionContains(selection: SelectionState, id: string): boolean {
  return selection.mode === 'single'
    ? selection.selectedId === id
    : selection.mode === 'multiple' && selection.selectedIds.includes(id);
}

function transition(transition: ListboxTransition): ListboxComponentAction {
  return { kind: 'transition', transition };
}

function activate(entry: ListEntryModel): ListboxComponentAction {
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

function searchableText(value: string): string {
  return cleanLine(value).trim();
}

function nonNegativeSafeInteger(value: unknown, subject: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${subject} must be a non-negative safe integer.`);
  }
  return value;
}

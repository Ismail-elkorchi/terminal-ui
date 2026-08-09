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
import { isNonArrayObject } from '../../foundation/validation.ts';
import type { RoutedPointerEvent } from '../../input/pointer.ts';
import { pointerVisualState } from '../../interaction/pointer-interaction.ts';
import type { PointerInteractionState } from '../../interaction/pointer-interaction.ts';
import type { ScrollPolicy, ScrollState } from '../../interaction/scroll.ts';
import type { ScrollbarOptions } from '../../interaction/scrollbar.ts';
import { measureTextCells, sanitizeTerminalText } from '../../text/index.ts';
import { terminalStyleHasBackground } from '../../theme/index.ts';
import type { ListAction } from '../../ui-model/list.ts';
import type { DataListStylePart } from '../../ui-model/style-parts.ts';
import type { RenderSpan, TerminalStyle } from '../../visual/render.ts';
import type { ListOptions, PassiveListOptions, ScrollableListOptions } from '../options/content.ts';

interface PreparedListEntry {
  readonly id: string;
  readonly itemIndex: number;
  readonly position: number;
  readonly label: string;
  readonly description?: string;
  readonly disabled: boolean;
}

interface PreparedList {
  readonly entries: readonly PreparedListEntry[];
  readonly startIndex: number;
  readonly totalCount: number;
  readonly windowed: boolean;
  readonly query: string;
  readonly selectedId?: string;
  readonly scroll?: ScrollState;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
  readonly pointerState?: PointerInteractionState;
}

interface DynamicListOptions {
  readonly items?: unknown;
  readonly projectItem?: unknown;
  readonly collection?: unknown;
  readonly filterQuery?: unknown;
  readonly selectedId?: unknown;
  readonly scroll?: unknown;
  readonly scrollbar?: unknown;
  readonly scrollPolicy?: unknown;
  readonly pointerState?: unknown;
}

const listDefinitionBase = {
  name: 'terminal-ui/components/list' as const,
  identity: 'required' as const,
  structure: 'leaf' as const,
  semantics: 'semantic' as const,
  optionFields: {
    items: null,
    projectItem: null,
    collection: null,
    filterQuery: null,
    selectedId: null,
    scroll: null,
    scrollbar: null,
    scrollPolicy: null,
    pointerState: null,
  },
  metadata: ['focus', 'layer', 'styles'] as const,
  parts: ['marker', 'item', 'description', 'match', 'empty', 'scrollbar'] as const,
  prepare: prepareList,
  measure: measureList,
  render: renderList,
  accessibility: accessibleList,
};

const passiveList = defineComponent<
  DynamicListOptions,
  PreparedList,
  never,
  DataListStylePart,
  readonly [],
  'required',
  readonly ['focus', 'layer', 'styles']
>(listDefinitionBase);

const interactiveList = defineComponent<
  DynamicListOptions,
  PreparedList,
  ListAction,
  DataListStylePart,
  readonly [],
  'required',
  readonly ['focus', 'layer', 'styles']
>({
  ...listDefinitionBase,
  pointer: { state: ({ model }) => model.pointerState, onAction: () => ignoreMessage() },
  keys({ model }) {
    const selected = selectedEntry(model);
    return {
      arrowUp: () => ({ kind: 'move', delta: -1 }),
      arrowDown: () => ({ kind: 'move', delta: 1 }),
      pageUp: () => ({ kind: 'page', delta: -1 }),
      pageDown: () => ({ kind: 'page', delta: 1 }),
      home: () => ({ kind: 'first' }),
      end: () => ({ kind: 'last' }),
      ...(selected === undefined || selected.disabled
        ? {}
        : { enter: () => ({ kind: 'activate', id: selected.id, itemIndex: selected.itemIndex }) }),
    };
  },
  focusTargets(input) {
    const plan = listPlan(input.model, input.bounds);
    const selected = plan.rows.findIndex((entry) => entry.id === input.model.selectedId);
    return [{
      id: 'self',
      bounds: plan.scrollbar.contentBounds,
      ...(selected < 0 ? {} : {
        cursor: {
          row: plan.scrollbar.contentBounds.row + selected,
          column: plan.scrollbar.contentBounds.column,
        },
      }),
    }];
  },
  hitTargets(input) {
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
            event.clickCount === 2
              ? { kind: 'activate' as const, id: entry.id, itemIndex: entry.itemIndex }
              : { kind: 'select' as const, id: entry.id, itemIndex: entry.itemIndex },
        }]
      ),
      ...(input.model.scroll === undefined ? [] : componentScrollbarHitTargets<ListAction>({
        id: input.id ?? 'list',
        plan: plan.scrollbar,
        ...(input.model.scrollPolicy === undefined ? {} : { policy: input.model.scrollPolicy }),
        onScroll: (event) => ({ kind: 'scroll' as const, event }),
      })),
    ];
  },
});

export function list<TValue, const TMessage extends ComponentMessage = never>(
  options: ScrollableListOptions<TValue, TMessage>,
): Element<TMessage>;
// The passive overload intentionally exposes ListControlAction instead of the scroll-capable ListAction.
export function list<TValue, const TMessage extends ComponentMessage = never>(
  // eslint-disable-next-line @typescript-eslint/unified-signatures
  options: PassiveListOptions<TValue, TMessage>,
): Element<TMessage>;
export function list<TValue, const TMessage extends ComponentMessage = never>(
  options: ListOptions<TValue, TMessage>,
): Element<TMessage> {
  const dynamic = snapshotListOptions(options);
  const onAction = options.onAction;
  if (onAction === undefined) {
    return passiveList({
      ...dynamic,
      id: options.id,
      ...(options.meta === undefined ? {} : { meta: options.meta }),
    });
  }
  if (options.scroll === undefined) {
    return interactiveList({
      ...dynamic,
      id: options.id,
      ...(options.meta === undefined ? {} : { meta: options.meta }),
      onAction: (action) =>
        action.kind === 'scroll' ? ignoreMessage() : onAction(action),
    });
  }
  return interactiveList({
    ...dynamic,
    id: options.id,
    ...(options.meta === undefined ? {} : { meta: options.meta }),
    onAction: options.onAction,
  });
}

function snapshotListOptions<TValue>(
  options: ListOptions<TValue, ComponentMessage>,
): DynamicListOptions {
  return { ...options };
}

function prepareList(value: unknown): PreparedList {
  if (!isNonArrayObject(value)) throw new TypeError('list options must be an object.');
  const rawItems = value['items'];
  const rawProjector = value['projectItem'];
  const rawCollection = value['collection'];
  const dataForms = Number(rawItems !== undefined || rawProjector !== undefined) +
    Number(rawCollection !== undefined);
  if (dataForms !== 1) {
    throw new TypeError('list requires either items with projectItem, or collection.');
  }
  const projected = rawCollection === undefined
    ? prepareProjectedItems(rawItems, rawProjector)
    : prepareProjectedCollection(rawCollection);
  const requestedQuery = value['filterQuery'];
  if (requestedQuery !== undefined && typeof requestedQuery !== 'string') {
    throw new TypeError('list filterQuery must be a string.');
  }
  if (projected.windowed && requestedQuery !== undefined) {
    throw new TypeError('Windowed list collections own their filter query.');
  }
  const query = projected.windowed ? projected.query : normalizedQuery(requestedQuery ?? '');
  const entries = preparedListEntries(projected, query);
  const selectedId = optionalCleanString(value['selectedId'], 'list selectedId');
  const scroll = prepareComponentScrollState(value['scroll'], 'list scroll');
  const scrollbar = prepareComponentScrollbarOptions(value['scrollbar'], 'list scrollbar');
  const scrollPolicy = prepareComponentScrollPolicy(value['scrollPolicy'], 'list scrollPolicy');
  const pointerState = preparePointerState(value['pointerState']);
  if (scroll === undefined && (scrollbar !== undefined || scrollPolicy !== undefined)) {
    throw new TypeError('list scrollbar and scrollPolicy require scroll state.');
  }
  return {
    entries,
    startIndex: projected.windowed ? projected.startIndex : 0,
    totalCount: projected.windowed ? projected.totalCount : entries.length,
    windowed: projected.windowed,
    query,
    ...(selectedId === undefined ? {} : { selectedId }),
    ...(scroll === undefined ? {} : { scroll }),
    ...(scrollbar === undefined ? {} : { scrollbar }),
    ...(scrollPolicy === undefined ? {} : { scrollPolicy }),
    ...(pointerState === undefined ? {} : { pointerState }),
  };
}

interface ProjectedListData {
  readonly entries:
    readonly (Omit<PreparedListEntry, 'position'> & { readonly searchText: string })[];
  readonly windowed: boolean;
  readonly startIndex: number;
  readonly totalCount: number;
  readonly query: string;
}

const preparedListCollections = new WeakMap<object, ProjectedListData>();
const preparedListEntryViews = new WeakMap<
  object,
  { readonly query: string; readonly entries: readonly PreparedListEntry[] }
>();

function preparedListEntries(
  projected: ProjectedListData,
  query: string,
): readonly PreparedListEntry[] {
  const cached = preparedListEntryViews.get(projected);
  if (cached?.query === query) return cached.entries;
  const visible = projected.windowed || query.length === 0
    ? projected.entries
    : projected.entries.filter((entry) => entry.searchText.includes(query));
  const entries = Object.freeze(visible.map((entry, position): PreparedListEntry =>
    Object.freeze({
      id: entry.id,
      itemIndex: entry.itemIndex,
      position: projected.windowed ? entry.itemIndex : position,
      label: entry.label,
      ...(entry.description === undefined ? {} : { description: entry.description }),
      disabled: entry.disabled,
    })
  ));
  preparedListEntryViews.set(projected, Object.freeze({ query, entries }));
  return entries;
}

function prepareProjectedItems(items: unknown, projector: unknown): ProjectedListData {
  if (!Array.isArray(items) || !isListProjector(projector)) {
    throw new TypeError('list items must be an array and projectItem must be a function.');
  }
  return {
    entries: prepareEntries(items.map((item, index) => {
      const projected = projector(item, index);
      return {
        id: isNonArrayObject(projected) ? projected['id'] : undefined,
        itemIndex: index,
        item: projected,
      };
    })),
    windowed: false,
    startIndex: 0,
    totalCount: items.length,
    query: '',
  };
}

function isListProjector(value: unknown): value is (item: unknown, index: number) => unknown {
  return typeof value === 'function';
}

function prepareProjectedCollection(value: unknown): ProjectedListData {
  if (!isCollectionProjection(value)) {
    throw new TypeError('list collection must be prepared with prepareListCollection().');
  }
  const cached = preparedListCollections.get(value);
  if (cached !== undefined) return cached;
  const kind = value.kind;
  const supported = kind === 'complete'
    ? new Set(['kind', 'records', 'startIndex', 'totalCount'])
    : new Set(['kind', 'records', 'startIndex', 'totalCount', 'domain']);
  const unsupported = Object.keys(value).find((field) => !supported.has(field));
  if (unsupported !== undefined) {
    throw new TypeError(`list collection contains unknown field "${unsupported}".`);
  }
  const startIndex = nonNegativeSafeInteger(value.startIndex, 'list collection startIndex');
  const totalCount = nonNegativeSafeInteger(value.totalCount, 'list collection totalCount');
  if (kind === 'complete' && (startIndex !== 0 || totalCount !== value.records.length)) {
    throw new RangeError('Complete list collection indexes are inconsistent.');
  }
  if (
    kind === 'window' &&
    (startIndex > totalCount || value.records.length > totalCount - startIndex)
  ) {
    throw new RangeError('Windowed list collection records exceed its declared range.');
  }
  const query = kind === 'window' ? prepareCollectionDomain(value.domain) : '';
  const prepared = Object.freeze({
    entries: prepareEntries(value.records),
    windowed: kind === 'window',
    startIndex,
    totalCount,
    query,
  });
  preparedListCollections.set(value, prepared);
  return prepared;
}

function prepareCollectionDomain(value: unknown): string {
  if (!isNonArrayObject(value)) {
    throw new TypeError('Windowed list collection domain must be an object.');
  }
  if (value['kind'] === 'source') {
    if (Object.keys(value).some((field) => field !== 'kind')) {
      throw new TypeError('Source collection domain contains unknown fields.');
    }
    return '';
  }
  if (value['kind'] !== 'projection') {
    throw new TypeError('Windowed list collection domain kind is invalid.');
  }
  const unsupported = Object.keys(value).find((field) =>
    field !== 'kind' && field !== 'id' && field !== 'filterQuery' && field !== 'sort'
  );
  if (unsupported !== undefined) {
    throw new TypeError(`Windowed list collection domain contains unknown field "${unsupported}".`);
  }
  if (typeof value['id'] !== 'string' || value['id'].trim() === '') {
    throw new TypeError('Projected collection domain id must be non-empty.');
  }
  if (value['sort'] !== undefined) prepareCollectionSort(value['sort']);
  return normalizedQuery(
    value['filterQuery'] === undefined
      ? ''
      : requiredString(value['filterQuery'], 'collection domain filterQuery'),
  );
}

function prepareCollectionSort(value: unknown): void {
  if (
    !isNonArrayObject(value) ||
    Object.keys(value).some((field) => field !== 'key' && field !== 'direction') ||
    typeof value['key'] !== 'string' ||
    value['key'].trim() === '' ||
    value['direction'] !== 'ascending' && value['direction'] !== 'descending'
  ) {
    throw new TypeError('Projected collection domain sort is invalid.');
  }
}

function prepareEntries(
  records: readonly unknown[],
): readonly (Omit<PreparedListEntry, 'position'> & { readonly searchText: string })[] {
  const ids = new Set<string>();
  return Object.freeze(records.map((record, offset) => {
    if (!isNonArrayObject(record)) {
      throw new TypeError(`list record ${String(offset)} must be an object.`);
    }
    const unsupported = Object.keys(record).find((field) =>
      field !== 'id' && field !== 'itemIndex' && field !== 'value' && field !== 'item'
    );
    if (unsupported !== undefined) {
      throw new TypeError(`list record contains unknown field "${unsupported}".`);
    }
    const itemIndex = nonNegativeSafeInteger(record['itemIndex'], 'list record itemIndex');
    const item = prepareListItem(record['item']);
    const recordId = requiredCleanString(record['id'], 'list record id');
    if (recordId !== item.id) throw new TypeError('list record and projected item ids must match.');
    if (ids.has(recordId)) {
      throw new TypeError(`list item ids must be unique; duplicate id: ${recordId}`);
    }
    ids.add(recordId);
    return Object.freeze({
      id: recordId,
      itemIndex,
      label: item.label,
      ...(item.description === undefined ? {} : { description: item.description }),
      disabled: item.disabled,
      searchText: item.searchText,
    });
  }));
}

function prepareListItem(value: unknown): {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly disabled: boolean;
  readonly searchText: string;
} {
  if (!isNonArrayObject(value)) throw new TypeError('list projected item must be an object.');
  const unsupported = Object.keys(value).find((field) =>
    field !== 'id' && field !== 'label' && field !== 'description' && field !== 'keywords' &&
    field !== 'disabled'
  );
  if (unsupported !== undefined) {
    throw new TypeError(`list projected item contains unknown field "${unsupported}".`);
  }
  const id = requiredCleanString(value['id'], 'list item id');
  const label = requiredString(value['label'], 'list item label');
  const description = optionalString(value['description'], 'list item description');
  const keywords = value['keywords'] === undefined
    ? []
    : Array.isArray(value['keywords'])
    ? value['keywords'].map((entry) => requiredString(entry, 'list item keyword'))
    : undefined;
  if (keywords === undefined) {
    throw new TypeError('list item keywords must be an array of strings.');
  }
  if (value['disabled'] !== undefined && typeof value['disabled'] !== 'boolean') {
    throw new TypeError('list item disabled must be a boolean.');
  }
  const cleanLabel = cleanLine(label);
  const cleanDescription = description === undefined ? undefined : cleanLine(description);
  return {
    id,
    label: cleanLabel,
    ...(cleanDescription === undefined ? {} : { description: cleanDescription }),
    disabled: value['disabled'] === true,
    searchText: normalizedQuery(
      [cleanLabel, cleanDescription, ...keywords].filter(Boolean).join(' '),
    ),
  };
}

function measureList(
  { model, widthProfile }: {
    readonly model: PreparedList;
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

function renderList(
  input: import('../../component/index.ts').ComponentRenderInput<PreparedList, DataListStylePart>,
): void {
  const plan = listPlan(input.model, input.bounds);
  if (plan.rows.length === 0 && plan.scrollbar.contentBounds.height > 0) {
    const emptyStyle = input.style({
      part: 'empty',
      base: { fg: { kind: 'theme', token: 'text.muted' }, dim: true },
    });
    input.target.write(0, 0, [{
      text: input.model.query.length === 0 ? 'No items' : 'No matching items',
      ...(emptyStyle === undefined ? {} : { style: emptyStyle }),
      source: input.source({
        cellRole: 'text',
        partName: 'empty',
        partType: 'text',
        description: input.model.query.length === 0 ? 'empty' : 'filter.empty',
      }),
    }]);
  }
  for (const [row, entry] of plan.rows.entries()) {
    const selected = entry.id === input.model.selectedId;
    const pointer = pointerVisualState(
      input.model.pointerState,
      `${input.id ?? 'list'}:option:${entry.id}`,
    );
    const state = entry.disabled ? 'disabled' : pointer ?? (selected ? 'selected' : undefined);
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
      ...highlightedListLabel(entry.label, input.model.query, itemStyle, input, entry, state),
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

function accessibleList(
  input: import('../../component/index.ts').ComponentAccessibilityInput<PreparedList>,
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
      selected: entry.id === input.model.selectedId,
      disabled: entry.disabled,
      position: { positionInSet: entry.position + 1, setSize: input.model.totalCount },
    })),
  };
}

function listPlan(model: PreparedList, bounds: import('../../geometry/types.ts').Rect) {
  const selected = selectedEntry(model);
  const base = model.scroll === undefined
    ? selected === undefined
      ? createScrollState({
        contentRows: model.totalCount,
        viewportRows: bounds.height,
        viewportColumns: bounds.width,
      })
      : scrollReducer(
        createScrollState({
          contentRows: model.totalCount,
          viewportRows: bounds.height,
          viewportColumns: bounds.width,
        }),
        { kind: 'itemIntoView', itemIndex: selected.position },
      )
    : normalizeScrollState({ ...model.scroll, contentRows: model.totalCount });
  const scrollbar = prepareComponentScrollbar({
    bounds,
    scroll: base,
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
  query: string,
  base: TerminalStyle | undefined,
  input: import('../../component/index.ts').ComponentRenderInput<PreparedList, DataListStylePart>,
  entry: PreparedListEntry,
  state: import('../../element/metadata.ts').ElementVisualState | undefined,
): readonly RenderSpan[] {
  const sourceState = state === 'default' ? undefined : state;
  const index = query.length === 0 ? -1 : label.toLocaleLowerCase().indexOf(query);
  if (index < 0) {
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
    label.slice(0, index),
    label.slice(index, index + query.length),
    label.slice(index + query.length),
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

function selectedEntry(model: PreparedList): PreparedListEntry | undefined {
  return model.selectedId === undefined
    ? undefined
    : model.entries.find((entry) => entry.id === model.selectedId);
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

function preparePointerState(value: unknown): PointerInteractionState | undefined {
  if (value === undefined) return undefined;
  if (
    !isNonArrayObject(value) ||
    Object.keys(value).some((field) => field !== 'hoveredTargetId' && field !== 'pressedTargetId')
  ) {
    throw new TypeError('list pointerState is invalid.');
  }
  const hoveredTargetId = value['hoveredTargetId'];
  const pressedTargetId = value['pressedTargetId'];
  if (
    hoveredTargetId !== undefined && typeof hoveredTargetId !== 'string' ||
    pressedTargetId !== undefined && typeof pressedTargetId !== 'string'
  ) {
    throw new TypeError('list pointerState values must be strings.');
  }
  return Object.freeze({
    ...(hoveredTargetId === undefined ? {} : { hoveredTargetId }),
    ...(pressedTargetId === undefined ? {} : { pressedTargetId }),
  });
}

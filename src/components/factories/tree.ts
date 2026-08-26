import {
  clipRenderSpans,
  componentScrollbarHitTargets,
  defineComponent,
  ignoreMessage,
  measureRenderSpans,
  paintComponentScrollbar,
  layoutComponentScrollbar,
  decodeComponentScrollbarOptions,
  decodeComponentScrollPolicy,
  decodeComponentScrollState,
  span,
} from '../../component/index.ts';
import type {
  ComponentMessage,
  ComponentInput,
  ComponentMeasureInput,
  ComponentRenderInput,
} from '../../component/index.ts';
import type { HitTarget } from '../../component/index.ts';
import type { Element } from '../../element/index.ts';
import { isTreeView, visibleRowWindow } from '../../behavior/index.ts';
import type { CollectionSnapshot } from '../../collection/snapshot.ts';
import {
  assertOptionalCallback,
  assertRequiredCallback,
  isNonArrayObject,
  isStringMember,
} from '../../foundation/validation.ts';
import {
  pointerVisualState,
} from '../../interaction/pointer-interaction.ts';
import type { ScrollPolicy, ScrollState } from '../../interaction/scroll.ts';
import type { ScrollbarOptions } from '../../interaction/scrollbar.ts';
import { measureTextCells, sanitizeTerminalText } from '../../text/index.ts';
import { terminalStyleHasBackground } from '../../theme/index.ts';
import type {
  TreeActivateEvent,
  TreeTransition,
} from '../../behavior/tree.ts';
import type {
  TreeCollectionRow,
  TreeLoadStatus,
  TreeNode,
  TreeVisibleRow,
} from '../../behavior/tree.ts';
import { decodeSelectionState, type SelectionState } from '../../interaction/collection-interaction.ts';
import type { TreeStylePart } from '../style-parts.ts';
import { matchCompiledCollectionQuery, compileCollectionQuery, indexQueryCandidate } from '../../text/query.ts';
import type { CompiledCollectionQuery } from '../../text/query.ts';
import type { RenderSpan, TerminalStyle } from '../../visual/render-content.ts';
import type {
  UnscrolledTreeOptions,
  ScrollableTreeOptions,
  TreeOptions,
} from '../options/content-and-collections.ts';
import { inspectSelection } from '../internal/inspection.ts';

interface TreeRow {
  readonly id: string;
  readonly itemIndex: number;
  readonly label: string;
  readonly depth: number;
  readonly path: readonly string[];
  readonly kind: 'leaf' | 'branch' | 'lazy';
  readonly expanded: boolean;
  readonly disabled: boolean;
  readonly lazyPlaceholder: boolean;
  readonly description?: string;
  readonly icon?: string;
}

interface TreeModel {
  readonly source: Readonly<Record<string, never>>;
  readonly startIndex: number;
  readonly totalCount: number;
  readonly query: CompiledCollectionQuery;
  readonly activeId?: string;
  readonly selection: SelectionState;
  readonly emptyText: string;
  readonly scroll?: ScrollState;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
}

interface TreeSource {
  readonly rows: readonly TreeRow[];
  readonly indexes: ReadonlyMap<string, number>;
}

const treeSources = new WeakMap<object, TreeSource>();
const treeSourcesByCollection = new WeakMap<object, TreeSource>();

const treeBase = {
  name: 'terminal-ui/components/tree' as const,
  identity: 'required' as const,
  structure: 'leaf' as const,
  semantics: 'semantic' as const,
  accessibleRole: 'tree' as const,
  metadata: ['focus', 'layer', 'styles'] as const,
  states: ['disabled', 'busy', 'inert'] as const,
  parts: [
    'marker',
    'indent',
    'disclosure',
    'icon',
    'label',
    'metadata',
    'match',
    'placeholder',
    'empty',
    'scrollbarTrack', 'scrollbarThumb',
  ] as const,
  visualStates: ['focused', 'hovered', 'pressed', 'active', 'selected', 'disabled', 'busy'] as const,
  measure: measureTree,
  render: paintTree,
  accessibility: treeAccessibility,
  inspection: ({ model }: { readonly model: Readonly<TreeModel> }) => ({
    ...(model.activeId === undefined ? {} : { active: model.activeId }),
    selection: inspectSelection(model.selection),
    collection: {
      startIndex: model.startIndex,
      totalCount: model.totalCount,
      visibleCount: treeSourceFor(model).rows.length,
    },
  }),
};

type TreeComponentAction =
  | { readonly kind: 'transition'; readonly transition: TreeTransition }
  | { readonly kind: 'activate'; readonly event: TreeActivateEvent };

const activeTree = defineComponent<
  TreeModel,
  TreeModel,
  TreeComponentAction,
  TreeStylePart,
  readonly ['disabled', 'busy', 'inert'],
  'required',
  readonly ['focus', 'layer', 'styles'],
  readonly ['focused', 'hovered', 'pressed', 'active', 'selected', 'disabled', 'busy']
>({
  ...treeBase,
  keys: ({ model, busy }) => {
    if (busy) return {};
    const row = activeTreeRow(model);
    return {
      arrowUp: () => treeTransition({ kind: 'moveActive', delta: -1 }),
      arrowDown: () => treeTransition({ kind: 'moveActive', delta: 1 }),
      ...(row === undefined ? {} : {
        ...(row.kind === 'leaf' || row.expanded
          ? {}
          : { arrowRight: () => treeTransition({ kind: 'expand', id: row.id }) }),
        ...(row.kind === 'leaf' || !row.expanded
          ? {}
          : { arrowLeft: () => treeTransition({ kind: 'collapse', id: row.id }) }),
        space: () => treeTransition({ kind: 'commitActive' }),
        enter: () => ({ kind: 'activate' as const, event: { kind: 'activate' as const, id: row.id } }),
      }),
    };
  },
  focusTargets(input) {
    const plan = treePlan(input);
    return [{
      id: 'self',
      bounds: input.bounds,
      ...(plan.activeVisibleIndex === undefined
        ? {}
        : { cursor: { row: plan.activeVisibleIndex, column: 0 } }),
    }];
  },
  hitTargets: treeHitTargets,
});

export function tree<
  TMetadata extends Readonly<Record<string, unknown>>,
  const TTransitionMessage extends ComponentMessage = never,
  const TActivateMessage extends ComponentMessage = never,
>(options: ScrollableTreeOptions<TMetadata, TTransitionMessage, TActivateMessage>): Element<TTransitionMessage | TActivateMessage>;
// The passive overload intentionally excludes scroll actions.
export function tree<
  TMetadata extends Readonly<Record<string, unknown>>,
  const TTransitionMessage extends ComponentMessage = never,
  const TActivateMessage extends ComponentMessage = never,
>(
  // eslint-disable-next-line @typescript-eslint/unified-signatures
  options: UnscrolledTreeOptions<TMetadata, TTransitionMessage, TActivateMessage>
): Element<TTransitionMessage | TActivateMessage>;
export function tree<
  TMetadata extends Readonly<Record<string, unknown>>,
  const TTransitionMessage extends ComponentMessage = never,
  const TActivateMessage extends ComponentMessage = never,
>(options: TreeOptions<TMetadata, TTransitionMessage, TActivateMessage>): Element<TTransitionMessage | TActivateMessage> {
  const model = createTreeModel(options);
  const shared = {
    ...model,
    id: options.id,
    ...(options.busy === undefined ? {} : { busy: options.busy }),
    ...(options.styles === undefined ? {} : { styles: options.styles }),
    ...(options.meta === undefined ? {} : { meta: options.meta }),
  };
  if (options.disabled === true) return activeTree({
    ...shared,
    disabled: true,
    ...(options.inert === undefined ? {} : { inert: options.inert }),
  });
  if (options.inert === true) return activeTree({ ...shared, inert: true });
  assertRequiredCallback(options.onTransition, 'tree onTransition');
  assertOptionalCallback(options.onActivate, 'tree onActivate');
  return activeTree({
    ...shared,
    onAction: (action) => {
      if (action.kind === 'activate') return options.onActivate?.(action.event) ?? ignoreMessage();
      if (isScrollableTreeOptions(options)) return options.onTransition(action.transition);
      return action.transition.kind === 'scroll'
        ? ignoreMessage()
        : options.onTransition(action.transition);
    },
  });
}

function createTreeModel<
  TMetadata extends Readonly<Record<string, unknown>>,
  TTransitionMessage extends ComponentMessage,
  TActivateMessage extends ComponentMessage,
>(
  value: Readonly<TreeOptions<TMetadata, TTransitionMessage, TActivateMessage>>,
): TreeModel {
  const query = compileCollectionQuery(
    value.state.query ?? { text: '', mode: 'contains' },
  );
  if (!isTreeView(value.view)) {
    throw new TypeError('tree view must be created with createTreeView().');
  }
  const collection = value.view.collection as CollectionSnapshot<TreeCollectionRow<TMetadata>>;
  const startIndex = collection.startIndex;
  const totalCount = collection.totalCount;
  const sourceToken = Object.freeze({});
  treeSources.set(sourceToken, treeSourceForCollection(collection));
  const scroll = decodeComponentScrollState(value.state.scroll, 'tree scroll');
  const scrollbar = decodeComponentScrollbarOptions(value.scrollbar, 'tree scrollbar');
  const scrollPolicy = decodeComponentScrollPolicy(value.scrollPolicy, 'tree scrollPolicy');
  if (scroll === undefined && (scrollbar !== undefined || scrollPolicy !== undefined)) {
    throw new TypeError('tree scrollbar and scrollPolicy require scroll state.');
  }
  const activeId = value.state.activeId === undefined
    ? undefined
    : nonEmpty(value.state.activeId, 'tree activeId');
  return {
    source: sourceToken,
    startIndex,
    totalCount,
    query,
    ...(activeId === undefined ? {} : { activeId }),
    selection: decodeSelectionState(value.state.selection, 'tree selection'),
    emptyText: text(value.emptyText, 'tree emptyText') ?? 'No items',
    ...(scroll === undefined ? {} : { scroll }),
    ...(scrollbar === undefined ? {} : { scrollbar }),
    ...(scrollPolicy === undefined ? {} : { scrollPolicy }),
  };
}

function isScrollableTreeOptions<
  TMetadata extends Readonly<Record<string, unknown>>,
  TTransitionMessage extends ComponentMessage,
  TActivateMessage extends ComponentMessage,
>(
  options: TreeOptions<TMetadata, TTransitionMessage, TActivateMessage>,
): options is ScrollableTreeOptions<TMetadata, TTransitionMessage, TActivateMessage> {
  return options.state.scroll !== undefined;
}

function treeSourceForCollection<
  TMetadata extends Readonly<Record<string, unknown>>,
>(
  collection: CollectionSnapshot<TreeCollectionRow<TMetadata>>,
): TreeSource {
  const cached = treeSourcesByCollection.get(collection);
  if (cached !== undefined) return cached;
  const rows = Object.freeze(collection.items.map((item, index) => {
    const row = decodeTreeRow(
      item.row,
      item.itemIndex,
    );
    if (row.id !== item.id) {
      throw new TypeError(`tree collection item ${String(index)} id does not match its row.`);
    }
    return row;
  }));
  const source = Object.freeze({
    rows,
    indexes: new Map(rows.map((row) => [row.id, row.itemIndex])),
  });
  treeSourcesByCollection.set(collection, source);
  return source;
}

function decodeTreeRow<
  TMetadata extends Readonly<Record<string, unknown>>,
>(value: TreeVisibleRow<TMetadata>, itemIndex: number): TreeRow {
  if (!isNonArrayObject(value)) throw new TypeError('tree collection row is invalid.');
  const node = decodeVisibleTreeNode(value.node, 'tree collection row.node');
  const depth = nonNegative(value.depth, 'tree row depth');
  const path = value.path;
  if (!Array.isArray(path) || path.some((part) => typeof part !== 'string')) {
    throw new TypeError('tree row path must be a string array.');
  }
  const lazyPlaceholder = value.lazyPlaceholder;
  if (lazyPlaceholder !== undefined && typeof lazyPlaceholder !== 'boolean') {
    throw new TypeError('tree row lazyPlaceholder must be a boolean.');
  }
  return treeRow({
    node,
    depth,
    path: path.map((part) => sanitizeTerminalText(part as string).text),
    expanded: boolean(value.expanded, 'tree row expanded'),
    ...(value.loadStatus === undefined ? {} : { loadStatus: decodeTreeLoadStatus(value.loadStatus) }),
    ...(lazyPlaceholder === true ? { lazyPlaceholder: true } : {}),
  }, itemIndex);
}

function decodeVisibleTreeNode(value: TreeNode, owner: string): TreeNode {
  if (!isNonArrayObject(value)) throw new TypeError(`${owner} must be an object.`);
  const kind = value.kind;
  if (!isStringMember(kind, ['leaf', 'branch', 'lazy'])) {
    throw new TypeError(`${owner}.kind is invalid.`);
  }
  const base = {
    id: nonEmpty(value.id, `${owner}.id`),
    label: text(value.label, `${owner}.label`) ?? '',
    ...(value.description === undefined
      ? {}
      : { description: text(value.description, `${owner}.description`) ?? '' }),
    ...(value.disabled === undefined
      ? {}
      : { disabled: boolean(value.disabled, `${owner}.disabled`) }),
    ...(value.icon === undefined ? {} : { icon: text(value.icon, `${owner}.icon`) ?? '' }),
  };
  if (kind === 'leaf') return { ...base, kind };
  if (kind === 'branch') {
    if (!Array.isArray(value.children)) {
      throw new TypeError(`${owner}.children must be an array.`);
    }
    return { ...base, kind, children: [] };
  }
  return { ...base, kind };
}

function decodeTreeLoadStatus(value: TreeLoadStatus): TreeLoadStatus {
  if (!isNonArrayObject(value) || !isStringMember(value.kind, ['idle', 'pending', 'error', 'empty'])) {
    throw new TypeError('tree load state is invalid.');
  }
  const kind = value.kind;
  const message = 'message' in value ? text(value.message, 'tree load state message') : undefined;
  switch (kind) {
    case 'idle': {
      if (message !== undefined) {
        throw new TypeError('tree lazy idle state cannot define a message.');
      }
      return { kind };
    }
    case 'pending':
      return { kind, ...(message === undefined ? {} : { message }) };
    case 'error': {
      if (message === undefined) throw new TypeError('tree lazy error requires a message.');
      return { kind, message };
    }
    case 'empty':
      return { kind, ...(message === undefined ? {} : { message }) };
  }
}

function treeRow(value: TreeVisibleRow, itemIndex: number): TreeRow {
  return {
    id: value.node.id,
    itemIndex,
    label: value.node.label,
    depth: value.depth,
    path: value.path,
    kind: value.node.kind,
    expanded: value.expanded,
    disabled: value.node.disabled === true,
    lazyPlaceholder: value.lazyPlaceholder === true,
    ...(value.node.description === undefined ? {} : { description: value.node.description }),
    ...(value.node.icon === undefined ? {} : { icon: value.node.icon }),
  };
}

function treeGeometry(input: ComponentInput<TreeModel>) {
  const scroll = input.model.scroll ??
    {
      offsetRow: 0,
      offsetColumn: 0,
      followTail: false,
    };
  return layoutComponentScrollbar({
    bounds: input.bounds,
    scroll,
    contentRows: input.model.totalCount,
    contentColumns: input.bounds.width,
    ...(input.model.scrollbar === undefined ? {} : { options: input.model.scrollbar }),
    defaultAxis: 'vertical',
  });
}

function treePlan(input: ComponentInput<TreeModel>) {
  const source = treeSourceFor(input.model);
  const geometry = treeGeometry(input);
  const activeIndex = input.model.activeId === undefined
    ? undefined
    : source.indexes.get(input.model.activeId);
  const requested = visibleRowWindow({
    totalRows: input.model.totalCount,
    viewportRows: geometry.contentBounds.height,
    ...(activeIndex === undefined ? {} : { activeIndex }),
    ...(input.model.scroll === undefined ? {} : {
      scroll: input.model.scroll,
    }),
  });
  const availableEnd = input.model.startIndex + source.rows.length;
  const lastStart = Math.max(
    input.model.startIndex,
    availableEnd - Math.min(geometry.contentBounds.height, source.rows.length),
  );
  const startIndex = Math.max(input.model.startIndex, Math.min(lastStart, requested.startIndex));
  const localStart = startIndex - input.model.startIndex;
  const rows = Array.from(
    { length: Math.min(geometry.contentBounds.height, source.rows.length - localStart) },
    (_unused, offset) => treeRowAt(input.model, localStart + offset),
  );
  const activeVisibleIndex = activeIndex === undefined || activeIndex < startIndex ||
      activeIndex >= startIndex + rows.length
    ? undefined
    : activeIndex - startIndex;
  return {
    geometry,
    rows,
    startIndex,
    endIndexExclusive: startIndex + rows.length,
    activeVisibleIndex,
  };
}

function measureTree(input: ComponentMeasureInput<TreeModel>) {
  const source = treeSourceFor(input.model);
  const sampleSize = Math.min(64, source.rows.length);
  let preferredWidth = 1;
  for (let localIndex = 0; localIndex < sampleSize; localIndex += 1) {
    const row = treeRowAt(input.model, localIndex);
    preferredWidth = Math.max(
      preferredWidth,
      4 + row.depth * 2 +
        measureTextCells(`${row.icon === undefined ? '' : `${row.icon} `}${row.label}`, {
          widthProfile: input.widthProfile,
        }).cells,
    );
  }
  return {
    minWidth: 1,
    minHeight: 1,
    preferredWidth,
    preferredHeight: Math.max(1, input.model.totalCount),
  };
}

function paintTree(input: ComponentRenderInput<TreeModel, TreeStylePart>) {
  const plan = treePlan(input);
  if (treeSourceFor(input.model).rows.length === 0) {
    const style = input.style({
      part: 'empty',
      base: { fg: { kind: 'theme', token: 'text.muted' }, dim: true },
    });
    input.target.write(0, 0, [
      span(input.model.emptyText, {
        ...(style === undefined ? {} : { style }),
        source: input.frameSource({
          partName: 'empty',
          partType: 'empty',
          description: 'empty',
          cellRole: 'text',
        }),
      }),
    ]);
    return;
  }
  plan.rows.forEach((row, visibleIndex) => {
    paintTreeRow(input, row, visibleIndex, plan.geometry.contentBounds.width);
  });
  paintComponentScrollbar({
    target: input.target,
    plan: plan.geometry,
    theme: input.theme,
    style: (part, state, base) => input.style({ part, base, ...(state === undefined ? {} : { states: [state] }) }),
    frameSource: (sourceInput) => input.frameSource(sourceInput),
  });
}

function treeSourceFor(model: TreeModel): TreeSource {
  const source = treeSources.get(model.source);
  if (source === undefined) throw new TypeError('tree render source is unavailable.');
  return source;
}

function treeRowAt(model: TreeModel, localIndex: number): TreeRow {
  const source = treeSourceFor(model);
  const row = source.rows[localIndex];
  if (row === undefined) throw new RangeError('tree row index is outside the tree source.');
  return row;
}

function activeTreeRow(model: TreeModel): TreeRow | undefined {
  if (model.activeId === undefined) return undefined;
  const source = treeSourceFor(model);
  const itemIndex = source.indexes.get(model.activeId);
  if (itemIndex === undefined) return undefined;
  return treeRowAt(model, itemIndex - model.startIndex);
}

function paintTreeRow(
  input: ComponentRenderInput<TreeModel, TreeStylePart>,
  row: TreeRow,
  visibleIndex: number,
  width: number,
): void {
  input.target.write(visibleIndex, 0, treeRowRenderPlan(input, row, width));
}

type TreeRowVisualState = 'disabled' | 'hovered' | 'pressed' | 'selected' | 'focused' | 'active';

interface TreeRowInteraction {
  readonly selected: boolean;
  readonly states: readonly TreeRowVisualState[];
  readonly state: TreeRowVisualState | undefined;
  readonly disclosureStates: readonly TreeRowVisualState[];
  readonly disclosureState: TreeRowVisualState | undefined;
}

interface TreeRowStyles {
  readonly marker: TerminalStyle | undefined;
  readonly label: TerminalStyle | undefined;
  readonly disclosure: TerminalStyle | undefined;
  readonly indent: TerminalStyle | undefined;
  readonly icon: TerminalStyle | undefined;
}

function treeRowRenderPlan(
  input: ComponentRenderInput<TreeModel, TreeStylePart>,
  row: TreeRow,
  width: number,
): readonly RenderSpan[] {
  const interaction = treeRowInteraction(input, row);
  const styles = treeRowStyles(input, row, interaction);
  const source = treeRowFrameSource(input, row, interaction.state);
  const spans = treeRowSpans(input, row, interaction, styles, source);
  const clipped = [...clipRenderSpans(spans, width, { ellipsis: '…', widthProfile: input.widthProfile })];
  const used = measureRenderSpans(clipped, { widthProfile: input.widthProfile });
  if (used < width) {
    clipped.push(span(' '.repeat(width - used), {
      ...(styles.label === undefined ? {} : { style: styles.label }),
      source: source(`node.${row.id}.padding`, 'padding', 'decoration'),
    }));
  }
  return clipped;
}

function treeRowInteraction(
  input: ComponentRenderInput<TreeModel, TreeStylePart>,
  row: TreeRow,
): TreeRowInteraction {
  const selected = treeSelectionContains(input.model.selection, row.id);
  const active = row.id === input.model.activeId;
  const bodyId = `${input.id ?? 'tree'}:${row.id}:body`;
  const disclosureId = `${input.id ?? 'tree'}:${row.id}:disclosure`;
  const pointer = pointerVisualState(input.pointerState, bodyId);
  const states: readonly TreeRowVisualState[] =
    row.disabled || row.lazyPlaceholder
      ? ['disabled']
      : [
        ...(selected ? ['selected' as const] : []),
        ...(active ? ['active' as const] : []),
        ...(input.focus === 'self' && active ? ['focused' as const] : []),
        ...(pointer === undefined ? [] : [pointer]),
      ];
  const disclosurePointer = pointerVisualState(input.pointerState, disclosureId);
  const disclosureStates = row.disabled || row.lazyPlaceholder
    ? ['disabled' as const]
    : [...states.filter((item) => item !== 'hovered' && item !== 'pressed'),
      ...(disclosurePointer === undefined ? [] : [disclosurePointer])];
  return {
    selected,
    states,
    state: states.at(-1),
    disclosureStates,
    disclosureState: disclosureStates.at(-1),
  };
}

function treeRowStyles(
  input: ComponentRenderInput<TreeModel, TreeStylePart>,
  row: TreeRow,
  interaction: TreeRowInteraction,
): TreeRowStyles {
  const selectionBase: TerminalStyle | undefined = interaction.selected
    ? {
      fg: { kind: 'theme', token: 'selection.foreground' },
      bg: { kind: 'theme', token: 'selection.background' },
    }
    : undefined;
  const markerStyle = input.style({
    part: 'marker',
    ...(selectionBase === undefined ? {} : { base: selectionBase }),
    ...(interaction.states.length === 0 ? {} : { states: interaction.states }),
  });
  const labelStyle = input.style({
    part: row.lazyPlaceholder ? 'placeholder' : 'label',
    base: selectionBase ?? { fg: { kind: 'theme', token: 'text.default' } },
    ...(interaction.states.length === 0 ? {} : { states: interaction.states }),
  });
  const disclosureStyle = input.style({
    part: row.lazyPlaceholder ? 'placeholder' : 'disclosure',
    base: { ...selectionBase, fg: { kind: 'theme', token: 'tree.branch' } },
    ...(interaction.disclosureStates.length === 0 ? {} : { states: interaction.disclosureStates }),
  });
  const indentStyle = input.style({
    part: 'indent',
    base: { ...selectionBase, fg: { kind: 'theme', token: 'tree.branch' } },
    ...(interaction.states.length === 0 ? {} : { states: interaction.states }),
  });
  const iconStyle = input.style({
    part: 'icon',
    ...(selectionBase === undefined ? {} : { base: selectionBase }),
    ...(interaction.states.length === 0 ? {} : { states: interaction.states }),
  });
  return {
    marker: markerStyle,
    label: labelStyle,
    disclosure: disclosureStyle,
    indent: indentStyle,
    icon: iconStyle,
  };
}

function treeRowFrameSource(
  input: ComponentRenderInput<TreeModel, TreeStylePart>,
  row: TreeRow,
  state: TreeRowVisualState | undefined,
) {
  const itemId = `${input.id ?? 'tree'}:${row.id}`;
  return (
    description: string,
    partType: string,
    cellRole: import('../../visual/frame-source.ts').FrameCellRole,
    interactionState = state,
  ) =>
    input.frameSource({
      partName: description,
      partType,
      description,
      cellRole,
      itemId,
      itemIndex: row.itemIndex,
      ...(interactionState === undefined ? {} : { interactionState }),
    });
}

function treeRowSpans(
  input: ComponentRenderInput<TreeModel, TreeStylePart>,
  row: TreeRow,
  interaction: TreeRowInteraction,
  styles: TreeRowStyles,
  source: ReturnType<typeof treeRowFrameSource>,
): readonly RenderSpan[] {
  const marker = interaction.selected && !terminalStyleHasBackground(styles.marker, input.theme)
    ? input.theme.tokens.symbols.selected
    : input.theme.tokens.symbols.unselected;
  const disclosure = row.lazyPlaceholder
    ? input.theme.tokens.symbols.unselected
    : row.kind === 'leaf'
    ? input.theme.tokens.symbols.unselected
    : row.expanded
    ? input.theme.tokens.symbols.treeExpanded
    : input.theme.tokens.symbols.treeCollapsed;
  return [
    span(marker, {
      ...(styles.marker === undefined ? {} : { style: styles.marker }),
      source: source(`node.${row.id}.marker`, 'selection-marker', 'decoration'),
    }),
    span(' ', {
      ...(styles.marker === undefined ? {} : { style: styles.marker }),
      source: source(`node.${row.id}.marker.gap`, 'selection-marker', 'decoration'),
    }),
    ...(row.depth === 0 ? [] : [
      span('  '.repeat(row.depth), {
        ...(styles.indent === undefined ? {} : { style: styles.indent }),
        source: source(`node.${row.id}.indent`, 'indent', 'decoration'),
      }),
    ]),
    span(disclosure, {
      ...(styles.disclosure === undefined ? {} : { style: styles.disclosure }),
      source: source(`node.${row.id}.disclosure`, 'disclosure', 'decoration', interaction.disclosureState),
    }),
    span(' ', {
      ...(styles.disclosure === undefined ? {} : { style: styles.disclosure }),
      source: source(`node.${row.id}.disclosure.gap`, 'gap', 'decoration', interaction.disclosureState),
    }),
    ...(row.icon === undefined || row.icon === '' ? [] : [
      span(`${row.icon} `, {
        ...(styles.icon === undefined ? {} : { style: styles.icon }),
        source: source(`node.${row.id}.icon`, 'icon', 'decoration'),
      }),
    ]),
    ...treeLabelSpans(input, row, styles.label, source),
  ];
}

function treeLabelSpans(
  input: ComponentRenderInput<TreeModel, TreeStylePart>,
  row: TreeRow,
  labelStyle: TerminalStyle | undefined,
  source: (
    description: string,
    partType: string,
    cellRole: import('../../visual/frame-source.ts').FrameCellRole,
  ) => import('../../visual/frame-source.ts').FrameCellSource,
): readonly import('../../visual/render-content.ts').RenderSpan[] {
  const match = matchCompiledCollectionQuery(
    indexQueryCandidate({ id: row.id, primary: row.label }),
    input.model.query,
  )
    ?.ranges.find((range) => range.field === 'primary');
  if (match === undefined) {
    return [
      span(row.label, {
        ...(labelStyle === undefined ? {} : { style: labelStyle }),
        source: source(`node.${row.id}.label`, 'label', 'text'),
      }),
    ];
  }
  const matchStyle = input.style({
    part: 'match',
    base: { ...(labelStyle ?? {}), fg: { kind: 'theme', token: 'menu.match' }, underline: true },
  });
  return [
    ...(match.start === 0 ? [] : [
      span(row.label.slice(0, match.start), {
        ...(labelStyle === undefined ? {} : { style: labelStyle }),
        source: source(`node.${row.id}.label`, 'label', 'text'),
      }),
    ]),
    span(row.label.slice(match.start, match.end), {
      ...(matchStyle === undefined ? {} : { style: matchStyle }),
      source: source(`node.${row.id}.match`, 'match', 'text'),
    }),
    ...(match.end >= row.label.length ? [] : [
      span(row.label.slice(match.end), {
        ...(labelStyle === undefined ? {} : { style: labelStyle }),
        source: source(`node.${row.id}.label`, 'label', 'text'),
      }),
    ]),
  ];
}

function treeHitTargets(input: ComponentInput<TreeModel>) {
  if (input.busy) return [];
  const plan = treePlan(input);
  const targets = plan.rows.flatMap((row, index): HitTarget<TreeComponentAction>[] => {
    if (row.disabled || row.lazyPlaceholder) return [];
    const result: HitTarget<TreeComponentAction>[] = [];
    const disclosureColumn = 2 + row.depth * 2;
    if (row.kind !== 'leaf' && disclosureColumn < plan.geometry.contentBounds.width) {
      result.push({
        id: `${input.id ?? 'tree'}:${row.id}:disclosure`,
        bounds: {
          row: index,
          column: disclosureColumn,
          width: Math.min(2, plan.geometry.contentBounds.width - disclosureColumn),
          height: 1,
        },
        cursor: 'pointer',
        focus: { kind: 'target', targetId: 'self' },
        message: () => treeTransition({ kind: 'toggle', id: row.id }),
      });
    }
    const bodyColumn = row.kind === 'leaf'
      ? 0
      : Math.min(plan.geometry.contentBounds.width, disclosureColumn + 2);
    if (bodyColumn < plan.geometry.contentBounds.width) {
      result.push({
        id: `${input.id ?? 'tree'}:${row.id}:body`,
        bounds: {
          row: index,
          column: bodyColumn,
          width: plan.geometry.contentBounds.width - bodyColumn,
          height: 1,
        },
        accepts: ['pointerDown', 'click'],
        cursor: 'pointer',
        focus: { kind: 'target', targetId: 'self' },
        message: (event) => {
          if (event.button !== 'left') return ignoreMessage();
          if (event.kind === 'pointerDown') return treeTransition({ kind: 'setActive', id: row.id });
          return event.clickCount === 2
            ? { kind: 'activate', event: { kind: 'activate', id: row.id } }
            : ignoreMessage();
        },
      });
    }
    return result;
  });
  if (input.model.scroll !== undefined) {
    return [
      ...targets,
      ...componentScrollbarHitTargets<TreeComponentAction>({
        id: input.id ?? 'tree',
        plan: plan.geometry,
        ...(input.model.scrollPolicy === undefined ? {} : { policy: input.model.scrollPolicy }),
        onScroll: (request) => treeTransition({ kind: 'scroll', request }),
      }),
    ];
  }
  return targets;
}

function treeAccessibility(
  input: import('../../component/index.ts').ComponentAccessibilityInput<TreeModel>,
) {
  const plan = treePlan(input);
  return {
    id: input.id,
    role: 'tree' as const,
    description: `Showing ${String(plan.startIndex + 1)}-${String(plan.endIndexExclusive)} of ${
      String(input.model.totalCount)
    } tree rows.`,
    ...(input.focused ? { focused: true } : {}),
    ...(input.model.activeId === undefined || !plan.rows.some((row) => row.id === input.model.activeId)
      ? {}
      : { activeDescendant: `${input.id}:${input.model.activeId}` }),
    ...(input.model.selection.mode === 'multiple' ? { multiSelectable: true } : {}),
    window: {
      startIndex: plan.startIndex,
      endIndexExclusive: plan.endIndexExclusive,
      totalCount: input.model.totalCount,
      omittedBefore: plan.startIndex,
      omittedAfter: Math.max(0, input.model.totalCount - plan.endIndexExclusive),
    },
    children: plan.rows.map((row, index) => ({
      id: `${input.id}:${row.id}`,
      role: 'treeitem' as const,
      label: row.label,
      ...(row.description === undefined ? {} : { description: row.description }),
      selected: treeSelectionContains(input.model.selection, row.id),
      disabled: row.disabled || row.lazyPlaceholder,
      ...(row.kind === 'leaf' ? {} : { expanded: row.expanded }),
      position: {
        positionInSet: plan.startIndex + index + 1,
        setSize: input.model.totalCount,
        level: row.depth + 1,
      },
      value: row.path.join('/'),
    })),
  };
}

function treeSelectionContains(selection: SelectionState, id: string): boolean {
  return selection.mode === 'single'
    ? selection.selectedId === id
    : selection.mode === 'multiple' && selection.selectedIds.includes(id);
}

function treeTransition(transition: TreeTransition): TreeComponentAction {
  return { kind: 'transition', transition };
}
function text(value: unknown, owner: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new TypeError(`${owner} must be a string.`);
  return sanitizeTerminalText(value).text;
}
function nonEmpty(value: unknown, owner: string): string {
  const result = text(value, owner);
  if (result === undefined || result.trim() === '') {
    throw new TypeError(`${owner} must be non-empty.`);
  }
  return result;
}
function boolean(value: unknown, owner: string): boolean {
  if (value === undefined) return false;
  if (typeof value !== 'boolean') throw new TypeError(`${owner} must be a boolean.`);
  return value;
}
function nonNegative(value: unknown, owner: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${owner} must be a non-negative safe integer.`);
  }
  return value;
}

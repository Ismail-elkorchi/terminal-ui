import type { AccessibleNode } from '../../accessibility/index.ts';
import {
  clipRenderSpans,
  defineComponent,
  ignoreMessage,
  measureRenderSpans,
} from '../../component/index.ts';
import type {
  ComponentAccessibilityInput,
  ComponentInput,
  ComponentLayoutInput,
  ComponentMeasureInput,
  ComponentRenderInput,
} from '../../component/index.ts';
import type { Element } from '../../element/index.ts';
import { isNonArrayObject } from '../../foundation/validation.ts';
import type { LayoutFlowOptions, Rect } from '../../geometry/types.ts';
import {
  layoutContentBounds,
  layoutInsetSize,
  prepareLayoutFlowOptions,
} from '../../layout/index.ts';
import { pointerVisualState } from '../../interaction/index.ts';
import type { PointerInteractionState } from '../../interaction/index.ts';
import type { MessageResolution } from '../../interaction/index.ts';
import { oneCellGlyph, sanitizeTerminalText } from '../../text/index.ts';
import type { TabAction } from '../../ui-model/tabs.ts';
import type { TabsStylePart } from '../../ui-model/style-parts.ts';
import {
  inlineContentAccessibleText,
  inlineSegmentText,
  isInlineContent,
  normalizeInlineContent,
} from '../../visual/inline-content.ts';
import type { InlineContent } from '../../visual/inline-content.ts';
import type { RenderSpan, TerminalStyle } from '../../visual/render.ts';
import type { TabsOptions } from '../options/tabs.ts';

interface TabModelItem {
  readonly id: string;
  readonly label: string;
  readonly leading?: InlineContent;
  readonly description?: string;
  readonly disabled: boolean;
  readonly badge?: string;
  readonly closable: boolean;
}

interface TabsModel {
  readonly tabs: readonly TabModelItem[];
  readonly selectedIndex: number;
  readonly maxTabWidth?: number;
  readonly pointerState?: PointerInteractionState;
  readonly layout: LayoutFlowOptions;
}

interface TabsOwnOptions {
  readonly tabs: readonly TabOwnOption[];
  readonly selected?: string;
  readonly maxTabWidth?: number;
  readonly pointerState?: PointerInteractionState;
  readonly gap?: number;
  readonly padding?: LayoutFlowOptions['padding'];
  readonly margin?: LayoutFlowOptions['margin'];
  readonly minWidth?: number;
  readonly minHeight?: number;
  readonly maxWidth?: number;
  readonly maxHeight?: number;
  readonly align?: LayoutFlowOptions['align'];
  readonly justify?: LayoutFlowOptions['justify'];
  readonly overflow?: LayoutFlowOptions['overflow'];
}

interface TabOwnOption {
  readonly id: string;
  readonly label: string;
  readonly leading?: InlineContent;
  readonly description?: string;
  readonly disabled?: boolean;
  readonly badge?: string;
  readonly closable?: boolean;
}

const tabsSlots = {
  panels: { cardinality: 'many', owner: 'caller', messages: 'bubble' },
} as const;

type TabsFactory = <TMessage extends NonNullable<unknown> | null>(
  options: TabsOptions<TMessage>,
) => Element<TMessage>;

const instantiateTabs = defineComponent<
  TabsOwnOptions,
  TabsModel,
  TabAction,
  TabsStylePart,
  readonly [],
  'required',
  readonly ['focus', 'layer', 'styles'],
  typeof tabsSlots
>({
  name: 'terminal-ui/components/tabs',
  identity: 'required',
  structure: 'composite',
  semantics: 'semantic',
  slots: tabsSlots,
  optionFields: {
    tabs: null,
    selected: null,
    maxTabWidth: null,
    pointerState: null,
    gap: null,
    padding: null,
    margin: null,
    minWidth: null,
    minHeight: null,
    maxWidth: null,
    maxHeight: null,
    align: null,
    justify: null,
    overflow: null,
  },
  metadata: ['focus', 'layer', 'styles'],
  parts: ['leading', 'label', 'indicator', 'badge', 'close', 'overflow'],
  prepare: prepareTabs,
  measure(input) {
    const headerWidth = tabHeaderEntries(input)
      .reduce((width, entry, index) => width + entry.width + (index === 0 ? 0 : 1), 0);
    const panelCount = input.slots.count('panels');
    const panelMeasurements = Array.from(
      { length: panelCount },
      (_unused, index) => input.slots.measure('panels', index),
    );
    const inset = combinedInsets(input.model.layout);
    return {
      minWidth: 0,
      minHeight: 0,
      preferredWidth: Math.max(
        headerWidth,
        ...panelMeasurements.map((item) => item.preferredWidth),
        0,
      ) +
        inset.width,
      preferredHeight: 1 + Math.max(...panelMeasurements.map((item) => item.preferredHeight), 0) +
        inset.height,
    };
  },
  layout(input) {
    const content = layoutContentBounds(input.bounds, input.model.layout);
    const panels = Array.from(
      { length: input.slots.count('panels') },
      (_unused, index): Rect =>
        index === input.model.selectedIndex
          ? {
            row: content.row + Math.min(1, content.height),
            column: content.column,
            width: content.width,
            height: Math.max(0, content.height - 1),
          }
          : { row: content.row, column: content.column, width: 0, height: 0 },
    );
    return { panels };
  },
  renderBeforeChildren(input) {
    const content = layoutContentBounds(input.bounds, input.model.layout);
    if (content.width === 0 || content.height === 0) return;
    const layout = tabHeaderLayout(input, content.width);
    const spans: RenderSpan[] = [...layout.spans];
    const used = measureRenderSpans(spans, { widthProfile: input.widthProfile });
    if (used < content.width) {
      spans.push(tabSpan(input, ' '.repeat(content.width - used), 'label', 'header.background', {
        bg: { kind: 'theme', token: 'surface.background' },
      }));
    }
    input.target.write(content.row, content.column, spans);
  },
  keys({ id, model }) {
    const whenSelf =
      (action: MessageResolution<TabAction>) =>
      (event: { readonly focusPath: readonly string[] }) =>
        event.focusPath.at(-1) === id ? action : ignoreMessage();
    const selected = model.tabs[model.selectedIndex];
    return {
      arrowLeft: whenSelf({ kind: 'move', delta: -1 }),
      arrowRight: whenSelf({ kind: 'move', delta: 1 }),
      home: whenSelf({ kind: 'first' }),
      end: whenSelf({ kind: 'last' }),
      enter: whenSelf(
        selected === undefined ? ignoreMessage() : { kind: 'select', id: selected.id },
      ),
      delete: whenSelf(
        selected?.closable === true ? { kind: 'close', id: selected.id } : ignoreMessage(),
      ),
    };
  },
  pointer: {
    state: ({ model }) => model.pointerState,
    onAction: (action) => ({ kind: 'pointer', action }),
  },
  focusTargets(input) {
    const content = layoutContentBounds(input.bounds, input.model.layout);
    return content.width === 0 || content.height === 0 ? [] : [{
      id: 'self',
      bounds: { row: content.row, column: content.column, width: content.width, height: 1 },
    }];
  },
  hitTargets(input) {
    const content = layoutContentBounds(input.bounds, input.model.layout);
    if (content.width === 0 || content.height === 0) return [];
    const layout = tabHeaderLayout(input, content.width);
    return layout.visible.flatMap(({ entry, offset }) => {
      const start = content.column + offset;
      const tabWidth = Math.min(entry.bodyWidth, content.column + content.width - start);
      const closeWidth = entry.closeOffset === undefined
        ? 0
        : Math.min(1, content.column + content.width - start - entry.closeOffset);
      return [
        ...(entry.tab.disabled || tabWidth <= 0 ? [] : [{
          id: tabTargetId(input.id, entry.tab.id),
          bounds: { row: content.row, column: start, width: tabWidth, height: 1 },
          accepts: ['click' as const],
          focus: { kind: 'target' as const, targetId: 'self' },
          message: () => ({ kind: 'select' as const, id: entry.tab.id }),
          cursor: 'pointer' as const,
        }]),
        ...(entry.tab.disabled || !entry.tab.closable || closeWidth <= 0 ||
            entry.closeOffset === undefined
          ? []
          : [{
            id: tabCloseTargetId(input.id, entry.tab.id),
            bounds: {
              row: content.row,
              column: start + entry.closeOffset,
              width: closeWidth,
              height: 1,
            },
            accepts: ['click' as const],
            focus: { kind: 'target' as const, targetId: 'self' },
            message: () => ({ kind: 'close' as const, id: entry.tab.id }),
            cursor: 'pointer' as const,
          }]),
      ];
    });
  },
  accessibility(input) {
    return tabsAccessibility(input);
  },
});

export const tabs: TabsFactory = (options) => {
  const { tabs: items, onAction, ...rest } = options;
  return instantiateTabs({
    ...rest,
    tabs: items.map((item) => ({
      id: item.id,
      label: item.label,
      ...(item.description === undefined ? {} : { description: item.description }),
      ...(item.disabled === undefined ? {} : { disabled: item.disabled }),
      ...(item.leading === undefined ? {} : { leading: item.leading }),
      ...(item.badge === undefined ? {} : { badge: item.badge }),
      ...(item.closable === undefined ? {} : { closable: item.closable }),
    })),
    slots: { panels: items.map((item) => item.panel) },
    onAction,
  });
};

interface TabHeaderEntry {
  readonly tab: TabModelItem;
  readonly spans: readonly RenderSpan[];
  readonly width: number;
  readonly bodyWidth: number;
  readonly closeOffset?: number;
}

interface TabHeaderLayout {
  readonly spans: readonly RenderSpan[];
  readonly visible: readonly { readonly entry: TabHeaderEntry; readonly offset: number }[];
}

type TabsVisualInput =
  | ComponentInput<TabsModel>
  | ComponentMeasureInput<TabsModel, typeof tabsSlots>
  | ComponentRenderInput<TabsModel, TabsStylePart>
  | ComponentLayoutInput<TabsModel, typeof tabsSlots>;

function tabHeaderEntries(input: TabsVisualInput): readonly TabHeaderEntry[] {
  return input.model.tabs.map((tab, index) => {
    const selected = index === input.model.selectedIndex;
    const targetId = tabTargetId(input.id, tab.id);
    const pointer = pointerVisualState(input.model.pointerState, targetId);
    const state = tab.disabled
      ? 'disabled' as const
      : pointer ?? (selected ? 'selected' as const : undefined);
    const base: TerminalStyle = selected
      ? {
        fg: { kind: 'theme', token: 'tab.active.foreground' },
        bg: { kind: 'theme', token: 'surface.raised.background' },
        bold: true,
      }
      : {
        fg: { kind: 'theme', token: 'tab.inactive.foreground' },
        bg: { kind: 'theme', token: 'surface.background' },
      };
    const labelStyle = resolveTabStyle(input, 'label', base, state);
    const spans: RenderSpan[] = [tabSpan(
      input,
      selected ? oneCellGlyph('▏', '|', { widthProfile: input.widthProfile }) : ' ',
      'indicator',
      'indicator',
      resolveTabStyle(input, 'indicator', labelStyle, state),
      tab.id,
      state,
    )];
    if (tab.leading !== undefined) {
      for (const [leadingIndex, segment] of tab.leading.entries()) {
        spans.push(tabSpan(
          input,
          inlineSegmentText(segment, input.theme.tokens.symbols.mode),
          'leading',
          `leading.${String(leadingIndex)}`,
          resolveTabStyle(input, 'leading', segment.style ?? labelStyle, state),
          tab.id,
          state,
        ));
      }
      spans.push(tabSpan(input, ' ', 'leading', 'leading.separator', labelStyle, tab.id, state));
    }
    spans.push(tabSpan(input, tab.label, 'label', 'label', labelStyle, tab.id, state));
    if (tab.badge !== undefined) {
      spans.push(tabSpan(
        input,
        ` ${tab.badge}`,
        'badge',
        'badge',
        resolveTabStyle(input, 'badge', {
          fg: { kind: 'theme', token: 'badge.foreground' },
          bg: { kind: 'theme', token: 'badge.background' },
          bold: true,
        }, state),
        tab.id,
        state,
      ));
    }
    let closeOffset: number | undefined;
    if (tab.closable) {
      spans.push(tabSpan(
        input,
        ' ',
        'close',
        'close.separator',
        resolveTabStyle(input, 'close', labelStyle, state),
        tab.id,
        state,
      ));
      closeOffset = measureSpans(spans, input);
      spans.push(tabSpan(
        input,
        oneCellGlyph('×', 'x', { widthProfile: input.widthProfile }),
        'close',
        'close',
        resolveTabStyle(input, 'close', labelStyle, state),
        tab.id,
        state,
      ));
    }
    spans.push(tabSpan(input, ' ', 'label', 'padding.trailing', labelStyle, tab.id, state));
    let bounded: readonly RenderSpan[] = spans;
    if (input.model.maxTabWidth !== undefined) {
      const wasConstrained = measureSpans(spans, input) > input.model.maxTabWidth;
      bounded = boundedTabSpans(input, tab, spans, input.model.maxTabWidth, labelStyle);
      if (wasConstrained && tab.closable) {
        closeOffset = measureRenderSpans(bounded.slice(0, -1), {
          widthProfile: input.widthProfile,
        });
      }
    }
    const width = measureSpans(bounded, input);
    return {
      tab,
      spans: bounded,
      width,
      bodyWidth: closeOffset ?? width,
      ...(closeOffset === undefined ? {} : { closeOffset }),
    };
  });
}

function tabHeaderLayout(
  input: TabsVisualInput,
  width: number,
): TabHeaderLayout {
  if (width <= 0) return { spans: [], visible: [] };
  const entries = tabHeaderEntries(input);
  if (entries.length === 0) return { spans: [], visible: [] };
  let start = input.model.selectedIndex;
  let end = input.model.selectedIndex;
  const rangeWidth = (nextStart: number, nextEnd: number): number => {
    let total = 0;
    for (let index = nextStart; index <= nextEnd; index += 1) {
      total += entries[index]?.width ?? 0;
      if (index > nextStart) total += 1;
    }
    return total;
  };
  const fits = (nextStart: number, nextEnd: number): boolean =>
    rangeWidth(nextStart, nextEnd) +
        (nextStart > 0 ? 2 : 0) +
        (nextEnd < entries.length - 1 ? 2 : 0) <=
      width;
  const selected = entries[input.model.selectedIndex];
  if (selected === undefined) return { spans: [], visible: [] };
  if (!fits(start, end) && selected.width > width) {
    return {
      spans: clipRenderSpans(selected.spans, width, {
        ellipsis: '…',
        widthProfile: input.widthProfile,
      }),
      visible: [{ entry: selected, offset: 0 }],
    };
  }
  for (;;) {
    if (start > 0 && fits(start - 1, end)) {
      start -= 1;
      continue;
    }
    if (end < entries.length - 1 && fits(start, end + 1)) {
      end += 1;
      continue;
    }
    break;
  }
  const spans: RenderSpan[] = [];
  const visible: { readonly entry: TabHeaderEntry; readonly offset: number }[] = [];
  let offset = 0;
  if (start > 0) {
    spans.push(tabSpan(input, '… ', 'overflow', 'overflow.leading', {
      fg: { kind: 'theme', token: 'text.muted' },
    }));
    offset += 2;
  }
  for (let index = start; index <= end; index += 1) {
    const entry = entries[index];
    if (entry === undefined) continue;
    if (index > start) {
      spans.push(tabSpan(input, ' ', 'label', 'separator', {
        bg: { kind: 'theme', token: 'surface.background' },
      }));
      offset += 1;
    }
    visible.push({ entry, offset });
    spans.push(...entry.spans);
    offset += entry.width;
  }
  if (end < entries.length - 1) {
    spans.push(tabSpan(input, ' …', 'overflow', 'overflow.trailing', {
      fg: { kind: 'theme', token: 'text.muted' },
    }));
  }
  return {
    spans: clipRenderSpans(spans, width, { widthProfile: input.widthProfile }),
    visible,
  };
}

function boundedTabSpans(
  input: TabsVisualInput,
  tab: TabModelItem,
  natural: readonly RenderSpan[],
  maxWidth: number,
  labelStyle: TerminalStyle | undefined,
): readonly RenderSpan[] {
  if (measureSpans(natural, input) <= maxWidth) return natural;
  const close = tab.closable ? natural.at(-2) : undefined;
  if (close === undefined) {
    return clipRenderSpans(natural, maxWidth, {
      ellipsis: '…',
      widthProfile: input.widthProfile,
    });
  }
  const closeGlyph = tabSpan(
    input,
    oneCellGlyph('×', 'x', { widthProfile: input.widthProfile }),
    'close',
    'close',
    close.style,
    tab.id,
  );
  if (maxWidth === 1) return [closeGlyph];
  const indicator = natural[0];
  const prefix = indicator === undefined ? [] : [indicator];
  const bodyBudget = Math.max(0, maxWidth - 1 - measureSpans(prefix, input));
  const body = natural.filter((span, index) =>
    index > 0 &&
    span.source?.partName !== 'close' &&
    span.source?.partName !== 'close.separator' &&
    span.source?.partName !== 'padding.trailing'
  );
  const clippedBody = clipRenderSpans(body, bodyBudget, {
    ellipsis: '…',
    widthProfile: input.widthProfile,
  });
  const result = [...prefix, ...clippedBody, closeGlyph];
  const used = measureSpans(result, input);
  return used >= maxWidth ? result : [
    ...prefix,
    ...clippedBody,
    tabSpan(input, ' '.repeat(maxWidth - used), 'label', 'label', labelStyle, tab.id),
    closeGlyph,
  ];
}

function tabSpan(
  input: TabsVisualInput,
  text: string,
  part: TabsStylePart,
  partName: string,
  style: TerminalStyle | undefined,
  itemId?: string,
  interactionState?: 'disabled' | 'selected' | 'focused' | 'hovered' | 'pressed',
): RenderSpan {
  return {
    text,
    ...(style === undefined ? {} : { style }),
    ...('source' in input
      ? {
        source: input.source({
          partName,
          partType: part,
          ...(itemId === undefined ? {} : { itemId }),
          ...(interactionState === undefined ? {} : { interactionState }),
          cellRole: part === 'indicator' || part === 'overflow' ? 'decoration' : 'text',
          description: partName,
        }),
      }
      : {}),
  };
}

function resolveTabStyle(
  input: TabsVisualInput,
  part: TabsStylePart,
  base: TerminalStyle | undefined,
  state?: 'disabled' | 'selected' | 'focused' | 'hovered' | 'pressed',
): TerminalStyle | undefined {
  return 'style' in input
    ? input.style({
      part,
      ...(base === undefined ? {} : { base }),
      ...(state === undefined ? {} : { state }),
      ...(state === 'selected' ? { defaultState: false } : {}),
    })
    : base;
}

function measureSpans(spans: readonly RenderSpan[], input: TabsVisualInput): number {
  return measureRenderSpans(spans, { widthProfile: input.widthProfile });
}

function tabsAccessibility(
  input: ComponentAccessibilityInput<TabsModel, typeof tabsSlots>,
): AccessibleNode {
  const tabNodes = input.model.tabs.map((tab, index): AccessibleNode => ({
    id: `${input.id}:${tab.id}`,
    role: 'tab',
    label: tab.leading === undefined
      ? tab.label
      : `${inlineContentAccessibleText(tab.leading)} ${tab.label}`.trim(),
    ...(tab.badge === undefined ? {} : { value: tab.badge }),
    ...(tab.description === undefined ? {} : { description: tab.description }),
    selected: index === input.model.selectedIndex,
    disabled: tab.disabled,
    controls: `${input.id}:${tab.id}:panel`,
    ...(tab.closable && !tab.disabled
      ? {
        children: [{
          id: tabCloseTargetId(input.id, tab.id),
          role: 'button' as const,
          label: `Close ${tab.label}`,
        }],
      }
      : {}),
  }));
  const panels = input.model.tabs.map((tab, index): AccessibleNode => ({
    id: `${input.id}:${tab.id}:panel`,
    role: 'tabpanel',
    label: tab.label,
    labelledBy: `${input.id}:${tab.id}`,
    ...(index === input.model.selectedIndex && input.slots.panels[index] !== undefined
      ? { children: [input.slots.panels[index]] }
      : {}),
  }));
  return {
    id: input.id,
    role: 'group',
    label: input.id,
    value: input.model.tabs[input.model.selectedIndex]?.id ?? '',
    ...(input.focused ? { focused: true } : {}),
    children: [{
      id: `${input.id}:tablist`,
      role: 'tablist',
      label: input.id,
      children: tabNodes,
    }, ...panels],
  };
}

function prepareTabs(value: unknown): TabsModel {
  if (!isNonArrayObject(value)) throw new TypeError('tabs options must be an object.');
  const rawTabs = value['tabs'];
  if (!Array.isArray(rawTabs) || rawTabs.length === 0) {
    throw new TypeError('tabs tabs must be a non-empty array.');
  }
  const ids = new Set<string>();
  const tabs = rawTabs.map((raw, index): TabModelItem => {
    if (!isNonArrayObject(raw)) {
      throw new TypeError(`tabs tabs[${String(index)}] must be an object.`);
    }
    const unsupported = Object.keys(raw).find((field) =>
      field !== 'id' &&
      field !== 'label' &&
      field !== 'leading' &&
      field !== 'description' &&
      field !== 'disabled' &&
      field !== 'badge' &&
      field !== 'closable'
    );
    if (unsupported !== undefined) {
      throw new TypeError(`tabs tabs[${String(index)}] contains unknown field "${unsupported}".`);
    }
    const id = raw['id'];
    const label = raw['label'];
    if (typeof id !== 'string' || id.trim() === '') {
      throw new TypeError('tabs tab id must be non-empty.');
    }
    if (ids.has(id)) throw new TypeError(`tabs contains duplicate tab id "${id}".`);
    ids.add(id);
    if (typeof label !== 'string') throw new TypeError('tabs tab label must be a string.');
    const leading = raw['leading'];
    if (leading !== undefined && !isInlineContent(leading)) {
      throw new TypeError('tabs tab leading is invalid.');
    }
    const description = raw['description'];
    const badge = raw['badge'];
    if (description !== undefined && typeof description !== 'string') {
      throw new TypeError('tabs tab description must be a string.');
    }
    if (badge !== undefined && typeof badge !== 'string') {
      throw new TypeError('tabs tab badge must be a string.');
    }
    for (const field of ['disabled', 'closable'] as const) {
      if (raw[field] !== undefined && typeof raw[field] !== 'boolean') {
        throw new TypeError(`tabs tab ${field} must be a boolean.`);
      }
    }
    return {
      id,
      label: sanitizeTerminalText(label).text,
      ...(leading === undefined ? {} : { leading: normalizeInlineContent(leading) }),
      ...(description === undefined ? {} : { description: sanitizeTerminalText(description).text }),
      ...(badge === undefined ? {} : { badge: sanitizeTerminalText(badge).text }),
      disabled: raw['disabled'] === true,
      closable: raw['closable'] === true,
    };
  });
  const selected = value['selected'];
  if (selected !== undefined && typeof selected !== 'string') {
    throw new TypeError('tabs selected must be a string.');
  }
  const selectedIndex = selected === undefined
    ? Math.max(0, tabs.findIndex((tab) => !tab.disabled))
    : tabs.findIndex((tab) => tab.id === selected);
  if (selected !== undefined && selectedIndex < 0) {
    throw new RangeError('tabs selected must identify a tab.');
  }
  const maxTabWidth = value['maxTabWidth'];
  if (
    maxTabWidth !== undefined &&
    (!Number.isSafeInteger(maxTabWidth) || (maxTabWidth as number) <= 0)
  ) {
    throw new RangeError('tabs maxTabWidth must be a positive safe integer.');
  }
  const pointerState = value['pointerState'];
  if (pointerState !== undefined) assertPointerState(pointerState, 'tabs pointerState');
  return {
    tabs,
    selectedIndex,
    ...(maxTabWidth === undefined ? {} : { maxTabWidth: maxTabWidth as number }),
    ...(pointerState === undefined ? {} : { pointerState }),
    layout: prepareLayoutFlowOptions(value, 'tabs'),
  };
}

function assertPointerState(
  value: unknown,
  label: string,
): asserts value is PointerInteractionState {
  if (!isNonArrayObject(value)) throw new TypeError(`${label} must be an object.`);
  const unsupported = Object.keys(value).find((field) =>
    field !== 'hoveredTargetId' && field !== 'pressedTargetId'
  );
  if (unsupported !== undefined) {
    throw new TypeError(`${label} contains unknown field "${unsupported}".`);
  }
  for (const field of ['hoveredTargetId', 'pressedTargetId'] as const) {
    if (value[field] !== undefined && typeof value[field] !== 'string') {
      throw new TypeError(`${label}.${field} must be a string.`);
    }
  }
}

function combinedInsets(
  layout: LayoutFlowOptions,
): { readonly width: number; readonly height: number } {
  const padding = layoutInsetSize(layout.padding);
  const margin = layoutInsetSize(layout.margin);
  return { width: padding.width + margin.width, height: padding.height + margin.height };
}

function tabTargetId(id: string | undefined, tabId: string): string {
  return `${id ?? 'tabs'}:tab:${tabId}`;
}

function tabCloseTargetId(id: string | undefined, tabId: string): string {
  return `${id ?? 'tabs'}:tab:${tabId}:close`;
}

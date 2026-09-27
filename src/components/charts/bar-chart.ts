import type { BarChartTransition } from '../../behavior/visualization.ts';
import type {
  ComponentAccessibilityInput,
  ComponentMeasureInput,
  ComponentRenderInput,
} from '../../component/contracts.ts';
import { defineComponent } from '../../component/definition.ts';
import type { ComponentMessage } from '../../component/message.ts';
import type { Element } from '../../element/types.ts';
import { assertOptionalCallback } from '../../foundation/validation.ts';
import type { RoutedPointerEvent } from '../../input/pointer.ts';
import {
  assertCollectionInteractionReferences,
  createCollectionInteractionIndex,
  decodeSelectionState,
  selectionContains,
} from '../../interaction/collection-interaction.ts';
import { ignoreMessage } from '../../interaction/message.ts';
import { fillTextCells } from '../../text/cell-geometry.ts';
import { measureTextCells } from '../../text/measure.ts';
import { inspectSelection } from '../shared/inspection.ts';
import type { ChartStylePart } from '../style-parts.ts';
import type {
  BarChartComponentAction,
  BarChartComponentOptions,
  BarChartModel,
  BarModelItem,
} from './contracts.ts';
import type { BarChartOptions } from './options.ts';
import {
  assertVisualizationCallbacks,
  chartSpan,
  decodeVisualizationStatus,
  finite,
  nonEmpty,
  optionalFinite,
  paintStatus,
  selectedStyle,
  seriesStyle,
  visibleWindow,
  visualizationUnavailable,
  withoutVisualizationBehavior,
} from './shared.ts';

const barChartBase = {
  name: 'terminal-ui/components/bar-chart' as const,
  identity: 'required' as const,
  structure: 'leaf' as const,
  semantics: 'semantic' as const,
  states: ['busy'] as const,
  accessibleRole: 'listbox' as const,
  metadata: ['focus', 'layer', 'styles'] as const,
  parts: ['label', 'axis', 'series', 'value', 'legend', 'muted'] as const,
  visualStates: ['active', 'selected', 'disabled', 'busy'] as const,
  measure: measureBarChart,
  retainPaint: true as const,
  render: paintBarChart,
  accessibility: barChartAccessibility,
  inspection: ({ model }: { readonly model: Readonly<BarChartModel> }) => ({
    ...(model.activeId === undefined ? {} : { active: model.activeId }),
    selection: inspectSelection(model.selection),
    collection: { startIndex: 0, totalCount: model.items.length, visibleCount: model.items.length },
  }),
};

const passiveBarChart = defineComponent<BarChartComponentOptions>()({ ...barChartBase, createModel: createBarChartModel });

const activeBarChart = defineComponent<BarChartComponentOptions, BarChartComponentAction>()({
  ...barChartBase,
  states: ['disabled', 'busy', 'inert'],
  createModel: createBarChartModel,
  keys: ({ model, busy }) => {
    if (busy) return {};
    const active = activeBar(model);
    const transition = (value: BarChartTransition): BarChartComponentAction => ({ kind: 'transition', transition: value });
    return {
      arrowUp: () => transition({ kind: 'moveActive', delta: -1 }),
      arrowDown: () => transition({ kind: 'moveActive', delta: 1 }),
      home: () => transition({ kind: 'firstActive' }),
      end: () => transition({ kind: 'lastActive' }),
      ...(active === undefined ? {} : {
        enter: () => ({ kind: 'activate' as const, event: { kind: 'activate' as const, id: active.id } }),
      }),
    };
  },
  focusTargets: ({ bounds }) => [{ id: 'self', bounds }],
  hitTargets(input) {
    if (input.busy) return [];
    const plan = barChartPlan(input.model, input.bounds.height);
    return plan.items.map((item, row) => ({
      id: `${input.id ?? 'bar-chart'}:bar:${item.id}`,
      bounds: { row, column: 0, width: input.bounds.width, height: 1 },
      accepts: ['pointerDown', 'click'] as const,
      cursor: 'pointer' as const,
      focus: { kind: 'target' as const, targetId: 'self' },
      message: (event: RoutedPointerEvent) => {
        if (event.button !== 'left') return ignoreMessage();
        if (event.kind === 'pointerDown') {
          return { kind: 'transition', transition: { kind: 'setActive', id: item.id } };
        }
        return event.clickCount === 2
          ? { kind: 'activate', event: { kind: 'activate', id: item.id } }
          : ignoreMessage();
      },
    }));
  },
});

export function barChart<const TMessage extends ComponentMessage = never>(
  options: BarChartOptions<TMessage>,
): Element<TMessage> {
  if (options.state === undefined) {
    return passiveBarChart(withoutVisualizationBehavior(options));
  }
  const componentOptions = withoutVisualizationBehavior(options);
  assertOptionalCallback(options.onActivate, 'barChart onActivate');
  if (options.onTransition === undefined) {
    if (!visualizationUnavailable(options)) assertVisualizationCallbacks(options, 'barChart');
    return activeBarChart({ ...componentOptions, ...(options.disabled === true ? { disabled: true as const } : { inert: true as const }) });
  }
  assertVisualizationCallbacks(options, 'barChart');
  return activeBarChart({
    ...componentOptions,
    onAction: (action) => {
      if (action.kind === 'transition') return options.onTransition(action.transition);
      return options.onActivate?.(action.event) ?? ignoreMessage();
    },
  });
}

function createBarChartModel(value: Readonly<BarChartComponentOptions>): BarChartModel {
  const label = nonEmpty(value.label, 'barChart label');
  const ids = new Set<string>();
  const items = Object.freeze(value.items.map((candidate, itemIndex): BarModelItem => {
    const id = nonEmpty(candidate.id, 'barChart item id');
    if (ids.has(id)) throw new TypeError(`barChart contains duplicate item id "${id}".`);
    ids.add(id);
    return Object.freeze({
      id,
      itemIndex,
      label: nonEmpty(candidate.label, 'barChart item label'),
      value: finite(candidate.value, 'barChart item value'),
    });
  }));
  const explicitMaximum = optionalFinite(value.max, 'barChart max');
  const maximum = explicitMaximum ?? Math.max(1, ...items.map((item) => item.value));
  if (maximum <= 0) throw new RangeError('barChart max must be positive.');
  const activeId = value.state?.activeId === undefined
    ? undefined
    : nonEmpty(value.state.activeId, 'barChart activeId');
  const selection = decodeSelectionState(
    value.state?.selection ?? { mode: 'none' },
    'barChart selection',
  );
  assertCollectionInteractionReferences(
    { ...(activeId === undefined ? {} : { activeId }), selection },
    createCollectionInteractionIndex(items.map((item) => item.id)),
    'barChart state',
  );
  return {
    label,
    items,
    maximum,
    ...(activeId === undefined ? {} : { activeId }),
    selection,
    ...decodeVisualizationStatus(value, 'barChart', items.length === 0),
  };
}

function measureBarChart(input: ComponentMeasureInput<BarChartModel>) {
  const longest = Math.max(
    0,
    ...input.model.items.map((item) =>
      measureTextCells(`${item.label}  ${String(item.value)}`, {
        widthProfile: input.widthProfile,
      }).cells + 4
    ),
  );
  return {
    minWidth: 1,
    minHeight: 1,
    preferredWidth: Math.min(120, Math.max(1, longest)),
    preferredHeight: Math.min(24, Math.max(1, input.model.items.length)),
  };
}

function paintBarChart(input: ComponentRenderInput<BarChartModel, ChartStylePart>): undefined {
  if (paintStatus(input, input.model)) return;
  const plan = barChartPlan(input.model, input.bounds.height);
  for (const [row, item] of plan.items.entries()) {
    const active = item.id === input.model.activeId;
    const selected = selectionContains(input.model.selection, item.id);
    const states = [
      ...(selected ? ['selected' as const] : []),
      ...(active ? ['active' as const] : []),
    ];
    const prefix = active
      ? input.theme.tokens.symbols.pointer
      : input.theme.tokens.symbols.unselected;
    const value = String(item.value);
    const fixedCells = measureTextCells(`${prefix} ${item.label}  ${value}`, {
      widthProfile: input.widthProfile,
    }).cells;
    const available = Math.max(0, input.bounds.width - fixedCells);
    const fill = Math.max(
      0,
      Math.min(
        available,
        Math.round((item.value / input.model.maximum) * available),
      ),
    );
    const visualStyle = active || selected ? selectedStyle() : undefined;
    input.target.write(row, 0, [
      chartSpan(
        input,
        prefix,
        'muted',
        `bar.${item.id}.marker`,
        'marker',
        visualStyle,
        undefined,
        states,
      ),
      chartSpan(input, ' ', 'muted', `bar.${item.id}.separator.beforeLabel`, 'separator'),
      chartSpan(
        input,
        item.label,
        'label',
        `bar.${item.id}.label`,
        'label',
        visualStyle,
        undefined,
        states,
      ),
      chartSpan(input, ' ', 'muted', `bar.${item.id}.separator.beforeFill`, 'separator'),
      chartSpan(
        input,
        fillTextCells(input.theme.tokens.symbols.progressFilled, fill, {
          widthProfile: input.widthProfile,
        }),
        'series',
        `bar.${item.id}.fill`,
        'bar',
        visualStyle ?? seriesStyle(item.itemIndex),
        item.itemIndex,
        states,
      ),
      chartSpan(input, ' ', 'muted', `bar.${item.id}.separator.beforeValue`, 'separator'),
      chartSpan(
        input,
        value,
        'value',
        `bar.${item.id}.value`,
        'metric',
        visualStyle,
        undefined,
        states,
      ),
    ]);
  }
}

function barChartAccessibility(input: ComponentAccessibilityInput<BarChartModel>) {
  const plan = barChartPlan(input.model, input.bounds.height);
  return {
    id: input.id,
    role: 'listbox' as const,
    label: input.model.label,
    description: `${String(input.model.items.length)} bars. Showing ${String(plan.start + 1)}-${
      String(plan.end)
    }.`,
    disabled: input.disabled,
    ...(input.focused ? { focused: true } : {}),
    children: plan.items.map((item) => ({
      id: `${input.id}:${item.id}`,
      role: 'option' as const,
      label: item.label,
      value: item.value,
      selected: selectionContains(input.model.selection, item.id),
      current: item.id === input.model.activeId,
      position: { positionInSet: item.itemIndex + 1, setSize: input.model.items.length },
    })),
  };
}

function activeBar(model: BarChartModel): BarModelItem | undefined {
  return model.items.find((item) => item.id === model.activeId);
}

function barChartPlan(model: BarChartModel, height: number) {
  const active = model.items.findIndex((item) => item.id === model.activeId);
  const window = visibleWindow(model.items.length, height, Math.max(0, active));
  return {
    ...window,
    items: model.items.slice(window.start, window.end),
  };
}

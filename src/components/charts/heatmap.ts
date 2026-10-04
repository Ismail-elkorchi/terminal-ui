import type { HeatmapTransition } from '../../behavior/visualization.ts';
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
import { fillTextCells, oneCellGlyph } from '../../text/cell-geometry.ts';
import type { RenderSpan, TerminalStyle } from '../../visual/render-content.ts';
import { inspectSelection } from '../shared/inspection.ts';
import type { ChartStylePart } from '../style-parts.ts';
import type {
  HeatmapCellModel,
  HeatmapComponentAction,
  HeatmapComponentOptions,
  HeatmapModel,
} from './contracts.ts';
import type { HeatmapOptions } from './options.ts';
import {
  assertVisualizationCallbacks,
  boundedInteger,
  chartSpan,
  decodeValueScale,
  decodeVisualizationStatus,
  finite,
  nonEmpty,
  normalizedIndex,
  numericRange,
  optionalBoolean,
  paintStatus,
  selectedStyle,
  visibleWindow,
  visualizationUnavailable,
  withoutVisualizationBehavior,
} from './shared.ts';

const heatmapBase = {
  name: 'terminal-ui/components/heatmap' as const,
  identity: 'required' as const,
  structure: 'leaf' as const,
  semantics: 'semantic' as const,
  states: ['busy'] as const,
  accessibleRole: 'grid' as const,
  metadata: ['focus', 'layer', 'styles'] as const,
  parts: ['label', 'axis', 'series', 'value', 'legend', 'muted'] as const,
  visualStates: ['active', 'selected', 'disabled', 'busy'] as const,
  measure: measureHeatmap,
  reuse: { paint: (model: object) => [model] as const },
  render: paintHeatmap,
  accessibility: heatmapAccessibility,
  inspection: ({ model }: { readonly model: Readonly<HeatmapModel> }) => ({
    ...(model.activeId === undefined ? {} : { active: model.activeId }),
    selection: inspectSelection(model.selection),
    collection: {
      startIndex: 0,
      totalCount: model.rows.reduce((total, row) => total + row.length, 0),
      visibleCount: model.rows.reduce((total, row) => total + row.length, 0),
    },
  }),
};

const passiveHeatmap = defineComponent<HeatmapComponentOptions>()({ ...heatmapBase, createModel: createHeatmapModel });

const activeHeatmap = defineComponent<HeatmapComponentOptions, HeatmapComponentAction>()({
  ...heatmapBase,
  states: ['disabled', 'busy', 'inert'],
  createModel: createHeatmapModel,
  keys: ({ model, busy }) => {
    if (busy) return {};
    const transition = (value: HeatmapTransition): HeatmapComponentAction => ({ kind: 'transition', transition: value });
    return {
      arrowUp: () => transition({ kind: 'moveCell', rows: -1, columns: 0 }),
      arrowDown: () => transition({ kind: 'moveCell', rows: 1, columns: 0 }),
      arrowLeft: () => transition({ kind: 'moveCell', rows: 0, columns: -1 }),
      arrowRight: () => transition({ kind: 'moveCell', rows: 0, columns: 1 }),
      pageUp: () => transition({ kind: 'pageRows', delta: -1 }),
      pageDown: () => transition({ kind: 'pageRows', delta: 1 }),
      home: () => transition({ kind: 'firstActive' }),
      end: () => transition({ kind: 'lastActive' }),
      ...(model.activeId === undefined ? {} : {
        enter: () => ({ kind: 'activate' as const, event: { kind: 'activate' as const, id: model.activeId ?? '' } }),
      }),
    };
  },
  focusTargets: ({ bounds }) => [{ id: 'self', bounds }],
  hitTargets(input) {
    if (input.busy) return [];
    const plan = heatmapPlan(input.model, input.bounds.height);
    return plan.rows.flatMap((row, rowOffset) =>
      row.flatMap((cell) => {
        if (cell.disabled) return [];
        const column = cell.column * (input.model.cellWidth + input.model.gap);
        if (column >= input.bounds.width) return [];
        return [{
          id: `${input.id ?? 'heatmap'}:${cell.id}`,
          bounds: {
            row: rowOffset,
            column,
            width: Math.min(input.model.cellWidth, input.bounds.width - column),
            height: 1,
          },
          accepts: ['pointerDown'] as const,
          cursor: 'pointer' as const,
          focus: { kind: 'target' as const, targetId: 'self' },
          message: (event: RoutedPointerEvent) =>
            event.button !== 'left'
              ? ignoreMessage()
              : {
                kind: 'transition' as const,
                transition: { kind: 'setActive' as const, id: cell.id },
              },
        }];
      })
    );
  },
});

export function heatmap<TValue, const TMessage extends ComponentMessage = never>(
  options: HeatmapOptions<TValue, TMessage>,
): Element<TMessage> {
  if (options.state === undefined) {
    return passiveHeatmap(withoutVisualizationBehavior(options));
  }
  const componentOptions = withoutVisualizationBehavior(options);
  assertOptionalCallback(options.onActivate, 'heatmap onActivate');
  if (options.onTransition === undefined) {
    if (!visualizationUnavailable(options)) assertVisualizationCallbacks(options, 'heatmap');
    return activeHeatmap({ ...componentOptions, ...(options.disabled === true ? { disabled: true as const } : { inert: true as const }) });
  }
  assertVisualizationCallbacks(options, 'heatmap');
  return activeHeatmap({
    ...componentOptions,
    onAction: (action) => {
      if (action.kind === 'transition') return options.onTransition(action.transition);
      return options.onActivate?.(action.event) ?? ignoreMessage();
    },
  });
}

function createHeatmapModel(value: Readonly<HeatmapComponentOptions>): HeatmapModel {
  const label = nonEmpty(value.label, 'heatmap label');
  const ids = new Set<string>();
  const values: number[] = [];
  let itemIndex = 0;
  const rows = Object.freeze(value.rows.map((rawRow, row) => {
    return Object.freeze(rawRow.map((raw, column): HeatmapCellModel => {
      const id = nonEmpty(raw.id, 'heatmap cell id');
      if (ids.has(id)) throw new TypeError(`heatmap contains duplicate cell id "${id}".`);
      ids.add(id);
      const numeric = finite(raw.value, 'heatmap cell value');
      values.push(numeric);
      const cellModel = Object.freeze({
        id,
        itemIndex,
        row,
        column,
        label: nonEmpty(raw.label, 'heatmap cell label'),
        value: numeric,
        disabled: optionalBoolean(raw.disabled, 'heatmap cell disabled') ?? false,
      });
      itemIndex += 1;
      return cellModel;
    }));
  }));
  const range = numericRange(values, value.min, value.max, 'heatmap');
  const activeId = value.state?.activeId === undefined
    ? undefined
    : nonEmpty(value.state.activeId, 'heatmap activeId');
  const selection = decodeSelectionState(
    value.state?.selection ?? { mode: 'none' },
    'heatmap selection',
  );
  const cells = rows.flat();
  assertCollectionInteractionReferences(
    { selection },
    createCollectionInteractionIndex(cells.map((cell) => cell.id)),
    'heatmap state',
  );
  if (activeId !== undefined) {
    assertCollectionInteractionReferences(
      { activeId, selection: { mode: 'none' } },
      createCollectionInteractionIndex(cells.filter((cell) => !cell.disabled).map((cell) => cell.id)),
      'heatmap state',
    );
  }
  return {
    label,
    rows,
    minimum: range.min,
    maximum: range.max,
    ...(activeId === undefined ? {} : { activeId }),
    selection,
    cellWidth: boundedInteger(value.cellWidth, 1, 8, 3, 'heatmap cellWidth'),
    gap: boundedInteger(value.gap, 0, 4, 1, 'heatmap gap'),
    valueScale: decodeValueScale(value.valueScale, 'heatmap valueScale'),
    ...decodeVisualizationStatus(value, 'heatmap', values.length === 0),
  };
}

function measureHeatmap(input: ComponentMeasureInput<HeatmapModel>) {
  const widest = Math.max(
    0,
    ...input.model.rows.map((row) =>
      row.length * input.model.cellWidth + Math.max(0, row.length - 1) * input.model.gap
    ),
  );
  return {
    minWidth: 1,
    minHeight: 1,
    preferredWidth: Math.min(160, Math.max(1, widest)),
    preferredHeight: Math.min(40, Math.max(1, input.model.rows.length)),
  };
}

function paintHeatmap(input: ComponentRenderInput<HeatmapModel, ChartStylePart>): undefined {
  if (paintStatus(input, input.model)) return;
  const plan = heatmapPlan(input.model, input.bounds.height);
  for (const [rowOffset, row] of plan.rows.entries()) {
    const spans: RenderSpan[] = [];
    for (const cell of row) {
      if (cell.column > 0) {
        spans.push(chartSpan(
          input,
          ' '.repeat(input.model.gap),
          'muted',
          `cell.${String(cell.row)}.${String(cell.column)}.gap`,
          'separator',
        ));
      }
      spans.push(...heatmapCellSpans(input, cell));
    }
    input.target.write(rowOffset, 0, spans);
  }
}

function heatmapCellSpans(
  input: ComponentRenderInput<HeatmapModel, ChartStylePart>,
  cell: HeatmapCellModel,
): readonly RenderSpan[] {
  const intensity = normalizedIndex(cell.value, input.model, 4);
  const glyphs = [' ', '░', '▒', '▓', '█'] as const;
  const glyph = glyphs[intensity] ?? glyphs[0];
  const active = cell.id === input.model.activeId;
  const selected = selectionContains(input.model.selection, cell.id);
  const states = [
    ...(selected ? ['selected' as const] : []),
    ...(active ? ['active' as const] : []),
  ];
  const style = heatmapStyle(input.model, cell.value, intensity, active || selected);
  const id = `cell.${cell.id}`;
  if (!active && !selected) {
    return [chartSpan(
      input,
      fillTextCells(glyph, input.model.cellWidth, { widthProfile: input.widthProfile, textPresentation: input.textPresentation }),
      'series',
      `${id}.value`,
      'cell',
      style,
      cell.itemIndex,
      states,
    )];
  }
  if (input.model.cellWidth === 1) {
    return [chartSpan(
      input,
      oneCellGlyph('◆', '*', { widthProfile: input.widthProfile, textPresentation: input.textPresentation }),
      'series',
      `${id}.selected`,
      'selected',
      style,
      cell.itemIndex,
      states,
    )];
  }
  if (input.model.cellWidth === 2) {
    return [
      chartSpan(input, '›', 'series', `${id}.selected.marker`, 'marker', style, undefined, states),
      chartSpan(
        input,
        fillTextCells(glyph, 1, { widthProfile: input.widthProfile, textPresentation: input.textPresentation }),
        'series',
        `${id}.value`,
        'cell',
        style,
        cell.itemIndex,
        states,
      ),
    ];
  }
  return [
    chartSpan(input, '[', 'series', `${id}.selected.open`, 'marker', style, undefined, states),
    chartSpan(
      input,
      fillTextCells(glyph, Math.max(1, input.model.cellWidth - 2), {
        widthProfile: input.widthProfile, textPresentation: input.textPresentation,
      }),
      'series',
      `${id}.value`,
      'cell',
      style,
      cell.itemIndex,
      states,
    ),
    chartSpan(input, ']', 'series', `${id}.selected.close`, 'marker', style, undefined, states),
  ];
}

function heatmapAccessibility(input: ComponentAccessibilityInput<HeatmapModel>) {
  const plan = heatmapPlan(input.model, input.bounds.height);
  const columnCount = Math.max(0, ...input.model.rows.map((row) => row.length));
  return {
    id: input.id,
    role: 'grid' as const,
    label: input.model.label,
    description: `${String(input.model.rows.length)} heatmap rows. Showing ${
      String(plan.start + 1)
    }-${String(plan.end)}.`,
    disabled: input.disabled,
    ...(input.focused ? { focused: true } : {}),
    children: plan.rows.map((row, rowOffset) => {
      const rowIndex = plan.start + rowOffset;
      return {
        id: `${input.id}:row:${String(rowIndex)}`,
        role: 'row' as const,
        position: {
          rowIndex: rowIndex + 1,
          rowCount: input.model.rows.length,
          columnCount: Math.max(1, row.length),
        },
        children: row.map((cell) => ({
          id: `${input.id}:${cell.id}`,
          role: 'gridcell' as const,
          label: cell.label,
          value: cell.value,
          disabled: cell.disabled,
          selected: selectionContains(input.model.selection, cell.id),
          current: cell.id === input.model.activeId,
          position: {
            rowIndex: rowIndex + 1,
            rowCount: input.model.rows.length,
            columnIndex: cell.column + 1,
            columnCount: Math.max(1, columnCount),
          },
        })),
      };
    }),
  };
}

function heatmapPlan(model: HeatmapModel, height: number) {
  const active = model.rows.findIndex((row) => row.some((cell) => cell.id === model.activeId));
  const window = visibleWindow(model.rows.length, height, Math.max(0, active));
  return { ...window, rows: model.rows.slice(window.start, window.end) };
}

function heatmapStyle(
  model: HeatmapModel,
  value: number,
  intensity: number,
  selected: boolean,
): TerminalStyle {
  if (selected) return selectedStyle();
  let base: TerminalStyle = intensity <= 0
    ? { fg: { kind: 'theme', token: 'chart.muted' }, dim: true }
    : {
      fg: { kind: 'theme', token: 'chart.series.1' },
      ...(intensity === 1 ? { dim: true } : {}),
      ...(intensity >= 3 ? { bold: true } : {}),
    };
  if (model.valueScale.length === 0) return base;
  const ratio = Math.max(0, Math.min(1, (value - model.minimum) / (model.maximum - model.minimum)));
  let stop = model.valueScale[0];
  for (const candidate of model.valueScale) {
    if (ratio < candidate.at) break;
    stop = candidate;
  }
  if (stop !== undefined) base = { ...base, fg: { kind: 'theme', token: stop.token }, bold: true };
  return base;
}

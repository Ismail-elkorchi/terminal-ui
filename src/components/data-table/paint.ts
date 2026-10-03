import type { ComponentInput, ComponentRenderInput } from '../../component/contracts.ts';
import { paintComponentScrollbar } from '../../component/scrollbar.ts';
import { pointerVisualState } from '../../interaction/pointer-interaction.ts';
import { measureTextCells } from '../../text/measure.ts';
import { terminalStyleHasBackground } from '../../theme/theme.ts';
import { inlineSegmentText } from '../../visual/inline-content.ts';
import { sameStyleDependencies } from '../../visual/style-dependencies.ts';
import type { TerminalStyle } from '../../visual/render-content.ts';
import { clipRenderSpans, measureRenderSpans, span } from '../../visual/render-content.ts';
import type { TableStylePart } from '../style-parts.ts';
import type { TablePlan } from './layout.ts';
import { tablePlan, tableSeparatorCells, tableSortMarker } from './layout.ts';
import type { TableColumnModel, TableModel, TableRenderSource, TableRowModel } from './model.ts';
import { tableCellIsSelected, tableRowIsSelected, tableSourceFor } from './model.ts';

export function paintTable(input: ComponentRenderInput<TableModel, TableStylePart>): undefined {
  const plan = tablePlan(input);
  const source = tableSourceFor(input.model);
  const previousRows = retainedTableRows.get(source);
  const paintedRows = new Map<TableRowModel, RetainedTableRow>();
  if (plan.headerHeight > 0) {
    input.target.write(
      0,
      0,
      scrollTableSpans(
        tableHeaderSpans(input, plan),
        plan.horizontalOffset,
        plan.geometry.contentBounds.width,
        input.widthProfile,
      ),
    );
  }
  if (input.model.totalCount === 0 && plan.geometry.contentBounds.height > 0) {
    input.target.write(
      plan.headerHeight,
      0,
      scrollTableSpans(
        tableEmptySpans(input, plan),
        plan.horizontalOffset,
        plan.geometry.contentBounds.width,
        input.widthProfile,
      ),
    );
  } else {
    plan.rows.forEach((row, visibleIndex) => {
      input.target.write(
        plan.headerHeight + visibleIndex,
        0,
        scrollTableSpans(
          tableRowSpans(input, row, plan, previousRows, paintedRows),
          plan.horizontalOffset,
          plan.geometry.contentBounds.width,
          input.widthProfile,
        ),
      );
    });
  }
  retainedTableRows.set(source, paintedRows);
  // Source identities survive view construction, but off-screen decoded rows do
  // not accumulate as the user traverses a large collection.
  const visibleRows = new Set(plan.rows);
  for (const [index, row] of source.rowModels) {
    if (!visibleRows.has(row)) source.rowModels.delete(index);
  }
  paintComponentScrollbar({
    target: input.target,
    plan: plan.geometry,
    theme: input.theme,
    style: (part, state, base) => input.style({ part, base, ...(state === undefined ? {} : { states: [state] }) }),
    frameSource: (sourceInput) => input.frameSource(sourceInput),
  });
}

function tableHeaderSpans(
  input: ComponentRenderInput<TableModel, TableStylePart>,
  plan: TablePlan,
): readonly import('../../visual/render-content.ts').RenderSpan[] {
  const headerStyle = input.style({
    part: 'header',
    base: { fg: { kind: 'theme', token: 'table.header' }, bold: true },
  });
  const result: import('../../visual/render-content.ts').RenderSpan[] = input.model.semanticRole === 'table'
    ? []
    : [
    span(' '.repeat(plan.markerCells), {
      ...(headerStyle === undefined ? {} : { style: headerStyle }),
      source: tableFrameSource(input, 'header.marker', 'header', 'decoration'),
    }),
    ];
  input.model.columns.forEach((column, visibleIndex) => {
    if (visibleIndex > 0) result.push(tableSeparatorSpan(input, headerStyle));
    const width = plan.widths[visibleIndex] ?? 1;
    const sourceId = `${input.id ?? 'table'}:header:${String(column.index)}`;
    const cellStyle = input.style({
      part: 'headerCell',
      base: {
        fg: { kind: 'theme', token: 'table.header' },
        bold: true,
        ...(column.headerStyle ?? {}),
      },
    });
    const labelSpans: import('../../visual/render-content.ts').RenderSpan[] = [];
    if (column.header !== '') {
      labelSpans.push(
        span(column.header, {
          ...(cellStyle === undefined ? {} : { style: cellStyle }),
          source: tableFrameSource(
            input,
            `header.${String(column.index)}.label`,
            'header',
            'text',
            sourceId,
          ),
        }),
      );
    }
    const sort = input.model.sort?.columnId === column.id
      ? tableSortMarker(input.model.sort.direction)
      : '';
    if (sort !== '') {
      const sortStyle = input.style({
        part: 'sortIndicator',
        ...(cellStyle === undefined ? {} : { base: cellStyle }),
      });
      labelSpans.push(
        span(sort, {
          ...(sortStyle === undefined ? {} : { style: sortStyle }),
          source: tableFrameSource(
            input,
            `header.${String(column.index)}.sort`,
            'sort',
            'decoration',
            sourceId,
          ),
        }),
      );
    }
    if (input.model.semanticRole === 'grid' && column.resizable) {
      labelSpans.push(
        span(' ↔', {
          ...(cellStyle === undefined ? {} : { style: cellStyle }),
          source: tableFrameSource(
            input,
            `header.${String(column.index)}.resize`,
            'resize',
            'decoration',
            sourceId,
          ),
        }),
      );
    }
    result.push(
      ...tableSizedSpans(
        labelSpans,
        width,
        column.align,
        input.widthProfile,
        cellStyle,
        tableFrameSource(
          input,
          `header.${String(column.index)}.padding`,
          'padding',
          'decoration',
          sourceId,
        ),
      ),
    );
  });
  return result;
}

interface TableRowPaintDependencies {
  readonly id: string | undefined;
  readonly theme: ComponentRenderInput<TableModel>['theme'];
  readonly emoji: string;
  readonly ambiguous: string;
  readonly columns: TableModel['columns'];
  readonly semanticRole: TableModel['semanticRole'];
  readonly interactionKind: TableModel['interactionKind'];
  readonly density: TableModel['density'];
  readonly widths: readonly number[];
  readonly selected: boolean;
  readonly active: boolean;
  readonly activeColumnId: string | undefined;
  readonly selectedCells: readonly boolean[];
  readonly pointer: ReturnType<typeof pointerVisualState>;
  readonly cellPointers: readonly ReturnType<typeof pointerVisualState>[];
  readonly styles: ComponentRenderInput<TableModel>['styles'];
  readonly disabled: boolean;
  readonly busy: boolean;
  readonly readOnly: boolean;
  readonly inert: boolean;
}

function sameRowDependencies(a: TableRowPaintDependencies, b: TableRowPaintDependencies): boolean {
  if (a.id !== b.id || a.theme !== b.theme || a.emoji !== b.emoji || a.ambiguous !== b.ambiguous
    || a.columns !== b.columns || a.semanticRole !== b.semanticRole || a.interactionKind !== b.interactionKind
    || a.density !== b.density || a.selected !== b.selected || a.active !== b.active
    || a.activeColumnId !== b.activeColumnId || a.pointer !== b.pointer || !sameStyleDependencies(a.styles, b.styles)
    || a.disabled !== b.disabled || a.busy !== b.busy || a.readOnly !== b.readOnly || a.inert !== b.inert
    || a.widths.length !== b.widths.length || a.selectedCells.length !== b.selectedCells.length
    || a.cellPointers.length !== b.cellPointers.length) return false;
  return sameRowColumnDependencies(a, b);
}

function sameRowColumnDependencies(a: TableRowPaintDependencies, b: TableRowPaintDependencies): boolean {
  // These dense arrays are constructed here from visible columns, never supplied
  // as arbitrary application data. No row contents or collections are traversed.
  for (let i = 0; i < a.widths.length; i += 1) if (a.widths[i] !== b.widths[i]) return false;
  for (let i = 0; i < a.cellPointers.length; i += 1) {
    if (a.cellPointers[i] !== b.cellPointers[i] || a.selectedCells[i] !== b.selectedCells[i]) return false;
  }
  return true;
}

interface RetainedTableRow {
  readonly dependencies: TableRowPaintDependencies;
  readonly spans: readonly import('../../visual/render-content.ts').RenderSpan[];
}

// Keep the painted window, rather than retaining every row visited during scrolling.
const retainedTableRows = new WeakMap<TableRenderSource, ReadonlyMap<TableRowModel, RetainedTableRow>>();

function tableRowSpans(
  input: ComponentRenderInput<TableModel, TableStylePart>,
  row: TableRowModel,
  plan: TablePlan,
  previous: ReadonlyMap<TableRowModel, RetainedTableRow> | undefined,
  next: Map<TableRowModel, RetainedTableRow>,
): readonly import('../../visual/render-content.ts').RenderSpan[] {
  const active = input.model.activeRowId === row.id;
  const prefix = `${input.id ?? 'table'}:row:${row.id}`;
  const dependencies: TableRowPaintDependencies = {
    id: input.id, theme: input.theme, emoji: input.widthProfile.emoji, ambiguous: input.widthProfile.ambiguous,
    columns: input.model.columns, semanticRole: input.model.semanticRole,
    interactionKind: input.model.interactionKind, density: input.model.density, widths: plan.widths,
    selected: tableRowIsSelected(input.model, row.id), active,
    activeColumnId: active ? input.model.activeColumnId : undefined,
    selectedCells: input.model.columns.map(column => tableCellIsSelected(input.model, row.id, column.id)),
    pointer: pointerVisualState(input.pointerState, prefix),
    cellPointers: input.model.columns.map(column => pointerVisualState(input.pointerState, `${prefix}:cell:${String(column.index)}`)),
    styles: input.styles, disabled: input.disabled, busy: input.busy, readOnly: input.readOnly, inert: input.inert,
  };
  const cached = previous?.get(row);
  if (cached !== undefined && sameRowDependencies(cached.dependencies, dependencies)) {
    next.set(row, cached);
    return cached.spans;
  }
  const spans = Object.freeze(buildTableRowSpans(input, row, plan, dependencies));
  next.set(row, { dependencies, spans });
  return spans;
}

function buildTableRowSpans(
  input: ComponentRenderInput<TableModel, TableStylePart>,
  row: TableRowModel,
  plan: TablePlan,
  dependencies: TableRowPaintDependencies,
): readonly import('../../visual/render-content.ts').RenderSpan[] {
  const { selected, active, pointer } = dependencies;
  const rowStates = [
    ...(selected ? ['selected' as const] : []),
    ...(active ? ['active' as const] : []),
    ...(pointer === undefined ? [] : [pointer]),
  ];
  const rowState = rowStates.at(-1);
  const rowStyle = input.style({
    part: 'row',
    ...(rowStates.length === 0 ? {} : { states: rowStates }),
  });
  const markerStyle = input.style({
    part: 'marker',
    ...(rowStyle === undefined ? {} : { base: rowStyle }),
    ...(rowStates.length === 0 ? {} : { states: rowStates }),
  });
  const marker = selected && !terminalStyleHasBackground(markerStyle, input.theme)
    ? input.theme.tokens.symbols.selected
    : input.theme.tokens.symbols.unselected;
  const result: import('../../visual/render-content.ts').RenderSpan[] = input.model.semanticRole === 'table'
    ? []
    : [span(marker, {
      ...(markerStyle === undefined ? {} : { style: markerStyle }),
      source: tableFrameSource(
        input,
        `row.${row.id}.marker`,
        'marker',
        'decoration',
        row.id,
        row.rowIndex,
        rowState,
      ),
    }),
    span(' ', {
      ...(markerStyle === undefined ? {} : { style: markerStyle }),
      source: tableFrameSource(
        input,
        `row.${row.id}.marker.gap`,
        'marker',
        'decoration',
        row.id,
        row.rowIndex,
        rowState,
      ),
    })];
  input.model.columns.forEach((column, visibleIndex) => {
    if (visibleIndex > 0) result.push(tableSeparatorSpan(input, rowStyle));
    const cellSelected = dependencies.selectedCells[visibleIndex] === true;
    const cellActive = input.model.interactionKind === 'cell' && active &&
      dependencies.activeColumnId === column.id;
    const cellPointer = dependencies.cellPointers[visibleIndex];
    const cellStates = input.model.interactionKind === 'row'
      ? rowStates
      : [
        ...(cellSelected ? ['selected' as const] : []),
        ...(cellActive ? ['active' as const] : []),
        ...(cellPointer === undefined ? [] : [cellPointer]),
      ];
    result.push(
      ...tableCellSpans(
        input,
        row,
        visibleIndex,
        plan.widths[visibleIndex] ?? 1,
        column,
        rowStyle,
        cellStates,
      ),
    );
  });
  return result;
}

function tableCellSpans(
  input: ComponentRenderInput<TableModel, TableStylePart>,
  row: TableRowModel,
  columnIndex: number,
  width: number,
  column: TableColumnModel,
  rowStyle: TerminalStyle | undefined,
  states: readonly ('active' | 'disabled' | 'focused' | 'hovered' | 'pressed' | 'selected')[],
): readonly import('../../visual/render-content.ts').RenderSpan[] {
  const state = states.at(-1);
  const cell = row.cells[columnIndex] ?? { content: Object.freeze([]), text: '' };
  const part: TableStylePart = column.semantic === 'metric'
    ? 'metric'
    : column.semantic === 'metadata'
    ? 'metadata'
    : 'cell';
  const semanticStyle: TerminalStyle = column.semantic === 'metric'
    ? { fg: { kind: 'theme', token: 'table.metric' } }
    : column.semantic === 'metadata'
    ? { fg: { kind: 'theme', token: 'table.metadata' }, dim: true }
    : { fg: { kind: 'theme', token: 'text.default' } };
  const partName = `row.${row.id}.cell.${String(column.index)}`;
  const source = tableFrameSource(
    input,
    partName,
    column.semantic,
    column.semantic === 'metric' ? 'content' : 'text',
    row.id,
    row.rowIndex,
    state,
  );
  const rendered = cell.content.map((segment) => {
    const explicit = { ...semanticStyle, ...column.style, ...segment.style };
    const style = preserveExplicitTableForeground(
      input.style({
        part,
        base: { ...(rowStyle ?? {}), ...semanticStyle, ...explicit },
        ...(states.length === 0 ? {} : { states }),
      }),
      explicit,
    );
    return span(inlineSegmentText(segment, input.theme.tokens.symbols.mode), {
      ...(style === undefined ? {} : { style }),
      ...(segment.link === undefined ? {} : { link: segment.link }),
      source,
    });
  });
  const paddingStyle = input.style({
    part,
    base: { ...(rowStyle ?? {}), ...semanticStyle, ...(column.style ?? {}) },
    ...(states.length === 0 ? {} : { states }),
  });
  return tableSizedSpans(
    rendered,
    width,
    column.align,
    input.widthProfile,
    paddingStyle,
    tableFrameSource(
      input,
      `${partName}.padding`,
      'padding',
      'decoration',
      row.id,
      row.rowIndex,
      state,
    ),
  );
}

function preserveExplicitTableForeground(
  style: TerminalStyle | undefined,
  explicit: TerminalStyle,
): TerminalStyle | undefined {
  const foreground = explicit.fg;
  if (
    foreground === undefined || (foreground.kind === 'theme' && foreground.token === 'text.default')
  ) return style;
  return { ...(style ?? {}), fg: foreground };
}

function tableSizedSpans(
  spans: readonly import('../../visual/render-content.ts').RenderSpan[],
  width: number,
  alignment: TableColumnModel['align'],
  widthProfile: ComponentInput<TableModel>['widthProfile'],
  paddingStyle: TerminalStyle | undefined,
  paddingSource: import('../../visual/frame-source.ts').FrameCellSource,
): readonly import('../../visual/render-content.ts').RenderSpan[] {
  const clipped = clipRenderSpans(spans, width, { ellipsis: '…', widthProfile });
  const remaining = Math.max(0, width - measureRenderSpans(clipped, { widthProfile }));
  const before = alignment === 'end'
    ? remaining
    : alignment === 'center'
    ? Math.floor(remaining / 2)
    : 0;
  const after = remaining - before;
  return [
    ...(before === 0 ? [] : [
      span(' '.repeat(before), {
        ...(paddingStyle === undefined ? {} : { style: paddingStyle }),
        source: paddingSource,
      }),
    ]),
    ...clipped,
    ...(after === 0 ? [] : [
      span(' '.repeat(after), {
        ...(paddingStyle === undefined ? {} : { style: paddingStyle }),
        source: paddingSource,
      }),
    ]),
  ];
}

function tableEmptySpans(
  input: ComponentRenderInput<TableModel, TableStylePart>,
  plan: TablePlan,
): readonly import('../../visual/render-content.ts').RenderSpan[] {
  const markerStyle = input.style({ part: 'marker' });
  const emptyStyle = input.style({
    part: 'empty',
    base: { fg: { kind: 'theme', token: 'text.muted' }, dim: true },
  });
  return [
    span(' '.repeat(plan.markerCells), {
      ...(markerStyle === undefined ? {} : { style: markerStyle }),
      source: tableFrameSource(input, 'empty.marker', 'marker', 'decoration'),
    }),
    span(input.model.emptyText, {
      ...(emptyStyle === undefined ? {} : { style: emptyStyle }),
      source: tableFrameSource(input, 'empty', 'empty', 'text'),
    }),
  ];
}

function tableSeparatorSpan(
  input: ComponentRenderInput<TableModel, TableStylePart>,
  style: TerminalStyle | undefined,
): import('../../visual/render-content.ts').RenderSpan {
  return span(' '.repeat(tableSeparatorCells(input.model)), {
    ...(style === undefined ? {} : { style }),
    source: tableFrameSource(input, 'column.separator', 'separator', 'separator'),
  });
}

function scrollTableSpans(
  spans: readonly import('../../visual/render-content.ts').RenderSpan[],
  offsetCells: number,
  width: number,
  widthProfile: ComponentInput<TableModel>['widthProfile'],
): readonly import('../../visual/render-content.ts').RenderSpan[] {
  const visible: import('../../visual/render-content.ts').RenderSpan[] = [];
  let skipped = 0;
  let written = 0;
  for (const current of spans) {
    let visibleText = '';
    let exhausted = false;
    for (const grapheme of measureTextCells(current.text, { widthProfile }).graphemes) {
      if (skipped < offsetCells) {
        skipped += grapheme.cells;
        continue;
      }
      if (written + grapheme.cells > width) {
        exhausted = true;
        break;
      }
      visibleText += grapheme.text;
      written += grapheme.cells;
    }
    if (visibleText.length > 0) {
      visible.push({
        text: visibleText,
        ...(current.style === undefined ? {} : { style: current.style }),
        ...(current.link === undefined ? {} : { link: current.link }),
        ...(current.source === undefined ? {} : { source: current.source }),
      });
    }
    if (exhausted) break;
  }
  return visible;
}

function tableFrameSource(
  input: ComponentRenderInput<TableModel, TableStylePart>,
  partName: string,
  partType: string,
  cellRole: import('../../visual/frame-source.ts').FrameCellRole,
  itemId?: string,
  itemIndex?: number,
  interactionState?: Exclude<import('../../element/metadata.ts').ElementVisualState, 'default'>,
) {
  return input.frameSource({
    partName,
    partType,
    cellRole,
    description: partName,
    ...(itemId === undefined ? {} : { itemId }),
    ...(itemIndex === undefined ? {} : { itemIndex }),
    ...(interactionState === undefined ? {} : { interactionState }),
  });
}

import { controlKeyBindings } from '../shared/control-key-bindings.ts';
import type { DataGridKeyAction } from '../keymaps.ts';
import type { DataGridTransition } from '../../behavior/table.ts';
import { defineComponent } from '../../component/definition.ts';
import type { ComponentMessage } from '../../component/message.ts';
import type { Element } from '../../element/types.ts';
import {
  assertOptionalCallback,
  assertRequiredCallback,
  assertRequiredPropertyCallback,
} from '../../foundation/validation.ts';
import { ignoreMessage } from '../../interaction/message.ts';
import { inspectCollectionValues } from '../shared/inspection.ts';
import { tableAccessibility } from './accessibility.ts';
import { tableHitTargets, tableScrollHitTargets } from './interaction.ts';
import { measureTable } from './layout.ts';
import type { DataGridComponentAction, TableModel } from './model.ts';
import { activeTablePosition, createTableModel, ownTableModel, tableSourceFor } from './model.ts';
import type {
  DataGridOptions,
  ScrollableDataGridOptions,
  TableOptions,
  UnscrolledDataGridOptions,
} from './options.ts';
import { paintTable } from './paint.ts';

const tableBase = {
  identity: 'required' as const,
  structure: 'leaf' as const,
  semantics: 'semantic' as const,
  accessibleRole: 'table' as const,
  metadata: ['layer', 'styles'] as const,
  parts: [
    'header',
    'headerCell',
    'sortIndicator',
    'marker',
    'row',
    'cell',
    'metric',
    'metadata',
    'empty',
    'scrollbarTrack', 'scrollbarThumb',
  ] as const,
  visualStates: ['active', 'selected'] as const,
  createModel: ownTableModel,
  measure: measureTable,
  retainPaint: true as const,
  render: paintTable,
  accessibility: tableAccessibility,
  inspection: ({ model }: { readonly model: Readonly<TableModel> }) => ({
    ...(model.activeRowId === undefined ? {} : {
      active: model.activeColumnId === undefined
        ? model.activeRowId
        : { rowId: model.activeRowId, columnId: model.activeColumnId },
    }),
    selection: model.interactionKind === 'cell'
      ? {
          mode: model.selectionMode ?? 'none',
          cells: inspectCollectionValues(model.selectedCells, (cell) => ({
            rowId: cell.rowId,
            columnId: cell.columnId,
          })),
        }
      : {
          mode: model.selectionMode ?? 'none',
          rowIds: inspectCollectionValues(model.selectedRowIds, (id) => id),
        },
    collection: {
      startIndex: model.startIndex,
      totalCount: model.totalCount,
      visibleCount: tableSourceFor(model).rows.length,
    },
  }),
};

const passiveTable = defineComponent<TableModel>()({ ...tableBase, name: 'terminal-ui/components/table' });



const scrollableTable = defineComponent<TableModel, { readonly kind: 'scroll'; readonly request: import('../../interaction/scroll.ts').ScrollRequest }>()({
  ...tableBase,
  name: 'terminal-ui/components/table',
  hitTargets: tableScrollHitTargets,
});

const activeDataGrid = defineComponent<TableModel, DataGridComponentAction>()({
  ...tableBase,
  name: 'terminal-ui/components/data-grid',
  accessibleRole: 'grid',
  metadata: ['focus', 'layer', 'styles'],
  states: ['disabled', 'busy', 'inert'],
  visualStates: ['focused', 'hovered', 'pressed', 'active', 'selected', 'disabled', 'busy'],
  keys: ({ model, busy }) => {
    if (busy) return {};
    const active = activeTablePosition(model);
    const column = model.columns.find((candidate) => candidate.id === model.activeColumnId);
    const transition = (value: DataGridTransition): DataGridComponentAction => ({
      kind: 'transition',
      transition: value,
    });
    return controlKeyBindings<DataGridKeyAction, DataGridComponentAction>(model.keymap, {
      previousRow: () => transition({ kind: 'moveRow', delta: -1 }),
      nextRow: () => transition({ kind: 'moveRow', delta: 1 }),
      ...(model.interactionKind === 'cell'
        ? {
          previousColumn: () => transition({ kind: 'moveColumn', delta: -1 }),
          nextColumn: () => transition({ kind: 'moveColumn', delta: 1 }),
        }
        : {}),
      previousPage: () => transition({ kind: 'page', delta: -1 }),
      nextPage: () => transition({ kind: 'page', delta: 1 }),
      firstRow: () => transition({ kind: 'firstRow' }),
      lastRow: () => transition({ kind: 'lastRow' }),
      select: () => transition({ kind: 'commit' }),
      ...(column?.sortable ? { sort: () => transition({ kind: 'sortBy', columnId: column.id }) } : {}),
      ...(column?.resizable ? {
        shrinkColumn: () => transition({ kind: 'resizeColumnBy', columnId: column.id, delta: -1 }),
        growColumn: () => transition({ kind: 'resizeColumnBy', columnId: column.id, delta: 1 }),
      } : {}),
      ...(active === undefined ? {} : {
        activate: () => ({
          kind: 'activate' as const,
          event: model.interactionKind === 'cell' && model.activeColumnId !== undefined
            ? { kind: 'activate', target: { kind: 'cell', cell: { rowId: active.id, columnId: model.activeColumnId } } }
            : { kind: 'activate', target: { kind: 'row', rowId: active.id } },
        }),
      }),
    });
  },
  focusTargets: ({ bounds }) => [{ id: 'self', bounds }],
  hitTargets: (input) => input.busy ? [] : tableHitTargets(input),
});

export function table<TRow, const TMessage extends ComponentMessage = never>(
  options: TableOptions<TRow, TMessage>,
): Element<TMessage> {
  const model = createTableModel(options, 'table', options.scroll?.state);
  const componentOptions = {
    ...model,
    id: options.id,
    ...(options.styles === undefined ? {} : { styles: options.styles }),
    ...(options.meta === undefined ? {} : { meta: options.meta }),
  };
  const scroll = options.scroll;
  if (scroll !== undefined) {
    assertRequiredCallback(scroll.onScroll, 'table scroll.onScroll');
  }
  return scroll === undefined
    ? passiveTable(componentOptions)
    : scrollableTable({
      ...componentOptions,
      onAction: (action) => scroll.onScroll(action.request),
    });
}

/* eslint-disable @typescript-eslint/unified-signatures -- overloads preserve the unscrolled transition union */
export function dataGrid<
  TRow,
  const TTransitionMessage extends ComponentMessage = never,
  const TActivateMessage extends ComponentMessage = never,
>(options: ScrollableDataGridOptions<TRow, TTransitionMessage, TActivateMessage>): Element<TTransitionMessage | TActivateMessage>;

export function dataGrid<
  TRow,
  const TTransitionMessage extends ComponentMessage = never,
  const TActivateMessage extends ComponentMessage = never,
>(options: UnscrolledDataGridOptions<TRow, TTransitionMessage, TActivateMessage>): Element<TTransitionMessage | TActivateMessage>;

/* eslint-enable @typescript-eslint/unified-signatures */
export function dataGrid<
  TRow,
  const TTransitionMessage extends ComponentMessage = never,
  const TActivateMessage extends ComponentMessage = never,
>(
  options: DataGridOptions<TRow, TTransitionMessage, TActivateMessage>,
): Element<TTransitionMessage | TActivateMessage> {
  const model = createTableModel(options, 'grid');
  const shared = {
    ...model,
    id: options.id,
    ...(options.busy === undefined ? {} : { busy: options.busy }),
    ...(options.disabled === undefined ? {} : { disabled: options.disabled }),
    ...(options.inert === undefined ? {} : { inert: options.inert }),
    ...(options.styles === undefined ? {} : { styles: options.styles }),
    ...(options.meta === undefined ? {} : { meta: options.meta }),
  };
  assertOptionalCallback(options.onActivate, 'data-table onActivate');
  if (options.disabled === true && options.onTransition === undefined) return activeDataGrid({
    ...shared,
    disabled: true,
    ...(options.inert === undefined ? {} : { inert: options.inert }),
  });
  if (options.inert === true && options.onTransition === undefined) return activeDataGrid({ ...shared, inert: true });
  assertRequiredPropertyCallback(options, 'onTransition', 'dataGrid onTransition');
  assertOptionalCallback(options.onActivate, 'dataGrid onActivate');
  const onTransition = isScrollableDataGrid(options)
    ? (transition: DataGridTransition) => options.onTransition(transition)
    : (transition: DataGridTransition) => transition.kind === 'scroll'
      ? ignoreMessage()
      : options.onTransition(transition);
  return activeDataGrid({
    ...shared,
    onAction: (action) => {
      if (action.kind === 'transition') return onTransition(action.transition);
      return options.onActivate?.(action.event) ?? ignoreMessage();
    },
  });
}

function isScrollableDataGrid<
  TRow,
  TTransitionMessage extends ComponentMessage,
  TActivateMessage extends ComponentMessage,
>(
  options: DataGridOptions<TRow, TTransitionMessage, TActivateMessage>,
): options is ScrollableDataGridOptions<TRow, TTransitionMessage, TActivateMessage> {
  return options.state.scroll !== undefined;
}

import type { AccessibleNode } from '../../accessibility/types.ts';
import { adoptedAccessibleNode } from '../../accessibility/validate.ts';
import type { ComponentAccessibilityInput } from '../../component/index.ts';
import { tablePlan } from './layout.ts';
import type { TableModel, TableRowModel } from './model.ts';
import { tableCellIsSelected, tableRowIsSelected } from './model.ts';

type TableAccessibilityInput = ComponentAccessibilityInput<TableModel>;
interface RowAccessibility {
  readonly id: string;
  readonly columns: TableModel['columns'];
  readonly role: TableModel['semanticRole'];
  readonly hasHeader: boolean;
  readonly totalCount: number;
  readonly selected: boolean;
  readonly selectedCells: readonly boolean[];
  readonly node: AccessibleNode;
}
const rowAccessibility = new WeakMap<TableRowModel, RowAccessibility>();
interface HeaderAccessibility {
  readonly id: string;
  readonly role: TableModel['semanticRole'];
  readonly rowCount: number;
  readonly sortColumn: string | undefined;
  readonly sortDirection: string | undefined;
  readonly node: AccessibleNode;
}
const headerAccessibility = new WeakMap<TableModel['columns'], HeaderAccessibility>();

export function tableAccessibility(input: TableAccessibilityInput): AccessibleNode {
  const plan = tablePlan(input);
  const rowCount = input.model.totalCount + (input.model.hasHeader ? 1 : 0);
  const header = input.model.hasHeader ? [tableAccessibleHeader(input, rowCount)] : [];
  const body = plan.rows.map((row) => tableAccessibleRow(input, row, rowCount));
  const activeRowVisible = input.model.activeRowId !== undefined &&
    plan.rows.some((row) => row.id === input.model.activeRowId);
  return {
    id: input.id,
    role: input.model.semanticRole,
    description: `Showing ${String(plan.startIndex + 1)}-${String(plan.endIndexExclusive)} of ${String(input.model.totalCount)} rows.`,
    ...(input.focused ? { focused: true } : {}),
    ...(input.model.semanticRole === 'grid' && input.model.selectionMode === 'multiple'
      ? { multiSelectable: true } : {}),
    ...(input.model.semanticRole === 'grid' && activeRowVisible ? {
      activeDescendant: input.model.interactionKind === 'cell' && input.model.activeColumnId !== undefined
        ? `${input.id}:row:${input.model.activeRowId}:cell:${String(
          input.model.columns.find((column) => column.id === input.model.activeColumnId)?.index ?? 0
        )}` : `${input.id}:row:${input.model.activeRowId}`,
    } : {}),
    ...(rowCount === 0 && input.model.columns.length === 0 ? {} : {
      position: {
        ...(rowCount === 0 ? {} : { rowCount }),
        ...(input.model.columns.length === 0 ? {} : { columnCount: input.model.columns.length }),
      },
    }),
    window: {
      startIndex: plan.startIndex,
      endIndexExclusive: plan.endIndexExclusive,
      totalCount: input.model.totalCount,
      omittedBefore: plan.startIndex,
      omittedAfter: Math.max(0, input.model.totalCount - plan.endIndexExclusive),
    },
    children: [...header, ...body],
  };
}

function tableAccessibleHeader(input: TableAccessibilityInput, rowCount: number): AccessibleNode {
  const model = input.model;
  const previous = headerAccessibility.get(model.columns);
  if (previous?.id === input.id && previous.role === model.semanticRole
    && previous.rowCount === rowCount && previous.sortColumn === model.sort?.columnId
    && previous.sortDirection === model.sort?.direction) return adoptedAccessibleNode(previous.node) ?? previous.node;
  const node: AccessibleNode = {
    id: `${input.id}:headers`,
    role: 'row',
    position: { rowIndex: 1, rowCount, columnCount: model.columns.length },
    children: model.columns.map((column, index) => ({
      id: `${input.id}:header:${String(column.index)}`,
      role: 'columnheader',
      label: column.header || `Column ${String(index + 1)}`,
      value: column.header || `Column ${String(index + 1)}`,
      ...(model.semanticRole === 'grid' && (column.sortable || column.resizable) ? {
        description: [
          ...(column.sortable ? ['sortable'] : []),
          ...(column.resizable ? ['resizable'] : []),
          ...(model.sort?.columnId === column.id ? [`sorted ${model.sort.direction}`] : []),
        ].join(', '),
      } : {}),
      position: {
        rowIndex: 1, rowCount, columnIndex: index + 1, columnCount: model.columns.length,
        columnLabel: column.header || `Column ${String(index + 1)}`,
      },
    })),
  };
  headerAccessibility.set(model.columns, {
    id: input.id, role: model.semanticRole, rowCount,
    sortColumn: model.sort?.columnId, sortDirection: model.sort?.direction, node,
  });
  return node;
}

function tableAccessibleRow(input: TableAccessibilityInput, row: TableRowModel, rowCount: number): AccessibleNode {
  const model = input.model;
  const selected = tableRowIsSelected(model, row.id);
  const selectedCells = row.cells.map((_cell, index) => tableCellIsSelected(model, row.id, model.columns[index]?.id));
  const previous = rowAccessibility.get(row);
  if (previous?.id === input.id && previous.columns === model.columns && previous.role === model.semanticRole
    && previous.hasHeader === model.hasHeader && previous.totalCount === model.totalCount
    && previous.selected === selected && previous.selectedCells.every((value, index) => value === selectedCells[index])) {
    return adoptedAccessibleNode(previous.node) ?? previous.node;
  }
  const node: AccessibleNode = {
    id: `${input.id}:row:${row.id}`,
    role: 'row',
    ...(model.semanticRole === 'grid' ? { selected } : {}),
    position: {
      positionInSet: row.rowIndex + 1,
      setSize: model.totalCount,
      rowIndex: row.rowIndex + (model.hasHeader ? 2 : 1),
      rowCount,
      ...(model.columns.length === 0 ? {} : { columnCount: model.columns.length }),
    },
    children: row.cells.map((cell, index) => {
      const column = model.columns[index];
      return {
        id: `${input.id}:row:${row.id}:cell:${String(column?.index ?? index)}`,
        role: model.semanticRole === 'grid' ? 'gridcell' : 'cell',
        label: cell.text,
        value: cell.text,
        ...(model.semanticRole === 'grid' ? { selected: selectedCells[index] === true } : {}),
        position: {
          rowIndex: row.rowIndex + (model.hasHeader ? 2 : 1), rowCount,
          columnIndex: index + 1, columnCount: model.columns.length,
          columnLabel: column?.header ?? `Column ${String(index + 1)}`,
        },
      };
    }),
  };
  rowAccessibility.set(row, {
    id: input.id, columns: model.columns, role: model.semanticRole,
    hasHeader: model.hasHeader, totalCount: model.totalCount, selected, selectedCells, node,
  });
  return node;
}

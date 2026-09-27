import { tablePlan } from './layout.ts';
import type { TableModel } from './model.ts';

export function tableAccessibility(
  input: import('../../component/index.ts').ComponentAccessibilityInput<TableModel>,
) {
  const plan = tablePlan(input);
  const rowCount = input.model.totalCount + (input.model.hasHeader ? 1 : 0);
  const header = input.model.hasHeader
    ? [{
      id: `${input.id}:headers`,
      role: 'row' as const,
      position: { rowIndex: 1, rowCount, columnCount: input.model.columns.length },
      children: input.model.columns.map((column, index) => ({
        id: `${input.id}:header:${String(column.index)}`,
        role: 'columnheader' as const,
        label: column.header || `Column ${String(index + 1)}`,
        value: column.header || `Column ${String(index + 1)}`,
        ...(input.model.semanticRole === 'grid' && (column.sortable || column.resizable)
          ? {
            description: [
              ...(column.sortable ? ['sortable'] : []),
              ...(column.resizable ? ['resizable'] : []),
              ...(input.model.sort?.columnId === column.id
                ? [`sorted ${input.model.sort.direction}`]
                : []),
            ].join(', '),
          }
          : {}),
        position: {
          rowIndex: 1,
          rowCount,
          columnIndex: index + 1,
          columnCount: input.model.columns.length,
          columnLabel: column.header || `Column ${String(index + 1)}`,
        },
      })),
    }]
    : [];
  const body = plan.rows.map((row) => ({
    id: `${input.id}:row:${row.id}`,
    role: 'row' as const,
    ...(input.model.semanticRole === 'grid'
      ? { selected: input.model.selectedRowIds.includes(row.id) }
      : {}),
    position: {
      positionInSet: row.rowIndex + 1,
      setSize: input.model.totalCount,
      rowIndex: row.rowIndex + (input.model.hasHeader ? 2 : 1),
      rowCount,
      ...(input.model.columns.length === 0 ? {} : { columnCount: input.model.columns.length }),
    },
    children: row.cells.map((cell, index) => {
      const column = input.model.columns[index];
      const label = column?.header ?? `Column ${String(index + 1)}`;
      return {
        id: `${input.id}:row:${row.id}:cell:${String(column?.index ?? index)}`,
        role: input.model.semanticRole === 'grid' ? 'gridcell' as const : 'cell' as const,
        label: cell.text,
        value: cell.text,
        ...(input.model.semanticRole === 'grid'
          ? {
            selected: input.model.selectedCells.some((selected) =>
              selected.rowId === row.id && selected.columnId === column?.id
            ),
          }
          : {}),
        position: {
          rowIndex: row.rowIndex + (input.model.hasHeader ? 2 : 1),
          rowCount,
          columnIndex: index + 1,
          columnCount: input.model.columns.length,
          columnLabel: label,
        },
      };
    }),
  }));
  const activeRowVisible = input.model.activeRowId !== undefined &&
    plan.rows.some((row) => row.id === input.model.activeRowId);
  return {
    id: input.id,
    role: input.model.semanticRole,
    description: `Showing ${String(plan.startIndex + 1)}-${String(plan.endIndexExclusive)} of ${
      String(input.model.totalCount)
    } rows.`,
    ...(input.focused ? { focused: true } : {}),
    ...(input.model.semanticRole === 'grid' && input.model.selectionMode === 'multiple'
      ? { multiSelectable: true }
      : {}),
    ...(input.model.semanticRole === 'grid' && activeRowVisible
      ? {
        activeDescendant: input.model.interactionKind === 'cell' && input.model.activeColumnId !== undefined
          ? `${input.id}:row:${input.model.activeRowId}:cell:${String(
            input.model.columns.find((column) => column.id === input.model.activeColumnId)?.index ?? 0
          )}`
          : `${input.id}:row:${input.model.activeRowId}`,
      }
      : {}),
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

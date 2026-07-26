import type { ChoiceItem, SearchEntry } from '../../ui-model/contracts.ts';
import type {
  TableColumn,
} from '../options/content.ts';
import type { TableRenderColumn } from '../../renderer/model/props/content.ts';
import { resolveStableIds } from '../../ui-model/identity.ts';
import type { ColorSwatchPickerOption } from '../options/forms.ts';
import { sanitizeTerminalText } from '../../text/index.ts';
import { isNonArrayObject } from '../../foundation/validation.ts';
import {
  assertFiniteNumber,
  assertOptionalEnum,
  assertOptionalFiniteNumber
} from '../../authoring/validation.ts';
import type { TableColumnWidth } from '../../ui-model/content.ts';
import type { TablePresentation } from '../../ui-model/table.ts';

export function tableColumnsForRenderer<TRow>(
  columns: readonly TableColumn<TRow>[] | undefined
): readonly TableRenderColumn[] | undefined {
  return columns?.map((column): TableRenderColumn => {
    if ('render' in column) {
      throw new TypeError('Table columns with custom rendering must be created with tableColumn().');
    }
    const metadata = tableColumnMetadataForRenderer(column);
    if ('renderCell' in column) {
      const { value, renderCell } = column;
      return {
        ...metadata,
        value: (row: unknown, index: number) => value(row as TRow, index),
        renderCell: (row: unknown, rowIndex: number, columnIndex: number) =>
          renderCell(row as TRow, rowIndex, columnIndex)
      };
    }
    const { value } = column;
    return {
      ...metadata,
      value: (row: unknown, index: number) => value(row as TRow, index)
    };
  });
}

export function tablePresentationForRenderer(
  value: TablePresentation | undefined
): TablePresentation | undefined {
  if (value === undefined) return undefined;
  const sortValue: unknown = value.sort;
  let sort: TablePresentation['sort'];
  if (sortValue !== undefined) {
    if (
      !isNonArrayObject(sortValue)
      || typeof sortValue['columnId'] !== 'string'
      || sortValue['columnId'].trim().length === 0
      || (sortValue['direction'] !== 'ascending' && sortValue['direction'] !== 'descending')
    ) {
      throw new TypeError('Table sort requires a non-empty columnId and ascending or descending direction.');
    }
    sort = {
      columnId: sortValue['columnId'],
      direction: sortValue['direction']
    };
  }
  const columnWidths = value.columnWidths;
  if (columnWidths !== undefined) {
    for (const [id, width] of Object.entries(columnWidths)) {
      if (id.length === 0 || !Number.isFinite(width)) {
        throw new RangeError('Table column widths must use non-empty ids and finite numbers.');
      }
    }
  }
  const selectedCellValue: unknown = value.selectedCell;
  let selectedCell: TablePresentation['selectedCell'];
  if (selectedCellValue !== undefined) {
    if (!isNonArrayObject(selectedCellValue)) {
      throw new TypeError('Table selectedCell requires a non-empty rowId and non-negative safe integer columnIndex.');
    }
    const rowId = selectedCellValue['rowId'];
    const columnIndex = selectedCellValue['columnIndex'];
    if (
      typeof rowId !== 'string'
      || rowId.trim().length === 0
      || typeof columnIndex !== 'number'
      || !Number.isSafeInteger(columnIndex)
      || columnIndex < 0
    ) {
      throw new TypeError('Table selectedCell requires a non-empty rowId and non-negative safe integer columnIndex.');
    }
    selectedCell = { rowId, columnIndex };
  }
  return {
    ...(value.selectedRowId === undefined ? {} : { selectedRowId: value.selectedRowId }),
    ...(selectedCell === undefined ? {} : { selectedCell }),
    ...(sort === undefined ? {} : { sort }),
    ...(columnWidths === undefined ? {} : {
      columnWidths: Object.fromEntries(
        Object.entries(columnWidths).map(([id, width]) => [
          id,
          Math.max(1, Math.floor(width))
        ])
      )
    })
  };
}

function tableColumnMetadataForRenderer<TRow>(
  column: TableColumn<TRow>
): Omit<TableRenderColumn, 'value' | 'renderCell'> {
  if (typeof column.id !== 'string' || column.id.trim().length === 0) {
    throw new TypeError('Table columns must define a non-empty id.');
  }
  if (typeof column.value !== 'function') {
    throw new TypeError(`Table column "${column.id}" must define a value accessor.`);
  }
  if ('renderCell' in column && typeof column.renderCell !== 'function') {
    throw new TypeError(`Table column "${column.id}" renderCell must be a function.`);
  }
  assertOptionalEnum(column.align, ['start', 'center', 'end'], 'Table column align');
  assertOptionalEnum(column.semantic, ['text', 'metric', 'metadata'], 'Table column semantic');
  const align = column.align ?? 'start';
  return {
    id: sanitizeLine(column.id),
    ...(column.header === undefined ? {} : { header: sanitizeLine(column.header) }),
    ...(column.width === undefined ? {} : { width: normalizeTableColumnWidth(column.width) }),
    align,
    semantic: column.semantic ?? (align === 'end' ? 'metric' : 'text'),
    ...(column.hidden === true ? { hidden: true } : {}),
    ...(column.sortable === true ? { sortable: true } : {}),
    ...(column.resizable === true ? { resizable: true } : {}),
    ...(column.style === undefined ? {} : { style: column.style }),
    ...(column.headerStyle === undefined ? {} : { headerStyle: column.headerStyle })
  };
}

function normalizeTableColumnWidth(value: unknown): TableColumnWidth {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new RangeError('Table column width must be finite.');
    return Math.max(1, Math.floor(value));
  }
  if (!isNonArrayObject(value)) throw new TypeError('Table column width is invalid.');
  const candidate = value;
  switch (candidate['kind']) {
    case 'fixed':
      assertFiniteNumber(candidate['cells'], 'Fixed table column cells');
      return { kind: 'fixed', cells: Math.max(1, Math.floor(candidate['cells'])) };
    case 'percent':
      assertFiniteNumber(candidate['value'], 'Percent table column value');
      return { kind: 'percent', value: Math.max(0, candidate['value']) };
    case 'fill':
      assertOptionalFiniteNumber(candidate['weight'], 'Fill table column weight');
      return {
        kind: 'fill',
        ...(candidate['weight'] === undefined
          ? {}
          : { weight: Math.max(1, candidate['weight']) })
      };
    case 'content':
      assertOptionalFiniteNumber(candidate['min'], 'Content table column minimum');
      assertOptionalFiniteNumber(candidate['max'], 'Content table column maximum');
      return {
        kind: 'content',
        ...(candidate['min'] === undefined
          ? {}
          : { min: Math.max(1, Math.floor(candidate['min'])) }),
        ...(candidate['max'] === undefined
          ? {}
          : { max: Math.max(1, Math.floor(candidate['max'])) })
      };
    default:
      throw new TypeError('Table column width kind is invalid.');
  }
}

function sanitizeLine(value: string): string {
  return sanitizeTerminalText(value).text.replace(/\s*\n\s*/gu, ' ');
}

export function choiceItemsForRenderer<TValue>(items: readonly ChoiceItem<TValue>[]): readonly ChoiceItem<unknown>[] {
  resolveStableIds(items, (item) => item.id, 'choice');
  return items;
}

export function colorOptionsForRenderer<TValue>(
  options: readonly ColorSwatchPickerOption<TValue>[]
): readonly ColorSwatchPickerOption<unknown>[] {
  resolveStableIds(options, (option) => option.id, 'colorSwatchPicker');
  return options;
}

export function searchSelectionHandler<TValue, TMessage>(
  handler: ((entry: SearchEntry<TValue>) => TMessage) | undefined
): ((entry: SearchEntry<unknown>) => TMessage) | undefined {
  return handler === undefined ? undefined : (entry) => handler(entry as SearchEntry<TValue>);
}

import type { ChoiceItem, SearchEntry } from '../../ui-model/contracts.ts';
import type {
  TableColumn,
} from '../options/content.ts';
import type { TableRenderColumn } from '../../renderer/model/props/content.ts';
import { resolveStableIds } from '../../ui-model/identity.ts';
import type { ColorSwatchPickerOption } from '../options/forms.ts';
import type { HeatmapCell } from '../options/feedback.ts';

export function tableColumnsForRenderer<TRow>(
  columns: readonly TableColumn<TRow>[] | undefined
): readonly TableRenderColumn[] | undefined {
  return columns?.map((column) => {
    if ('render' in column) {
      throw new TypeError('Table columns with custom rendering must be created with tableColumn().');
    }
    if ('renderCell' in column) {
      const { value, renderCell, ...metadata } = column;
      return {
        ...metadata,
        value: (row: unknown, index: number) => value(row as TRow, index),
        renderCell: (row: unknown, rowIndex: number, columnIndex: number) =>
          renderCell(row as TRow, rowIndex, columnIndex)
      };
    }
    const { value, ...metadata } = column;
    return {
      ...metadata,
      value: (row: unknown, index: number) => value(row as TRow, index)
    };
  });
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

export function searchEntriesForRenderer<TValue>(entries: readonly SearchEntry<TValue>[]): readonly SearchEntry<unknown>[] {
  return entries;
}

export function searchSelectionHandler<TValue, TMessage>(
  handler: ((entry: SearchEntry<TValue>) => TMessage) | undefined
): ((entry: SearchEntry<unknown>) => TMessage) | undefined {
  return handler === undefined ? undefined : (entry) => handler(entry as SearchEntry<TValue>);
}

export function heatmapRowsForRenderer<TValue>(
  rows: readonly (readonly HeatmapCell<TValue>[])[]
): readonly (readonly HeatmapCell[])[] {
  return rows;
}

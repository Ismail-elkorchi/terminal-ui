import type { ChoiceItem, SearchEntry } from '../contracts.ts';
import type {
  TableColumn,
  TablePointerSelection,
  TreeDisclosureAction,
  TreeNode
} from '../options/content.ts';
import type { ColorPickerOption, DatePickerDay } from '../options/forms.ts';
import type { HeatmapCell } from '../options/feedback.ts';
import type { RoutedPointerEvent } from '../../tui/pointer-types.ts';

export function domainValues(values: readonly unknown[]): readonly unknown[] {
  return values;
}

export function tableColumnsForRenderer<TRow>(
  columns: readonly TableColumn<TRow>[] | undefined
): readonly TableColumn[] | undefined {
  return columns?.map((column) => {
    const { value, render, ...metadata } = column;
    return {
      ...metadata,
      value: (row: unknown, index: number) => value(row as TRow, index),
      ...(render === undefined ? {} : {
        render: (input) => render({
        ...input,
        row: input.row as TRow
        })
      })
    };
  });
}

export function tableSelectionHandler<TRow, TMessage>(
  handler: ((selection: TablePointerSelection<TRow>) => TMessage) | undefined
): ((selection: TablePointerSelection) => TMessage) | undefined {
  return handler === undefined
    ? undefined
    : (selection) => handler(selection as TablePointerSelection<TRow>);
}

export function treeNodesForRenderer<TMetadata extends Readonly<Record<string, unknown>>>(
  nodes: readonly TreeNode<TMetadata>[]
): readonly TreeNode[] {
  return nodes;
}

export function treeSelectionHandler<TMetadata extends Readonly<Record<string, unknown>>, TMessage>(
  handler: ((node: TreeNode<TMetadata>) => TMessage) | undefined
): ((node: TreeNode) => TMessage) | undefined {
  return handler === undefined ? undefined : (node) => handler(node as TreeNode<TMetadata>);
}

export function treeDisclosureHandler<TMetadata extends Readonly<Record<string, unknown>>, TMessage>(
  handler: ((node: TreeNode<TMetadata>, action: TreeDisclosureAction, event: RoutedPointerEvent) => TMessage) | undefined
): ((node: TreeNode, action: TreeDisclosureAction, event: RoutedPointerEvent) => TMessage) | undefined {
  return handler === undefined
    ? undefined
    : (node, action, event) => handler(node as TreeNode<TMetadata>, action, event);
}

export function choiceItemsForRenderer<TValue>(items: readonly ChoiceItem<TValue>[]): readonly ChoiceItem<unknown>[] {
  return items;
}

export function choiceHandler<TValue, TMessage>(
  handler: ((option: ChoiceItem<TValue>) => TMessage) | undefined
): ((option: ChoiceItem<unknown>) => TMessage) | undefined {
  return handler === undefined ? undefined : (option) => handler(option as ChoiceItem<TValue>);
}

export function checkboxChoiceHandler<TValue, TMessage>(
  handler: ((option: ChoiceItem<TValue>, checked: boolean) => TMessage) | undefined
): ((option: ChoiceItem<unknown>, checked: boolean) => TMessage) | undefined {
  return handler === undefined
    ? undefined
    : (option, checked) => handler(option as ChoiceItem<TValue>, checked);
}

export function colorOptionsForRenderer<TValue>(
  options: readonly ColorPickerOption<TValue>[]
): readonly ColorPickerOption<unknown>[] {
  return options;
}

export function colorSelectionHandler<TValue, TMessage>(
  handler: ((option: ColorPickerOption<TValue>) => TMessage) | undefined
): ((option: ColorPickerOption<unknown>) => TMessage) | undefined {
  return handler === undefined ? undefined : (option) => handler(option as ColorPickerOption<TValue>);
}

export function dateDaysForRenderer<TValue>(days: readonly DatePickerDay<TValue>[]): readonly DatePickerDay<unknown>[] {
  return days;
}

export function dateSelectionHandler<TValue, TMessage>(
  handler: ((day: DatePickerDay<TValue>) => TMessage) | undefined
): ((day: DatePickerDay<unknown>) => TMessage) | undefined {
  return handler === undefined ? undefined : (day) => handler(day as DatePickerDay<TValue>);
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

export function heatmapSelectionHandler<TValue, TMessage>(
  handler: ((cell: HeatmapCell<TValue>, row: number, column: number) => TMessage) | undefined
): ((cell: HeatmapCell, row: number, column: number) => TMessage) | undefined {
  return handler === undefined
    ? undefined
    : (cell, row, column) => handler(cell as HeatmapCell<TValue>, row, column);
}

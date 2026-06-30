import { paginator, stack, table } from './factories.ts';
import type {
  AccessibleNodeDefinition,
  TableCellSelection,
  TableColumn,
  Widget,
  WidgetKeyMap,
  WidgetLayerOptions
} from './types.ts';
import type { ScrollState } from '../tui/scroll.ts';
import type { ScrollbarOptions } from '../tui/scrollbar.ts';

export interface PaginatedTableOptions<TMessage = never> extends WidgetLayerOptions {
  readonly id?: string;
  readonly rows: readonly unknown[];
  readonly columns?: readonly TableColumn[];
  readonly page: number;
  readonly pageSize: number;
  readonly selected?: number;
  readonly selectedCell?: TableCellSelection;
  readonly stickyHeader?: boolean;
  readonly emptyText?: string;
  readonly label?: string;
  readonly gap?: number;
  readonly tableId?: string;
  readonly paginatorId?: string;
  readonly message?: TMessage;
  readonly keyMap?: WidgetKeyMap<TMessage>;
  readonly accessibility?: AccessibleNodeDefinition;
}

export interface VirtualTableOptions<TMessage = never> extends WidgetLayerOptions {
  readonly id?: string;
  readonly rows: readonly unknown[];
  readonly columns?: readonly TableColumn[];
  readonly selected?: number;
  readonly selectedCell?: TableCellSelection;
  readonly scroll?: ScrollState;
  readonly scrollbar?: ScrollbarOptions;
  readonly stickyHeader?: boolean;
  readonly emptyText?: string;
  readonly message?: TMessage;
  readonly keyMap?: WidgetKeyMap<TMessage>;
  readonly accessibility?: AccessibleNodeDefinition;
}

export function paginatedTable<TMessage>(options: PaginatedTableOptions<TMessage>): Widget<TMessage> {
  const pageSize = Math.max(1, Math.floor(options.pageSize));
  const pageCount = Math.max(1, Math.ceil(options.rows.length / pageSize));
  const page = clampPage(options.page, pageCount);
  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  const selected = selectedInsidePage(options.selected, start, end);
  const selectedCell = selectedCellInsidePage(options.selectedCell, start, end);
  const tableId = options.tableId ?? childId(options.id, 'table');
  const paginatorId = options.paginatorId ?? childId(options.id, 'paginator');
  return stack([
    table({
      ...(tableId === undefined ? {} : { id: tableId }),
      rows: options.rows.slice(start, end),
      ...(options.columns === undefined ? {} : { columns: options.columns }),
      ...(selected === undefined ? {} : { selected }),
      ...(selectedCell === undefined ? {} : { selectedCell }),
      ...(options.stickyHeader === undefined ? {} : { stickyHeader: options.stickyHeader }),
      ...(options.emptyText === undefined ? {} : { emptyText: options.emptyText }),
      ...(options.message === undefined ? {} : { message: options.message }),
      ...(options.keyMap === undefined ? {} : { keyMap: options.keyMap })
    }),
    paginator({
      ...(paginatorId === undefined ? {} : { id: paginatorId }),
      page,
      pageCount,
      ...(options.label === undefined ? {} : { label: options.label })
    })
  ], {
    ...(options.id === undefined ? {} : { id: options.id }),
    gap: options.gap ?? 1,
    ...(options.accessibility === undefined ? {} : { accessibility: options.accessibility }),
    ...layerOptions(options)
  });
}

export function virtualTable<TMessage>(options: VirtualTableOptions<TMessage>): Widget<TMessage> {
  return table({
    ...(options.id === undefined ? {} : { id: options.id }),
    rows: options.rows,
    ...(options.columns === undefined ? {} : { columns: options.columns }),
    ...(options.selected === undefined ? {} : { selected: options.selected }),
    ...(options.selectedCell === undefined ? {} : { selectedCell: options.selectedCell }),
    ...(options.scroll === undefined ? {} : { scroll: options.scroll }),
    scrollbar: options.scrollbar ?? { axis: 'both' },
    stickyHeader: options.stickyHeader ?? true,
    ...(options.emptyText === undefined ? {} : { emptyText: options.emptyText }),
    ...(options.message === undefined ? {} : { message: options.message }),
    ...(options.keyMap === undefined ? {} : { keyMap: options.keyMap }),
    ...(options.accessibility === undefined ? {} : { accessibility: options.accessibility }),
    ...layerOptions(options)
  });
}

function clampPage(page: number, pageCount: number): number {
  if (!Number.isFinite(page)) return 1;
  return Math.max(1, Math.min(pageCount, Math.floor(page)));
}

function selectedInsidePage(selected: number | undefined, start: number, end: number): number | undefined {
  if (selected === undefined) return undefined;
  const row = Math.floor(selected);
  return row >= start && row < end ? row - start : undefined;
}

function selectedCellInsidePage(
  selectedCell: TableCellSelection | undefined,
  start: number,
  end: number
): TableCellSelection | undefined {
  if (selectedCell === undefined) return undefined;
  const row = Math.floor(selectedCell.row);
  if (row < start || row >= end) return undefined;
  return {
    row: row - start,
    ...(selectedCell.column === undefined ? {} : { column: selectedCell.column })
  };
}

function childId(id: string | undefined, suffix: string): string | undefined {
  return id === undefined ? undefined : `${id}:${suffix}`;
}

function layerOptions(options: WidgetLayerOptions): WidgetLayerOptions {
  return {
    ...(options.zIndex === undefined ? {} : { zIndex: options.zIndex }),
    ...(options.visible === undefined ? {} : { visible: options.visible }),
    ...(options.opacity === undefined ? {} : { opacity: options.opacity }),
    ...(options.focus === undefined ? {} : { focus: options.focus }),
    ...(options.styles === undefined ? {} : { styles: options.styles })
  };
}

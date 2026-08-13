import {
  dataGrid,
  tableColumn,
  type Element,
  type TableCellRenderInput,
  type TableColumn
} from '@ismail-elkorchi/terminal-ui/components';

interface ProcessRow {
  readonly pid: number;
  readonly name: string;
  readonly active: boolean;
  readonly state: 'idle' | 'running';
  readonly owner: { readonly handle: string };
}

const rows: readonly ProcessRow[] = [{
  pid: 42,
  name: 'worker',
  active: true,
  state: 'running',
  owner: { handle: 'ada' }
}];
const column = tableColumn<ProcessRow>();
const processes = dataGrid({
  getRowId: (row) => String(row.pid),
  id: 'processes',
  rows,
  columns: [
    column({
      id: 'pid',
      header: 'PID',
      value: (row) => row.pid,
      render: ({ value }) => value.toFixed(0)
    }),
    column({
      id: 'name',
      header: 'Name',
      value: (row) => row.name,
      render: ({ value }) => value.toUpperCase()
    }),
    column({
      id: 'active',
      value: (row) => row.active,
      render: ({ value }) => value ? 'yes' : 'no'
    }),
    column({
      id: 'state',
      value: (row) => row.state,
      render: ({ value }) => value === 'running' ? 'busy' : 'idle'
    }),
    column({
      id: 'owner',
      value: (row) => row.owner,
      render: ({ value }) => value.handle
    }),
    { id: 'automatic', value: (row) => row.name }
  ],
  presentation: {
    interaction: {
      kind: 'cell',
      selectionMode: 'single' as const,
      activeCell: { rowId: '42', columnId: 'name' },
      selectedCells: [{ rowId: '42', columnId: 'name' }]
    }
  },
  onTransition: (action) => ({
    kind: 'selected' as const,
    action
  })
});

const accepted: Element<{
  readonly kind: 'selected';
  readonly action: import('@ismail-elkorchi/terminal-ui/components').DataGridTransition;
}> = processes;
void accepted;

const invalidColumn: TableColumn<ProcessRow> = {
  id: 'invalid-renderer',
  value: (row) => row.pid,
  // @ts-expect-error custom cell functions must use tableColumn() to preserve the value type
  render: ({ value }: TableCellRenderInput<ProcessRow, number>) => String(value)
};
void invalidColumn;

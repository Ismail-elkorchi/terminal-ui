import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  chart,
  column,
  dataGrid,
  defineTui,
  grid,
  helpBar,
  intervalSource,
  progressBar,
  row,
  runTui,
  sparkline,
  statusBar,
  surface,
  tableColumn,
  text
} from '@ismail-elkorchi/terminal-ui';
import { createMemoryTerminalHost } from '@ismail-elkorchi/terminal-ui/host';
import { createTuiRuntime } from '@ismail-elkorchi/terminal-ui/tui';
import type { TuiContext, TuiRuntime, TuiUpdateResult } from '@ismail-elkorchi/terminal-ui/tui';
import { renderFramePlain } from '@ismail-elkorchi/terminal-ui/renderer';
import type { FrameHitTarget, TerminalStyle } from '@ismail-elkorchi/terminal-ui/renderer';
import type {
  CompleteTableCollection,
  InlineTextSegment,
  TableColumn,
  TableColumnBuilder,
  ValueScale,
} from '@ismail-elkorchi/terminal-ui';
import {
  createScrollState,
  dataGridReducer,
  prepareTableCollection,
  sortTableRows,
} from '@ismail-elkorchi/terminal-ui/behavior';
import type { DataGridTransition, ScrollableDataGridPresentation } from '@ismail-elkorchi/terminal-ui';
import { keyInput, pointerInput } from '@ismail-elkorchi/terminal-ui/testing';
import { themeColor } from '@ismail-elkorchi/terminal-ui/theme';
import type { ThemeColorToken } from '@ismail-elkorchi/terminal-ui/theme';

interface ProcessRow {
  readonly pid: number;
  readonly program: string;
  readonly command: string;
  readonly threads: number;
  readonly user: string;
  readonly memory: string;
  readonly cpu: number;
}

interface MonitorState {
  readonly tick: number;
  readonly processTable: ScrollableDataGridPresentation;
  readonly processes: CompleteTableCollection<ProcessRow>;
}

type MonitorMessage =
  | { readonly kind: 'tick'; readonly tick: number }
  | { readonly kind: 'cycleSort' }
  | { readonly kind: 'processTable'; readonly action: DataGridTransition }
  | { readonly kind: 'exit' };

interface CoreSample {
  readonly core: string;
  readonly load: number;
  readonly temp: number;
}

const monitorScale: ValueScale = Object.freeze([
  { at: 0, token: 'scale.low', label: 'low' },
  { at: 0.45, token: 'scale.medium', label: 'medium' },
  { at: 0.7, token: 'scale.high', label: 'high' },
  { at: 0.88, token: 'scale.critical', label: 'critical' }
]);

const baseProcessRows: readonly ProcessRow[] = Object.freeze([
  { pid: 18, program: 'migration/0', command: 'kernel worker', threads: 1, user: 'root', memory: '0B', cpu: 0.0 },
  { pid: 19, program: 'kprobe-optimizer', command: 'kernel worker', threads: 1, user: 'root', memory: '0B', cpu: 0.0 },
  { pid: 20, program: 'idle_inject/0', command: 'idle governor', threads: 1, user: 'root', memory: '0B', cpu: 0.0 },
  { pid: 21, program: 'cpuhp/0', command: 'hotplug control', threads: 1, user: 'root', memory: '0B', cpu: 0.0 },
  { pid: 22, program: 'cpuhp/1', command: 'hotplug control', threads: 1, user: 'root', memory: '0B', cpu: 0.0 },
  { pid: 23, program: 'idle_inject/1', command: 'idle governor', threads: 1, user: 'root', memory: '0B', cpu: 0.0 },
  { pid: 24, program: 'migration/1', command: 'kernel worker', threads: 1, user: 'root', memory: '0B', cpu: 0.0 },
  { pid: 25, program: 'ksoftirqd/1', command: 'soft irq', threads: 1, user: 'root', memory: '0B', cpu: 0.0 },
  { pid: 26, program: 'kworker/1:0H', command: 'events_highpri', threads: 1, user: 'root', memory: '0B', cpu: 0.0 },
  { pid: 27, program: 'node', command: 'terminal-ui example', threads: 14, user: 'ismail', memory: '188M', cpu: 4.2 },
  { pid: 28, program: 'bash', command: 'interactive shell', threads: 1, user: 'ismail', memory: '12M', cpu: 0.1 },
  { pid: 29, program: 'gitstatusd', command: 'prompt status', threads: 6, user: 'ismail', memory: '38M', cpu: 1.4 },
  { pid: 30, program: 'systemd', command: 'user services', threads: 3, user: 'root', memory: '47M', cpu: 0.0 },
  { pid: 31, program: 'dbus-daemon', command: 'session bus', threads: 1, user: 'ismail', memory: '9M', cpu: 0.0 },
  { pid: 32, program: 'pipewire', command: 'audio graph', threads: 5, user: 'ismail', memory: '84M', cpu: 0.6 },
  { pid: 33, program: 'wireplumber', command: 'session policy', threads: 4, user: 'ismail', memory: '31M', cpu: 0.2 }
]);

const processRows: readonly ProcessRow[] = Object.freeze([
  ...baseProcessRows,
  ...Array.from({ length: 72 }, (_, index) => {
    const names = ['code', 'node', 'gnome-shell', 'pipewire', 'rust-analyzer', 'typescript', 'browser', 'worker'];
    const program = names[index % names.length] ?? 'process';
    return {
      pid: 1000 + index * 17,
      program,
      command: `${program} ${index % 3 === 0 ? 'renderer' : index % 3 === 1 ? 'service' : 'worker'} loop`,
      threads: 1 + (index % 28),
      user: index % 5 === 0 ? 'root' : 'ismail',
      memory: `${String(64 + ((index * 37) % 980))}M`,
      cpu: Number(((index * 1.7) % 18).toFixed(1))
    };
  })
]);

const cpuBase = Object.freeze(Array.from({ length: 180 }, (_value, index) => {
  const drift = 16 + ((index * 7) % 19);
  const wave = Math.round(9 * Math.sin(index / 6) + 6 * Math.sin(index / 17));
  const burst = index % 53 > 43 ? 28 - (index % 53 - 44) * 3 : 0;
  return clamp(drift + wave + burst, 4, 92);
}));
const netDown = Object.freeze([0, 1, 0, 2, 0, 4, 2, 8, 10, 4, 2, 0, 12, 26, 4, 0, 18, 5, 3, 0, 10, 2, 44, 9, 0, 3, 20, 2, 0, 1, 18, 4, 0, 0, 3, 2]);
const netUp = Object.freeze([0, -1, 0, -4, -2, -8, -14, -6, -2, 0, -10, -22, -8, -3, 0, -6, -16, -26, -9, 0, -5, -12, -7, -2, 0, -4, -9, -3, 0, -1, -7, -18, -5, 0, -2, -1]);

const quitKey = { kind: 'key', key: 'q' } as const;
const sortKey = { kind: 'key', key: 's' } as const;
const nextProcessKey = { kind: 'key', key: 'arrowDown' } as const;
const previousProcessKey = { kind: 'key', key: 'arrowUp' } as const;

export const btopMonitorApp = defineTui<MonitorState, MonitorMessage>({
  id: 'btop-monitor',
  init: () => ({
    state: initialState(),
    focus: { kind: 'element', elementId: 'process-table' },
  }),
  subscriptions: () => [intervalSource('btop-tick', 1000, (tick) => ({ kind: 'tick', tick }))],
  inputBindings: [
    {
      id: 'exit',
      triggers: [quitKey, { kind: 'text', text: 'q' }, { kind: 'key', key: 'c', modifiers: { ctrl: true } }],
      label: 'Quit',
      message: { kind: 'exit' }
    },
    { id: 'next-sort', triggers: [sortKey, { kind: 'text', text: 's' }], label: 'Sort', message: { kind: 'cycleSort' } },
    { id: 'next-process', triggers: [{ kind: 'text', text: 'j' }], label: 'Next process', message: { kind: 'processTable', action: { kind: 'moveRow', delta: 1 } } },
    { id: 'previous-process', triggers: [{ kind: 'text', text: 'k' }], label: 'Previous process', message: { kind: 'processTable', action: { kind: 'moveRow', delta: -1 } } }
  ],
  update: updateMonitor,
  view: monitorView,
  nonTty: { mode: 'last_frame' }
});

function initialState(): MonitorState {
  const selectedRowId = String(processRows[9]?.pid ?? processRows[0]?.pid ?? '');
  const sort = { columnId: 'memory', direction: 'descending' } as const;
  return {
    tick: 0,
    processes: prepareProcessCollection(sort),
    processTable: {
      interaction: {
        kind: 'row',
        activeRowId: selectedRowId,
        selection: { mode: 'single', selectedRowId, selectionFollowsActive: true },
      },
      sort,
      scroll: createScrollState()
    }
  };
}

function updateMonitor(
  state: MonitorState,
  message: MonitorMessage
): TuiUpdateResult<MonitorState, MonitorMessage> {
  switch (message.kind) {
    case 'tick':
      return {
        state: {
          ...state,
          tick: message.tick
        }
      };
    case 'cycleSort': {
      const columnId = state.processTable.sort?.columnId === 'memory' ? 'cpu' : 'memory';
      const sort = { columnId, direction: 'descending' } as const;
      return {
        state: {
          ...state,
          processes: prepareProcessCollection(sort),
          processTable: {
            ...state.processTable,
            sort,
          }
        }
      };
    }
    case 'processTable': {
      const processTable = dataGridReducer(state.processTable, message.action, {
        collection: state.processes,
        columnIds: processColumns.map((column) => column.id),
        pageSize: 20
      });
      const sortChanged = processTable.sort?.columnId !== state.processTable.sort?.columnId
        || processTable.sort?.direction !== state.processTable.sort?.direction;
      if (processTable === state.processTable) return { state };
      return {
        state: {
          ...state,
          processTable,
          processes: sortChanged && processTable.sort !== undefined
            ? prepareProcessCollection(processTable.sort)
            : state.processes,
        }
      };
    }
    case 'exit':
      return { state, exit: { reason: 'user requested exit' } };
  }
}

function monitorView(state: MonitorState, context: TuiContext) {
  if (context.terminalSize.columns < 60 || context.terminalSize.rows < 18) {
    return monitorMinimumSizeNotice();
  }
  const wide = context.terminalSize.columns >= 120;
  return wide ? wideMonitor(state) : compactMonitor(state);
}

function monitorMinimumSizeNotice() {
  return surface(column([
    text({ id: 'btop-size-title', content: 'System Monitor', textRole: 'title' }),
    text({ id: 'btop-size-message', content: 'This example requires at least 60 columns and 18 rows.' }),
  ], { id: 'btop-size-content', gap: 1 }), {
    id: 'btop-root',
    appearance: 'inset',
    padding: 1,
    meta: { accessibility: { role: 'application', label: 'Monitor size requirement' } },
  });
}

function wideMonitor(state: MonitorState) {
  return grid({
    id: 'btop-root',
    areas: `
      top top
      cpu cpu
      mem proc
      net proc
      help proc
    `,
    rows: [
      { kind: 'fixed', cells: 3 },
      { kind: 'fixed', cells: 15 },
      { kind: 'fixed', cells: 12 },
      { kind: 'fill' },
      { kind: 'fixed', cells: 1 }
    ],
    columns: [{ kind: 'fixed', cells: 72 }, { kind: 'fill' }],
    gap: 1,
    children: {
      top: topBar(state),
      cpu: cpuPanel(state),
      mem: row([memoryPanel(), disksPanel()], {
        id: 'btop-memory-disks',
        sizes: [{ kind: 'fill' }, { kind: 'fill' }],
        gap: 1
      }),
      net: networkPanel(state),
      help: footerHelp(),
      proc: processPanel(state)
    }
  });
}

function compactMonitor(state: MonitorState) {
  return grid({
    id: 'btop-root-compact',
    areas: `
      top
      cpu
      proc
      help
    `,
    rows: [{ kind: 'fixed', cells: 2 }, { kind: 'fixed', cells: 12 }, { kind: 'fill' }, { kind: 'fixed', cells: 1 }],
    columns: [{ kind: 'fill' }],
    gap: 1,
    children: {
      top: topBar(state),
      cpu: cpuPanel(state),
      proc: processPanel(state),
      help: footerHelp()
    }
  });
}

function topBar(state: MonitorState) {
  return surface(statusBar({
    id: 'btop-uptime',
    leading: [{ id: 'uptime', kind: 'text', text: `Up ${formatUptime(state.tick)}` }],
    trailing: [{ id: 'load', kind: 'text', text: 'Load avg: 1.72 1.95 1.98' }]
  }), {
    id: 'btop-top',
    title: {
      start: panelTitle('cpu', 'mem', `preset *  ${formatClock(state.tick)}`),
      center: [inlineText('btop', 'surface.title', { bold: true })],
      end: panelTitle('BAT', '84%', `${String(4.14 + state.tick / 200).slice(0, 4)}W  2000ms`)
    },
    border: { kind: 'single' },
    appearance: 'bar',
    padding: { left: 1, right: 1 }
  });
}

function cpuPanel(state: MonitorState) {
  const cpuValues = rotate(cpuBase, state.tick).map((value, index) => clamp(value + ((index + state.tick) % 7), 0, 92));
  return surface(grid({
    id: 'cpu-grid',
    areas: `
      graph detail
    `,
    rows: [{ kind: 'fill' }],
    columns: [{ kind: 'fill' }, { kind: 'fixed', cells: 48 }],
    gap: 2,
    children: {
      graph: column([
        text({ content: 'i7-4770HQ                                             2.5 GHz', id: 'cpu-caption', textRole: 'metadata' }),
        chart({
          id: 'cpu-chart',
          label: 'CPU history',
          series: [{
            id: 'cpu',
            label: 'CPU',
            points: chartPoints('cpu', cpuValues),
            kind: 'area'
          }],
          min: 0,
          max: 100,
          sampleMode: 'fit',
          interpolation: 'nearest',
          valueScale: monitorScale,
          xLabel: `last ${String(cpuValues.length)} samples`,
          yLabel: 'CPU',
          showLegend: false
        })
      ], {
        id: 'cpu-graph-column',
        gap: 0,
        sizes: [{ kind: 'fixed', cells: 1 }, { kind: 'fill' }]
      }),
      detail: corePanel(state)
    }
  }), {
    id: 'cpu-panel',
    title: {
      start: panelTitle('cpu', 'i7-4770HQ', `${String(cpuValues.at(-1) ?? 0)}%`),
      end: panelTitle('2.5GHz', '8 cores', `temp ${String(70 + (state.tick % 7))}°C`)
    },
    appearance: 'inset',
    padding: 1
  });
}

function corePanel(state: MonitorState) {
  const cores = Array.from({ length: 8 }, (_, index) => {
    const load = clamp(31 + ((index * 7 + state.tick * 3) % 14), 0, 99);
    const temp = 69 + ((index + state.tick) % 8);
    return { core: `C${String(index)}`, load, temp };
  });
  return column([
    progressBar({ id: 'cpu-total', label: 'CPU', mode: { kind: 'determinate', value: 38 + (state.tick % 4), max: 100 }, display: 'bar+percent', barWidth: 28, valueScale: monitorScale }),
    grid({
      id: 'core-grid',
      areas: `
        left right
      `,
      rows: [{ kind: 'fill' }],
      columns: [{ kind: 'fill' }, { kind: 'fill' }],
      gap: 1,
      children: {
        left: coreList(cores.slice(0, 4), 'left'),
        right: coreList(cores.slice(4), 'right')
      }
    }),
    statusBar({ id: 'load-avg', trailing: [{ id: 'load', kind: 'text', text: 'Load avg: 1.72 1.95 1.98' }] })
  ], { id: 'core-panel', gap: 0, sizes: [{ kind: 'fixed', cells: 1 }, { kind: 'fill' }, { kind: 'fixed', cells: 1 }] });
}

function coreList(cores: readonly CoreSample[], id: string) {
  return column(cores.map((core) => row([
    text({ content: core.core, id: `${id}-${core.core}-label`, textRole: 'metadata' }),
    sparkline({
      id: `${id}-${core.core}-spark`,
      label: `${core.core} load history`,
      values: coreSpark(core.load),
      min: 0,
      max: 100,
      valueScale: monitorScale
    }),
    text({ content: `${String(core.load).padStart(2, ' ')}% ${String(core.temp)}°C`, id: `${id}-${core.core}-value`, textRole: 'metric' })
  ], {
    id: `${id}-${core.core}`,
    sizes: [{ kind: 'fixed', cells: 3 }, { kind: 'fixed', cells: 9 }, { kind: 'fill' }],
    gap: 1
  })), { id: `core-list-${id}`, gap: 0 });
}

function memoryPanel() {
  return surface(column([
    memoryRow('Total', 15.4, 'GiB', 76, 'warning'),
    memoryRow('Available', 3.75, 'GiB', 24, 'success'),
    memoryRow('Cached', 5.86, 'GiB', 38, 'success'),
    memoryRow('Free', 987, 'MiB', 6, 'success')
  ], { id: 'memory-column', gap: 1 }), {
    id: 'memory-panel',
    title: panelTitle('mem', '15.4 GiB', '76%'),
    appearance: 'inset',
    padding: 1
  });
}

function memoryRow(
  label: string,
  value: number,
  unit: string,
  percent: number,
  status: 'running' | 'warning' | 'success'
) {
  return column([
    row([
      text({ content: `${label}:`, id: `${label}-label`, textRole: 'metadata' }),
      text({ content: `${String(value)} ${unit}`, id: `${label}-value`, textRole: 'metric' })
    ], { id: `${label}-header`, sizes: [{ kind: 'fill' }, { kind: 'content' }] }),
    progressBar({
      id: `${label}-bar`,
      label,
      mode: { kind: 'determinate', value: percent, max: 100 },
      display: 'bar+percent',
      labelPosition: 'none',
      barWidth: 24,
      valueScale: monitorScale,
      status
    })
  ], { id: `${label}-row`, gap: 0, sizes: [{ kind: 'fixed', cells: 1 }, { kind: 'fixed', cells: 1 }] });
}

function disksPanel() {
  return surface(column([
    storageRow('root', 61, '138 GiB', '89.2 GiB'),
    storageRow('swap', 13, '1.55 GiB', '10.1 GiB'),
    storageRow('efi', 1, '6.30 MiB', '968 MiB')
  ], { id: 'disks-column', gap: 1 }), {
    id: 'disks-panel',
    title: panelTitle('disks', 'root/swap/efi', '61%'),
    appearance: 'inset',
    padding: 1
  });
}

function storageRow(name: string, used: number, usedText: string, freeText: string) {
  return column([
    row([
      text({ content: name, id: `${name}-name`, textRole: 'metadata' }),
      text({ content: `${usedText} used`, id: `${name}-used`, textRole: 'metric' })
    ], { id: `${name}-heading`, sizes: [{ kind: 'fill' }, { kind: 'content' }] }),
    progressBar({
      id: `${name}-used-row`,
      label: 'used',
      mode: { kind: 'determinate', value: used, max: 100 },
      display: 'bar+percent',
      barWidth: 20,
      valueScale: monitorScale,
      status: used > 50 ? 'warning' : 'running'
    }),
    progressBar({
      id: `${name}-free-row`,
      label: 'free',
      mode: { kind: 'determinate', value: 100 - used, max: 100 },
      display: 'bar+percent',
      barWidth: 20,
      valueScale: monitorScale,
      status: 'running'
    }),
    text({ content: `free: ${freeText}`, id: `${name}-free-text`, textRole: 'metadata' })
  ], { id: `${name}-storage`, gap: 0 });
}

function networkPanel(state: MonitorState) {
  const download = rotate(netDown, state.tick);
  const upload = rotate(netUp, state.tick);
  return surface(grid({
    id: 'net-grid',
    areas: `
      graph stats
    `,
    rows: [{ kind: 'fill' }],
    columns: [{ kind: 'fill' }, { kind: 'fixed', cells: 28 }],
    gap: 1,
    children: {
      graph: chart({
        id: 'net-chart',
        label: 'Network throughput',
        series: [
          { id: 'download', label: 'download', points: chartPoints('download', download), kind: 'bar', glyph: '█' },
          { id: 'upload', label: 'upload', points: chartPoints('upload', upload), kind: 'bar', glyph: '█' }
        ],
        signedDomain: true,
        min: -50,
        max: 50,
        sampleMode: 'fit',
        interpolation: 'nearest',
        showLegend: false,
        yLabel: '10K',
        xLabel: 'wlp3s0'
      }),
      stats: column([
        structuredLine('download', '▼ 474 Byte/s', 'Top: 717 Kibps'),
        structuredLine('upload', '▲ 2.64 KiB/s', 'Top: 54.8 Kibps'),
        text({ content: 'Total: 1.51 GiB', id: 'net-total-down', textRole: 'metadata' }),
        text({ content: 'Total: 530 MiB', id: 'net-total-up', textRole: 'metadata' })
      ], { id: 'net-stats', gap: 1 })
    }
  }), {
    id: 'network-panel',
    title: panelTitle('net', '192.168.1.6', 'up/down'),
    appearance: 'inset',
    padding: 1
  });
}

function structuredLine(label: string, first: string, second: string) {
  return column([
    text({ content: label, id: `${label}-label`, textRole: 'heading' }),
    text({ content: first, id: `${label}-first`, textRole: 'metric' }),
    text({ content: second, id: `${label}-second`, textRole: 'metadata' })
  ], { id: `${label}-stats`, gap: 0 });
}

function processPanel(state: MonitorState) {
  const sort = state.processTable.sort;
  return surface(column([
    row([
      statusBar({ id: 'proc-mode', leading: [{ id: 'mode', kind: 'text', text: `proc filter  sort=${sort?.columnId ?? 'none'} ${sort?.direction ?? ''}` }] }),
      statusBar({ id: 'proc-flags', trailing: [{ id: 'flags', kind: 'text', text: 'per-core reverse tree memory' }] })
    ], { id: 'proc-header', sizes: [{ kind: 'fill' }, { kind: 'content' }] }),
    dataGrid<ProcessRow, MonitorMessage>({
      id: 'process-table',
      meta: { accessibleName: 'Processes' },
      collection: state.processes,
      presentation: state.processTable,
      density: 'compact',
      stickyHeader: true,
      scrollbar: { visible: 'auto' },
      columns: processColumns,
      onTransition: (action): MonitorMessage => ({ kind: 'processTable', action })
    })
  ], { id: 'proc-column', gap: 0, sizes: [{ kind: 'fixed', cells: 1 }, { kind: 'fill' }] }), {
    id: 'process-panel',
    title: panelTitle('proc', `sort=${sort?.columnId ?? 'none'}`, `${String(state.processes.totalCount)} rows`),
    appearance: 'inset',
    padding: 1
  });
}

function footerHelp() {
  return helpBar({
    id: 'btop-help',
    groups: [{
      id: 'processes',
      bindings: [
        { binding: previousProcessKey, label: 'previous process' },
        { binding: nextProcessKey, label: 'next process' },
        { binding: sortKey, label: 'sort' },
        { binding: quitKey, label: 'quit' }
      ]
    }]
  });
}

function prepareProcessCollection(
  sort: NonNullable<ScrollableDataGridPresentation['sort']>,
): CompleteTableCollection<ProcessRow> {
  return prepareTableCollection(
    sortTableRows(processRows, sort, processValueForColumn),
    processRowId,
  );
}

const processColumn: TableColumnBuilder<ProcessRow> = tableColumn<ProcessRow>();

const processColumns: readonly TableColumn<ProcessRow>[] = Object.freeze([
  processColumn({ id: 'pid', value: (row) => row.pid, header: 'Pid', width: { kind: 'fixed', cells: 5 }, semantic: 'metadata', render: ({ value }) => String(value) }),
  processColumn({ id: 'program', value: (row) => row.program, header: 'Program', width: { kind: 'fixed', cells: 18 }, render: ({ value }) => value }),
  processColumn({ id: 'command', value: (row) => row.command, header: 'Command', width: { kind: 'fill' }, semantic: 'metadata', render: ({ value }) => value }),
  processColumn({ id: 'threads', value: (row) => row.threads, header: 'Threads', width: { kind: 'fixed', cells: 8 }, align: 'end', semantic: 'metric', render: ({ value }) => String(value) }),
  processColumn({ id: 'user', value: (row) => row.user, header: 'User', width: { kind: 'fixed', cells: 8 }, semantic: 'metadata', render: ({ value }) => value }),
  processColumn({ id: 'memory', value: (row) => row.memory, header: 'MemB', width: { kind: 'fixed', cells: 8 }, align: 'end', semantic: 'metric', render: ({ value }) => value }),
  processColumn({ id: 'cpu', value: (row) => row.cpu, header: 'Cpu%', width: { kind: 'fixed', cells: 6 }, align: 'end', semantic: 'metric', render: ({ value }) => value.toFixed(1) })
]);

function processRowId(row: ProcessRow): string {
  return String(row.pid);
}

function processValueForColumn(row: ProcessRow, column: string): unknown {
  switch (column) {
    case 'pid': return row.pid;
    case 'program': return row.program;
    case 'command': return row.command;
    case 'threads': return row.threads;
    case 'user': return row.user;
    case 'memory': return Number.parseFloat(row.memory);
    case 'cpu': return row.cpu;
    default: return undefined;
  }
}

function rotate(values: readonly number[], offset: number): readonly number[] {
  return values.map((_, index) => values[(index + offset) % values.length] ?? 0);
}

function chartPoints(prefix: string, values: readonly number[]) {
  return values.map((value, index) => ({
    id: `${prefix}-${String(index)}`,
    label: `${prefix} sample ${String(index + 1)}`,
    value
  }));
}

function coreSpark(load: number): readonly number[] {
  return [load - 8, load - 5, load - 10, load - 1, load - 6, load + 2, load - 3].map((value) => clamp(value, 0, 100));
}

function formatClock(tick: number): string {
  return formatDuration((22 * 60 * 60 + 16 * 60 + 18 + tick) % (24 * 60 * 60));
}

function formatUptime(tick: number): string {
  return formatDuration(60 * 60 + 18 * 60 + tick);
}

function formatDuration(totalSeconds: number): string {
  const normalized = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(normalized / (60 * 60));
  const minutes = Math.floor(normalized / 60) % 60;
  const seconds = normalized % 60;
  return [hours, minutes, seconds]
    .map((part) => String(part).padStart(2, '0'))
    .join(':');
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function panelTitle(title: string, detail: string, metric: string): readonly InlineTextSegment[] {
  return [
    inlineText(title, 'surface.title', { bold: true }),
    inlineText(` ${detail}`, 'text.muted', { dim: true }),
    inlineText(` ${metric}`, 'chart.value')
  ];
}

function inlineText(
  content: string,
  token: ThemeColorToken,
  style: TerminalStyle = {}
): InlineTextSegment {
  return { kind: 'text', text: content, style: { ...style, fg: themeColor(token) } };
}

export async function runScriptedBtopMonitor() {
  const host = createMemoryTerminalHost({ terminalSize: { columns: 160, rows: 42 } });
  const runtime = createTuiRuntime({
    app: btopMonitorApp,
    host,
    initialFocus: { kind: 'element', elementId: 'process-table' },
    input: { mouseReporting: 'drag' }
  });
  try {
    await runtime.start();
    await runtime.dispatch({ kind: 'tick', tick: 3 });
    const contentTarget = targetById(runtime, 'process-table:scroll:content');
    const wheelPacket = `\u001B[<65;${String(contentTarget.bounds.column)};${String(contentTarget.bounds.row)}M`;
    const firstWheel = await runtime.handleInputChunk({ data: wheelPacket });
    const secondWheel = await runtime.handleInputChunk({ data: wheelPacket });
    const thirdWheel = await runtime.handleInputChunk({ data: wheelPacket });
    host.clock.advance(8);
    await thirdWheel.pending;
    const offsetAfterWheel = runtime.state().processTable.scroll.offsetRow;

    const thumbTarget = targetById(runtime, 'process-table:scrollbar:vertical:thumb');
    const trackTarget = targetById(runtime, 'process-table:scrollbar:vertical:track');
    const thumbPressRow = thumbTarget.bounds.row;
    await runtime.handleInput(pointerInput({
      action: 'press', column: thumbTarget.bounds.column, row: thumbPressRow, button: 'left',
    }));
    await runtime.handleInput(pointerInput({
      action: 'drag',
      column: thumbTarget.bounds.column,
      row: Math.min(trackTarget.bounds.row + trackTarget.bounds.height - 1, thumbPressRow + 3),
      button: 'left',
    }));
    await runtime.handleInput(pointerInput({
      action: 'release',
      column: thumbTarget.bounds.column,
      row: thumbPressRow + 3,
      button: 'none',
    }));
    const offsetAfterDrag = runtime.state().processTable.scroll.offsetRow;

    const selectedTarget = targetByPrefix(runtime, 'process-table:row:');
    await click(runtime, selectedTarget);
    const selectedBeforeKeyboard = selectedProcessId(runtime.state().processTable);
    await runtime.handleInput(keyInput('arrowDown'));
    const selectedAfterKeyboard = selectedProcessId(runtime.state().processTable);
    await runtime.handleInput({ kind: 'text', text: 's', paste: false });
    const frame = runtime.frame();
    if (frame === undefined) throw new Error('The scripted monitor did not render a frame.');
    const output = renderFramePlain(frame);
    return {
      status: 'completed',
      frames: host.frames().length,
      rows: output.split('\n').length,
      hasCpu: output.includes('cpu'),
      hasMemory: output.includes('Total:'),
      hasNetwork: output.includes('wlp3s0') || output.includes('Kibps'),
      hasProcesses: output.includes('Program'),
      selectedProcessId: selectedProcessId(runtime.state().processTable),
      sort: runtime.state().processTable.sort,
      wheelBatchShared: firstWheel.pending === secondWheel.pending && secondWheel.pending === thirdWheel.pending,
      offsetAfterWheel,
      offsetAfterDrag,
      keyboardSelectionMoved: selectedAfterKeyboard !== selectedBeforeKeyboard,
      metrics: runtime.metrics()
    };
  } finally {
    await runtime.dispose();
  }
}

function selectedProcessId(presentation: ScrollableDataGridPresentation): string | undefined {
  return presentation.interaction.kind === 'row' && presentation.interaction.selection.mode === 'single'
    ? presentation.interaction.selection.selectedRowId
    : undefined;
}

function targetById(runtime: TuiRuntime<MonitorState, MonitorMessage>, id: string): FrameHitTarget {
  const target = runtime.frame()?.hitTargets?.find((item) => item.id === id);
  if (target === undefined) throw new Error(`Missing hit target ${id}`);
  return target;
}

function targetByPrefix(runtime: TuiRuntime<MonitorState, MonitorMessage>, prefix: string): FrameHitTarget {
  const target = runtime.frame()?.hitTargets?.find((item) => item.id.startsWith(prefix));
  if (target === undefined) throw new Error(`Missing hit target with prefix ${prefix}`);
  return target;
}

async function click(
  runtime: TuiRuntime<MonitorState, MonitorMessage>,
  target: FrameHitTarget
): Promise<void> {
  await runtime.handleInput(pointerInput({
    action: 'press', column: target.bounds.column, row: target.bounds.row, button: 'left',
  }));
  await runtime.handleInput(pointerInput({
    action: 'release', column: target.bounds.column, row: target.bounds.row, button: 'none',
  }));
}

const isMain = process.argv[1] !== undefined
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  if (process.stdin.isTTY && process.stdout.isTTY && !process.argv.includes('--scripted')) {
    const exit = await runTui(btopMonitorApp);
    if (exit.status !== 'completed') {
      process.exitCode = 1;
    }
  } else {
    const result = await runScriptedBtopMonitor();
    console.log(JSON.stringify(result));
  }
}

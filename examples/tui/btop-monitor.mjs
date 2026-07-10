import process from 'node:process';

import { createMemoryTerminalHost, createTerminalHost } from '@ismail-elkorchi/terminal-ui/host';
import {
  createTuiRuntime,
  defineTui,
  intervalSource,
  runTui
} from '@ismail-elkorchi/terminal-ui/tui';
import { renderFramePlain } from '@ismail-elkorchi/terminal-ui/renderer';
import {
  grid,
  row,
  stack,
  surface
} from '@ismail-elkorchi/terminal-ui/layout';
import {
  chart,
  helpBar,
  progressBar,
  sparkline,
  statusBar,
  table,
  text
} from '@ismail-elkorchi/terminal-ui/components';

const monitorScale = Object.freeze([
  { at: 0, token: 'scale.low', label: 'low' },
  { at: 0.45, token: 'scale.medium', label: 'medium' },
  { at: 0.7, token: 'scale.high', label: 'high' },
  { at: 0.88, token: 'scale.critical', label: 'critical' }
]);

const baseProcessRows = Object.freeze([
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

const processRows = Object.freeze([
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

const commandFocusPath = Object.freeze(['btop-root']);

export const btopMonitorApp = defineTui({
  id: 'btop-monitor',
  init: () => initialState(),
  subscriptions: () => [intervalSource('btop-tick', 1000, (tick) => ({ kind: 'tick', tick }))],
  keyBindings: [
    { id: 'exit', triggers: [{ kind: 'text', text: 'q' }, { kind: 'key', key: 'ctrlC' }], label: 'Quit', message: { kind: 'exit' } },
    { id: 'next-sort', triggers: [{ kind: 'text', text: 's' }], label: 'Sort', message: { kind: 'sort' } },
    { id: 'next-process', triggers: [{ kind: 'key', key: 'arrowDown' }, { kind: 'text', text: 'j' }], label: 'Next process', message: { kind: 'selectProcess', delta: 1 } },
    { id: 'previous-process', triggers: [{ kind: 'key', key: 'arrowUp' }, { kind: 'text', text: 'k' }], label: 'Previous process', message: { kind: 'selectProcess', delta: -1 } }
  ],
  update: updateMonitor,
  view: monitorView,
  nonTty: { mode: 'last_frame' }
});

function initialState() {
  return {
    tick: 0,
    selectedProcess: 9,
    sort: 'memory',
    processOffset: 0
  };
}

function updateMonitor(state, message) {
  switch (message.kind) {
    case 'tick':
      return {
        state: {
          ...state,
          tick: message.tick
        }
      };
    case 'sort':
      return { state: { ...state, sort: state.sort === 'memory' ? 'cpu' : 'memory' } };
    case 'selectProcess': {
      const selectedProcess = clamp(state.selectedProcess + message.delta, 0, processRows.length - 1);
      return {
        state: {
          ...state,
          selectedProcess,
          processOffset: Math.max(0, Math.min(selectedProcess - 8, processRows.length - 12))
        }
      };
    }
    case 'exit':
      return { state, exit: { reason: 'user requested exit' } };
  }
  throw new Error(`Unsupported monitor message: ${String(message?.kind)}`);
}

function monitorView(state, context) {
  const wide = context.viewport.columns >= 120;
  return wide ? wideMonitor(state) : compactMonitor(state);
}

function wideMonitor(state) {
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

function compactMonitor(state) {
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

function topBar(state) {
  return surface(statusBar({ id: 'btop-uptime', text: `Up ${formatUptime(state.tick)}  Load avg: 1.72 1.95 1.98` }), {
    id: 'btop-top',
    title: {
      start: panelTitle('cpu', 'mem', `preset *  ${formatClock(state.tick)}`),
      center: [themeSpan('btop', 'surface.title', { bold: true })],
      end: panelTitle('BAT', '84%', `${String(4.14 + state.tick / 200).slice(0, 4)}W  2000ms`)
    },
    border: { kind: 'single' },
    variant: 'chrome',
    padding: { left: 1, right: 1 }
  });
}

function cpuPanel(state) {
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
      graph: stack([
        text('i7-4770HQ                                             2.5 GHz', { id: 'cpu-caption', textRole: 'metadata' }),
        chart({
          id: 'cpu-chart',
          series: [{ id: 'cpu', label: 'CPU', points: cpuValues, kind: 'area' }],
          min: 0,
          max: 100,
          sampleMode: 'fit',
          interpolation: 'nearest',
          valueScale: monitorScale,
          xLabel: `last ${String(cpuValues.length)} samples`,
          yLabel: 'CPU',
          legend: false,
          status: 'success'
        })
      ], {
        id: 'cpu-graph-stack',
        gap: 0,
        sizes: [{ kind: 'fixed', cells: 1 }, { kind: 'fill' }]
      }),
      detail: corePanel(state)
    }
  }), {
    id: 'cpu-panel',
    label: 'cpu',
    title: {
      start: panelTitle('cpu', 'i7-4770HQ', `${String(cpuValues.at(-1) ?? 0)}%`),
      end: panelTitle('2.5GHz', '8 cores', `temp ${String(70 + (state.tick % 7))}°C`)
    },
    variant: 'inset',
    padding: 1
  });
}

function corePanel(state) {
  const cores = Array.from({ length: 8 }, (_, index) => {
    const load = clamp(31 + ((index * 7 + state.tick * 3) % 14), 0, 99);
    const temp = 69 + ((index + state.tick) % 8);
    return { core: `C${String(index)}`, load, temp };
  });
  return stack([
    progressBar({ id: 'cpu-total', label: 'CPU', value: 38 + (state.tick % 4), max: 100, display: 'bar+percent', barWidth: 28, valueScale: monitorScale }),
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
    statusBar({ id: 'load-avg', text: 'Load avg: 1.72 1.95 1.98' })
  ], { id: 'core-panel', gap: 0, sizes: [{ kind: 'fixed', cells: 1 }, { kind: 'fill' }, { kind: 'fixed', cells: 1 }] });
}

function coreList(cores, id) {
  return stack(cores.map((core) => row([
    text(core.core, { id: `${id}-${core.core}-label`, textRole: 'metadata' }),
    sparkline({ id: `${id}-${core.core}-spark`, values: coreSpark(core.load), min: 0, max: 100, valueScale: monitorScale }),
    text(`${String(core.load).padStart(2, ' ')}% ${String(core.temp)}°C`, { id: `${id}-${core.core}-value`, textRole: 'metric' })
  ], {
    id: `${id}-${core.core}`,
    sizes: [{ kind: 'fixed', cells: 3 }, { kind: 'fixed', cells: 9 }, { kind: 'fill' }],
    gap: 1
  })), { id: `core-list-${id}`, gap: 0 });
}

function memoryPanel() {
  return surface(stack([
    memoryRow('Total', 15.4, 'GiB', 76, 'warning'),
    memoryRow('Available', 3.75, 'GiB', 24, 'success'),
    memoryRow('Cached', 5.86, 'GiB', 38, 'success'),
    memoryRow('Free', 987, 'MiB', 6, 'success')
  ], { id: 'memory-stack', gap: 1 }), {
    id: 'memory-panel',
    label: 'mem',
    title: panelTitle('mem', '15.4 GiB', '76%'),
    variant: 'inset',
    padding: 1
  });
}

function memoryRow(label, value, unit, percent, status) {
  return stack([
    row([
      text(`${label}:`, { id: `${label}-label`, textRole: 'metadata' }),
      text(`${String(value)} ${unit}`, { id: `${label}-value`, textRole: 'metric' })
    ], { id: `${label}-header`, sizes: [{ kind: 'fill' }, { kind: 'content' }] }),
    progressBar({
      id: `${label}-bar`,
      value: percent,
      max: 100,
      display: 'bar+percent',
      labelPosition: 'none',
      barWidth: 24,
      valueScale: monitorScale,
      status: meterStatus(status)
    })
  ], { id: `${label}-row`, gap: 0, sizes: [{ kind: 'fixed', cells: 1 }, { kind: 'fixed', cells: 1 }] });
}

function disksPanel() {
  return surface(stack([
    storageRow('root', 61, '138 GiB', '89.2 GiB'),
    storageRow('swap', 13, '1.55 GiB', '10.1 GiB'),
    storageRow('efi', 1, '6.30 MiB', '968 MiB')
  ], { id: 'disks-stack', gap: 1 }), {
    id: 'disks-panel',
    label: 'disks',
    title: panelTitle('disks', 'root/swap/efi', '61%'),
    variant: 'inset',
    padding: 1
  });
}

function storageRow(name, used, usedText, freeText) {
  return stack([
    row([
      text(name, { id: `${name}-name`, textRole: 'metadata' }),
      text(`${usedText} used`, { id: `${name}-used`, textRole: 'metric' })
    ], { id: `${name}-heading`, sizes: [{ kind: 'fill' }, { kind: 'content' }] }),
    progressBar({
      id: `${name}-used-row`,
      label: 'used',
      value: used,
      max: 100,
      display: 'bar+percent',
      barWidth: 20,
      valueScale: monitorScale,
      status: used > 50 ? 'warning' : 'running'
    }),
    progressBar({
      id: `${name}-free-row`,
      label: 'free',
      value: 100 - used,
      max: 100,
      display: 'bar+percent',
      barWidth: 20,
      valueScale: monitorScale,
      status: 'running'
    }),
    text(`free: ${freeText}`, { id: `${name}-free-text`, textRole: 'metadata' })
  ], { id: `${name}-storage`, gap: 0 });
}

function networkPanel(state) {
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
        series: [
          { id: 'download', label: 'download', points: download, kind: 'bar', glyph: '█' },
          { id: 'upload', label: 'upload', points: upload, kind: 'bar', glyph: '█' }
        ],
        signedDomain: true,
        min: -50,
        max: 50,
        sampleMode: 'fit',
        interpolation: 'nearest',
        legend: false,
        yLabel: '10K',
        xLabel: 'wlp3s0',
        status: 'success'
      }),
      stats: stack([
        structuredLine('download', '▼ 474 Byte/s', 'Top: 717 Kibps'),
        structuredLine('upload', '▲ 2.64 KiB/s', 'Top: 54.8 Kibps'),
        text('Total: 1.51 GiB', { id: 'net-total-down', textRole: 'metadata' }),
        text('Total: 530 MiB', { id: 'net-total-up', textRole: 'metadata' })
      ], { id: 'net-stats', gap: 1 })
    }
  }), {
    id: 'network-panel',
    label: 'net 192.168.1.6',
    title: panelTitle('net', '192.168.1.6', 'up/down'),
    variant: 'inset',
    padding: 1
  });
}

function structuredLine(label, first, second) {
  return stack([
    text(label, { id: `${label}-label`, textRole: 'heading' }),
    text(first, { id: `${label}-first`, textRole: 'metric' }),
    text(second, { id: `${label}-second`, textRole: 'metadata' })
  ], { id: `${label}-stats`, gap: 0 });
}

function processPanel(state) {
  const rows = sortedProcesses(state).slice(state.processOffset);
  const selected = Math.max(0, state.selectedProcess - state.processOffset);
  return surface(stack([
    row([
      statusBar({ id: 'proc-mode', text: `proc filter  sort=${state.sort}` }),
      statusBar({ id: 'proc-flags', text: 'per-core reverse tree memory' })
    ], { id: 'proc-header', sizes: [{ kind: 'fill' }, { kind: 'content' }] }),
    table({
      id: 'process-table',
      rows,
      selected,
      density: 'dense',
      stickyHeader: true,
      scrollbar: { visible: 'auto' },
      columns: [
        {
          id: 'pid-0', value: (row) => row.pid, header: 'Pid', width: { kind: 'fixed', cells: 5 }, semantic: 'metadata', render: ({ row }) => String(row.pid) },
        {
          id: 'program-1', value: (row) => row.program, header: 'Program', width: { kind: 'fixed', cells: 18 }, render: ({ row }) => row.program },
        {
          id: 'command-2', value: (row) => row.command, header: 'Command', width: { kind: 'fill' }, semantic: 'metadata', render: ({ row }) => row.command },
        {
          id: 'threads-3', value: (row) => row.threads, header: 'Threads', width: { kind: 'fixed', cells: 8 }, align: 'end', semantic: 'metric', render: ({ row }) => String(row.threads) },
        {
          id: 'user-4', value: (row) => row.user, header: 'User', width: { kind: 'fixed', cells: 8 }, semantic: 'metadata', render: ({ row }) => row.user },
        {
          id: 'memb-5', value: (row) => row.memory, header: 'MemB', width: { kind: 'fixed', cells: 8 }, align: 'end', semantic: 'metric', render: ({ row }) => row.memory },
        {
          id: 'cpu-6', value: (row) => row.cpu, header: 'Cpu%', width: { kind: 'fixed', cells: 6 }, align: 'end', semantic: 'metric', render: ({ row }) => row.cpu.toFixed(1) }
      ],
      keys: {
        arrowDown: { kind: 'selectProcess', delta: 1 },
        arrowUp: { kind: 'selectProcess', delta: -1 },
        text: { s: { kind: 'sort' } }
      }
    })
  ], { id: 'proc-stack', gap: 0, sizes: [{ kind: 'fixed', cells: 1 }, { kind: 'fill' }] }), {
    id: 'process-panel',
    label: 'proc',
    title: panelTitle('proc', `sort=${state.sort}`, `${String(rows.length)} rows`),
    variant: 'inset',
    padding: 1
  });
}

function footerHelp() {
  return helpBar({
    id: 'btop-help',
    bindings: [
      { key: '↑/↓', label: 'select' },
      { key: 's', label: 'sort' },
      { key: 'q', label: 'quit' }
    ]
  });
}

function sortedProcesses(state) {
  const rows = [...processRows];
  if (state.sort === 'cpu') return rows.sort((left, right) => right.cpu - left.cpu);
  return rows.sort((left, right) => Number.parseFloat(right.memory) - Number.parseFloat(left.memory));
}

function rotate(values, offset) {
  return values.map((_, index) => values[(index + offset) % values.length] ?? 0);
}

function coreSpark(load) {
  return [load - 8, load - 5, load - 10, load - 1, load - 6, load + 2, load - 3].map((value) => clamp(value, 0, 100));
}

function formatClock(tick) {
  const seconds = 18 + tick;
  return `22:16:${String(seconds % 60).padStart(2, '0')}`;
}

function formatUptime(tick) {
  const minutes = 18 + Math.floor(tick / 60);
  const seconds = tick % 60;
  return `01:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function meterStatus(status) {
  return status === 'warning' ? 'warning' : 'running';
}

function panelTitle(title, detail, metric) {
  return [
    themeSpan(title, 'surface.title', { bold: true }),
    themeSpan(` ${detail}`, 'text.muted', { dim: true }),
    themeSpan(` ${metric}`, 'chart.value')
  ];
}

/**
 * @param {string} content
 * @param {import('@ismail-elkorchi/terminal-ui/theme').ThemeColorToken} token
 * @param {import('@ismail-elkorchi/terminal-ui/renderer').TerminalStyle} [style]
 * @returns {import('@ismail-elkorchi/terminal-ui/renderer').RenderSpan}
 */
function themeSpan(content, token, style = {}) {
  return { text: content, style: { ...style, fg: { kind: 'theme', token } } };
}

export async function runScriptedBtopMonitor() {
  const host = createMemoryTerminalHost({ viewport: { columns: 160, rows: 42 } });
  const runtime = createTuiRuntime({ app: btopMonitorApp, host, initialFocusPath: commandFocusPath });
  try {
    await runtime.start();
    await runtime.dispatch({ kind: 'tick', tick: 3 });
    await runtime.dispatch({ kind: 'selectProcess', delta: 2 });
    await runtime.dispatch({ kind: 'sort' });
    const frame = runtime.frame();
    if (frame === undefined) throw new Error('The scripted monitor did not render a frame.');
    const output = renderFramePlain(frame);
    return {
      status: 'ok',
      frames: host.frames().length,
      rows: output.split('\n').length,
      hasCpu: output.includes('cpu'),
      hasMemory: output.includes('Total:'),
      hasNetwork: output.includes('wlp3s0') || output.includes('Kibps'),
      hasProcesses: output.includes('Program'),
      selectedProcess: runtime.getState().selectedProcess,
      sort: runtime.getState().sort
    };
  } finally {
    await runtime.dispose();
  }
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  if (process.stdin.isTTY === true && process.stdout.isTTY === true && !process.argv.includes('--scripted')) {
    const exit = await runTui(btopMonitorApp, createTerminalHost({ runtime: 'node' }), {
      initialFocusPath: commandFocusPath
    });
    if (exit.status !== 'completed') {
      process.exitCode = 1;
    }
  } else {
    const result = await runScriptedBtopMonitor();
    console.log(JSON.stringify(result));
  }
}

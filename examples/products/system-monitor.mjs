import {
  activityFeed,
  chart,
  gauge,
  heatmap,
  panel,
  progressBar,
  sidePanel,
  stack,
  text
} from '@ismail-elkorchi/terminal-ui/widgets';

import { inspectorCard, metricRow, printProductExample } from './product-shell.mjs';

const before = { queue: 81, cpu: 68 };
const after = { queue: 54, cpu: 62 };

printProductExample({
  id: 'system-monitor-product',
  source: 'examples/products/system-monitor.mjs',
  workflow: 'system-monitor',
  action: 'drain queue shard',
  appName: 'Pulse Monitor',
  route: 'Service pressure',
  subtitle: 'Live operational dashboard with bounded visual telemetry',
  status: 'healthy',
  commandValue: '/drain queue-alpha',
  commandFooter: 'Queue pressure dropped after one scripted action',
  main: panel({
    title: 'System monitor',
    body: stack([
      metricRow([
        { label: 'cpu', value: `${String(after.cpu)}%` },
        { label: 'queue', value: `${String(after.queue)}%` },
        { label: 'latency', value: '42ms' }
      ]),
      gauge({ label: 'cpu', value: after.cpu, width: 28, status: 'success' }),
      progressBar({ label: 'queue drain', value: after.queue, max: 100, mode: 'full', showPercentage: true, status: 'success' }),
      chart({
        id: 'service-trend',
        yLabel: 'load',
        xLabel: 'window',
        legend: true,
        selected: { series: 'queue', point: 4 },
        series: [
          { id: 'cpu', label: 'CPU', points: [51, 58, before.cpu, 66, after.cpu], glyph: '+' },
          { id: 'queue', label: 'Queue', points: [72, 76, before.queue, 64, after.queue], kind: 'scatter', glyph: 'o' }
        ]
      }),
      heatmap({
        id: 'node-heat',
        min: 0,
        max: 100,
        cellWidth: 2,
        selected: { row: 1, column: 2 },
        rows: [
          [{ id: 'a1', value: 30 }, { id: 'a2', value: 44 }, { id: 'a3', value: 61 }, { id: 'a4', value: 40 }],
          [{ id: 'b1', value: 35 }, { id: 'b2', value: 52 }, { id: 'b3', value: after.queue }, { id: 'b4', value: 47 }]
        ]
      })
    ], { gap: 1 })
  }),
  side: sidePanel({
    title: 'Incident lane',
    body: stack([
      inspectorCard('Action result', [
        `queue before: ${String(before.queue)}%`,
        `queue after: ${String(after.queue)}%`,
        'node: queue-alpha',
        'status: recovered'
      ]),
      activityFeed({
        selected: 1,
        blocks: [
          { id: 'detect', title: 'Detected pressure spike', status: 'warning', summary: 'Queue was above policy.' },
          { id: 'drain', title: 'Drain completed', status: 'success', summary: 'Backlog moved below alert threshold.' }
        ]
      })
    ], { gap: 1 })
  }),
  meta: {
    queueBefore: before.queue,
    queueAfter: after.queue,
    actionSucceeded: after.queue < before.queue
  }
});

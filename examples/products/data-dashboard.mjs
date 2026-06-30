import {
  chart,
  heatmap,
  paginatedTable,
  panel,
  sidePanel,
  stack,
  text
} from '@ismail-elkorchi/terminal-ui/widgets';

import { inspectorCard, metricRow, printProductExample } from './product-shell.mjs';

const rows = [
  { vessel: 'Atlas', berth: 'A1', eta: '08:20', risk: 'low', cargo: 'medical' },
  { vessel: 'Boreal', berth: 'C3', eta: '08:45', risk: 'medium', cargo: 'grain' },
  { vessel: 'Cobalt', berth: 'B2', eta: '09:10', risk: 'high', cargo: 'machinery' },
  { vessel: 'Dawn', berth: 'D1', eta: '09:40', risk: 'low', cargo: 'timber' },
  { vessel: 'Echo', berth: 'A4', eta: '10:15', risk: 'medium', cargo: 'parts' },
  { vessel: 'Fjord', berth: 'B4', eta: '10:50', risk: 'low', cargo: 'mail' }
];
const selectedBefore = 0;
const selectedAfter = 2;
const selected = rows[selectedAfter];

printProductExample({
  id: 'data-dashboard-product',
  source: 'examples/products/data-dashboard.mjs',
  workflow: 'data-table-dashboard',
  action: 'select high-risk row',
  appName: 'Port Ledger',
  route: 'Arrival table',
  subtitle: 'Paginated table, row inspector, trend chart, and risk heatmap',
  status: 'review',
  statusTone: 'warning',
  commandValue: '/inspect Cobalt',
  commandFooter: 'Selection moved from Atlas to Cobalt',
  main: panel({
    title: 'Arrival board',
    body: stack([
      paginatedTable({
        id: 'arrivals',
        rows,
        page: 1,
        pageSize: 4,
        selected: selectedAfter,
        columns: [
          { key: 'vessel', label: 'Vessel', width: 12, resizable: true },
          { key: 'berth', label: 'Berth', width: 8 },
          { key: 'eta', label: 'ETA', width: 8 },
          { key: 'risk', label: 'Risk', width: 10 },
          { key: 'cargo', label: 'Cargo', width: 12, resizable: true }
        ]
      }),
      chart({
        id: 'arrival-trend',
        legend: true,
        xLabel: 'watch',
        yLabel: 'arrivals',
        selected: { series: 'arrivals', point: 3 },
        series: [
          { id: 'arrivals', label: 'Arrivals', points: [2, 4, 3, 6, 5], glyph: '+' },
          { id: 'holds', label: 'Holds', points: [1, 1, 2, 3, 2], kind: 'scatter', glyph: 'o' }
        ]
      }),
      heatmap({
        id: 'risk-map',
        min: 0,
        max: 100,
        cellWidth: 3,
        selected: { row: 0, column: 2 },
        rows: [
          [{ id: 'atlas', value: 22 }, { id: 'boreal', value: 58 }, { id: 'cobalt', value: 91 }],
          [{ id: 'dawn', value: 30 }, { id: 'echo', value: 64 }, { id: 'fjord', value: 26 }]
        ]
      })
    ], { gap: 1 })
  }),
  side: sidePanel({
    title: 'Row inspector',
    body: stack([
      inspectorCard('Selected arrival', [
        `vessel: ${selected.vessel}`,
        `berth: ${selected.berth}`,
        `eta: ${selected.eta}`,
        `risk: ${selected.risk}`,
        `cargo: ${selected.cargo}`
      ]),
      metricRow([
        { label: 'rows', value: String(rows.length) },
        { label: 'page', value: '1/2' }
      ]),
      text('Risk heatmap cell follows the selected row.')
    ], { gap: 1 })
  }),
  meta: {
    selectedBefore,
    selectedAfter,
    selectedVessel: selected.vessel
  }
});

import {
  barChart,
  carousel,
  chart,
  gauge,
  heatmap,
  panel,
  sidePanel,
  sparkline,
  stack,
  text,
  tooltip
} from '@ismail-elkorchi/terminal-ui/widgets';

import { inspectorCard, metricRow, printProductExample } from './product-shell.mjs';

const selectedBefore = { series: 'wind', point: 1 };
const selectedAfter = { series: 'wind', point: 4 };

printProductExample({
  id: 'chart-explorer-product',
  source: 'examples/products/chart-explorer.mjs',
  workflow: 'chart-explorer',
  action: 'select chart point',
  appName: 'Signal Lab',
  route: 'Chart explorer',
  subtitle: 'Interactive chart selection, heatmap, gauge, carousel, and tooltip',
  status: 'analysis',
  commandValue: '/select wind:4',
  commandFooter: 'Selected point moved along the Wind series',
  main: panel({
    title: 'Signal explorer',
    body: stack([
      chart({
        id: 'wind-chart',
        legend: true,
        yLabel: 'speed',
        xLabel: 'sample',
        selected: selectedAfter,
        series: [
          { id: 'wind', label: 'Wind', points: [22, 31, 27, 36, 48, 41], glyph: '+' },
          { id: 'gust', label: 'Gust', points: [18, 25, 21, 39, 44, 37], kind: 'scatter', glyph: 'o' }
        ]
      }),
      tooltip({
        title: 'Selected point',
        content: 'Wind sample 4 is the current inspection focus.',
        placement: 'below',
        tone: 'info'
      }),
      barChart({
        items: [
          { label: 'north', value: 48 },
          { label: 'east', value: 37 },
          { label: 'south', value: 29 }
        ],
        selected: 0
      }),
      sparkline({ values: [8, 12, 10, 16, 18, 14, 19, 22] })
    ], { gap: 1 })
  }),
  side: sidePanel({
    title: 'Signal inspector',
    body: stack([
      inspectorCard('Selected signal', [
        `series before: ${selectedBefore.series}:${String(selectedBefore.point)}`,
        `series after: ${selectedAfter.series}:${String(selectedAfter.point)}`,
        'value: 48',
        'status: watch'
      ]),
      metricRow([
        { label: 'samples', value: '6' },
        { label: 'peak', value: '48' }
      ]),
      gauge({ label: 'confidence', value: 86, width: 24, status: 'success' }),
      heatmap({
        id: 'sample-heat',
        min: 0,
        max: 50,
        cellWidth: 2,
        selected: { row: 0, column: 4 },
        rows: [
          [{ id: 's0', value: 22 }, { id: 's1', value: 31 }, { id: 's2', value: 27 }, { id: 's3', value: 36 }, { id: 's4', value: 48 }, { id: 's5', value: 41 }]
        ]
      }),
      carousel({
        selected: 1,
        items: [
          { id: 'trend', title: 'Trend', body: text('Rising wind pressure') },
          { id: 'point', title: 'Point', body: text('Sample 4 selected') },
          { id: 'next', title: 'Next', body: text('Compare gust variance') }
        ]
      })
    ], { gap: 1 })
  }),
  meta: {
    selectedBefore,
    selectedAfter,
    selectedValue: 48
  }
});

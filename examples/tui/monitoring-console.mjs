import { renderFrame, renderWidgetFrame } from '@ismail-elkorchi/terminal-ui/tui';
import { barChart, chart, row, stack, statusBar } from '@ismail-elkorchi/terminal-ui/widgets';

const widget = stack([
  statusBar({ id: 'status', text: 'cluster healthy' }),
  row([
    barChart({
      id: 'requests',
      items: [
        { label: 'api', value: 80 },
        { label: 'worker', value: 45 },
        { label: 'queue', value: 20 }
      ],
      selected: 0
    }),
    chart({
      id: 'latency',
      series: [{ id: 'p95', label: 'p95', points: [2, 4, 3, 6, 5, 8] }]
    })
  ])
]);

console.log(renderFrame(renderWidgetFrame(widget, { columns: 60, rows: 10 })));

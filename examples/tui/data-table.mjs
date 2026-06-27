import { renderFrame, renderWidgetFrame } from '@ismail-elkorchi/terminal-ui/tui';
import { table } from '@ismail-elkorchi/terminal-ui/widgets';

const widget = table({
  id: 'data',
  selectedCell: { row: 1, column: 2 },
  stickyHeader: true,
  columns: [
    { header: 'Name', width: { kind: 'fixed', cells: 14 } },
    { header: 'Score', width: { kind: 'fixed', cells: 6 }, align: 'end', sort: 'descending' },
    { header: 'State', width: { kind: 'fill' } }
  ],
  rows: [
    ['Alpha', 98, 'ready'],
    ['Bravo', 91, 'review'],
    ['Charlie', 86, 'queued']
  ]
});

console.log(renderFrame(renderWidgetFrame(widget, { columns: 42, rows: 6 })));

import { renderFramePlain, renderWidgetFrame } from '@ismail-elkorchi/terminal-ui/tui';
import { canvas } from '@ismail-elkorchi/terminal-ui/widgets';

const widget = canvas({
  id: 'board',
  label: 'Board',
  painter({ buffer, bounds }) {
    const rows = ['A . .', '. B .', '. . C'];
    for (const [index, line] of rows.entries()) {
      buffer.write(bounds.row + index, bounds.column, [{
        text: line,
        style: { fg: { kind: 'theme', token: index === 1 ? 'accent.primary' : 'text.default' } }
      }]);
    }
  }
});

console.log(renderFramePlain(renderWidgetFrame(widget, { columns: 12, rows: 5 })));

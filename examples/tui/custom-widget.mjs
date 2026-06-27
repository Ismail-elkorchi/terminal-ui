import { renderFrame, renderWidgetFrame } from '@ismail-elkorchi/terminal-ui/tui';
import { custom } from '@ismail-elkorchi/terminal-ui/widgets';

const widget = custom({
  id: 'meter',
  renderer: {
    render({ buffer, node }) {
      buffer.write(node.bounds.row, node.bounds.column, [
        { text: 'CPU ', style: { fg: { kind: 'theme', token: 'text.muted' } } },
        { text: '████░░ 67%', style: { fg: { kind: 'theme', token: 'status.running' } } }
      ]);
    },
    accessibility() {
      return { id: 'meter', role: 'meter', label: 'CPU', value: '67%' };
    }
  }
});

console.log(renderFrame(renderWidgetFrame(widget, { columns: 24, rows: 3 })));

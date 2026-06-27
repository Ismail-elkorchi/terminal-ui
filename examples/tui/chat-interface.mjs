import { renderFrame, renderWidgetFrame } from '@ismail-elkorchi/terminal-ui/tui';
import { commandBar, scrollback, stack } from '@ismail-elkorchi/terminal-ui/widgets';

const widget = stack([
  scrollback({
    id: 'messages',
    items: [
      { id: 'm1', timestamp: '09:00', metadata: { from: 'Ada' }, text: 'Can we ship this?' },
      { id: 'm2', timestamp: '09:01', metadata: { from: 'Lin' }, text: 'After one more test.' }
    ]
  }),
  commandBar({
    id: 'reply',
    prompt: '>',
    value: 'Looks good',
    footer: 'enter sends'
  })
]);

console.log(renderFrame(renderWidgetFrame(widget, { columns: 52, rows: 8 })));

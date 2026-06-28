import { renderFramePlain, renderWidgetFrame } from '@ismail-elkorchi/terminal-ui/tui';
import { box, row, stack, text } from '@ismail-elkorchi/terminal-ui/widgets';

const widget = box(
  stack([
    text('terminal-ui'),
    row([
      text('left'),
      text('right')
    ])
  ]),
  { id: 'example-root' }
);

const frame = renderWidgetFrame(widget, { columns: 24, rows: 5 });

console.log(renderFramePlain(frame));

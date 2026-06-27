import { renderFrame, renderWidgetFrame } from '@ismail-elkorchi/terminal-ui/tui';
import { helpBar, stack, textArea } from '@ismail-elkorchi/terminal-ui/widgets';

const widget = stack([
  textArea({
    id: 'editor',
    value: 'Title\n\nWrite text here.',
    cursor: 'Title\n\nWrite'.length
  }),
  helpBar({
    id: 'keys',
    bindings: [
      { key: 'ctrl+s', label: 'save' },
      { key: 'esc', label: 'close' }
    ]
  })
]);

console.log(renderFrame(renderWidgetFrame(widget, { columns: 42, rows: 8 })));

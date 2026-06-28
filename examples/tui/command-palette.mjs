import { renderFramePlain, renderWidgetFrame } from '@ismail-elkorchi/terminal-ui/tui';
import { palette } from '@ismail-elkorchi/terminal-ui/widgets';

const widget = palette({
  id: 'palette',
  title: 'Actions',
  query: 'op',
  selectedId: 'open-file',
  entries: [
    { id: 'open-file', label: 'Open File', value: 'open', description: 'Pick a file' },
    { id: 'open-settings', label: 'Open Settings', value: 'settings' },
    { id: 'close', label: 'Close Window', value: 'close', disabled: true }
  ],
  helpText: 'enter accepts, escape closes'
});

console.log(renderFramePlain(renderWidgetFrame(widget, { columns: 48, rows: 7 })));

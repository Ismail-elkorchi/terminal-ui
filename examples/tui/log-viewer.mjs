import { createScrollState, renderFrame, renderWidgetFrame } from '@ismail-elkorchi/terminal-ui/tui';
import { scrollback } from '@ismail-elkorchi/terminal-ui/widgets';

const items = Array.from({ length: 12 }, (_value, index) => ({
  id: `event-${index}`,
  timestamp: `10:${String(index).padStart(2, '0')}`,
  metadata: { source: index % 2 === 0 ? 'api' : 'worker' },
  text: index === 9 ? 'retry completed' : `event ${index}`
}));

const widget = scrollback({
  id: 'log',
  items,
  searchQuery: 'retry',
  scroll: createScrollState({ contentRows: items.length, viewportRows: 5, offsetRow: 7 })
});

console.log(renderFrame(renderWidgetFrame(widget, { columns: 54, rows: 5 })));

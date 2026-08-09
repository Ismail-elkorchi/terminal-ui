import { button, text } from '@ismail-elkorchi/terminal-ui/components';
import { column } from '@ismail-elkorchi/terminal-ui/layout';
import { renderElementFrame } from '@ismail-elkorchi/terminal-ui/renderer';

const content = column([
  text({ content: 'Actions' }),
  button({ id: 'save', label: 'Save', onAction: () => ({ kind: 'save' } as const) }),
  button({ id: 'quit', label: 'Quit', onAction: () => ({ kind: 'quit' } as const) })
] as const);

renderElementFrame(content, { columns: 20, rows: 4 });

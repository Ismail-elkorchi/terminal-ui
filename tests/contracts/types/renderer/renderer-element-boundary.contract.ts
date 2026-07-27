import { button, text } from '@ismail-elkorchi/terminal-ui/components';
import { column } from '@ismail-elkorchi/terminal-ui/layout';
import { renderElementFrame } from '@ismail-elkorchi/terminal-ui/renderer';

const content = column([
  text('Actions'),
  button({ id: 'save', label: 'Save', onPress: () => ({ kind: 'save' } as const) }),
  button({ id: 'quit', label: 'Quit', onPress: () => ({ kind: 'quit' } as const) })
] as const);

renderElementFrame(content, { columns: 20, rows: 4 });

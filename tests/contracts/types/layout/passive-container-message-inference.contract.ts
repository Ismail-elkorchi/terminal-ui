import { button, type Element } from '@ismail-elkorchi/terminal-ui/components';
import { overlay, row, column, surface } from '@ismail-elkorchi/terminal-ui/layout';

export type Message =
  | { readonly kind: 'save' }
  | { readonly kind: 'quit' };

const actions = row([
  button({ id: 'save', label: 'Save', onPress: () => ({ kind: 'save' } as const) }),
  button({ id: 'quit', label: 'Quit', onPress: () => ({ kind: 'quit' } as const) })
] as const, { id: 'actions', gap: 1 });
const panel = surface(column([actions], { id: 'content' }), {
  id: 'panel',
  appearance: 'raised'
});
const root = overlay([panel], { id: 'root' });
const accepted: Element<Message> = root;
void accepted;

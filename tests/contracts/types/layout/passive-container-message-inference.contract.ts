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

surface(column([actions], { id: 'legacy-variant-content' }), {
  id: 'legacy-variant-panel',
  // @ts-expect-error Surface construction belongs in appearance.
  variant: 'raised'
});

surface(column([actions], { id: 'legacy-state-content' }), {
  id: 'legacy-state-panel',
  // @ts-expect-error A layout surface does not accept component interaction state.
  visualState: 'selected'
});

surface(column([actions], { id: 'condition-content' }), {
  id: 'condition-panel',
  // @ts-expect-error Result and interaction conditions belong to the component carrying them.
  condition: 'selected'
});

surface(column([actions], { id: 'disabled-content' }), {
  id: 'disabled-panel',
  // @ts-expect-error A visual layout container has no disabled behavior.
  disabled: true
});

surface(column([actions], { id: 'focus-within-content' }), {
  id: 'focus-within-panel',
  // @ts-expect-error Descendant focus does not change layout-surface appearance.
  focusWithin: true
});

surface(column([actions], { id: 'label-content' }), {
  id: 'label-panel',
  // @ts-expect-error Layout surfaces do not create named controls.
  label: 'Panel'
});

import { text } from '@ismail-elkorchi/terminal-ui/components';
import { confirm, runPrompt } from '@ismail-elkorchi/terminal-ui/prompts';
import { defineTui } from '@ismail-elkorchi/terminal-ui/tui';

const result = await runPrompt(confirm({
  label: 'Continue?',
  nonTty: { mode: 'provided_value', value: true }
}));
const app = defineTui({
  id: 'portable-app',
  init: () => ({ count: 0 }),
  update: (state) => ({ state }),
  view: (state) => text(`Count ${String(state.count)}`)
});

invariant(result.status === 'submitted' && result.value === true, 'non-TTY prompt failed');
invariant(app.id === 'portable-app', 'TUI definition failed');

console.log(JSON.stringify({ scenario: 'prompts-tui', ok: true }));

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

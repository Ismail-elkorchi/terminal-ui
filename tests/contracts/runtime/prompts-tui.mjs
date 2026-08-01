import { defineTui, runTui, text } from '@ismail-elkorchi/terminal-ui';
import { confirm, runPrompt } from '@ismail-elkorchi/terminal-ui/prompts';

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
const tuiResult = await runTui(app);

invariant(result.status === 'submitted' && result.value === true, 'non-TTY prompt failed');
invariant(app.id === 'portable-app', 'TUI definition failed');
invariant(
  tuiResult.status === 'error'
    && tuiResult.diagnostics[0]?.diagnostic.code === 'HOST_CAPABILITY_UNAVAILABLE',
  'default-host non-TTY TUI handling failed'
);

console.log(JSON.stringify({ scenario: 'prompts-tui', ok: true }));

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

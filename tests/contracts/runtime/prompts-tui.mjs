import { defineTui, runTui, text, TuiRunError } from '@ismail-elkorchi/terminal-ui';
import { confirm, runPrompt } from '@ismail-elkorchi/terminal-ui/prompts';

const result = await runPrompt(confirm({
  label: 'Continue?',
  nonTty: { mode: 'provided_value', value: true }
}));
const app = defineTui({
  id: 'portable-app',
  init: () => ({ state: ({ count: 0 }) }),
  update: (state) => ({ state }),
  view: (state) => text({ content: `Count ${String(state.count)}` })
});
let tuiExit;
try {
  await runTui(app);
  throw new Error('Expected a non-TTY TUI host to reject.');
} catch (error) {
  if (!(error instanceof TuiRunError)) throw error;
  tuiExit = error.exit;
}

invariant(result.status === 'submitted' && result.value === true, 'non-TTY prompt failed');
invariant(app.id === 'portable-app', 'TUI definition failed');
invariant(
  tuiExit.status === 'error'
    && tuiExit.diagnostics[0]?.diagnostic.code === 'HOST_CAPABILITY_UNAVAILABLE',
  'default-host non-TTY TUI handling failed'
);

console.log(JSON.stringify({ scenario: 'prompts-tui', status: 'passed' }));

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

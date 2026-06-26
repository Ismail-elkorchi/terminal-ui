import { input, runPrompt } from '@ismail-elkorchi/terminal-ui/prompts';

const result = await runPrompt(input({
  label: 'Project name',
  nonTty: { mode: 'provided_value', value: 'terminal-ui' }
}));

console.log(JSON.stringify({
  status: result.status,
  value: result.status === 'submitted' ? result.value : undefined,
  source: result.snapshot?.source
}));

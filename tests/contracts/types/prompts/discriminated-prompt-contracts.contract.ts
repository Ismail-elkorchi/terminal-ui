import { progress, runPrompt, select } from '@ismail-elkorchi/terminal-ui/prompts';

const selected = await runPrompt(select({
  label: 'Port',
  choices: [{ label: 'HTTPS', value: 443 }],
  nonTty: { mode: 'provided_value', value: 443 }
}));
if (selected.status === 'submitted') {
  const port: number = selected.value;
  void port;
}

progress({
  label: 'Build',
  progress: { kind: 'indeterminate', status: 'Starting' }
});

progress({
  label: 'Build',
  progress: { kind: 'determinate', value: 1, max: 4 }
});

select({
  label: 'Invalid',
  choices: [{ label: 'One', value: 1 }],
  // @ts-expect-error reject policies cannot carry a value
  nonTty: { mode: 'reject', value: 1 }
});

progress({
  label: 'Invalid',
  // @ts-expect-error indeterminate progress cannot carry determinate metrics
  progress: { kind: 'indeterminate', value: 1, max: 4 }
});

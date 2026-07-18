import {
  confirm,
  runPrompt,
  select,
  type PromptResult
} from '@ismail-elkorchi/terminal-ui/prompts';

const confirmation = confirm({ label: 'Continue?', defaultValue: true });
const choice = select({
  label: 'Environment',
  choices: [{ label: 'Production', value: { kind: 'production' } as const }],
  nonTty: { mode: 'provided_value', value: { kind: 'production' } as const }
});
const confirmationResult: Promise<PromptResult<boolean>> = runPrompt(confirmation);
const choiceResult = runPrompt(choice);

// @ts-expect-error select non-TTY values must match choice values
select({ label: 'Invalid', choices: [{ label: 'One', value: 1 }], nonTty: { mode: 'provided_value', value: 'one' } });

void confirmationResult;
void choiceResult;

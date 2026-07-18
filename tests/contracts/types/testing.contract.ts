import {
  createTerminalHarness,
  runInteractionScript,
  type InteractionScript
} from '@ismail-elkorchi/terminal-ui/testing';

const harness = createTerminalHarness({ viewport: { columns: 40, rows: 10 } });
const script: InteractionScript = {
  id: 'contract',
  steps: [{ kind: 'input', event: 'x' }, { kind: 'assertOutput', includes: 'x' }]
};
const result = runInteractionScript(harness, script);

// @ts-expect-error interaction steps are discriminated
const invalidScript: InteractionScript = { id: 'invalid', steps: [{ kind: 'sleep', ms: 1 }] };

void result;
void invalidScript;

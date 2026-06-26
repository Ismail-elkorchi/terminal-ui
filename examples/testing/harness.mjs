import { createTerminalHarness, runInteractionScript } from '@ismail-elkorchi/terminal-ui/testing';

const harness = createTerminalHarness({ viewport: { columns: 20, rows: 4 } });
const result = await runInteractionScript(harness, {
  id: 'example-script',
  steps: [
    { kind: 'input', event: 'hello' },
    { kind: 'assertOutput', includes: '' }
  ]
});

console.log(JSON.stringify({
  status: result.status,
  steps: result.transcript.steps.length,
  source: result.snapshot.source
}));

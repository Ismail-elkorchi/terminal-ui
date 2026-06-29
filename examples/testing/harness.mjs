import { createTerminalHarness, runInteractionScript } from '@ismail-elkorchi/terminal-ui/testing';
import { renderWidgetFrame } from '@ismail-elkorchi/terminal-ui/tui';
import { text } from '@ismail-elkorchi/terminal-ui/widgets';

const harness = createTerminalHarness({ viewport: { columns: 20, rows: 4 } });
harness.recordFrame(renderWidgetFrame(text('Harness ready', { id: 'ready' }), { columns: 20, rows: 4 }));

const result = await runInteractionScript(harness, {
  id: 'example-script',
  steps: [
    { kind: 'assertVisibleText', assertion: { text: 'Harness ready' } },
    { kind: 'input', event: 'hello' }
  ]
});

console.log(JSON.stringify({
  steps: result.transcript.steps.length,
  source: result.snapshot.source,
  frameCount: harness.frames().length
}));

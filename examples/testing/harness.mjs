import { createTerminalHarness, runInteractionScript } from '@ismail-elkorchi/terminal-ui/testing';
import { diffFrames, renderElementFrame } from '@ismail-elkorchi/terminal-ui/renderer';
import { text } from '@ismail-elkorchi/terminal-ui/components';

const harness = createTerminalHarness({ viewport: { columns: 20, rows: 4 } });
const frame = renderElementFrame(text('Harness ready', { id: 'ready' }), { columns: 20, rows: 4 });
harness.recordCommit({
  id: 'example:commit:1',
  stateVersion: 0,
  viewport: { columns: frame.width, rows: frame.height },
  frame,
  diff: diffFrames(undefined, frame)
});

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

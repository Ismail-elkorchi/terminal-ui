import {
  createTerminalHarness,
  renderElementSnapshot,
  runInteractionScript
} from '@ismail-elkorchi/terminal-ui/testing';
import { text } from '@ismail-elkorchi/terminal-ui';

const harness = createTerminalHarness({ terminalSize: { columns: 20, rows: 4 } });
const emptySnapshot = harness.snapshot();
const rendered = renderElementSnapshot({
  element: text({ content: 'Harness ready', id: 'ready' }),
  terminalSize: { columns: 20, rows: 4 }
});
const frame = rendered.frame;
harness.recordCommit({
  id: 'example:commit:1',
  stateVersion: 0,
  terminalSize: { columns: frame.width, rows: frame.height },
  frame,
  diff: rendered.diff
});

const result = await runInteractionScript(harness, {
  id: 'example-script',
  steps: [
    { kind: 'assertVisibleText', assertion: { text: 'Harness ready' } },
    { kind: 'input', event: 'hello' }
  ]
});

if (result.diagnostics.length > 0) {
  const diagnostic = result.diagnostics[0];
  throw new Error(diagnostic?.diagnostic.message ?? 'The interaction script reported a diagnostic.');
}

console.log(JSON.stringify({
  steps: result.transcript.steps.length,
  source: result.snapshot.source,
  emptySource: emptySnapshot.source,
  emptyRole: emptySnapshot.root.role,
  frameCount: harness.frames().length,
  diagnosticCount: result.diagnostics.length
}));

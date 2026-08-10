import assert from 'node:assert/strict';
import test from 'node:test';

import {
  defineTui,
  runTui
} from '../../dist/tui/index.js';
import {
  input,
  runPrompt } from '../../dist/prompts/index.js';
import { createTerminalHarness,
  runInteractionScript } from '../../dist/testing/index.js';
import { text } from '../../dist/components/index.js';

test('public acceptance path covers prompt, TUI, and testing surfaces', async () => {
  const promptResult = await runPrompt(input({
    label: 'Name',
    nonTty: { mode: 'provided_value', value: 'Ada' }
  }));
  assert.equal(promptResult.status, 'submitted');
  assert.equal(promptResult.value, 'Ada');

  const harness = createTerminalHarness({ terminalSize: { columns: 16, rows: 3 } });
  const app = defineTui({
    id: 'acceptance',
    init: () => ({ count: 0 }),
    update: (state) => ({ state }),
    view: () => text({ content: 'accepted', id: 'accepted-text' })
  });
  harness.host.endInput();
  const tuiResult = await runTui(app, harness.host);
  assert.equal(tuiResult.status, 'completed');
  assert.equal(harness.snapshot().root.id, 'accepted-text');

  const scriptResult = await runInteractionScript(harness, {
    id: 'acceptance-script',
    steps: [{ kind: 'assertSnapshot', assertion: { role: 'text' } }]
  });
  assert.equal(scriptResult.snapshot.root.role, 'text');
  assert.equal(scriptResult.transcript.formatVersion, 3);
});

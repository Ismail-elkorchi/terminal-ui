import assert from 'node:assert/strict';
import test from 'node:test';
import { defineCli } from '@ismail-elkorchi/cli-core';

import { createMemoryTerminalHost } from '../../dist/host/index.js';
import { input, runPrompt } from '../../dist/prompts/index.js';
import { createShell, runShell } from '../../dist/shell/index.js';
import { createTerminalHarness, runInteractionScript } from '../../dist/testing/index.js';
import { defineTui, runTui } from '../../dist/tui/index.js';
import { text } from '../../dist/widgets/index.js';

function parseArgv({ input }) {
  return {
    ok: true,
    value: Object.freeze(input.trim().split(/\s+/u).filter(Boolean))
  };
}

test('public acceptance path covers prompt, shell, TUI, and testing surfaces', async () => {
  const promptResult = await runPrompt(input({
    label: 'Name',
    nonTty: { mode: 'provided_value', value: 'Ada' }
  }));
  assert.equal(promptResult.status, 'submitted');
  assert.equal(promptResult.value, 'Ada');

  const program = defineCli({
    name: 'tool',
    commands: [{ name: 'hello', positionals: [{ name: 'name', required: true }] }]
  });
  const shell = createShell({
    commands: {
      kind: 'program',
      program,
      parseArgv,
      run: { request: { handlers: { hello: () => ({ exitStatus: 0 }) } } }
    },
    nonTty: { mode: 'transcript_only' }
  });
  const shellHost = createMemoryTerminalHost({ isTty: false });
  shellHost.input('hello Ada\n');
  shellHost.stdin.close();
  const shellResult = await runShell(shell, shellHost);
  assert.equal(shellResult.status, 'completed');
  assert.equal(shellResult.transcript?.commands[0]?.status, 'completed');

  const harness = createTerminalHarness({ viewport: { columns: 16, rows: 3 } });
  const app = defineTui({
    id: 'acceptance',
    init: () => ({ count: 0 }),
    update: (state) => ({ state }),
    view: () => text('accepted', { id: 'accepted-text' })
  });
  harness.host.stdin.close();
  const tuiResult = await runTui(app, harness.host);
  assert.equal(tuiResult.status, 'completed');
  assert.equal(harness.snapshot().root.id, 'accepted-text');

  const scriptResult = await runInteractionScript(harness, {
    id: 'acceptance-script',
    steps: [{ kind: 'assertSnapshot', assertion: { role: 'text' } }]
  });
  assert.equal(scriptResult.snapshot.root.role, 'text');
  assert.equal(scriptResult.transcript.schemaVersion, 'terminal-ui.interaction-transcript.v1');
});

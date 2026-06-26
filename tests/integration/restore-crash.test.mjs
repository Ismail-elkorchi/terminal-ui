import assert from 'node:assert/strict';
import test from 'node:test';

import { createPtyTerminalHarness } from '../../dist/testing/index.js';
import { defineTui, runTui } from '../../dist/tui/index.js';

test('PTY harness restores terminal protocols when a TUI throws during rendering', async () => {
  const result = createPtyTerminalHarness({ viewport: { columns: 24, rows: 4 } });
  assert.equal(result.ok, true);
  const harness = result.harness;
  const app = defineTui({
    id: 'pty-crash-restore',
    init: () => ({ ready: true }),
    update: (state) => ({ state }),
    view: () => {
      throw new Error('render exploded');
    }
  });

  const exit = await runTui(app, harness.host);

  assert.equal(exit.status, 'error');
  assert.equal(exit.diagnostics[0]?.code, 'TUI_RENDER_FAILED');
  assert.equal(harness.host.stdin.isRawModeEnabled?.(), false);
  assert.equal(harness.restores().length, 1);
  assert.match(harness.output(), /\u001B\[\?1049h/u);
  assert.match(harness.output(), /\u001B\[\?1049l/u);
  assert.match(harness.output(), /\u001B\[\?2004l/u);
  assert.match(harness.output(), /\u001B\[\?1000l\u001B\[\?1006l/u);
  assert.match(harness.output(), /\u001B\[\?25h/u);
});

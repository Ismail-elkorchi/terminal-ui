import assert from 'node:assert/strict';
import test from 'node:test';

import { createMemoryTerminalHost } from '../../dist/host/index.js';
import { textInput } from '../../dist/components/index.js';
import { defineTui, runTui } from '../../dist/tui/index.js';

void test('invalid run configuration is rejected before terminal mutation', async () => {
  const host = createMemoryTerminalHost();
  host.input('\r');
  const exit = await runTui(exitOnSubmitApp('invalid-cleanup-policy'), host, {
    cleanup: { gracePeriodMs: Number.NaN }
  });

  assert.equal(exit.status, 'error');
  assert.equal(exit.diagnostics.some((item) => item.code === 'TUI_RUN_FAILED'), true);
  assert.equal(host.output(), '');
  assert.equal(host.stdin.isRawModeEnabled(), false);
  assert.equal(host.restores().length, 0);
});

void test('cleanup clock failure is diagnostic data and does not suppress restoration', async () => {
  const host = createMemoryTerminalHost();
  host.input('\r');
  host.clock.sleep = () => Promise.reject(new Error('cleanup clock failed'));
  const app = defineTui({
    ...exitOnSubmitApp('cleanup-clock-failure').definition,
    onExit: () => new Promise(() => undefined)
  });

  const exit = await runTui(app, host, { cleanup: { gracePeriodMs: 5 } });

  assert.equal(exit.status, 'error');
  assert.equal(exit.diagnostics.some((item) => item.code === 'TUI_CLEANUP_FAILED'), true);
  assert.equal(host.restores().length, 1);
  assert.equal(host.stdin.isRawModeEnabled(), false);
});

function exitOnSubmitApp(id: string) {
  return defineTui<{ readonly done: boolean }, { readonly kind: 'exit' }>({
    id,
    init: () => ({ done: false }),
    update: () => ({ state: { done: true }, exit: {} }),
    view: () => textInput({
      id: `${id}-input`,
      presentation: { value: '', cursor: 0 },
      onSubmit: () => ({ kind: 'exit' })
    })
  });
}

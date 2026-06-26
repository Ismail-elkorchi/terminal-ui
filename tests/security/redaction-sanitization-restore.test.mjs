import assert from 'node:assert/strict';
import test from 'node:test';

import { createMemoryTerminalHost } from '../../dist/host/index.js';
import { password, runPrompt } from '../../dist/prompts/index.js';
import { sanitizeTerminalText } from '../../dist/text/index.js';
import { defineTui, runTui } from '../../dist/tui/index.js';
import { text } from '../../dist/widgets/index.js';

test('security lane proves password redaction and control-sequence sanitization', async () => {
  const secret = 'super-secret-token';
  const host = createMemoryTerminalHost();
  const running = runPrompt(password({ label: 'Token' }), host);

  host.input(`${secret}\r`);
  host.stdin.close();
  const result = await running;
  const encoded = JSON.stringify({ result, output: host.output() });

  assert.equal(result.status, 'submitted');
  assert.equal(result.value, secret);
  assert.equal(encoded.includes(secret), true, 'submitted value is intentionally returned to the caller');
  assert.equal(JSON.stringify(result.snapshot).includes(secret), false);
  assert.equal(host.output().includes(secret), false);

  const sanitized = sanitizeTerminalText('safe\u001B[31mred\u001B[0m\u0007');
  assert.equal(sanitized.text, 'safered');
  assert.equal(sanitized.changed, true);
  assert.ok(sanitized.removedControlSequences.length >= 2);
});

test('security lane proves terminal sessions restore after TUI failures', async () => {
  const host = createMemoryTerminalHost();
  const app = defineTui({
    id: 'restore-after-failure',
    init: () => {
      throw new Error('boom');
    },
    update: (state) => ({ state }),
    view: () => text('unreachable')
  });

  const result = await runTui(app, host);

  assert.equal(result.status, 'error');
  assert.equal(host.stdin.isRawModeEnabled(), false);
  assert.ok(host.restores().length > 0);
});

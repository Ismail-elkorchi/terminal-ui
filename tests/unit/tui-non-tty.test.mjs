import assert from 'node:assert/strict';
import test from 'node:test';

import { createMemoryTerminalHost } from '../../dist/host/index.js';
import { defineTui, runTui } from '../../dist/tui/index.js';
import { statusBar, text } from '../../dist/widgets/index.js';

test('TUI non-TTY reject mode returns a typed diagnostic without control sequences', async () => {
  const host = createMemoryTerminalHost({ isTty: false });
  const app = defineTui({
    id: 'non-tty-reject',
    init: () => ({ ready: true }),
    update: (state) => ({ state }),
    view: () => text('ready'),
    nonTty: { mode: 'reject', diagnosticHint: 'Use last_frame for CI.' }
  });

  const result = await runTui(app, host);

  assert.equal(result.status, 'error');
  assert.equal(result.diagnostics[0]?.code, 'HOST_CAPABILITY_UNAVAILABLE');
  assert.equal(result.diagnostics[0]?.hint, 'Use last_frame for CI.');
  assert.equal(host.output(), '');
  assert.equal(host.restores().length, 0);
});

test('TUI non-TTY transcript_only mode renders a snapshot without terminal output', async () => {
  const host = createMemoryTerminalHost({ isTty: false });
  const app = defineTui({
    id: 'non-tty-transcript',
    transcript: { enabled: true },
    init: () => ({ label: 'ready' }),
    update: (state) => ({ state }),
    view: (state) => statusBar({ id: 'status', text: state.label }),
    nonTty: { mode: 'transcript_only' }
  });

  const result = await runTui(app, host);

  assert.equal(result.status, 'completed');
  assert.equal(result.reason, 'transcript_only');
  assert.equal(host.output(), '');
  assert.equal(result.snapshot.root.id, 'status');
  assert.equal(result.transcript?.steps.some((step) => step.kind === 'frame'), true);
  assert.equal(host.restores().length, 0);
});

test('TUI non-TTY last_frame mode writes readable text without control sequences', async () => {
  const host = createMemoryTerminalHost({ isTty: false });
  const app = defineTui({
    id: 'non-tty-last-frame',
    init: () => ({ label: 'ready' }),
    update: (state) => ({ state }),
    view: (state) => statusBar({ id: 'status', text: state.label }),
    nonTty: { mode: 'last_frame' }
  });

  const result = await runTui(app, host);

  assert.equal(result.status, 'completed');
  assert.equal(result.reason, 'last_frame');
  assert.match(host.output(), /# status/u);
  assert.match(host.output(), /- status: status = ready/u);
  assert.match(host.output(), /\n\nready\n$/u);
  assert.doesNotMatch(host.output(), /\u001B\[/u);
});

test('TUI non-TTY line_fallback maps one input line into an app message', async () => {
  const host = createMemoryTerminalHost({ isTty: false });
  host.input('Ada\n');
  host.stdin.close();
  const app = defineTui({
    id: 'non-tty-line',
    init: () => ({ name: '' }),
    update: (_state, message) => ({ state: { name: message.name } }),
    view: (state) => text(`Hello ${state.name}`, { id: 'greeting' }),
    nonTty: {
      mode: 'line_fallback',
      message: (line) => ({ name: line })
    }
  });

  const result = await runTui(app, host);

  assert.equal(result.status, 'completed');
  assert.equal(result.reason, 'line_fallback');
  assert.deepEqual(result.state, { name: 'Ada' });
  assert.match(host.output(), /# greeting/u);
  assert.match(host.output(), /- text: greeting = Hello Ada/u);
  assert.match(host.output(), /\n\nHello Ada\n$/u);
});

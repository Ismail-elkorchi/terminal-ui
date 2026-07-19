import assert from 'node:assert/strict';
import test from 'node:test';

import { runTui } from '../../dist/tui/index.js';
import { createMemoryTerminalHost } from '../../dist/host/index.js';
import { defineTui } from '../../dist/tui/index.js';
import {
  statusBar,
  text
} from '../../dist/components/index.js';

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
    view: (state) => statusBar({ id: 'status', leading: [{ id: 'state', kind: 'text', text: state.label }] }),
    nonTty: { mode: 'transcript_only' }
  });

  const result = await runTui(app, host);

  assert.equal(result.status, 'completed');
  assert.equal(result.reason, 'transcript_only');
  assert.equal(host.output(), '');
  assert.equal(result.snapshot.root.id, 'status');
  assert.equal(result.transcript?.steps.some((step) => step.kind === 'commit'), true);
  assert.equal(host.restores().length, 0);
});

test('TUI non-TTY last_frame mode writes readable text without control sequences', async () => {
  const host = createMemoryTerminalHost({ isTty: false });
  const app = defineTui({
    id: 'non-tty-last-frame',
    init: () => ({ label: 'ready' }),
    update: (state) => ({ state }),
    view: (state) => statusBar({ id: 'status', leading: [{ id: 'state', kind: 'text', text: state.label }] }),
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

test('TUI non-TTY projection reports initialization failures precisely and disposes the host', async () => {
  const host = createMemoryTerminalHost({ isTty: false });
  let disposed = false;
  const dispose = host.dispose.bind(host);
  host.dispose = async (context) => {
    disposed = true;
    await dispose(context);
  };
  const app = defineTui({
    id: 'non-tty-init-failure',
    init: () => { throw new Error('initialization failed'); },
    update: (state) => ({ state }),
    view: () => text('unreachable'),
    nonTty: { mode: 'transcript_only' }
  });

  const result = await runTui(app, host);

  assert.equal(result.status, 'error');
  assert.equal(result.diagnostics[0]?.code, 'TUI_INITIALIZATION_FAILED');
  assert.equal(disposed, true);
});

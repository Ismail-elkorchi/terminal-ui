import assert from 'node:assert/strict';
import test from 'node:test';

import { defaultSessionProtocolPolicy, runTui, TuiRunError } from '../../../dist/tui/index.js';
import { createMemoryTerminalHost } from '../../../dist/host/index.js';
import { defineTui } from '../../../dist/tui/index.js';
import { defineTextPresentation, segmentGraphemes } from '../../../dist/text/index.js';
import { renderTuiOutput } from '../../../dist/renderer/index.js';
import {
  statusBar,
  text
} from '../../../dist/components/index.js';

async function errorExit(operation) {
  try {
    await operation;
  } catch (error) {
    assert.ok(error instanceof TuiRunError);
    return error.exit;
  }
  assert.fail('Expected runTui() to reject with TuiRunError.');
}

test('TUI non-TTY reject mode returns a typed diagnostic without control sequences', async () => {
  const host = createMemoryTerminalHost({ isTty: false });
  const app = defineTui({
    id: 'non-tty-reject',
    init: () => ({ state: ({ ready: true }) }),
    update: (state) => ({ state }),
    view: () => text({ content: 'ready' }),
    nonTty: { mode: 'reject', diagnosticHint: 'Use last_frame for CI.' }
  });

  const result = await errorExit(runTui(app, { host: host }));

  assert.equal(result.status, 'error');
  assert.equal(result.diagnostics[0]?.diagnostic.code, 'HOST_CAPABILITY_UNAVAILABLE');
  assert.equal(result.diagnostics[0]?.diagnostic.hint, 'Use last_frame for CI.');
  assert.equal(host.output(), '');
  assert.equal(host.restores().length, 0);
});

test('TUI non-TTY transcript_only mode renders a snapshot without terminal output', async () => {
  const host = createMemoryTerminalHost({ isTty: false });
  const app = defineTui({
    id: 'non-tty-transcript',
    transcript: true,
    init: () => ({ state: ({ label: 'ready' }) }),
    update: (state) => ({ state }),
    view: (state) => statusBar({ id: 'status', leading: [{ id: 'state', kind: 'text', text: state.label }] }),
    nonTty: { mode: 'transcript_only' }
  });

  const result = await runTui(app, { host: host });

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
    init: () => ({ state: ({ label: 'ready' }) }),
    update: (state) => ({ state }),
    view: (state) => statusBar({ id: 'status', leading: [{ id: 'state', kind: 'text', text: state.label }] }),
    nonTty: { mode: 'last_frame' }
  });

  const result = await runTui(app, { host: host });

  assert.equal(result.status, 'completed');
  assert.equal(result.reason, 'last_frame');
  assert.match(host.output(), /- status = ready \[live:polite\]/u);
  assert.match(host.output(), /\n\nready\n$/u);
  assert.doesNotMatch(host.output(), /\u001B\[/u);
});

for (const mode of ['last_frame', 'transcript_only']) {
  test(`TUI non-TTY ${mode} preserves configured presentation in hooks and frame rendering`, async () => {
    const host = createMemoryTerminalHost({ isTty: false });
    const textPresentation = defineTextPresentation({ map: request => segmentGraphemes(
      request.text.slice(request.startOffset, request.endOffsetExclusive),
    ).map(cluster => ({
      text: cluster.text,
      startOffset: cluster.startOffset + request.startOffset,
      endOffsetExclusive: cluster.endOffsetExclusive + request.startOffset,
      direction: 'rtl',
    })).reverse() });
    const contexts = [];
    const app = defineTui({
      id: `non-tty-mapped-${mode}`,
      transcript: true,
      init: context => {
        contexts.push(context.textPresentation);
        return { state: { label: 'abc' } };
      },
      update: state => ({ state }),
      view: (state, context) => {
        contexts.push(context.textPresentation);
        return statusBar({ id: 'status', leading: [{ id: 'state', kind: 'text', text: state.label }] });
      },
      nonTty: { mode },
    });
    const result = await runTui(app, { host, textPresentation,
      sessionPolicy: { ...defaultSessionProtocolPolicy, cellPresentation: 'required' } });
    assert.equal(result.status, 'completed');
    assert.deepEqual(contexts, [textPresentation, textPresentation]);
    assert.equal(result.state.label, 'abc');
    const commit = result.transcript?.steps.find(step => step.kind === 'commit')?.commit;
    assert.ok(commit);
    const output = renderTuiOutput({ frame: commit.frame });
    assert.equal(output.plainTextFrame, 'cba');
    assert.match(output.accessibleText, /abc/u);
    assert.equal(host.output(), mode === 'last_frame' ? `${output.accessibleText}\n\n${output.plainTextFrame}\n` : '');
    assert.doesNotMatch(host.output(), /\u001B/u);
    assert.equal(host.restores().length, 0);
    assert.equal(host.stdin.isRawModeEnabled(), false);
  });
}

test('TUI non-TTY run reports initialization failures without disposing an injected host', async () => {
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
    view: () => text({ content: 'unreachable' }),
    nonTty: { mode: 'transcript_only' }
  });

  const result = await errorExit(runTui(app, { host: host }));

  assert.equal(result.status, 'error');
  assert.equal(result.diagnostics[0]?.diagnostic.code, 'TUI_INITIALIZATION_FAILED');
  assert.equal(disposed, false);
});

test('TUI non-TTY render failures preserve an initialized undefined state', async () => {
  const host = createMemoryTerminalHost({ isTty: false });
  const app = defineTui({
    id: 'non-tty-undefined-state-failure',
    init: () => ({ state: undefined }),
    update: () => ({ state: undefined }),
    view: () => {
      throw new Error('render failed');
    },
    nonTty: { mode: 'transcript_only' }
  });

  const result = await errorExit(runTui(app, { host: host }));

  assert.equal(result.status, 'error');
  assert.equal(result.diagnostics[0]?.diagnostic.code, 'TUI_RENDER_FAILED');
  assert.equal(Object.hasOwn(result, 'state'), true);
  assert.equal(result.state, undefined);
});

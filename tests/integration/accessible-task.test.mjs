import assert from 'node:assert/strict';
import test from 'node:test';
import { createMemoryTerminalHost } from '../../dist/host/index.js';
import { createTuiRuntime } from '../../dist/tui/index.js';
import { createTranscriptRecorder } from '../../dist/transcript/index.js';
import { createAccessibleTaskApp } from '../../examples/tui/accessible-task.ts';
import { key } from '../support/keyboard.mjs';
import { flushAsync, waitUntil } from '../support/async.ts';

for (const outputMode of ['visual', 'accessible']) {
  test(`local task keyboard sequence works in ${outputMode} mode`, async () => {
    const host = createMemoryTerminalHost({ terminalSize: { columns: 80, rows: 30 } });
    const transcript = createTranscriptRecorder({ id: `task-${outputMode}`, source: 'tui' });
    const runtime = createTuiRuntime({ app: createAccessibleTaskApp(), host, outputMode, transcript });
    try {
      await runtime.start();
      assert.equal(runtime.frame().focusPath.at(-1), 'task-title');
      const initial = host.output();
      await runtime.resize({ columns: 70, rows: 28 });
      if (outputMode === 'accessible') assert.equal(host.output(), initial);
      await runtime.handleInput(key('enter'));
      assert.equal(runtime.state().error, 'Enter a task title');
      await runtime.handleInput({ kind: 'paste', text: 'Review café 世界 👩‍💻', bracketed: true });
      assert.equal(runtime.state().error, undefined);
      await runtime.handleInput(key('arrowLeft', { shift: true }));
      await runtime.handleInput(key('tab'));
      assert.equal(runtime.frame().focusPath.at(-1), 'task-password');
      await runtime.handleInput({ kind: 'text', text: 'practice-secret', paste: false });
      await runtime.handleInput(key('tab'));
      await runtime.handleInput(key('arrowDown'));
      await runtime.handleInput(key('space'));
      assert.equal(runtime.state().priority.selection.selectedId, 'Urgent');
      await runtime.handleInput(key('tab'));
      assert.equal(runtime.frame().focusPath.at(-1), 'task-review');
      await runtime.handleInput(key('enter'));
      assert.equal(runtime.state().confirming, true);
      assert.equal(runtime.frame().focusPath.at(-1), 'task-cancel');
      await runtime.handleInput(key('escape'));
      assert.equal(runtime.state().confirming, false);
      assert.equal(runtime.frame().focusPath.at(-1), 'task-review');
      await runtime.handleInput(key('enter'));
      await runtime.handleInput(key('tab'));
      assert.equal(runtime.frame().focusPath.at(-1), 'task-confirm-button');
      await runtime.handleInput(key('enter'));
      await flushAsync();
      host.clock.advance(250);
      await waitUntil(() => runtime.state().progress === 50);
      await flushAsync();
      host.clock.advance(250);
      await waitUntil(() => runtime.state().complete);
      assert.equal(runtime.state().progress, 100);
      assert.equal(runtime.frame().focusPath.at(-1), 'task-review');
      if (outputMode === 'accessible') {
        const beforeRepeat = host.output();
        await runtime.handleInput(key('l', { ctrl: true }));
        assert.match(host.output().slice(beforeRepeat.length), /Task complete/u);
        assert.match(host.output(), /Validation cleared:/u);
        assert.match(host.output(), /selection:/u);
        assert.match(host.output(), /active-descendant:[^\r\n]*Urgent/u);
        assert.match(host.output(), /Opened: dialog: Confirm task/u);
        assert.match(host.output(), /Closed: Confirm task/u);
        assert.match(host.output(), /value:50\/100/u);
        assert.match(host.output(), /value:100\/100/u);
        assert.doesNotMatch(host.output(), /\u001b|practice-secret/u);
      }
      assert.doesNotMatch(JSON.stringify(transcript.snapshot()), /practice-secret/u);
      await runtime.handleInput(key('q', { ctrl: true }));
      assert.equal(runtime.exit().reason, 'quit');
    } finally { await runtime.dispose(); }
  });
}
